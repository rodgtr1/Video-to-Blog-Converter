import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export interface LoadedPost {
  id: string
  title: string
  excerpt: string
  content: string
  tags: string[]
  headings?: Array<{level: number, text: string}>
  word_count: number
  reading_time_minutes: number
  sources?: Array<{type: 'video', url?: string, timestamps?: string[]}>
  generated_at: string
  transcript: string
  videoUrl?: string
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: postId } = await params
    
    if (!postId) {
      return NextResponse.json({
        success: false,
        error: 'Post ID is required'
      }, { status: 400 })
    }
    
    const projectRoot = process.cwd()
    const postDir = path.join(projectRoot, 'posts', postId)
    
    // Security check: ensure path is within posts directory
    const resolvedPostDir = path.resolve(postDir)
    const resolvedPostsDir = path.resolve(path.join(projectRoot, 'posts'))
    
    if (!resolvedPostDir.startsWith(resolvedPostsDir)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid post ID'
      }, { status: 400 })
    }
    
    // Check if post directory exists
    try {
      await fs.access(postDir)
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Post not found'
      }, { status: 404 })
    }
    
    // Read all required files
    const metadataPath = path.join(postDir, 'metadata.json')
    const blogPostPath = path.join(postDir, 'blog-post.md')
    const transcriptPath = path.join(postDir, 'transcript.txt')
    
    try {
      const [metadataContent, blogPostContent, transcriptContent] = await Promise.all([
        fs.readFile(metadataPath, 'utf-8'),
        fs.readFile(blogPostPath, 'utf-8'),
        fs.readFile(transcriptPath, 'utf-8')
      ])
      
      const metadata = JSON.parse(metadataContent)
      
      // Extract the actual blog content from the markdown file
      // The saved markdown has a header format, so we need to extract just the content part
      const contentMatch = blogPostContent.match(/---\n\n([\s\S]*?)\n\n---/)
      const content = contentMatch ? contentMatch[1] : blogPostContent
      
      // Determine video URL from sources if available
      let videoUrl: string | undefined
      if (metadata.sources && metadata.sources.length > 0) {
        const videoSource = metadata.sources.find((s: {type: string, url?: string}) => s.type === 'video' && s.url)
        videoUrl = videoSource?.url
      }
      
      const loadedPost: LoadedPost = {
        id: postId,
        title: metadata.title,
        excerpt: metadata.excerpt,
        content: content,
        tags: metadata.tags || [],
        headings: metadata.headings,
        word_count: metadata.word_count,
        reading_time_minutes: metadata.reading_time_minutes,
        sources: metadata.sources,
        generated_at: metadata.generated_at,
        transcript: transcriptContent,
        videoUrl
      }
      
      return NextResponse.json({
        success: true,
        post: loadedPost
      })
      
    } catch (error) {
      console.error(`Error reading post files for ${postId}:`, error)
      return NextResponse.json({
        success: false,
        error: 'Failed to read post files'
      }, { status: 500 })
    }
    
  } catch (error) {
    console.error('Error loading post:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load post'
    }, { status: 500 })
  }
}