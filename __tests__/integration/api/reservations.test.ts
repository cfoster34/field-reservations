import { NextRequest } from 'next/server'
import { GET, POST } from '@/app/api/reservations/route'
import { createClient } from '@/lib/supabase/server'
import { createMockReservation, createMockField, createMockUser } from '../../fixtures'

// Mock dependencies
jest.mock('@/lib/supabase/server')
jest.mock('@/lib/api/middleware', () => ({
  withErrorHandler: (handler: any) => handler,
  authenticate: jest.fn(),
  validateBody: jest.fn(),
  successResponse: jest.fn((data, status = 200) => Response.json(data, { status })),
  errorResponse: jest.fn((message, status = 400, details?) => 
    Response.json({ error: message, details }, { status })),
  logRequest: jest.fn(),
  paginatedResponse: jest.fn((data, count, page, pageSize) => 
    Response.json({ data, pagination: { page, pageSize, total: count } })),
  rateLimit: jest.fn(() => ({ success: true })),
}))

const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  gte: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  range: jest.fn().mockReturnThis(),
  single: jest.fn(),
  rpc: jest.fn(),
}

const mockAuthenticate = require('@/lib/api/middleware').authenticate
const mockValidateBody = require('@/lib/api/middleware').validateBody

;(createClient as jest.MockedFunction<typeof createClient>).mockReturnValue(mockSupabase as any)

