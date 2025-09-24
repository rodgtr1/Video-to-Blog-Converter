import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { validateRequestBody, sanitizeFilename } from '@/lib/validation'
import { z } from 'zod'

// Import the blog generation logic from the blogify route
import { generateBlogContent } from '../blogify/route'

const regenerateSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
  alpha: z.number().min(0).max(1, 'Alpha must be between 0 and 1'),
  targetWordCount: z.number().min(100).max(3000, 'Word count must be between 100 and 3000'),
  videoUrl: z.string().optional()
})

export async function POST(request: NextRequest) {
  try {
    // Validate input
    const validation = await validateRequestBody(request, regenerateSchema)
    if (validation.error || !validation.data) {
      return NextResponse.json({
        success: false,
        error: validation.error || 'Validation failed'
      }, { status: 400 })
    }
    
    const { postId, alpha, targetWordCount, videoUrl } = validation.data

    // Security check: ensure post ID is safe
    const sanitizedPostId = sanitizeFilename(postId)
    if (sanitizedPostId !== postId) {
      return NextResponse.json({
        success: false,
        error: 'Invalid post ID'
      }, { status: 400 })
    }

    const projectRoot = process.cwd()
    const postDir = path.join(projectRoot, 'posts', postId)
    
    // Security check: ensure paths are within project directory
    const resolvedPostDir = path.resolve(postDir)
    const resolvedPostsDir = path.resolve(path.join(projectRoot, 'posts'))
    
    if (!resolvedPostDir.startsWith(resolvedPostsDir)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid post directory'
      }, { status: 400 })
    }

    // Check if post directory exists and has transcript
    const transcriptPath = path.join(postDir, 'transcript.txt')
    let transcript: string
    
    try {
      transcript = await fs.readFile(transcriptPath, 'utf-8')
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Transcript not found. Original post may have been deleted.'
      }, { status: 404 })
    }

    if (!transcript.trim()) {
      return NextResponse.json({
        success: false,
        error: 'Transcript is empty'
      }, { status: 400 })
    }

    // Generate new blog content
    console.log(`Regenerating blog post for ${postId} with alpha=${alpha}, words=${targetWordCount}`)
    
    const blogResult = await generateBlogContent(transcript, alpha, videoUrl, targetWordCount)

    // Find the next version number
    const existingFiles = await fs.readdir(postDir)
    const blogVersions = existingFiles
      .filter(file => file.startsWith('blog-post-v') && file.endsWith('.md'))
      .map(file => {
        const match = file.match(/blog-post-v(\d+)\.md/)
        return match ? parseInt(match[1], 10) : 0
      })
    
    const nextVersion = Math.max(1, ...blogVersions) + 1

    // Save the new version
    const versionedBlogPath = path.join(postDir, `blog-post-v${nextVersion}.md`)
    const versionedMetadataPath = path.join(postDir, `metadata-v${nextVersion}.json`)

    // Create blog content with version info
    const blogContent = `# ${blogResult.title}

*${blogResult.excerpt}*

**Word Count:** ${blogResult.word_count} | **Reading Time:** ${blogResult.reading_time_minutes} minutes | **Version:** ${nextVersion} | **Alpha:** ${alpha}

**Tags:** ${blogResult.tags.join(', ')}

---

${blogResult.content}

---

*Generated from video transcript on ${new Date().toISOString().split('T')[0]} (Version ${nextVersion}, α=${alpha})*
`

    // Create metadata for this version
    const versionMetadata = {
      version: nextVersion,
      title: blogResult.title,
      excerpt: blogResult.excerpt,
      word_count: blogResult.word_count,
      reading_time_minutes: blogResult.reading_time_minutes,
      tags: blogResult.tags,
      headings: blogResult.headings,
      sources: blogResult.sources,
      alpha_used: alpha,
      target_word_count: targetWordCount,
      generated_at: new Date().toISOString(),
      regenerated_from: postId,
      video_url: videoUrl
    }

    // Save both files
    await Promise.all([
      fs.writeFile(versionedBlogPath, blogContent, 'utf-8'),
      fs.writeFile(versionedMetadataPath, JSON.stringify(versionMetadata, null, 2), 'utf-8')
    ])

    // Update the main metadata.json to track the latest version
    const mainMetadataPath = path.join(postDir, 'metadata.json')
    interface MetadataStructure {
      title?: string
      excerpt?: string
      generated_at?: string
      transcript_length?: number
      latest_version?: number
      versions?: Array<{
        version: number
        alpha: number
        word_count: number
        target_word_count: number
        generated_at: string
      }>
    }
    
    let mainMetadata: MetadataStructure = {}
    
    try {
      const existing = await fs.readFile(mainMetadataPath, 'utf-8')
      mainMetadata = JSON.parse(existing)
    } catch {
      // If main metadata doesn't exist, create basic structure
      mainMetadata = {
        title: blogResult.title,
        excerpt: blogResult.excerpt,
        generated_at: new Date().toISOString(),
        transcript_length: transcript.length
      }
    }

    // Update with versioning info
    mainMetadata.latest_version = nextVersion
    mainMetadata.versions = mainMetadata.versions || []
    
    // Add this version to the versions array if not already present
    const existingVersionIndex = mainMetadata.versions?.findIndex(v => v.version === nextVersion) ?? -1
    if (existingVersionIndex >= 0) {
      mainMetadata.versions[existingVersionIndex] = {
        version: nextVersion,
        alpha: alpha,
        word_count: blogResult.word_count,
        target_word_count: targetWordCount,
        generated_at: new Date().toISOString()
      }
    } else {
      mainMetadata.versions.push({
        version: nextVersion,
        alpha: alpha,
        word_count: blogResult.word_count,
        target_word_count: targetWordCount,
        generated_at: new Date().toISOString()
      })
    }

    // Save updated main metadata
    await fs.writeFile(mainMetadataPath, JSON.stringify(mainMetadata, null, 2), 'utf-8')

    console.log(`Saved regenerated blog post: ${versionedBlogPath}`)

    return NextResponse.json({
      success: true,
      version: nextVersion,
      title: blogResult.title,
      excerpt: blogResult.excerpt,
      content: blogResult.content,
      tags: blogResult.tags,
      headings: blogResult.headings,
      word_count: blogResult.word_count,
      reading_time_minutes: blogResult.reading_time_minutes,
      sources: blogResult.sources,
      savedTo: postDir,
      files: [`blog-post-v${nextVersion}.md`, `metadata-v${nextVersion}.json`]
    })

  } catch (error) {
    console.error('Error regenerating blog post:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to regenerate blog post'
    }, { status: 500 })
  }
}