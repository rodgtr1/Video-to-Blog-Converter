import { NextRequest, NextResponse } from 'next/server'
import { validateRequestBody, blogGenerationSchema } from '@/lib/validation'
import { env, hasApiKey } from '@/lib/env'
import { blogGenerationRateLimit, getClientIdentifier } from '@/lib/rate-limit'

type BlogPost = {
  title: string
  excerpt: string
  content: string
  tags: string[]
  headings: Array<{ level: number; text: string }>
  word_count: number
  reading_time_minutes: number
  sources: Array<{ type: 'video'; url?: string; timestamps?: string[] }>
}

type ExpandResult = {
  blogPost: BlogPost
  sections: BlogSection[]
}

type BlogSection = {
  heading: string
  content: string
  target_words: number
  min_words: number
  max_words: number
  actual_words: number
}

type Outline = {
  title: string
  excerpt_goal?: string
  excerpt?: string
  sections: Array<{
    heading: string
    target_words: number
    min_words: number
    max_words: number
    key_points?: string[]
  }>
  tags_guess?: string[]
  tags?: string[]
}

export async function POST(request: NextRequest) {
  const url = new URL(request.url)
  const isStreamMode = url.searchParams.get('stream') === 'true'
  
  try {
    // Rate limiting check
    const clientId = getClientIdentifier(request)
    const rateLimitResult = blogGenerationRateLimit(clientId)
    
    if (!rateLimitResult.allowed) {
      const resetTime = new Date(rateLimitResult.resetTime)
      return NextResponse.json({
        success: false,
        error: `Rate limit exceeded. Try again at ${resetTime.toLocaleTimeString()}`
      }, { 
        status: 429,
        headers: {
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
          'Retry-After': Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000).toString()
        }
      })
    }
    
    // Validate input
    const validation = await validateRequestBody(request, blogGenerationSchema)
    if (validation.error || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Validation failed'
      }, { status: 400 })
    }
    
    const { transcript, alpha, videoUrl, targetWordCount } = validation.data
    
    // Check if OpenAI API key is available
    if (!hasApiKey()) {
      return NextResponse.json({
        success: false,
        error: 'OpenAI API key not configured. Please check your environment variables.'
      }, { status: 500 })
    }
    
    console.log(`Blog generation: ${targetWordCount} words, alpha=${alpha}, transcript=${transcript.length} chars`)
    console.log(`Using new content-driven section calculation system`)

    if (isStreamMode) {
      // Return a streaming response
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          const progressCallback = (step: string, progress: number, details?: string) => {
            const data = JSON.stringify({ step, progress, details }) + '\n'
            controller.enqueue(encoder.encode(`data: ${data}\n\n`))
          }
          
          generateBlogContentWithProgress(transcript, alpha, videoUrl, targetWordCount, progressCallback)
            .then(blogPost => {
              // Send final result
              const data = JSON.stringify({ step: 'complete', progress: 100, result: { success: true, ...blogPost } }) + '\n'
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
              controller.close()
            })
            .catch(error => {
              const data = JSON.stringify({ step: 'error', progress: 0, error: error.message }) + '\n'
              controller.enqueue(encoder.encode(`data: ${data}\n\n`))
              controller.close()
            })
        }
      })
      
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        }
      })
    }

    const blogPost = await generateBlogContent(transcript, alpha, videoUrl, targetWordCount)

    return NextResponse.json({
      success: true,
      ...blogPost
    })

  } catch (error) {
    console.error('Blog generation error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred'
    }, { status: 500 })
  }
}

type ProgressCallback = (step: string, progress: number, details?: string) => void

async function generateBlogContentWithProgress(
  transcript: string,
  alpha: number,
  videoUrl?: string,
  targetWordCount: number = 700,
  onProgress?: ProgressCallback
): Promise<BlogPost> {
  // Special case: alpha=0.0 means pure transcript with minimal formatting
  if (alpha === 0.0) {
    onProgress?.('pure_transcript', 10, 'Using pure transcript mode (alpha=0.0)')
    const result = await generatePureTranscript(transcript, videoUrl, targetWordCount)
    onProgress?.('pure_transcript_complete', 100, 'Pure transcript formatting complete')
    return result
  }
  
  // Check if transcript is too long and needs chunking
  const maxChars = 12000
  if (transcript.length > maxChars) {
    onProgress?.('long_transcript', 5, `Long transcript detected (${transcript.length} chars), using chunked processing`)
    return await generateFromLongTranscriptWithProgress(transcript, alpha, videoUrl, targetWordCount, onProgress)
  }

  onProgress?.('outline_start', 10, 'Generating blog post outline...')
  
  // Stage 1: Generate outline and key sections
  let outline = await generateOutline(transcript, alpha, targetWordCount)
  onProgress?.('outline_generated', 20, `Outline created with ${outline.sections?.length || 0} sections`)
  
  outline = await normalizeOutline(outline, targetWordCount, transcript)
  onProgress?.('outline_normalized', 25, 'Content-driven section budgets calculated')
  
  // Stage 2: Expand each section with word quotas
  onProgress?.('sections_start', 30, `Generating ${outline.sections.length} detailed sections...`)
  let expandedSections = await expandSectionsWithProgress(outline, transcript, alpha, targetWordCount, onProgress)
  
  // Global shrink pass if needed
  const shrinkTolerance = Math.max(50, Math.floor(targetWordCount * 0.1))
  const totalNow = expandedSections.reduce((s, x) => s + x.actual_words, 0)
  if (totalNow > targetWordCount + shrinkTolerance) {
    onProgress?.('shrinking', 83, `Trimming overage (${totalNow} → ${targetWordCount} words)`)
    expandedSections = shrinkSectionsToTarget(expandedSections, targetWordCount)
  }
  
  onProgress?.('assembly_start', 85, 'Assembling final blog post...')
  
  // Stage 3: Assemble final blog post
  const blogPost = await assembleBlogPost(outline, expandedSections, videoUrl)
  
  const actualWordCount = countWords(blogPost.content)
  onProgress?.('checking_length', 90, `Generated ${actualWordCount} words (target: ${targetWordCount})`)
  
  // Stage 4: Expand weak sections if total is significantly short (allow 10% tolerance)
  const expandTolerance = Math.max(50, targetWordCount * 0.1) // At least 50 word tolerance
  let final = blogPost
  let currentSections = expandedSections
  
  if (final.word_count < targetWordCount - expandTolerance) {
    const shortfall = targetWordCount - final.word_count
    onProgress?.('expanding', 92, `Post is ${shortfall} words short, expanding to reach target`)
    
    for (let guard = 0; guard < 2 && final.word_count < targetWordCount - expandTolerance; guard++) {
      onProgress?.('expanding', 94 + guard * 2, `Expanding sections (attempt ${guard + 1}/2)`)
      const result = await expandWeakSections(final, currentSections, targetWordCount, transcript, alpha)
      final = result.blogPost
      currentSections = result.sections
      
      // Stop if we're getting too long
      if (final.word_count > targetWordCount * 1.3) {
        onProgress?.('expansion_stopped', 98, 'Stopping expansion to avoid overshooting target')
        break
      }
    }
  } else if (final.word_count > targetWordCount * 1.5) {
    onProgress?.('too_long', 94, `Post is significantly over target (${final.word_count}/${targetWordCount}), but keeping as-is`)
  }
  
  onProgress?.('complete', 100, `Blog post completed: ${final.word_count} words`)
  
  // Final logging
  if (process.env.DEBUG_GEN === '1') {
    console.log(`\n=== CONTENT-DRIVEN GENERATION COMPLETE ===`)
    console.log(`Target: ${targetWordCount} words`)
    console.log(`Actual: ${final.word_count} words (${Math.round((final.word_count / targetWordCount) * 100)}% of target)`)
    console.log(`Sections: ${final.headings.length}`)
    console.log(`Accuracy: ${Math.abs(final.word_count - targetWordCount) <= targetWordCount * 0.2 ? 'GOOD' : 'NEEDS IMPROVEMENT'}`)
  }
  
  return final
}

