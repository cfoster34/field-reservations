import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

// Rate limiting configuration
const rateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 requests per minute
}

// Simple in-memory rate limiting for development
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()

// Simple in-memory cache
const cacheStore = new Map<string, { data: any; expiry: number }>()

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  // Clean rate limit store
  for (const [key, value] of rateLimitStore.entries()) {
    if (value.resetTime < now) {
      rateLimitStore.delete(key)
    }
  }
  // Clean cache store
  for (const [key, value] of cacheStore.entries()) {
    if (value.expiry < now) {
      cacheStore.delete(key)
    }
  }
}, 5 * 60 * 1000)

// Rate limiting middleware
export async function rateLimit(
  req: NextRequest,
  identifier: string,
  config = rateLimitConfig
) {
  const now = Date.now()
  const key = `rate_limit:${identifier}:${req.ip || 'anonymous'}`
  
  const entry = rateLimitStore.get(key)
  
  if (!entry || entry.resetTime < now) {
    // Create new entry
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + config.windowMs,
    })
    return { success: true, remaining: config.max - 1 }
  }
  
  // Increment count
  entry.count++
  
  if (entry.count > config.max) {
    return {
      success: false,
      error: 'Too many requests',
      retryAfter: Math.floor((entry.resetTime - now) / 1000),
    }
  }
  
  return { success: true, remaining: config.max - entry.count }
}

// Authentication middleware
export async function authenticate(req: NextRequest) {
  const supabase = createClient()
  
  const authHeader = req.headers.get('authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return {
      authenticated: false,
      error: 'No authentication token provided',
    }
  }

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return {
      authenticated: false,
      error: 'Invalid authentication token',
    }
  }

  // Get user profile with role
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return {
    authenticated: true,
    user: {
      ...user,
      profile,
    },
  }
}

// Authorization middleware
export function authorize(requiredRoles: string[]) {
  return async (req: NextRequest) => {
    const auth = await authenticate(req)
    
    if (!auth.authenticated) {
      return auth
    }

    const userRole = auth.user?.profile?.role
    
    if (!userRole || !requiredRoles.includes(userRole)) {
      return {
        authenticated: true,
        authorized: false,
        error: 'Insufficient permissions',
      }
    }

    return {
      authenticated: true,
      authorized: true,
      user: auth.user,
    }
  }
}

// Validation middleware
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return async (req: NextRequest) => {
    try {
      const body = await req.json()
      const validated = schema.parse(body)
      return { valid: true, data: validated }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        }
      }
      return { valid: false, error: 'Invalid request body' }
    }
  }
}

// Caching middleware
export async function cache(
  key: string,
  fn: () => Promise<any>,
  ttl = 300 // 5 minutes default
) {
  const now = Date.now()
  const cached = cacheStore.get(key)
  
  if (cached && cached.expiry > now) {
    return cached.data
  }
  
  const result = await fn()
  cacheStore.set(key, {
    data: result,
    expiry: now + (ttl * 1000),
  })
  
  return result
}

// CORS middleware
export function cors(origin = '*') {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

// Error response helper
export function errorResponse(
  message: string,
  status = 400,
  details?: any
) {
  return NextResponse.json(
    {
      success: false,
      error: {
        message,
        details,
      },
    },
    { status }
  )
}

// Success response helper
export function successResponse(
  data: any,
  status = 200,
  headers?: HeadersInit
) {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status, headers }
  )
}

// Paginated response helper
export function paginatedResponse(
  items: any[],
  total: number,
  page: number,
  pageSize: number,
  status = 200
) {
  return NextResponse.json(
    {
      success: true,
      data: {
        items,
        total,
        page,
        pageSize,
        totalPages: Math.ceil(total / pageSize),
      },
    },
    { status }
  )
}

// Request logger middleware
export function logRequest(req: NextRequest) {
  console.log({
    method: req.method,
    url: req.url,
    headers: Object.fromEntries(req.headers.entries()),
    timestamp: new Date().toISOString(),
  })
}

// Error handler wrapper
export function withErrorHandler(
  handler: (req: NextRequest, context?: any) => Promise<Response>
) {
  return async (req: NextRequest, context?: any) => {
    try {
      return await handler(req, context)
    } catch (error) {
      console.error('API Error:', error)
      
      if (error instanceof z.ZodError) {
        return errorResponse('Validation error', 400, error.errors)
      }
      
      if (error instanceof Error) {
        return errorResponse(error.message, 500)
      }
      
      return errorResponse('Internal server error', 500)
    }
  }
}

// Compose middleware functions
export function compose(...middlewares: Function[]) {
  return async (req: NextRequest, context?: any) => {
    for (const middleware of middlewares) {
      const result = await middleware(req, context)
      if (result && !result.success) {
        return result
      }
    }
    return { success: true }
  }
}