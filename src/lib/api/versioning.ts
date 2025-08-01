import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

export interface ApiVersion {
  version: string
  released: string
  deprecated?: string
  sunset?: string
  supported: boolean
  changelog?: string[]
}

export const API_VERSIONS: Record<string, ApiVersion> = {
  'v1': {
    version: 'v1',
    released: '2024-01-01',
    supported: true,
    changelog: [
      'Initial API release',
      'Basic CRUD operations for users, teams, fields, reservations',
      'Authentication and authorization',
    ],
  },
  'v2': {
    version: 'v2',
    released: '2024-06-01',
    supported: true,
    changelog: [
      'Enhanced pagination with cursor-based navigation',
      'Bulk operations support',
      'Webhook support',
      'Extended field metadata',
      'Team hierarchy support',
    ],
  },
  'v3': {
    version: 'v3',
    released: '2024-12-01',
    supported: true,
    changelog: [
      'GraphQL-like field selection',
      'Real-time subscriptions',
      'Advanced filtering and sorting',
      'Rate limiting improvements',
      'Enhanced error responses',
    ],
  },
}

export const CURRENT_VERSION = 'v3'
export const DEFAULT_VERSION = 'v2'

export function parseApiVersion(req: NextRequest): string {
  // Check URL path first (/api/v2/users)
  const pathMatch = req.nextUrl.pathname.match(/\/api\/v(\d+)\//)
  if (pathMatch) {
    const version = `v${pathMatch[1]}`
    if (API_VERSIONS[version]) {
      return version
    }
  }

  // Check Accept header (Accept: application/vnd.fieldreservations.v2+json)
  const acceptHeader = req.headers.get('accept')
  if (acceptHeader) {
    const versionMatch = acceptHeader.match(/application\/vnd\.fieldreservations\.v(\d+)\+json/)
    if (versionMatch) {
      const version = `v${versionMatch[1]}`
      if (API_VERSIONS[version]) {
        return version
      }
    }
  }

  // Check custom header (API-Version: v2)
  const versionHeader = req.headers.get('api-version')
  if (versionHeader && API_VERSIONS[versionHeader]) {
    return versionHeader
  }

  // Default to supported version
  return DEFAULT_VERSION
}

export function validateApiVersion(version: string): { valid: boolean; error?: string } {
  const apiVersion = API_VERSIONS[version]
  
  if (!apiVersion) {
    return {
      valid: false,
      error: `Unsupported API version: ${version}. Supported versions: ${Object.keys(API_VERSIONS).join(', ')}`,
    }
  }

  if (!apiVersion.supported) {
    return {
      valid: false,
      error: `API version ${version} is no longer supported. Please upgrade to ${CURRENT_VERSION}.`,
    }
  }

  if (apiVersion.deprecated) {
    // Still valid but deprecated
    return {
      valid: true,
      error: `API version ${version} is deprecated and will be sunset on ${apiVersion.sunset || 'TBD'}. Please upgrade to ${CURRENT_VERSION}.`,
    }
  }

  return { valid: true }
}

export function addVersionHeaders(response: NextResponse, version: string): NextResponse {
  const apiVersion = API_VERSIONS[version]
  
  response.headers.set('API-Version', version)
  response.headers.set('API-Current-Version', CURRENT_VERSION)
  response.headers.set('API-Supported-Versions', Object.keys(API_VERSIONS).join(', '))
  
  if (apiVersion.deprecated) {
    response.headers.set('API-Deprecation-Warning', `Version ${version} is deprecated`)
    if (apiVersion.sunset) {
      response.headers.set('API-Sunset', apiVersion.sunset)
    }
  }

  return response
}

// Schema versioning utilities
export interface VersionedSchema<T = any> {
  v1?: z.ZodSchema<T>
  v2?: z.ZodSchema<T>
  v3?: z.ZodSchema<T>
}

export function getSchemaForVersion<T>(
  versionedSchema: VersionedSchema<T>,
  version: string
): z.ZodSchema<T> | null {
  const schema = versionedSchema[version as keyof VersionedSchema<T>]
  return schema || null
}

// Response transformation for different versions
export interface ResponseTransformer<T = any> {
  transform(data: T, version: string): any
}

export class UserResponseTransformer implements ResponseTransformer {
  transform(user: any, version: string): any {
    switch (version) {
      case 'v1':
        return {
          id: user.id,
          email: user.email,
          name: user.full_name, // Different field name in v1
          role: user.role,
          createdAt: user.created_at,
        }
      
      case 'v2':
        return {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          phone: user.phone,
          role: user.role,
          teamId: user.team_id,
          isApproved: user.is_approved,
          createdAt: user.created_at,
          updatedAt: user.updated_at,
        }
      
      case 'v3':
        return {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          phone: user.phone,
          role: user.role,
          team: user.team ? {
            id: user.team.id,
            name: user.team.name,
          } : null,
          profile: {
            avatar: user.avatar_url,
            bio: user.bio,
            preferences: user.preferences,
          },
          status: {
            isApproved: user.is_approved,
            isActive: user.is_active,
            lastLogin: user.last_login,
          },
          timestamps: {
            createdAt: user.created_at,
            updatedAt: user.updated_at,
            approvedAt: user.approved_at,
          },
        }
      
      default:
        return user
    }
  }
}

export class FieldResponseTransformer implements ResponseTransformer {
  transform(field: any, version: string): any {
    switch (version) {
      case 'v1':
        return {
          id: field.id,
          name: field.name,
          type: field.type,
          address: field.address,
          rate: field.hourly_rate, // Different field name in v1
          status: field.status,
        }
      
      case 'v2':
        return {
          id: field.id,
          name: field.name,
          type: field.type,
          address: field.address,
          hourlyRate: field.hourly_rate,
          capacity: field.capacity,
          amenities: field.amenities,
          status: field.status,
          coordinates: field.coordinates,
          createdAt: field.created_at,
          updatedAt: field.updated_at,
        }
      
      case 'v3':
        return {
          id: field.id,
          name: field.name,
          type: field.type,
          address: field.address,
          location: {
            address: field.address,
            coordinates: field.coordinates,
            timezone: field.timezone,
          },
          pricing: {
            hourlyRate: field.hourly_rate,
            currency: field.currency || 'USD',
            discounts: field.discounts || [],
          },
          specifications: {
            capacity: field.capacity,
            dimensions: field.dimensions,
            surface: field.surface_type,
            amenities: field.amenities || [],
          },
          availability: {
            schedule: field.availability,
            restrictions: field.restrictions || [],
          },
          status: {
            current: field.status,
            maintenanceSchedule: field.maintenance_schedule,
          },
          metadata: {
            images: field.images || [],
            description: field.description,
            rules: field.rules || [],
          },
          timestamps: {
            createdAt: field.created_at,
            updatedAt: field.updated_at,
          },
        }
      
      default:
        return field
    }
  }
}

export class ReservationResponseTransformer implements ResponseTransformer {
  transform(reservation: any, version: string): any {
    switch (version) {
      case 'v1':
        return {
          id: reservation.id,
          fieldId: reservation.field_id,
          userId: reservation.user_id,
          date: reservation.date,
          startTime: reservation.start_time,
          endTime: reservation.end_time,
          status: reservation.status,
          createdAt: reservation.created_at,
        }
      
      case 'v2':
        return {
          id: reservation.id,
          field: {
            id: reservation.field?.id,
            name: reservation.field?.name,
          },
          user: {
            id: reservation.user?.id,
            name: reservation.user?.full_name,
            email: reservation.user?.email,
          },
          team: reservation.team ? {
            id: reservation.team.id,
            name: reservation.team.name,
          } : null,
          schedule: {
            date: reservation.date,
            startTime: reservation.start_time,
            endTime: reservation.end_time,
            duration: reservation.duration,
          },
          details: {
            purpose: reservation.purpose,
            attendees: reservation.attendees,
            notes: reservation.notes,
          },
          status: reservation.status,
          cost: reservation.cost,
          createdAt: reservation.created_at,
          updatedAt: reservation.updated_at,
        }
      
      case 'v3':
        return {
          id: reservation.id,
          field: {
            id: reservation.field?.id,
            name: reservation.field?.name,
            type: reservation.field?.type,
            address: reservation.field?.address,
          },
          user: {
            id: reservation.user?.id,
            fullName: reservation.user?.full_name,
            email: reservation.user?.email,
            phone: reservation.user?.phone,
          },
          team: reservation.team ? {
            id: reservation.team.id,
            name: reservation.team.name,
            division: reservation.team.division,
          } : null,
          schedule: {
            date: reservation.date,
            startTime: reservation.start_time,
            endTime: reservation.end_time,
            duration: reservation.duration,
            timezone: reservation.timezone,
          },
          details: {
            purpose: reservation.purpose,
            attendees: reservation.attendees,
            equipment: reservation.equipment || [],
            notes: reservation.notes,
            instructions: reservation.instructions,
          },
          pricing: {
            cost: reservation.cost,
            currency: reservation.currency || 'USD',
            discounts: reservation.discounts || [],
            taxes: reservation.taxes || [],
          },
          status: {
            current: reservation.status,
            history: reservation.status_history || [],
            confirmedAt: reservation.confirmed_at,
            cancelledAt: reservation.cancelled_at,
            cancellationReason: reservation.cancellation_reason,
          },
          notifications: {
            reminders: reservation.reminders || [],
            webhooks: reservation.webhooks || [],
          },
          timestamps: {
            createdAt: reservation.created_at,
            updatedAt: reservation.updated_at,
          },
        }
      
      default:
        return reservation
    }
  }
}

// Pagination transformation
export interface PaginationMeta {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

export function transformPaginationForVersion(
  meta: PaginationMeta,
  version: string
): any {
  switch (version) {
    case 'v1':
      return {
        page: meta.page,
        perPage: meta.pageSize,
        total: meta.total,
        pages: meta.totalPages,
      }
    
    case 'v2':
      return {
        pagination: {
          page: meta.page,
          pageSize: meta.pageSize,
          total: meta.total,
          totalPages: meta.totalPages,
          hasNext: meta.hasNext,
          hasPrev: meta.hasPrev,
        },
      }
    
    case 'v3':
      return {
        meta: {
          pagination: {
            current: meta.page,
            size: meta.pageSize,
            total: meta.total,
            pages: meta.totalPages,
          },
          navigation: {
            hasNext: meta.hasNext,
            hasPrevious: meta.hasPrev,
            first: 1,
            last: meta.totalPages,
          },
        },
      }
    
    default:
      return meta
  }
}

// Error response transformation
export function transformErrorForVersion(error: any, version: string): any {
  switch (version) {
    case 'v1':
      return {
        error: error.message,
        code: error.code,
      }
    
    case 'v2':
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code,
          details: error.details,
        },
      }
    
    case 'v3':
      return {
        success: false,
        error: {
          message: error.message,
          code: error.code,
          type: error.type || 'ValidationError',
          details: error.details,
          timestamp: new Date().toISOString(),
          path: error.path,
          requestId: error.requestId,
        },
        meta: {
          version,
          documentation: `https://docs.fieldreservations.com/${version}/errors#${error.code}`,
        },
      }
    
    default:
      return error
  }
}