export async function generateBlogContent(
  transcript: string,
  alpha: number,
  videoUrl?: string,
  targetWordCount: number = 700
): Promise<BlogPost> {
  // Special case: alpha=0.0 means pure transcript with minimal formatting
  if (alpha === 0.0) {
    console.log('Using pure transcript mode (alpha=0.0)')
    return await generatePureTranscript(transcript, videoUrl, targetWordCount)
  }
  
  // Check if transcript is too long and needs chunking
  const maxChars = 12000
  if (transcript.length > maxChars) {
    console.log(`Long transcript detected (${transcript.length} chars), using chunked processing`)
    return await generateFromLongTranscript(transcript, alpha, videoUrl, targetWordCount)
  }

  // Stage 1: Generate outline and key sections
  let outline = await generateOutline(transcript, alpha, targetWordCount)
  outline = await normalizeOutline(outline, targetWordCount, transcript)
  
  // Stage 2: Expand each section with word quotas
  let expandedSections = await expandSections(outline, transcript, alpha, targetWordCount)

  // Global shrink pass if needed
  const shrinkTolerance = Math.max(50, Math.floor(targetWordCount * 0.1))
  const totalNow = expandedSections.reduce((s, x) => s + x.actual_words, 0)
  if (totalNow > targetWordCount + shrinkTolerance) {
    if (process.env.DEBUG_GEN === '1') {
      console.log(`Trimming overage: ${totalNow} → ${targetWordCount} words`)
    }
    expandedSections = shrinkSectionsToTarget(expandedSections, targetWordCount)
  }

  // Stage 3: Assemble final blog post
  const blogPost = await assembleBlogPost(outline, expandedSections, videoUrl)

  const actualWordCount = countWords(blogPost.content)
  if (process.env.DEBUG_GEN === '1') {
    console.log(`Final word count: ${actualWordCount} (target: ${targetWordCount})`)
  }

  // Stage 4: Expand weak sections if total is significantly short (allow 10% tolerance)
  const expandTolerance = Math.max(50, targetWordCount * 0.1)
  let final = blogPost
  let currentSections = expandedSections
  
  if (final.word_count < targetWordCount - expandTolerance) {
    for (let guard = 0; guard < 2 && final.word_count < targetWordCount - expandTolerance; guard++) {
      if (process.env.DEBUG_GEN === '1') {
        console.log(`Post too short (${final.word_count}/${targetWordCount}), expanding weak sections... (attempt ${guard + 1})`)
      }
      const result = await expandWeakSections(final, currentSections, targetWordCount, transcript, alpha)
      final = result.blogPost
      currentSections = result.sections
      
      // Stop if getting too long
      if (final.word_count > targetWordCount * 1.3) {
        if (process.env.DEBUG_GEN === '1') {
          console.log('Stopping expansion to avoid overshooting target')
        }
        break
      }
    }
  } else if (final.word_count > targetWordCount * 1.5) {
    if (process.env.DEBUG_GEN === '1') {
      console.log(`Post is significantly over target (${final.word_count}/${targetWordCount}), but keeping as-is`)
    }
  }

  // Final logging
  if (process.env.DEBUG_GEN === '1') {
    console.log(`\n=== CONTENT-DRIVEN GENERATION COMPLETE ===`)
    console.log(`Target: ${targetWordCount} words`)
    console.log(`Actual: ${final.word_count} words (${Math.round((final.word_count / targetWordCount) * 100)}% of target)`)
    console.log(`Sections: ${final.headings.length}`)
    console.log(`Accuracy: ${Math.abs(final.word_count - targetWordCount) <= targetWordCount * 0.2 ? 'GOOD' : 'NEEDS IMPROVEMENT'}`)
  }

  return final
}

// Normalize outline budgets with exact target allocation
async function normalizeOutline(outline: Outline, targetWordCount: number, transcript: string): Promise<Outline> {
  const natural = await detectNaturalSections(transcript)
  // choose a sensible section count for small targets (350 -> 3)
  const preferred = Math.min(5, Math.max(2, Math.round(targetWordCount / 130)))
  const sectionCount = Math.min(preferred, Math.max(2, natural.length))

  // merge/split natural headings to exactly sectionCount
  const finalHeadings =
    natural.length === sectionCount ? natural :
    (natural.length > sectionCount ? mergeNaturalSections(natural, sectionCount)
                                   : splitNaturalSections(natural, sectionCount))

  // exact targets that add up to targetWordCount
  const base = Math.floor(targetWordCount / sectionCount)
  const remainder = targetWordCount - base * sectionCount
  const targets = Array.from({ length: sectionCount }, (_, i) => base + (i < remainder ? 1 : 0))

  const sections = finalHeadings.map((heading, i) => {
    const t = targets[i]
    const min = Math.max(40, Math.floor(t * 0.9))          // tighter band
    const max = Math.max(min + 8, Math.ceil(t * 1.05))      // tiny headroom
    const kp = outline.sections?.[i]?.key_points ?? ['main concepts','key details','examples']
    return { heading, target_words: t, min_words: min, max_words: max, key_points: kp }
  })
  
  // Debug logging
  if (process.env.DEBUG_GEN === '1') {
    console.log(`Exact target allocation:`)  
    console.log(`  Natural sections (${natural.length}): ${natural.join(', ')}`)
    console.log(`  Final sections (${sectionCount}): ${finalHeadings.join(', ')}`)
    console.log(`  Targets: ${targets.join(', ')} (sum=${targets.reduce((a, b) => a + b, 0)})`)
    console.log(`  Target total: ${targetWordCount} words`)
  }

  return { ...outline, sections }
}

// Helper functions for section management
function mergeNaturalSections(natural: string[], targetCount: number): string[] {
  if (natural.length <= targetCount) return natural
  
  const result = [...natural]
  while (result.length > targetCount) {
    // Find shortest adjacent pair to merge
    let minIndex = 0
    let minLength = result[0].length + result[1].length
    
    for (let i = 1; i < result.length - 1; i++) {
      const combinedLength = result[i].length + result[i + 1].length
      if (combinedLength < minLength) {
        minLength = combinedLength
        minIndex = i
      }
    }
    
    // Merge the pair
    const merged = `${result[minIndex]} & ${result[minIndex + 1]}`
    result.splice(minIndex, 2, merged)
  }
  
  return result
}

