export interface TranscriptionResponse {
  text: string
  success: boolean
  error?: string
}

export interface BlogGenerationResponse {
  title: string
  excerpt: string
  content: string
  tags: string[]
  headings?: Array<{level: number, text: string}>
  word_count?: number
  reading_time_minutes?: number
  sources?: Array<{type: 'video', url?: string, timestamps?: string[]}>
  success: boolean
  error?: string
}

export async function transcribeVideo(file: File): Promise<TranscriptionResponse> {
  try {
    const formData = new FormData()
    formData.append('video', file)

    const response = await fetch('/api/transcribe', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Network error' }))
      return {
        success: false,
        text: '',
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`
      }
    }

    return await response.json()
  } catch (error) {
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Failed to upload video'
    }
  }
}

export async function transcribeYouTube(url: string): Promise<TranscriptionResponse> {
  try {
    const response = await fetch('/api/transcribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ youtubeUrl: url }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Network error' }))
      return {
        success: false,
        text: '',
        error: errorData.error || `HTTP ${response.status}: ${response.statusText}`
      }
    }

    return await response.json()
  } catch (error) {
    return {
      success: false,
      text: '',
      error: error instanceof Error ? error.message : 'Failed to process YouTube URL'
    }
  }
}

export async function generateBlogPost(
  transcript: string,
  alpha: number,
  videoUrl?: string,
  targetWordCount?: number
): Promise<BlogGenerationResponse> {
  const response = await fetch('/api/blogify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      transcript, 
      alpha, 
      videoUrl,
      targetWordCount 
    }),
  })

  return response.json()
}

export interface ProgressUpdate {
  step: string
  progress: number
  details?: string
  result?: BlogGenerationResponse
  error?: string
}

export async function generateBlogPostWithProgress(
  transcript: string,
  alpha: number,
  videoUrl?: string,
  targetWordCount?: number,
  onProgress?: (update: ProgressUpdate) => void
): Promise<BlogGenerationResponse> {
  const response = await fetch('/api/blogify?stream=true', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ 
      transcript, 
      alpha, 
      videoUrl,
      targetWordCount 
    }),
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const reader = response.body?.getReader()
  const decoder = new TextDecoder()

  if (!reader) {
    throw new Error('Response body is not readable')
  }

  let result: BlogGenerationResponse | null = null

  try {
    while (true) {
      const { done, value } = await reader.read()
      
      if (done) break
      
      const chunk = decoder.decode(value)
      const lines = chunk.split('\n')
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            onProgress?.(data)
            
            if (data.step === 'complete' && data.result) {
              result = data.result
            }
            
            if (data.step === 'error') {
              throw new Error(data.error || 'Blog generation failed')
            }
          } catch {
            // Ignore malformed JSON lines
            continue
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!result) {
    throw new Error('No result received from blog generation')
  }

  return result
}

export interface SaveResultsResponse {
  success: boolean
  savedTo?: string
  files?: string[]
  error?: string
}

export async function saveResults(
  videoTitle: string,
  transcript: string,
  blogPost: BlogGenerationResponse
): Promise<SaveResultsResponse> {
  try {
    const response = await fetch('/api/save-results', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        videoTitle,
        transcript,
        blogPost
      })
    })

    return await response.json()
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save results'
    }
  }
}
