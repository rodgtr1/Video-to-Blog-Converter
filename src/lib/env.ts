import { z } from 'zod'

const envSchema = z.object({
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  OLLAMA_BASE_URL: z.string().url().optional().default('http://localhost:11434'),
  DEBUG_GEN: z.string().optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  MAX_FILE_SIZE: z.string().transform(val => parseInt(val) || 2147483648), // 2GB default
  ALLOWED_ORIGINS: z.string().optional().transform(val => val ? val.split(',') : []),
})

export type Env = z.infer<typeof envSchema>

function validateEnv(): Env {
  try {
    return envSchema.parse(process.env)
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingFields = error.issues.map(err => err.path.join('.')).join(', ')
      console.warn(`Environment validation failed. Missing or invalid: ${missingFields}`)
      // In development, allow missing keys with warnings
      if (process.env.NODE_ENV === 'development') {
        return {
          OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
          OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
          DEBUG_GEN: process.env.DEBUG_GEN,
          NODE_ENV: (process.env.NODE_ENV as 'development' | 'production' | 'test') || 'development',
          MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE || '2147483648'),
          ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [],
        }
      }
      throw new Error(`Environment validation failed. Missing or invalid: ${missingFields}`)
    }
    throw error
  }
}

export const env = validateEnv()

// Utility to check if we're in production
export const isProd = env.NODE_ENV === 'production'
export const isDev = env.NODE_ENV === 'development'

// Safe API key checker (doesn't expose the key)
export function hasApiKey(): boolean {
  return !!env.OPENAI_API_KEY && env.OPENAI_API_KEY.length > 10
}