function splitNaturalSections(natural: string[], targetCount: number): string[] {
  if (natural.length >= targetCount) return natural.slice(0, targetCount)
  
  const result = [...natural]
  while (result.length < targetCount) {
    // Find longest section to split
    let maxIndex = 0
    let maxLength = result[0].length
    
    for (let i = 1; i < result.length; i++) {
      if (result[i].length > maxLength) {
        maxLength = result[i].length
        maxIndex = i
      }
    }
    
    // Split the longest section
    const original = result[maxIndex]
    const part1 = `${original} (Part 1)`
    const part2 = `${original} (Part 2)`
    result.splice(maxIndex, 1, part1, part2)
  }
  
  return result
}

// Generate outline first - simplified since content-driven logic handles section calculation
async function generateOutline(transcript: string, alpha: number, targetWordCount: number) {
  // The actual section count and word budgets will be determined by normalizeOutline()
  // This function focuses on extracting the natural content structure

  const outlinePrompt = `Generate a blog post outline from this transcript. Focus on identifying the NATURAL STRUCTURE and key topics.
Alpha: ${alpha} (${alpha < 0.5 ? 'EXTRACTIVE - preserve original organization' : 'CREATIVE - reorganize for blog flow'})
Target: ${targetWordCount} words total

Return JSON:
{
  "title": "Engaging blog post title",
  "excerpt_goal": "1-2 sentences about the main topic",
  "sections": [
    {"heading": "Natural Topic 1", "key_points": ["key concept", "example", "detail"]},
    {"heading": "Natural Topic 2", "key_points": ["key concept", "example", "detail"]}
  ],
  "tags_guess": ["tag1", "tag2", "tag3"]
}

IMPORTANT: 
- Identify the speaker's natural organization (transitions, numbered points, topic changes)
- Create sections that reflect how the speaker structured their content
- Section count will be automatically optimized for the word target
- Focus on meaningful section names that capture the actual topics discussed

${alpha < 0.5 ? 'EXTRACTIVE: Follow the transcript structure closely. Preserve the speaker\'s organization.' : 'CREATIVE: Reorganize topics for better blog flow while respecting the main themes.'}

Transcript: ${transcript}`

  const useOpenAI = hasApiKey()

  if (useOpenAI) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Use full model for better outline generation
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: outlinePrompt }],
        temperature: 0.3,
        max_tokens: 2000
      }),
    })
    const data = await response.json()
    return JSON.parse(data.choices[0].message.content)
  } else {
    // Ollama fallback
    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b-instruct',
        prompt: outlinePrompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 2000 }
      })
    })
    const data = await response.json()
    return JSON.parse(data.response)
  }
}

// Structure validation functions
function hasBulletedList(md: string): boolean {
  return /^(\s*[-*+]\s).+/m.test(md)
}

function paragraphCount(md: string): number {
  return md
    .split(/\n\s*\n/)
    .map(p => p.replace(/^\s*([>*]\s|[-*+]\s)/gm, '').trim())
    .filter(p => p.length > 0).length
}

function countQuotes(md: string): number {
  // Count quoted spans (20+ chars) - includes curly and single quotes
  return (md.match(/"[^"\n]{20,200}"|"[^"\n]{20,200}"|'[^'\n]{20,200}'|'[^'\n]{20,200}'/g) || []).length
}

function needsMore(md: string, minWords: number, maxWords: number, requireQuotes: boolean, minQuotes: number) {
  const wc = countWords(md)
  const pc = paragraphCount(md)
  const hasList = hasBulletedList(md)
  const qc = requireQuotes ? countQuotes(md) : 1 // consider satisfied if not required
  
  // Get shape requirements for this section size
  const shape = sectionShape(minWords, maxWords)
  const avgWords = (minWords + maxWords) / 2
  // Be more lenient with paragraphs for very small sections
  const requiredParagraphs = avgWords <= 120 ? 1 : parseInt(shape.paras.split('-')[0])
  
  // NEW: enforce the upper bound too
  const withinMax = wc <= Math.max(maxWords, minWords + 10) // tiny cushion
  
  return {
    ok: wc >= minWords && withinMax && pc >= requiredParagraphs && (shape.requireList ? hasList : true) && qc >= (requireQuotes ? minQuotes : 0),
    wc, pc, hasList, qc, requiredParagraphs, withinMax, requireList: shape.requireList
  }
}

function rotateSnippet(transcript: string, window = 2000, phase = 0): string {
  if (transcript.length <= window) return transcript
  const starts = [0, Math.max(0, Math.floor(transcript.length/3)-window/2), Math.max(0, Math.floor(2*transcript.length/3)-window/2)]
  const start = Math.min(transcript.length - window, Math.max(0, starts[phase % starts.length]))
  return transcript.slice(start, start + window)
}

// Helper function to slice transcript for specific section
function sliceTranscriptForSection(transcript: string, keyPoints: string[], phase = 0): string {
  // Keep sentences that contain any keypoint keyword
  const sentences = transcript.split(/(?<=[.!?])\s+/)
  const needles = keyPoints
    .join(' ')
    .toLowerCase()
    .split(/\W+/)
    .filter(Boolean)
  const keep = sentences.filter(s => {
    const t = s.toLowerCase()
    return needles.some(n => t.includes(n))
  })
  // Limit to ~2000 chars so the section prompt stays focused
  const snippet = keep.join(' ').slice(0, 2000)

  // Better fallback strategy - use rotating snippets
  if (snippet.length < 400) {
    return rotateSnippet(transcript, 2000, phase)
  }

  return snippet
}

