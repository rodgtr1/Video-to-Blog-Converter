import { z } from 'zod'
import { NextRequest } from 'next/server'

// Request schemas
export const transcribeFileSchema = z.object({
  file: z.any().refine((file) => file instanceof File, {
    message: 'Must be a valid file'
  }),
})

export const transcribeYouTubeSchema = z.object({
  youtubeUrl: z.string().url().refine(
    (url) => url.includes('youtube.com/watch?v=') || url.includes('youtu.be/'),
    { message: 'Must be a valid YouTube URL' }
  )
})

export const blogGenerationSchema = z.object({
  transcript: z.string().min(50, 'Transcript must be at least 50 characters'),
  alpha: z.number().min(0).max(1),
  targetWordCount: z.number().min(100).max(5000),
  videoUrl: z.string().url().optional(),
})

export const saveResultsSchema = z.object({
  videoTitle: z.string().min(1).max(255),
  transcript: z.string().min(1),
  blogPost: z.object({
    title: z.string(),
    excerpt: z.string(),
    content: z.string(),
    tags: z.array(z.string()),
    word_count: z.number(),
    reading_time_minutes: z.number(),
    headings: z.array(z.object({
      level: z.number(),
      text: z.string()
    })).optional(),
    sources: z.array(z.object({
      type: z.literal('video'),
      url: z.string().optional(),
      timestamps: z.array(z.string()).optional()
    })).optional()
  })
})

// Validation helper
export async function validateRequestBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: string }> {
  try {
    const body = await request.json()
    const data = schema.parse(body)
    return { data, error: null }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join(', ')
      return { data: null, error: `Validation failed: ${errors}` }
    }
    return { data: null, error: 'Invalid request format' }
  }
}

// File size validation
export function validateFileSize(buffer: Buffer, maxSize: number = 2 * 1024 * 1024 * 1024): boolean {
  return buffer.length <= maxSize
}

// Sanitize filename for filesystem safety
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9\s\-_.]/g, '') // Remove special characters
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .toLowerCase()
    .slice(0, 100) // Limit length
}