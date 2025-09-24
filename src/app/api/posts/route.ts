import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'

export interface SavedPost {
  id: string
  title: string
  excerpt: string
  word_count: number
  reading_time_minutes: number
  tags: string[]
  generated_at: string
  transcript_length: number
  folder_name: string
}

export async function GET() {
  try {
    const projectRoot = process.cwd()
    const postsDir = path.join(projectRoot, 'posts')
    
    // Check if posts directory exists
    try {
      await fs.access(postsDir)
    } catch {
      // Posts directory doesn't exist yet
      return NextResponse.json({
        success: true,
        posts: []
      })
    }

    // Read all directories in posts folder
    const entries = await fs.readdir(postsDir, { withFileTypes: true })
    const postFolders = entries.filter(entry => entry.isDirectory())
    
    const posts: SavedPost[] = []
    
    for (const folder of postFolders) {
      try {
        const metadataPath = path.join(postsDir, folder.name, 'metadata.json')
        const metadataContent = await fs.readFile(metadataPath, 'utf-8')
        const metadata = JSON.parse(metadataContent)
        
        posts.push({
          id: folder.name,
          title: metadata.title,
          excerpt: metadata.excerpt,
          word_count: metadata.word_count,
          reading_time_minutes: metadata.reading_time_minutes,
          tags: metadata.tags || [],
          generated_at: metadata.generated_at,
          transcript_length: metadata.transcript_length,
          folder_name: folder.name
        })
      } catch (error) {
        console.warn(`Failed to read metadata for post ${folder.name}:`, error)
        // Skip posts with invalid metadata
        continue
      }
    }
    
    // Sort posts by generated_at date, newest first
    posts.sort((a, b) => new Date(b.generated_at).getTime() - new Date(a.generated_at).getTime())
    
    return NextResponse.json({
      success: true,
      posts
    })
    
  } catch (error) {
    console.error('Error listing posts:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list posts'
    }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const postId = searchParams.get('id')
    
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
    
    // Delete the entire post directory
    await fs.rm(postDir, { recursive: true, force: true })
    
    return NextResponse.json({
      success: true,
      message: 'Post deleted successfully'
    })
    
  } catch (error) {
    console.error('Error deleting post:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete post'
    }, { status: 500 })
  }
}