// Progress-aware section expansion
async function expandSectionsWithProgress(outline: Outline, transcript: string, alpha: number, targetWordCount: number, onProgress?: ProgressCallback): Promise<BlogSection[]> {
  const sections: BlogSection[] = []
  const rawBudget = Math.round((1 - alpha) * 3)
  const quoteBudget = Math.max(0, rawBudget) // 0-3 quotes per section
  const totalSections = outline.sections.length
  const progressStart = 30
  const progressEnd = 85
  const progressRange = progressEnd - progressStart

  for (let i = 0; i < outline.sections.length; i++) {
    const section = outline.sections[i]
    const sectionProgress = progressStart + (i / totalSections) * progressRange
    
    onProgress?.('section_start', Math.round(sectionProgress), `Writing "${section.heading}" (${i + 1}/${totalSections})`)
    
    let snippet = sliceTranscriptForSection(transcript, section.key_points || [])
    let body = ''
    let attempt = 0
    const maxRetries = 6
    const requireQuotes = alpha < 0.5 && quoteBudget >= 1
    // quoteLine removed - not used in progress version

    // Calculate max_tokens from per-section target (much more restrictive)
    const TOKENS_PER_WORD = 1.5
    const sectionTokenCap = Math.max(120, Math.round(section.target_words * TOKENS_PER_WORD))
    const moreTokenCap = Math.max(60, Math.round((section.target_words / 2) * TOKENS_PER_WORD))
    
    if (process.env.DEBUG_GEN === '1') {
      console.log(`Section "${section.heading}": target=${section.target_words}, ${section.min_words}-${section.max_words} words → ${sectionTokenCap} tokens`)
    }
    
    // Get format requirements based on section budget
    const shape = sectionShape(section.min_words, section.max_words)
    
    // Initial section generation
    const initialPrompt = `Write a ${section.target_words}-word blog section about "${section.heading}".

HARD LIMIT: ${section.max_words} words maximum. Aim for ${section.target_words} words.
Stop when you reach ${section.target_words} words (do NOT approach the max).

Format:
- ${shape.paras} paragraphs (blank line between paragraphs)
- ${shape.requireList ? `One bullet list with ${shape.list}` : `Optional bullet list (${shape.list} max)`}
- Use examples from the transcript.

Content source: ${snippet.slice(0, 800)}`

    body = await callLLMForText(initialPrompt, alpha, !!env.OPENAI_API_KEY, sectionTokenCap)
    
    // Enforce hard cap per section immediately after generation
    const hardCap = Math.min(section.max_words, Math.ceil(section.target_words * 1.05))
    if (countWords(body) > hardCap) {
      const trimmed = trimToMaxWords(body, hardCap)
      body = trimmed.text
    }
    
    let check = needsMore(body, section.min_words, section.max_words, requireQuotes, quoteBudget)

    // Validator loop with targeted continuation
    while (!check.ok && attempt < maxRetries) {
      attempt++
      
      if (attempt > 1) {
        onProgress?.('section_retry', Math.round(sectionProgress + 1), `Expanding "${section.heading}" (attempt ${attempt})`)
      }

      // Try different snippet if still failing after 2 attempts
      if (attempt > 2) {
        snippet = sliceTranscriptForSection(transcript, section.key_points || [], attempt - 2)
      }

      const missingBits = [
        check.wc < section.min_words ? `CRITICAL: Add ${section.min_words - check.wc} more words to reach minimum ${section.min_words}` : null,
        check.pc < check.requiredParagraphs ? `Ensure at least ${check.requiredParagraphs} paragraphs (separate by blank lines)` : null,
        (check.requireList && !check.hasList) ? `Add a bulleted list` : null,
        requireQuotes && check.qc < quoteBudget ? `Add ${quoteBudget - check.qc} more direct quotes (20–40 words each)` : null,
      ].filter(Boolean).join('\n- ')

      const contPrompt = `Continue the same section to satisfy ALL missing requirements:
- ${missingBits}

WORD COUNT CHECK: Current section has ${check.wc} words but needs ${section.min_words}. Add exactly ${section.min_words - check.wc} more words.

Current content:
${body}

Continue in the same voice. Use this transcript snippet for additional content:
${snippet}

Return markdown only, no heading. Start immediately.`

      const more = await callLLMForText(contPrompt, alpha, !!env.OPENAI_API_KEY, moreTokenCap)
      body += (body && !body.endsWith('\n\n') ? '\n\n' : '') + more.trim()
      
      // Enforce hard cap per section after continuation too
      const hardCap = Math.min(section.max_words, Math.ceil(section.target_words * 1.05))
      if (countWords(body) > hardCap) {
        const trimmed = trimToMaxWords(body, hardCap)
        body = trimmed.text
      }
      
      check = needsMore(body, section.min_words, section.max_words, requireQuotes, quoteBudget)

      if (process.env.DEBUG_GEN === '1') {
        console.log(`Section "${section.heading}" attempt ${attempt}: ${check.wc} words, ${check.pc} paragraphs, list: ${check.hasList}, quotes: ${check.qc}`)
      }
    }

    // Final safety net: if still too short after all retries, force expansion
    if (check.wc < section.min_words) {
      onProgress?.('section_force', Math.round(sectionProgress + 2), `Force expanding "${section.heading}" to meet word count`)
      
      const shortfall = section.min_words - check.wc
      const forcePrompt = `URGENT: This section is ${shortfall} words too short. Add exactly ${shortfall} more words of relevant content.

Current section (${check.wc} words):
${body}

Add ${shortfall} words now:`

      const extraContent = await callLLMForText(forcePrompt, alpha, !!env.OPENAI_API_KEY, Math.floor(moreTokenCap * 0.5))
      body += '\n\n' + extraContent.trim()
      const finalWordCount = countWords(body)

      sections.push({
        heading: section.heading,
        content: body.trim(),
        target_words: section.target_words,
        min_words: section.min_words,
        max_words: section.max_words,
        actual_words: finalWordCount
      })
    } else {
      sections.push({
        heading: section.heading,
        content: body.trim(),
        target_words: section.target_words,
        min_words: section.min_words,
        max_words: section.max_words,
        actual_words: check.wc
      })
    }

    const finalWordCount = sections[sections.length - 1].actual_words
    onProgress?.('section_complete', Math.round(sectionProgress + 3), `"${section.heading}" completed (${finalWordCount} words)`)
  }

  return sections
}

