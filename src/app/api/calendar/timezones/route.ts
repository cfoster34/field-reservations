import { NextRequest } from 'next/server'
import { 
  withErrorHandler, 
  successResponse,
  errorResponse,
  logRequest
} from '@/lib/api/middleware'
import { TimezoneHandler } from '@/lib/calendar/timezone-handler'

// GET /api/calendar/timezones - Get timezone information and utilities
export async function GET(req: NextRequest) {
  return withErrorHandler(async (req) => {
    logRequest(req)
    
    const searchParams = req.nextUrl.searchParams
    const action = searchParams.get('action') || 'list'
    const timezone = searchParams.get('timezone')
    const date = searchParams.get('date')
    
    switch (action) {
      case 'list':
        return handleListTimezones()
        
      case 'info':
        return handleTimezoneInfo(timezone, date)
        
      case 'detect':
        return handleDetectTimezone(req)
        
      case 'validate':
        return handleValidateTimezone(timezone)
        
      case 'convert':
        return handleConvertTime(req)
        
      case 'transitions':
        return handleDstTransitions(timezone)
        
      default:
        return errorResponse('Invalid action', 400)
    }
  })(req)
}

/**
 * List common timezones
 */
function handleListTimezones() {
  try {
    const timezones = TimezoneHandler.getCommonTimezones()
    
    return successResponse({
      timezones,
      total: timezones.length
    })
    
  } catch (error) {
    console.error('Failed to list timezones:', error)
    return errorResponse('Failed to list timezones', 500, error)
  }
}

/**
 * Get detailed information about a specific timezone
 */
function handleTimezoneInfo(timezone?: string, dateStr?: string) {
  if (!timezone) {
    return errorResponse('Timezone parameter is required', 400)
  }
  
  try {
    const date = dateStr ? new Date(dateStr) : new Date()
    
    if (dateStr && isNaN(date.getTime())) {
      return errorResponse('Invalid date format', 400)
    }
    
    const info = TimezoneHandler.getTimezoneInfo(timezone, date)
    const isDstActive = TimezoneHandler.isDstActive(timezone, date)
    const upcomingTransitions = TimezoneHandler.getUpcomingDstTransitions(timezone, 12)
    
    return successResponse({
      timezone: info,
      isDstActive,
      upcomingTransitions,
      queried: {
        timezone,
        date: date.toISOString()
      }
    })
    
  } catch (error) {
    console.error('Failed to get timezone info:', error)
    return errorResponse('Failed to get timezone info', 500, error)
  }
}

/**
 * Detect user's timezone from request
 */
function handleDetectTimezone(req: NextRequest) {
  try {
    // Try to get timezone from various sources
    let detectedTimezone = 'UTC'
    
    // Check for timezone in headers (custom header from client)
    const headerTimezone = req.headers.get('x-timezone')
    if (headerTimezone && TimezoneHandler.isValidTimezone(headerTimezone)) {
      detectedTimezone = headerTimezone
    } else {
      // Fallback to server-side detection
      detectedTimezone = TimezoneHandler.detectUserTimezone()
    }
    
    const info = TimezoneHandler.getTimezoneInfo(detectedTimezone)
    
    return successResponse({
      detected: detectedTimezone,
      info,
      sources: {
        header: headerTimezone,
        serverDefault: TimezoneHandler.detectUserTimezone()
      }
    })
    
  } catch (error) {
    console.error('Failed to detect timezone:', error)
    return errorResponse('Failed to detect timezone', 500, error)
  }
}

/**
 * Validate timezone string
 */
function handleValidateTimezone(timezone?: string) {
  if (!timezone) {
    return errorResponse('Timezone parameter is required', 400)
  }
  
  try {
    const isValid = TimezoneHandler.isValidTimezone(timezone)
    
    const response: any = {
      timezone,
      isValid
    }
    
    if (isValid) {
      response.info = TimezoneHandler.getTimezoneInfo(timezone)
    } else {
      response.suggestions = TimezoneHandler.getCommonTimezones()
        .filter(tz => 
          tz.iana.toLowerCase().includes(timezone.toLowerCase()) ||
          tz.display.toLowerCase().includes(timezone.toLowerCase())
        )
        .slice(0, 5)
    }
    
    return successResponse(response)
    
  } catch (error) {
    console.error('Failed to validate timezone:', error)
    return errorResponse('Failed to validate timezone', 500, error)
  }
}

/**
 * Convert time between timezones
 */
function handleConvertTime(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const dateTime = searchParams.get('datetime')
  const fromTimezone = searchParams.get('from') || 'UTC'
  const toTimezone = searchParams.get('to') || 'UTC'
  const format = searchParams.get('format') || 'iso'
  
  if (!dateTime) {
    return errorResponse('datetime parameter is required', 400)
  }
  
  try {
    const inputDate = new Date(dateTime)
    
    if (isNaN(inputDate.getTime())) {
      return errorResponse('Invalid datetime format', 400)
    }
    
    if (!TimezoneHandler.isValidTimezone(fromTimezone)) {
      return errorResponse('Invalid from timezone', 400)
    }
    
    if (!TimezoneHandler.isValidTimezone(toTimezone)) {
      return errorResponse('Invalid to timezone', 400)
    }
    
    const convertedDate = TimezoneHandler.convertTimezone(
      inputDate,
      fromTimezone,
      toTimezone
    )
    
    let formattedResult: string
    
    switch (format) {
      case 'iso':
        formattedResult = convertedDate.toISOString()
        break
      case 'local':
        formattedResult = TimezoneHandler.formatInTimezone(
          convertedDate,
          toTimezone,
          'yyyy-MM-dd HH:mm:ss'
        )
        break
      case 'display':
        formattedResult = TimezoneHandler.formatInTimezone(
          convertedDate,
          toTimezone,
          'MMM dd, yyyy HH:mm'
        )
        break
      default:
        formattedResult = TimezoneHandler.formatInTimezone(
          convertedDate,
          toTimezone,
          format
        )
    }
    
    return successResponse({
      original: {
        datetime: dateTime,
        timezone: fromTimezone
      },
      converted: {
        datetime: convertedDate.toISOString(),
        timezone: toTimezone,
        formatted: formattedResult
      },
      timezoneInfo: {
        from: TimezoneHandler.getTimezoneInfo(fromTimezone, inputDate),
        to: TimezoneHandler.getTimezoneInfo(toTimezone, convertedDate)
      }
    })
    
  } catch (error) {
    console.error('Failed to convert time:', error)
    return errorResponse('Failed to convert time', 500, error)
  }
}

/**
 * Get DST transitions for a timezone
 */
function handleDstTransitions(timezone?: string) {
  if (!timezone) {
    return errorResponse('Timezone parameter is required', 400)
  }
  
  try {
    if (!TimezoneHandler.isValidTimezone(timezone)) {
      return errorResponse('Invalid timezone', 400)
    }
    
    const transitions = TimezoneHandler.getUpcomingDstTransitions(timezone, 24) // 2 years
    const currentInfo = TimezoneHandler.getTimezoneInfo(timezone)
    
    return successResponse({
      timezone,
      currentInfo,
      transitions: transitions.map(t => ({
        date: t.date.toISOString(),
        type: t.type,
        offsetBefore: t.offsetBefore,
        offsetAfter: t.offsetAfter,
        description: t.type === 'start' 
          ? 'Daylight Saving Time begins' 
          : 'Daylight Saving Time ends'
      })),
      total: transitions.length
    })
    
  } catch (error) {
    console.error('Failed to get DST transitions:', error)
    return errorResponse('Failed to get DST transitions', 500, error)
  }
}