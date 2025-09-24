import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { validateRequestBody, saveResultsSchema, sanitizeFilename } from '@/lib/validation'

export async function POST(request: NextRequest) {
  try {
    // Validate input
    const validation = await validateRequestBody(request, saveResultsSchema)
    if (validation.error || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Validation failed'
      }, { status: 400 })
    }
    
    const { videoTitle, transcript, alpha, targetWordCount, blogPost } = validation.data

    // Sanitize the video title for use as a folder name
    const sanitizedTitle = sanitizeFilename(videoTitle)

    // Create the posts directory structure with path validation
    const projectRoot = process.cwd()
    const postsDir = path.join(projectRoot, 'posts')
    const videoDir = path.join(postsDir, sanitizedTitle)
    
    // Security check: ensure paths are within project directory
    const resolvedPostsDir = path.resolve(postsDir)
    const resolvedVideoDir = path.resolve(videoDir)
    const resolvedProjectRoot = path.resolve(projectRoot)
    
    if (!resolvedPostsDir.startsWith(resolvedProjectRoot) || 
        !resolvedVideoDir.startsWith(resolvedPostsDir)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid path detected'
      }, { status: 400 })
    }

    // Ensure directories exist
    await fs.mkdir(postsDir, { recursive: true })
    await fs.mkdir(videoDir, { recursive: true })

    // Save transcript
    const transcriptPath = path.join(videoDir, 'transcript.txt')
    await fs.writeFile(transcriptPath, transcript, 'utf-8')

    // Save blog post as markdown
    const blogContent = `# ${blogPost.title}

*${blogPost.excerpt}*

**Word Count:** ${blogPost.word_count} | **Reading Time:** ${blogPost.reading_time_minutes} minutes | **Alpha:** ${alpha} | **Target:** ${targetWordCount}

**Tags:** ${blogPost.tags.join(', ')}

---

${blogPost.content}

---

*Generated from video transcript on ${new Date().toISOString().split('T')[0]} (α=${alpha})*
`

    const blogPath = path.join(videoDir, 'blog-post.md')
    await fs.writeFile(blogPath, blogContent, 'utf-8')

    // Save metadata as JSON
    const metadata = {
      title: blogPost.title,
      excerpt: blogPost.excerpt,
      word_count: blogPost.word_count,
      reading_time_minutes: blogPost.reading_time_minutes,
      tags: blogPost.tags,
      headings: blogPost.headings,
      sources: blogPost.sources,
      alpha_used: alpha,
      target_word_count: targetWordCount,
      generated_at: new Date().toISOString(),
      transcript_length: transcript.length
    }

    const metadataPath = path.join(videoDir, 'metadata.json')
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')

    console.log(`Saved results to: ${videoDir}`)

    return NextResponse.json({
      success: true,
      savedTo: videoDir,
      files: ['transcript.txt', 'blog-post.md', 'metadata.json']
    })

  } catch (error) {
    console.error('Error saving results:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save results'
    }, { status: 500 })
  }
}