// Original function for backward compatibility
async function expandSections(outline: Outline, transcript: string, alpha: number, targetWordCount: number): Promise<BlogSection[]> {
  const sections: BlogSection[] = []
  const rawBudget = Math.round((1 - alpha) * 3)
  const quoteBudget = Math.max(0, rawBudget) // 0-3 quotes per section

  for (const section of outline.sections) {
    let snippet = sliceTranscriptForSection(transcript, section.key_points || [])
    let body = ''
    let attempt = 0
    const maxRetries = 6
    const requireQuotes = alpha < 0.5 && quoteBudget >= 1
    
    // Calculate max_tokens from per-section target (much more restrictive)
    const TOKENS_PER_WORD = 1.5
    const sectionTokenCap = Math.max(120, Math.round(section.target_words * TOKENS_PER_WORD))
    const moreTokenCap = Math.max(60, Math.round((section.target_words / 2) * TOKENS_PER_WORD))
    
    // Get format requirements based on section budget
    const shape = sectionShape(section.min_words, section.max_words)

    // Initial section generation
    const initialPrompt = `Write a ${section.target_words}-word blog section about "${section.heading}".

HARD LIMIT: ${section.max_words} words maximum. Aim for ${section.target_words} words.
Stop when you reach ${section.target_words} words (do NOT approach the max).

Format:
- ${shape.paras} paragraphs (blank line between paragraphs)
- ${shape.requireList ? `One bullet list with ${shape.list}` : `Optional bullet list (${shape.list} max)`}
- Use examples from the transcript.

Content source: ${snippet.slice(0, 800)}`

    body = await callLLMForText(initialPrompt, alpha, !!env.OPENAI_API_KEY, sectionTokenCap)
    
    // Enforce hard cap per section immediately after generation
    const hardCap = Math.min(section.max_words, Math.ceil(section.target_words * 1.05))
    if (countWords(body) > hardCap) {
      const trimmed = trimToMaxWords(body, hardCap)
      body = trimmed.text
    }
    
    let check = needsMore(body, section.min_words, section.max_words, requireQuotes, quoteBudget)

    // Validator loop with targeted continuation
    while (!check.ok && attempt < maxRetries) {
      attempt++

      // Try different snippet if still failing after 2 attempts
      if (attempt > 2) {
        snippet = sliceTranscriptForSection(transcript, section.key_points || [], attempt - 2)
      }

      const missingBits = [
        check.wc < section.min_words ? `CRITICAL: Add ${section.min_words - check.wc} more words to reach minimum ${section.min_words}` : null,
        check.pc < check.requiredParagraphs ? `Ensure at least ${check.requiredParagraphs} paragraphs (separate by blank lines)` : null,
        (check.requireList && !check.hasList) ? `Add a bulleted list` : null,
        requireQuotes && check.qc < quoteBudget ? `Add ${quoteBudget - check.qc} more direct quotes (20–40 words each)` : null,
      ].filter(Boolean).join('\n- ')

      const contPrompt = `Continue the same section to satisfy ALL missing requirements:
- ${missingBits}

WORD COUNT CHECK: Current section has ${check.wc} words but needs ${section.min_words}. Add exactly ${section.min_words - check.wc} more words.

Current content:
${body}

Continue in the same voice. Use this transcript snippet for additional content:
${snippet}

Return markdown only, no heading. Start immediately.`

      const more = await callLLMForText(contPrompt, alpha, !!env.OPENAI_API_KEY, moreTokenCap)
      body += (body && !body.endsWith('\n\n') ? '\n\n' : '') + more.trim()
      
      // Enforce hard cap per section after continuation too
      const hardCap = Math.min(section.max_words, Math.ceil(section.target_words * 1.05))
      if (countWords(body) > hardCap) {
        const trimmed = trimToMaxWords(body, hardCap)
        body = trimmed.text
      }
      
      check = needsMore(body, section.min_words, section.max_words, requireQuotes, quoteBudget)

      if (process.env.DEBUG_GEN === '1') {
        console.log(`Section "${section.heading}" attempt ${attempt}: ${check.wc} words, ${check.pc} paragraphs, list: ${check.hasList}, quotes: ${check.qc}`)
      }
    }

    // Final safety net: if still too short after all retries, force expansion
    if (check.wc < section.min_words) {
      const shortfall = section.min_words - check.wc
      const forcePrompt = `URGENT: This section is ${shortfall} words too short. Add exactly ${shortfall} more words of relevant content.

Current section (${check.wc} words):
${body}

Add ${shortfall} words now:`

      const extraContent = await callLLMForText(forcePrompt, alpha, !!env.OPENAI_API_KEY, Math.floor(moreTokenCap * 0.5))
      body += '\n\n' + extraContent.trim()
      const finalWordCount = countWords(body)

      if (process.env.DEBUG_GEN === '1') {
        console.log(`Forced expansion: "${section.heading}" ${check.wc} → ${finalWordCount} words`)
      }

      sections.push({
        heading: section.heading,
        content: body.trim(),
        target_words: section.target_words,
        min_words: section.min_words,
        max_words: section.max_words,
        actual_words: finalWordCount
      })
    } else {
      // Final word count enforcement: ensure within max
      let finalContent = body.trim()
      let finalWordCount = check.wc
      
      if (check.wc > section.max_words) {
        if (process.env.DEBUG_GEN === '1') {
          console.log(`Section "${section.heading}" is ${check.wc - section.max_words} words over limit, truncating...`)
        }
        
        const trimmed = trimToMaxWords(finalContent, section.max_words)
        finalContent = trimmed.text
        finalWordCount = trimmed.words
      }
      
      sections.push({
        heading: section.heading,
        content: finalContent,
        target_words: section.target_words,
        min_words: section.min_words,
        max_words: section.max_words,
        actual_words: finalWordCount
      })
    }

    if (process.env.DEBUG_GEN === '1') {
      console.log(`Section "${section.heading}": ${sections[sections.length-1].actual_words}/${section.min_words}-${section.max_words} words ✓`)
    }
  }

  return sections
}

// Global shrink pass to ensure final word count hits target
function shrinkSectionsToTarget(sections: BlogSection[], target: number): BlogSection[] {
  const total = sections.reduce((s, x) => s + x.actual_words, 0)
  if (total <= target) return sections

  let over = total - target
  // work longest -> shortest, trimming down toward each section's target (not below min)
  const ordered = sections.slice().sort((a, b) => b.actual_words - a.actual_words)

  for (const s of ordered) {
    if (over <= 0) break
    const desired = Math.max(s.min_words, Math.min(s.actual_words, s.target_words)) // pull toward target
    const canTrim = s.actual_words - desired
    if (canTrim <= 0) continue
    const trimBy = Math.min(canTrim, Math.ceil(over / 2)) // gentle, two passes max
    const newCap = s.actual_words - trimBy
    const t = trimToMaxWords(s.content, newCap)
    s.content = t.text
    s.actual_words = t.words
    over -= (trimBy - Math.max(0, (t.words - newCap))) // adjust for sentence-boundary trim
  }
  return sections
}

// Helper function for LLM calls
async function callLLMForText(prompt: string, alpha: number, useOpenAI: boolean, maxTokens?: number): Promise<string> {
  if (useOpenAI) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [{ role: 'user', content: prompt }],
        temperature: alpha < 0.5 ? 0.4 : 0.7,
        presence_penalty: alpha < 0.5 ? 0.0 : 0.3,
        frequency_penalty: alpha < 0.5 ? 0.0 : 0.2,
        max_tokens: maxTokens || 1000
      }),
    })
    
    if (!response.ok) {
      const errorData = await response.json()
      console.error('OpenAI API Error:', errorData)
      throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`)
    }
    
    const data = await response.json()
    const text = data?.choices?.[0]?.message?.content?.trim()
    if (!text) {
      console.error('OpenAI returned empty content')
      throw new Error('OpenAI returned empty content')
    }
    return text
  } else {
    // Ollama fallback
    const response = await fetch(`${env.OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.1:8b-instruct',
        prompt: prompt,
        stream: false,
        options: {
          temperature: alpha < 0.5 ? 0.4 : 0.7,
          repeat_penalty: alpha < 0.5 ? 1.0 : 1.2,
          num_predict: 4000
        }
      })
    })
    const data = await response.json()
    const text = data?.response?.trim()
    if (!text) throw new Error('Ollama returned empty content')
    return text
  }
}

// Assemble final blog post
async function assembleBlogPost(outline: Outline, sections: BlogSection[], videoUrl?: string): Promise<BlogPost> {
  const content = sections.map(s => `## ${s.heading}\n\n${s.content}`).join('\n\n')

  const actualWordCount = countWords(content)
  const headings = sections.map(s => ({ level: 2, text: s.heading }))

  return {
    title: outline.title,
    excerpt: outline.excerpt_goal || outline.excerpt || 'No excerpt available',
    content,
    tags: (outline.tags_guess || outline.tags || []).slice(0, 6),
    headings,
    word_count: actualWordCount,
    reading_time_minutes: Math.ceil(actualWordCount / 200),
    sources: videoUrl ? [{ type: 'video' as const, url: videoUrl, timestamps: [] }] : []
  }
}