describe('/api/reservations', () => {
  let mockUser: any
  let mockField: any
  let mockReservations: any[]

  beforeEach(() => {
    jest.clearAllMocks()
    
    mockUser = {
      id: 'user-1',
      profile: {
        role: 'player',
        team_id: 'team-1',
        league_id: 'league-1',
        is_approved: true,
        notification_preferences: {
          reminder_hours: 2,
        },
      },
    }

    mockField = createMockField({
      id: 'field-1',
      name: 'Soccer Field A',
      hourly_rate: 50,
      capacity: 22,
      status: 'available',
      league_id: 'league-1',
    })

    mockReservations = [
      createMockReservation({
        id: 'reservation-1',
        field_id: 'field-1',
        user_id: 'user-1',
        status: 'confirmed',
      }),
      createMockReservation({
        id: 'reservation-2',
        field_id: 'field-2',
        user_id: 'user-1',
        status: 'pending',
      }),
    ]

    // Mock successful authentication by default
    mockAuthenticate.mockResolvedValue({
      authenticated: true,
      user: mockUser,
    })
  })

  describe('GET /api/reservations', () => {
    beforeEach(() => {
      mockSupabase.single.mockReturnValue({
        data: mockReservations,
        error: null,
        count: mockReservations.length,
      })
    })

    it('should return paginated reservations for authenticated user', async () => {
      const request = new NextRequest('http://localhost:3000/api/reservations?page=1&pageSize=10')
      
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.data).toEqual(mockReservations)
      expect(data.pagination).toEqual({
        page: 1,
        pageSize: 10,
        total: mockReservations.length,
      })
    })

    it('should filter reservations by user role (player)', async () => {
      const request = new NextRequest('http://localhost:3000/api/reservations')
      
      await GET(request)

      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user-1')
    })

    it('should allow coaches to see team reservations', async () => {
      mockAuthenticate.mockResolvedValue({
        authenticated: true,
        user: {
          ...mockUser,
          profile: { ...mockUser.profile, role: 'coach' },
        },
      })

      const request = new NextRequest('http://localhost:3000/api/reservations')
      
      await GET(request)

      expect(mockSupabase.or).toHaveBeenCalledWith('user_id.eq.user-1,team_id.eq.team-1')
    })

    it('should apply date filters', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/reservations?dateFrom=2024-01-01&dateTo=2024-01-31'
      )
      
      await GET(request)

      expect(mockSupabase.gte).toHaveBeenCalledWith('date', '2024-01-01')
      expect(mockSupabase.lte).toHaveBeenCalledWith('date', '2024-01-31')
    })

    it('should apply sorting', async () => {
      const request = new NextRequest(
        'http://localhost:3000/api/reservations?sortBy=date&sortOrder=desc'
      )
      
      await GET(request)

      expect(mockSupabase.order).toHaveBeenCalledWith('date', { ascending: false })
      expect(mockSupabase.order).toHaveBeenCalledWith('start_time', { ascending: false })
    })

    it('should return 401 for unauthenticated requests', async () => {
      mockAuthenticate.mockResolvedValue({
        authenticated: false,
        error: 'Unauthorized',
      })

      const request = new NextRequest('http://localhost:3000/api/reservations')
      
      const response = await GET(request)

      expect(response.status).toBe(401)
    })

    it('should handle database errors', async () => {
      mockSupabase.single.mockReturnValue({
        data: null,
        error: { message: 'Database error' },
        count: null,
      })

      const request = new NextRequest('http://localhost:3000/api/reservations')
      
      const response = await GET(request)

      expect(response.status).toBe(400)
    })
  })

  describe('POST /api/reservations', () => {
    let reservationData: any

    beforeEach(() => {
      reservationData = {
        fieldId: 'field-1',
        date: '2024-01-15',
        startTime: '10:00',
        endTime: '12:00',
        purpose: 'Team practice',
        attendees: 15,
        notes: 'Regular practice session',
      }

      // Mock successful validation
      mockValidateBody.mockReturnValue(jest.fn().mockResolvedValue({
        valid: true,
        data: reservationData,
      }))

      // Mock field lookup
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockField, error: null }) // Field lookup
        .mockResolvedValueOnce({ data: null, error: null }) // Booking session lookup (optional)
        .mockResolvedValueOnce({ // New reservation creation
          data: {
            ...createMockReservation({
              id: 'new-reservation-id',
              field_id: 'field-1',
              user_id: 'user-1',
              ...reservationData,
            }),
            field: mockField,
            user: mockUser,
          },
          error: null,
        })

      // Mock conflict check
      mockSupabase.rpc.mockResolvedValue({ data: false, error: null })

      // Mock other inserts
      mockSupabase.insert.mockResolvedValue({ data: {}, error: null })
    })

    it('should create a new reservation successfully', async () => {
      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify(reservationData),
        headers: { 'Content-Type': 'application/json' },
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.reservation.field_id).toBe('field-1')
      expect(data.payment.amount).toBe(100) // 2 hours * $50/hour
    })

    it('should reject reservations for unapproved users', async () => {
      mockAuthenticate.mockResolvedValue({
        authenticated: true,
        user: {
          ...mockUser,
          profile: { ...mockUser.profile, is_approved: false },
        },
      })

      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify(reservationData),
      })

      const response = await POST(request)

      expect(response.status).toBe(403)
    })

    it('should validate field existence', async () => {
      mockSupabase.single.mockResolvedValueOnce({ data: null, error: null })

      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify(reservationData),
      })

      const response = await POST(request)

      expect(response.status).toBe(404)
    })

    it('should check field capacity', async () => {
      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify({
          ...reservationData,
          attendees: 50, // Exceeds field capacity of 22
        }),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('should detect time slot conflicts', async () => {
      mockSupabase.rpc.mockResolvedValue({ data: true, error: null }) // Has conflict

      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify(reservationData),
      })

      const response = await POST(request)

      expect(response.status).toBe(409)
    })

    it('should handle recurring reservations', async () => {
      const recurringData = {
        ...reservationData,
        recurringPattern: {
          type: 'weekly',
          frequency: 1,
          endDate: '2024-02-15',
        },
      }

      mockValidateBody.mockReturnValue(jest.fn().mockResolvedValue({
        valid: true,
        data: recurringData,
      }))

      mockSupabase.rpc.mockResolvedValue({
        data: [
          { success: true, reservation_id: 'recurring-1' },
          { success: true, reservation_id: 'recurring-2' },
          { success: false, error: 'Conflict on 2024-01-29' },
        ],
        error: null,
      })

      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify(recurringData),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.successful).toHaveLength(2)
      expect(data.failed).toHaveLength(1)
    })

    it('should validate request body', async () => {
      mockValidateBody.mockReturnValue(jest.fn().mockResolvedValue({
        valid: false,
        errors: [{ field: 'fieldId', message: 'Field is required' }],
      }))

      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify({}),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('should apply rate limiting', async () => {
      const mockRateLimit = require('@/lib/api/middleware').rateLimit
      mockRateLimit.mockResolvedValue({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: 60,
      })

      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify(reservationData),
      })

      const response = await POST(request)

      expect(response.status).toBe(429)
    })

    it('should handle database errors during creation', async () => {
      mockSupabase.single
        .mockResolvedValueOnce({ data: mockField, error: null })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({ 
          data: null, 
          error: { message: 'Database constraint violation' } 
        })

      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify(reservationData),
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
    })

    it('should handle booking sessions', async () => {
      const sessionId = 'session-123'
      const bookingSession = {
        id: sessionId,
        user_id: 'user-1',
        status: 'active',
        expires_at: new Date(Date.now() + 600000).toISOString(), // 10 minutes from now
      }

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockField, error: null })
        .mockResolvedValueOnce({ data: bookingSession, error: null })
        .mockResolvedValueOnce({
          data: {
            ...createMockReservation({ field_id: 'field-1', user_id: 'user-1' }),
            field: mockField,
          },
          error: null,
        })

      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify(reservationData),
        headers: { 
          'Content-Type': 'application/json',
          'x-booking-session': sessionId,
        },
      })

      const response = await POST(request)

      expect(response.status).toBe(201)
      expect(mockSupabase.update).toHaveBeenCalledWith({ status: 'completed' })
    })

    it('should reject expired booking sessions', async () => {
      const sessionId = 'session-123'
      const expiredSession = {
        id: sessionId,
        user_id: 'user-1',
        status: 'active',
        expires_at: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
      }

      mockSupabase.single
        .mockResolvedValueOnce({ data: mockField, error: null })
        .mockResolvedValueOnce({ data: expiredSession, error: null })

      const request = new NextRequest('http://localhost:3000/api/reservations', {
        method: 'POST',
        body: JSON.stringify(reservationData),
        headers: { 
          'Content-Type': 'application/json',
          'x-booking-session': sessionId,
        },
      })

      const response = await POST(request)

      expect(response.status).toBe(400)
    })
  })
})

