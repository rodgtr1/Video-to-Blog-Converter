'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, Eye, Code, Edit3, Save, X, ExternalLink } from 'lucide-react'

interface BlogPost {
  title: string
  excerpt: string
  content: string
  tags: string[]
  headings?: Array<{level: number, text: string}>
  word_count?: number
  reading_time_minutes?: number
  sources?: Array<{type: 'video', url?: string, timestamps?: string[]}>
  videoUrl?: string
}

interface BlogPreviewProps {
  blogPost: BlogPost | null
  isLoading: boolean
  onBlogPostUpdate?: (updatedPost: BlogPost) => void
}

export function BlogPreview({ blogPost, isLoading, onBlogPostUpdate }: BlogPreviewProps) {
  const [viewMode, setViewMode] = useState<'preview' | 'markdown'>('preview')
  const [isEditing, setIsEditing] = useState(false)
  const [editableContent, setEditableContent] = useState('')
  const [editableTitle, setEditableTitle] = useState('')
  const [editableExcerpt, setEditableExcerpt] = useState('')

  const generateTOC = (content: string) => {
    const headings = content.match(/^#{1,6}.+$/gm) || []
    return headings.map((heading, index) => {
      const level = heading.match(/^#+/)?.[0].length || 1
      const text = heading.replace(/^#+\s*/, '')
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      return { level, text, id, index }
    })
  }

  const calculateScore = (blogPost: BlogPost) => {
    const wordCount = blogPost.word_count || blogPost.content.split(/\s+/).length
    const headingCount = blogPost.headings?.length || (blogPost.content.match(/^#{1,6}.+$/gm) || []).length
    const paragraphCount = blogPost.content.split('\n\n').length
    const readingTime = blogPost.reading_time_minutes || Math.ceil(wordCount / 200)
    
    const readabilityScore = Math.min(100, Math.max(0, 
      (wordCount > 500 ? 80 : wordCount / 500 * 80) +
      (headingCount > 3 ? 20 : headingCount / 3 * 20)
    ))

    return {
      wordCount,
      headingCount,
      paragraphCount,
      readingTime,
      readabilityScore: Math.round(readabilityScore)
    }
  }

  const exportMarkdown = () => {
    if (!blogPost) return

    const frontMatter = `---
title: "${blogPost.title}"
excerpt: "${blogPost.excerpt}"
tags: [${blogPost.tags.map(tag => `"${tag}"`).join(', ')}]
date: ${new Date().toISOString()}
---

`

    const fullContent = frontMatter + blogPost.content
    const blob = new Blob([fullContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${blogPost.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6">
            <div className="animate-pulse space-y-4">
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-2/3"></div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  const startEditing = () => {
    if (!blogPost) return
    setEditableContent(blogPost.content)
    setEditableTitle(blogPost.title)
    setEditableExcerpt(blogPost.excerpt)
    setIsEditing(true)
  }

  const saveChanges = () => {
    if (!blogPost || !onBlogPostUpdate) return
    const updatedPost = {
      ...blogPost,
      title: editableTitle,
      excerpt: editableExcerpt,
      content: editableContent
    }
    onBlogPostUpdate(updatedPost)
    setIsEditing(false)
  }

  const cancelEditing = () => {
    setIsEditing(false)
    setEditableContent('')
    setEditableTitle('')
    setEditableExcerpt('')
  }

  if (!blogPost) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-gray-500">
          Upload a video or enter a YouTube URL to generate a blog post
        </CardContent>
      </Card>
    )
  }

  const toc = blogPost.headings || generateTOC(blogPost.content)
  const score = calculateScore(blogPost)

  return (
    <div className="space-y-4">
      {/* Header with title and controls */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {isEditing ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    value={editableTitle}
                    onChange={(e) => setEditableTitle(e.target.value)}
                    className="text-2xl font-bold w-full p-2 border rounded"
                    placeholder="Blog title..."
                  />
                  <textarea
                    value={editableExcerpt}
                    onChange={(e) => setEditableExcerpt(e.target.value)}
                    className="w-full p-2 border rounded text-gray-600"
                    rows={2}
                    placeholder="Blog excerpt..."
                  />
                </div>
              ) : (
                <>
                  <CardTitle className="text-2xl mb-2">{blogPost.title}</CardTitle>
                  <p className="text-gray-600 mb-4">{blogPost.excerpt}</p>
                </>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                {blogPost.tags.map((tag, index) => (
                  <Badge key={index} variant="secondary">{tag}</Badge>
                ))}
              </div>
            </div>
            <div className="flex gap-2 ml-4">
              {isEditing ? (
                <>
                  <Button onClick={saveChanges} size="sm" variant="default">
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button onClick={cancelEditing} size="sm" variant="outline">
                    <X className="w-4 h-4 mr-1" />
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={viewMode === 'preview' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('preview')}
                  >
                    <Eye className="w-4 h-4 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant={viewMode === 'markdown' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setViewMode('markdown')}
                  >
                    <Code className="w-4 h-4 mr-1" />
                    Markdown
                  </Button>
                  {onBlogPostUpdate && (
                    <Button onClick={startEditing} size="sm" variant="outline">
                      <Edit3 className="w-4 h-4 mr-1" />
                      Edit
                    </Button>
                  )}
                  <Button onClick={exportMarkdown} size="sm">
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main content */}
        <div className="lg:col-span-3">
          <Card>
            <CardContent className="p-6">
              {blogPost.videoUrl && (
                <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-700">
                    <ExternalLink className="w-4 h-4" />
                    <span className="font-medium">Source Video:</span>
                    <a 
                      href={blogPost.videoUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      Watch on YouTube
                    </a>
                  </div>
                </div>
              )}
              
              {isEditing ? (
                <div className="space-y-4">
                  <div className="text-sm font-medium">Edit Content (Markdown):</div>
                  <textarea
                    value={editableContent}
                    onChange={(e) => setEditableContent(e.target.value)}
                    className="w-full h-96 p-4 font-mono text-sm border rounded-lg"
                    placeholder="Enter your blog content in Markdown format..."
                  />
                </div>
              ) : viewMode === 'preview' ? (
                <article className="prose prose-lg max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {blogPost.content}
                  </ReactMarkdown>
                </article>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-sm bg-gray-50 p-4 rounded-lg overflow-auto">
                  {blogPost.content}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Table of Contents */}
          {toc.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Table of Contents</CardTitle>
              </CardHeader>
              <CardContent>
                <nav className="space-y-1">
                  {toc.map((item, index) => (
                    <div
                      key={index}
                      className={`text-sm hover:text-blue-600 cursor-pointer ${
                        item.level === 1 ? 'font-medium' : ''
                      }`}
                      style={{ paddingLeft: `${(item.level - 1) * 12}px` }}
                    >
                      {item.text}
                    </div>
                  ))}
                </nav>
              </CardContent>
            </Card>
          )}

          {/* Blog Score */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Blog Score</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Readability</span>
                <span className="font-medium">{score.readabilityScore}/100</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Word Count</span>
                <span className="font-medium">{score.wordCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Reading Time</span>
                <span className="font-medium">{score.readingTime} min</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Headings</span>
                <span className="font-medium">{score.headingCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">Paragraphs</span>
                <span className="font-medium">{score.paragraphCount}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}