// Expand weak sections if the total word count is too short
async function expandWeakSections(
  blogPost: BlogPost,
  sections: BlogSection[],
  targetWordCount: number,
  transcript: string,
  alpha: number
): Promise<ExpandResult> {
  const shortfall = targetWordCount - blogPost.word_count

  // Weight expansion by inverse section length - expand skinny sections more
  const totalWords = sections.reduce((sum, s) => sum + s.actual_words, 0)
  if (process.env.DEBUG_GEN === '1') {
    console.log(`Expanding ${sections.length} sections with weighted distribution`)
  }

  const expandedSections: BlogSection[] = []

  for (const section of sections) {
    // Skinnier sections get larger share of expansion
    const share = section.actual_words / totalWords
    const wordsNeeded = Math.ceil(shortfall * (1.5 - share))
    const expandPrompt = `Expand this section by adding ${wordsNeeded} more words.
- Add more examples, details, transitions
- Keep same tone and style
- Use information from the transcript
- Return markdown only, no heading, no JSON

Transcript:
${transcript}

Current section content:
${section.content}

Add ${wordsNeeded} more words of expansion:`

    const expandedContent = await callLLMForText(expandPrompt, alpha, !!env.OPENAI_API_KEY, 800)
    const combinedContent = section.content + '\n\n' + expandedContent.trim()
    const newWordCount = countWords(combinedContent)

    expandedSections.push({
      ...section,
      content: combinedContent,
      actual_words: newWordCount
    })

    if (process.env.DEBUG_GEN === '1') {
      console.log(`Expanded "${section.heading}": ${section.actual_words} → ${newWordCount} words`)
    }
  }

  // Reassemble the expanded blog post
  const newContent = expandedSections.map(s => `## ${s.heading}\n\n${s.content}`).join('\n\n')
  const newWordCount = countWords(newContent)

  return {
    blogPost: {
      ...blogPost,
      content: newContent,
      word_count: newWordCount,
      reading_time_minutes: Math.ceil(newWordCount / 200)
    },
    sections: expandedSections
  }
}

async function generateFromLongTranscriptWithProgress(
  transcript: string,
  alpha: number,
  videoUrl?: string,
  targetWordCount: number = 700,
  onProgress?: ProgressCallback
): Promise<BlogPost> {
  onProgress?.('chunking', 10, `Processing long transcript: ${transcript.length} chars -> ${targetWordCount} words`)
  
  // Create larger, more strategic chunks
  const chunkSize = 8000  // Larger chunks for better context
  const chunks: string[] = []

  for (let i = 0; i < transcript.length; i += chunkSize) {
    chunks.push(transcript.slice(i, i + chunkSize))
  }

  onProgress?.('outline_generation', 15, `Creating outline from ${chunks.length} transcript chunks`)

  // First, create a comprehensive outline from the full transcript
  const outlinePrompt = `Create a detailed blog post outline from this long transcript. Target: ${targetWordCount} words total.
  
Return JSON:
{
  "title": "Engaging blog post title",
  "excerpt": "1-2 sentences about the main topic", 
  "sections": [
    {"heading": "Introduction", "key_themes": ["theme1", "theme2"], "target_words": 150},
    {"heading": "Main Topic", "key_themes": ["theme1", "theme2"], "target_words": 200}
  ],
  "tags": ["tag1", "tag2", "tag3"]
}

Create exactly ${Math.ceil(targetWordCount / 150)} sections. Each section should target ~${Math.floor(targetWordCount / Math.ceil(targetWordCount / 150))} words.

Transcript (first 15000 chars):
${transcript.slice(0, 15000)}`

  let outline
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',  // Use full model for better outline
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: outlinePrompt }],
        temperature: 0.3,
        max_tokens: 3000
      })
    })
    const data = await response.json()
    outline = JSON.parse(data.choices[0].message.content)
    onProgress?.('outline_complete', 25, `Outline created with ${outline.sections.length} sections`)
  } catch {
    onProgress?.('outline_fallback', 25, 'Using fallback outline structure')
    // Fallback outline
    outline = {
      title: "Insights from Extended Discussion",
      excerpt: "Key insights and strategies from a comprehensive discussion.",
      sections: [
        {"heading": "Introduction", "key_themes": ["overview"], "target_words": Math.floor(targetWordCount / 4)},
        {"heading": "Key Strategies", "key_themes": ["methods"], "target_words": Math.floor(targetWordCount / 3)},
        {"heading": "Practical Applications", "key_themes": ["examples"], "target_words": Math.floor(targetWordCount / 3)}
      ],
      tags: ["insights", "strategies", "discussion"]
    }
  }

  // Now generate detailed content for each section
  const expandedSections: Array<{heading: string, content: string, actual_words: number}> = []
  const totalSections = outline.sections.length
  const progressStart = 30
  const progressEnd = 90
  const progressRange = progressEnd - progressStart
  
  for (let i = 0; i < outline.sections.length; i++) {
    const section = outline.sections[i]
    const sectionProgress = progressStart + (i / totalSections) * progressRange
    
    onProgress?.('long_section_start', Math.round(sectionProgress), `Writing "${section.heading}" (${i + 1}/${totalSections})`)
    
    // Find most relevant transcript chunks for this section
    const relevantChunks = chunks.slice(0, 3) // Use first 3 chunks for context
    const contextualTranscript = relevantChunks.join('\n\n')
    
    const sectionPrompt = `Write a detailed blog section for "${section.heading}" using this transcript content.

🎯 TARGET: Write exactly ${section.target_words} words (count every word)

📝 REQUIREMENTS:
- Write 4-6 full paragraphs with complete sentences
- Each paragraph should be 40-60 words
- Include ONE bulleted list with 5-7 items
- Include specific examples and details from the transcript
- ${alpha < 0.5 ? 'Use direct quotes from the transcript' : 'Expand and explain concepts thoroughly'}
- NO section headings in your response

KEY THEMES TO COVER: ${section.key_themes.join(', ')}

TRANSCRIPT CONTENT:
<<<
${contextualTranscript.slice(0, 12000)}
>>>

🚨 CRITICAL: Write a full blog section with detailed explanations, NOT a summary. Reach the target word count of ${section.target_words} words.`

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: sectionPrompt }],
          temperature: alpha < 0.5 ? 0.4 : 0.7,
          max_tokens: 4000
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        const content = data.choices[0].message.content.trim()
        const wordCount = countWords(content)
        
        onProgress?.('long_section_complete', Math.round(sectionProgress + (progressRange / totalSections * 0.8)), `"${section.heading}": ${wordCount} words generated`)
        
        expandedSections.push({
          heading: section.heading,
          content: content,
          actual_words: wordCount
        })
      } else {
        throw new Error(`API request failed: ${response.status}`)
      }
    } catch {
      onProgress?.('long_section_fallback', Math.round(sectionProgress), `Fallback content for "${section.heading}"`)
      // Fallback content
      expandedSections.push({
        heading: section.heading,
        content: `This section discusses ${section.key_themes.join(' and ')} as mentioned in the original content. The discussion covers important aspects and practical applications that can be applied in real-world scenarios.`,
        actual_words: 25
      })
    }
  }

  onProgress?.('long_assembly', 92, 'Assembling final long-form blog post...')

  // Assemble final blog post
  const content = expandedSections.map(s => `## ${s.heading}\n\n${s.content}`).join('\n\n')
  const finalWordCount = countWords(content)
  
  onProgress?.('long_complete', 100, `Long blog post completed: ${finalWordCount} words`)

  return {
    title: outline.title,
    excerpt: outline.excerpt,
    content,
    tags: outline.tags || ["comprehensive", "insights", "discussion"],
    headings: expandedSections.map(s => ({ level: 2, text: s.heading })),
    word_count: finalWordCount,
    reading_time_minutes: Math.ceil(finalWordCount / 200),
    sources: [{ type: 'video', url: videoUrl || '', timestamps: [] }]
  }
}

