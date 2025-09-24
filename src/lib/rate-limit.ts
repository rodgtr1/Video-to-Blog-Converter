// Simple in-memory rate limiter (use Redis in production)
const requests = new Map<string, { count: number; resetTime: number }>()

export interface RateLimitConfig {
  maxRequests: number
  windowMs: number
}

export function rateLimit(config: RateLimitConfig) {
  return (identifier: string): { allowed: boolean; remaining: number; resetTime: number } => {
    const now = Date.now()
    const key = identifier
    
    const requestData = requests.get(key)
    
    // Clean up expired entries
    if (requestData && now > requestData.resetTime) {
      requests.delete(key)
    }
    
    const currentData = requests.get(key) || { count: 0, resetTime: now + config.windowMs }
    
    if (currentData.count >= config.maxRequests) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: currentData.resetTime
      }
    }
    
    currentData.count++
    requests.set(key, currentData)
    
    return {
      allowed: true,
      remaining: config.maxRequests - currentData.count,
      resetTime: currentData.resetTime
    }
  }
}

// Pre-configured rate limiters
export const transcriptionRateLimit = rateLimit({
  maxRequests: 5, // 5 transcriptions per hour
  windowMs: 60 * 60 * 1000
})

export const blogGenerationRateLimit = rateLimit({
  maxRequests: 10, // 10 blog generations per hour  
  windowMs: 60 * 60 * 1000
})

// Helper to get client identifier
export function getClientIdentifier(request: Request): string {
  // Use IP address (in production, consider using user ID if authenticated)
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'unknown'
  return ip
}