// Middleware for API versioning
export function withApiVersioning() {
  return async (req: NextRequest) => {
    const version = parseApiVersion(req)
    const validation = validateApiVersion(version)
    
    if (!validation.valid) {
      return NextResponse.json(
        transformErrorForVersion({
          message: validation.error,
          code: 'UNSUPPORTED_VERSION',
        }, DEFAULT_VERSION),
        { status: 400 }
      )
    }
    
    // Add version to request context
    ;(req as any).apiVersion = version
    
    return null // Continue to next middleware
  }
}

// Helper to create versioned response
export function createVersionedResponse(
  data: any,
  version: string,
  transformer?: ResponseTransformer,
  pagination?: PaginationMeta
): NextResponse {
  let responseData = data
  
  // Transform data if transformer provided
  if (transformer) {
    if (Array.isArray(data)) {
      responseData = data.map(item => transformer.transform(item, version))
    } else {
      responseData = transformer.transform(data, version)
    }
  }
  
  // Add pagination if provided
  if (pagination) {
    const paginationData = transformPaginationForVersion(pagination, version)
    responseData = {
      data: responseData,
      ...paginationData,
    }
  } else {
    responseData = {
      success: true,
      data: responseData,
    }
  }
  
  const response = NextResponse.json(responseData)
  return addVersionHeaders(response, version)
}