async function generateFromLongTranscript(
  transcript: string,
  alpha: number,
  videoUrl?: string,
  targetWordCount: number = 700
): Promise<BlogPost> {
  console.log(`Processing long transcript: ${transcript.length} chars -> ${targetWordCount} words`)
  
  // Create larger, more strategic chunks
  const chunkSize = 8000  // Larger chunks for better context
  const chunks: string[] = []

  for (let i = 0; i < transcript.length; i += chunkSize) {
    chunks.push(transcript.slice(i, i + chunkSize))
  }

  // First, create a comprehensive outline from the full transcript
  const outlinePrompt = `Create a detailed blog post outline from this long transcript. Target: ${targetWordCount} words total.
  
Return JSON:
{
  "title": "Engaging blog post title",
  "excerpt": "1-2 sentences about the main topic", 
  "sections": [
    {"heading": "Introduction", "key_themes": ["theme1", "theme2"], "target_words": 150},
    {"heading": "Main Topic", "key_themes": ["theme1", "theme2"], "target_words": 200}
  ],
  "tags": ["tag1", "tag2", "tag3"]
}

Create exactly ${Math.ceil(targetWordCount / 150)} sections. Each section should target ~${Math.floor(targetWordCount / Math.ceil(targetWordCount / 150))} words.

Transcript (first 15000 chars):
${transcript.slice(0, 15000)}`

  let outline
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',  // Use full model for better outline
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: outlinePrompt }],
        temperature: 0.3,
        max_tokens: 3000
      })
    })
    const data = await response.json()
    outline = JSON.parse(data.choices[0].message.content)
  } catch (error) {
    console.error('Outline generation failed:', error)
    // Fallback outline
    outline = {
      title: "Insights from Extended Discussion",
      excerpt: "Key insights and strategies from a comprehensive discussion.",
      sections: [
        {"heading": "Introduction", "key_themes": ["overview"], "target_words": Math.floor(targetWordCount / 4)},
        {"heading": "Key Strategies", "key_themes": ["methods"], "target_words": Math.floor(targetWordCount / 3)},
        {"heading": "Practical Applications", "key_themes": ["examples"], "target_words": Math.floor(targetWordCount / 3)}
      ],
      tags: ["insights", "strategies", "discussion"]
    }
  }

  // Now generate detailed content for each section
  const expandedSections = []
  
  for (const section of outline.sections) {
    
    // Find most relevant transcript chunks for this section
    const relevantChunks = chunks.slice(0, 3) // Use first 3 chunks for context
    const contextualTranscript = relevantChunks.join('\n\n')
    
    const sectionPrompt = `Write a detailed blog section for "${section.heading}" using this transcript content.

🎯 TARGET: Write exactly ${section.target_words} words (count every word)

📝 REQUIREMENTS:
- Write 4-6 full paragraphs with complete sentences
- Each paragraph should be 40-60 words
- Include ONE bulleted list with 5-7 items
- Include specific examples and details from the transcript
- ${alpha < 0.5 ? 'Use direct quotes from the transcript' : 'Expand and explain concepts thoroughly'}
- NO section headings in your response

KEY THEMES TO COVER: ${section.key_themes.join(', ')}

TRANSCRIPT CONTENT:
<<<
${contextualTranscript.slice(0, 12000)}
>>>

🚨 CRITICAL: Write a full blog section with detailed explanations, NOT a summary. Reach the target word count of ${section.target_words} words.`

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: sectionPrompt }],
          temperature: alpha < 0.5 ? 0.4 : 0.7,
          max_tokens: 4000
        })
      })
      
      if (response.ok) {
        const data = await response.json()
        const content = data.choices[0].message.content.trim()
        const wordCount = countWords(content)
        
        expandedSections.push({
          heading: section.heading,
          content: content,
          actual_words: wordCount
        })
      } else {
        throw new Error(`API request failed: ${response.status}`)
      }
    } catch (error) {
      console.error(`Failed to generate section "${section.heading}":`, error)
      // Fallback content
      expandedSections.push({
        heading: section.heading,
        content: `This section discusses ${section.key_themes.join(' and ')} as mentioned in the original content. The discussion covers important aspects and practical applications that can be applied in real-world scenarios.`,
        actual_words: 25
      })
    }
  }

  // Assemble final blog post
  const content = expandedSections.map(s => `## ${s.heading}\n\n${s.content}`).join('\n\n')
  const finalWordCount = countWords(content)

  return {
    title: outline.title,
    excerpt: outline.excerpt,
    content,
    tags: outline.tags || ["comprehensive", "insights", "discussion"],
    headings: expandedSections.map(s => ({ level: 2, text: s.heading })),
    word_count: finalWordCount,
    reading_time_minutes: Math.ceil(finalWordCount / 200),
    sources: [{ type: 'video', url: videoUrl || '', timestamps: [] }]
  }
}

async function generatePureTranscript(
  transcript: string,
  videoUrl?: string,
  targetWordCount: number = 700
): Promise<BlogPost> {
  
  // Clean up the transcript - remove excessive whitespace, fix punctuation
  let cleanTranscript = transcript
    .replace(/\s+/g, ' ')  // Replace multiple spaces with single space
    .replace(/\s*\n+\s*/g, '\n\n')  // Clean up line breaks
    .replace(/([.!?])\s*([A-Z])/g, '$1\n\n$2')  // Add paragraph breaks after sentences
    .trim()
  
  // If transcript is much longer than target, truncate intelligently
  if (targetWordCount > 0) {
    const currentWords = countWords(cleanTranscript)
    if (currentWords > targetWordCount * 1.5) {
      // Truncate to approximately target length, but at sentence boundaries
      const words = cleanTranscript.split(/\s+/)
      const targetWords = words.slice(0, targetWordCount)
      const truncated = targetWords.join(' ')
      
      // Find the last complete sentence
      const lastSentenceEnd = Math.max(
        truncated.lastIndexOf('.'),
        truncated.lastIndexOf('!'),
        truncated.lastIndexOf('?')
      )
      
      if (lastSentenceEnd > truncated.length * 0.8) {
        cleanTranscript = truncated.substring(0, lastSentenceEnd + 1)
      } else {
        cleanTranscript = truncated + '...'
      }
    }
  }
  
  // Add a simple title and structure
  const title = 'Video Transcript'
  const excerpt = 'Complete transcript of the video content.'
  const wordCount = countWords(cleanTranscript)
  
  return {
    title,
    excerpt,
    content: cleanTranscript,
    tags: ['transcript', 'verbatim', 'raw'],
    headings: [],
    word_count: wordCount,
    reading_time_minutes: Math.ceil(wordCount / 200),
    sources: videoUrl ? [{ type: 'video' as const, url: videoUrl, timestamps: [] }] : []
  }
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).length
}

