'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { FileText, Clock, Users, Trash2, RefreshCw, FolderOpen } from 'lucide-react'
import { getSavedPosts, deletePost, loadPost, SavedPost, LoadedPost } from '@/lib/client'

interface PostsListProps {
  onLoadPost?: (post: LoadedPost) => void
  onPostDeleted?: () => void
  onPostsCountChange?: (count: number) => void
}

export function PostsList({ onLoadPost, onPostDeleted, onPostsCountChange }: PostsListProps) {
  const [posts, setPosts] = useState<SavedPost[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingPost, setIsLoadingPost] = useState<string | null>(null)
  const [isDeletingPost, setIsDeletingPost] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchPosts = async () => {
    setIsLoading(true)
    setError(null)
    
    try {
      const result = await getSavedPosts()
      if (result.success) {
        setPosts(result.posts)
        onPostsCountChange?.(result.posts.length)
      } else {
        setError(result.error || 'Failed to fetch posts')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to fetch posts')
    } finally {
      setIsLoading(false)
    }
  }

  const handleLoadPost = async (postId: string) => {
    if (!onLoadPost) return
    
    setIsLoadingPost(postId)
    try {
      const result = await loadPost(postId)
      if (result.success && result.post) {
        onLoadPost(result.post)
      } else {
        setError(result.error || 'Failed to load post')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load post')
    } finally {
      setIsLoadingPost(null)
    }
  }

  const handleDeletePost = async (postId: string) => {
    setIsDeletingPost(postId)
    try {
      const result = await deletePost(postId)
      if (result.success) {
        const newPosts = posts.filter(post => post.id !== postId)
        setPosts(newPosts)
        onPostsCountChange?.(newPosts.length)
        onPostDeleted?.()
      } else {
        setError(result.error || 'Failed to delete post')
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to delete post')
    } finally {
      setIsDeletingPost(null)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  useEffect(() => {
    fetchPosts()
  }, [])

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saved Posts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="border rounded-lg p-4">
                <div className="h-5 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="h-full flex flex-col">
      {/* Refresh Button */}
      <div className="p-4 border-b border-gray-100">
        <Button 
          onClick={fetchPosts} 
          size="sm" 
          variant="outline"
          disabled={isLoading}
          className="w-full"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh Posts
        </Button>
      </div>
      
      <div className="flex-1 overflow-hidden p-4">
        {error && (
          <div className="text-sm p-3 rounded bg-red-50 text-red-700 border border-red-200 mb-4">
            {error}
          </div>
        )}
        
        {posts.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No saved posts yet</p>
            <p className="text-sm mt-1">Generate a blog post to see it here</p>
          </div>
        ) : (
          <div className="space-y-4 h-full overflow-y-auto posts-scroll pr-1">
            {posts.map((post) => (
              <div key={post.id} className="border rounded-lg p-4 hover:bg-gray-50 transition-colors">
                <div className="space-y-3">
                  {/* Title and Date */}
                  <div className="space-y-2">
                    <h3 className="font-semibold text-base line-clamp-2">
                      {post.title}
                    </h3>
                    <span className="text-sm text-gray-500">
                      {formatDate(post.generated_at)}
                    </span>
                  </div>
                  
                  {/* Excerpt */}
                  <p className="text-sm text-gray-600 line-clamp-3 leading-relaxed">
                    {post.excerpt}
                  </p>
                  
                  {/* Stats */}
                  <div className="flex items-center gap-6 text-sm text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4" />
                      <span>{post.word_count} words</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4" />
                      <span>{post.reading_time_minutes} min</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      <span>{Math.round(post.transcript_length / 1000)}k chars</span>
                    </div>
                  </div>
                  
                  {/* Tags */}
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {post.tags.slice(0, 4).map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs px-2 py-1">
                          {tag}
                        </Badge>
                      ))}
                      {post.tags.length > 4 && (
                        <span className="text-sm text-gray-500 self-center">
                          +{post.tags.length - 4} more
                        </span>
                      )}
                    </div>
                  )}
                  
                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    <Button
                      onClick={() => handleLoadPost(post.id)}
                      size="sm"
                      variant="outline"
                      disabled={isLoadingPost === post.id || !onLoadPost}
                      className="flex-1 h-9"
                    >
                      {isLoadingPost === post.id ? (
                        <>
                          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          Loading...
                        </>
                      ) : (
                        <>
                          <FolderOpen className="w-4 h-4 mr-2" />
                          Load Post
                        </>
                      )}
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          disabled={isDeletingPost === post.id}
                          className="h-9 px-3"
                        >
                          {isDeletingPost === post.id ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Post</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete &ldquo;{post.title}&rdquo;? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={() => handleDeletePost(post.id)}
                            className="bg-red-600 hover:bg-red-700"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}