describe('Integration - Full reservation flow', () => {
  it('should complete full reservation creation with notifications and analytics', async () => {
    // This test verifies the complete integration flow
    const mockUser = createMockUser({ id: 'user-1', role: 'player' })
    const mockField = createMockField({ id: 'field-1', hourly_rate: 25 })
    
    mockAuthenticate.mockResolvedValue({
      authenticated: true,
      user: {
        ...mockUser,
        profile: {
          ...mockUser,
          is_approved: true,
          notification_preferences: { reminder_hours: 2 },
        },
      },
    })

    mockValidateBody.mockReturnValue(jest.fn().mockResolvedValue({
      valid: true,
      data: {
        fieldId: 'field-1',
        date: '2024-01-15',
        startTime: '14:00',
        endTime: '16:00',
        purpose: 'Team training',
        attendees: 10,
      },
    }))

    mockSupabase.single
      .mockResolvedValueOnce({ data: mockField, error: null })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: createMockReservation({
          id: 'new-reservation',
          field_id: 'field-1',
          user_id: 'user-1',
        }),
        error: null,
      })

    mockSupabase.rpc.mockResolvedValue({ data: false, error: null })
    mockSupabase.insert.mockResolvedValue({ data: {}, error: null })

    const request = new NextRequest('http://localhost:3000/api/reservations', {
      method: 'POST',
      body: JSON.stringify({
        fieldId: 'field-1',
        date: '2024-01-15',
        startTime: '14:00',
        endTime: '16:00',
        purpose: 'Team training',
        attendees: 10,
      }),
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    
    // Verify payment record creation
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 50, // 2 hours * $25/hour
        status: 'pending',
        reservation_id: 'new-reservation',
      })
    )

    // Verify notification scheduling
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'email',
        title: 'Reservation Reminder',
      })
    )

    // Verify analytics tracking
    expect(mockSupabase.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'reservation_created',
        event_data: expect.objectContaining({
          reservation_id: 'new-reservation',
          field_id: 'field-1',
        }),
      })
    )
  })
})