function trimToMaxWords(md: string, maxWords: number): { text: string; words: number } {
  const words = md.trim().split(/\s+/)
  if (words.length <= maxWords) return { text: md.trim(), words: words.length }
  const sliced = words.slice(0, maxWords).join(' ')
  const lastEnd = Math.max(sliced.lastIndexOf('.'), sliced.lastIndexOf('!'), sliced.lastIndexOf('?'))
  const clean = lastEnd > sliced.length * 0.6 ? sliced.slice(0, lastEnd + 1) : sliced + '…'
  return { text: clean, words: countWords(clean) }
}

function sectionShape(minWords: number, maxWords: number) {
  const avg = (minWords + maxWords) / 2
  if (avg <= 120) return { paras: '1', list: '0-1 items', requireList: false }
  if (avg <= 170) return { paras: '1-2', list: '0-2 items', requireList: false }
  if (avg <= 250) return { paras: '2-3', list: '3-4 items', requireList: true }
  return { paras: '3-4', list: '5-7 items', requireList: true }
}

// Detect natural sections from transcript content
async function detectNaturalSections(transcript: string): Promise<string[]> {
  const detectionPrompt = `Analyze this transcript and identify the natural sections/topics the speaker covers.

Look for:
- Topic transitions ("Now let's talk about...", "The next point is...")
- Numbered points ("First", "Second", "Finally")
- Clear subject changes
- Natural breaks in discussion

Return a JSON array of section titles that reflect the speaker's organization:
["Section Title 1", "Section Title 2", "Section Title 3"]

Keep titles concise (2-5 words). Minimum 2 sections, maximum 8 sections.

Transcript:
${transcript.slice(0, 8000)}`

  try {
    if (hasApiKey()) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          response_format: { type: 'json_object' },
          messages: [{ 
            role: 'system', 
            content: 'You are an expert at analyzing content structure. Return valid JSON with an array called "sections".' 
          }, { 
            role: 'user', 
            content: detectionPrompt 
          }],
          temperature: 0.3,
          max_tokens: 1000
        }),
      })
      
      if (response.ok) {
        const data = await response.json()
        const result = JSON.parse(data.choices[0].message.content)
        const sections = result.sections || result
        
        // Validate and constrain results
        if (Array.isArray(sections) && sections.length >= 2 && sections.length <= 8) {
          return sections.slice(0, 8) // Cap at 8 sections max
        }
      }
    }
  } catch (error) {
    if (process.env.DEBUG_GEN === '1') {
      console.log('Natural section detection failed:', error)
    }
  }
  
  // Fallback: return generic structure based on transcript length
  const transcriptWords = countWords(transcript)
  if (transcriptWords < 500) {
    return ['Introduction', 'Main Points']
  } else if (transcriptWords < 1500) {
    return ['Introduction', 'Key Concepts', 'Conclusion']
  } else {
    return ['Introduction', 'Background', 'Main Discussion', 'Key Takeaways']
  }
}

// Calculate optimal section budget based on natural sections and target word count
type SectionBudget = {
  sectionCount: number
  wordsPerSection: number
  minWordsPerSection: number
  maxWordsPerSection: number
  strategy: 'natural' | 'merge' | 'split'
  originalSections: string[]
  finalSections: string[]
}

function calculateSectionBudget(naturalSections: string[], targetWordCount: number): SectionBudget {
  const naturalCount = naturalSections.length
  const baseWordsPerSection = Math.floor(targetWordCount / naturalCount)
  
  // Define constraints
  const MIN_SECTION_WORDS = 40
  const MAX_SECTION_WORDS = 350
  const IDEAL_MIN_SECTION_WORDS = 80
  const IDEAL_MAX_SECTION_WORDS = 250
  
  // Check if natural structure works as-is
  if (baseWordsPerSection >= IDEAL_MIN_SECTION_WORDS && baseWordsPerSection <= IDEAL_MAX_SECTION_WORDS) {
    return {
      sectionCount: naturalCount,
      wordsPerSection: baseWordsPerSection,
      minWordsPerSection: Math.max(MIN_SECTION_WORDS, Math.floor(baseWordsPerSection * 0.8)),
      maxWordsPerSection: Math.min(MAX_SECTION_WORDS, Math.floor(baseWordsPerSection * 1.3)),
      strategy: 'natural',
      originalSections: naturalSections,
      finalSections: naturalSections
    }
  }
  
  // If sections would be too small, merge them
  if (baseWordsPerSection < IDEAL_MIN_SECTION_WORDS) {
    const idealSectionCount = Math.max(1, Math.floor(targetWordCount / IDEAL_MIN_SECTION_WORDS))
    const mergedCount = Math.min(idealSectionCount, Math.max(2, Math.ceil(naturalCount / 2)))
    const mergedWordsPerSection = Math.floor(targetWordCount / mergedCount)
    
    return {
      sectionCount: mergedCount,
      wordsPerSection: mergedWordsPerSection,
      minWordsPerSection: Math.max(MIN_SECTION_WORDS, Math.floor(mergedWordsPerSection * 0.8)),
      maxWordsPerSection: Math.min(MAX_SECTION_WORDS, Math.floor(mergedWordsPerSection * 1.3)),
      strategy: 'merge',
      originalSections: naturalSections,
      finalSections: mergeNaturalSections(naturalSections, mergedCount)
    }
  }
  
  // If sections would be too large, split them
  if (baseWordsPerSection > IDEAL_MAX_SECTION_WORDS) {
    const idealSectionCount = Math.ceil(targetWordCount / IDEAL_MAX_SECTION_WORDS)
    const splitCount = Math.min(8, Math.max(naturalCount, idealSectionCount))
    const splitWordsPerSection = Math.floor(targetWordCount / splitCount)
    
    return {
      sectionCount: splitCount,
      wordsPerSection: splitWordsPerSection,
      minWordsPerSection: Math.max(MIN_SECTION_WORDS, Math.floor(splitWordsPerSection * 0.8)),
      maxWordsPerSection: Math.min(MAX_SECTION_WORDS, Math.floor(splitWordsPerSection * 1.25)),
      strategy: 'split',
      originalSections: naturalSections,
      finalSections: splitNaturalSections(naturalSections, splitCount)
    }
  }
  
  // Fallback to natural structure with adjusted constraints
  return {
    sectionCount: naturalCount,
    wordsPerSection: baseWordsPerSection,
    minWordsPerSection: Math.max(MIN_SECTION_WORDS, Math.floor(baseWordsPerSection * 0.7)),
    maxWordsPerSection: Math.min(MAX_SECTION_WORDS, Math.floor(baseWordsPerSection * 1.4)),
    strategy: 'natural',
    originalSections: naturalSections,
    finalSections: naturalSections
  }
}



