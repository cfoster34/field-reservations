import { z } from 'zod'

// Auth validation schemas
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  fullName: z.string().min(2, 'Name must be at least 2 characters'),
  phone: z.string().optional(),
  leagueId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
})

export const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export const updatePasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
})

// User validation schemas
export const updateProfileSchema = z.object({
  fullName: z.string().min(2).optional(),
  phone: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  notificationPreferences: z.object({
    email: z.boolean(),
    sms: z.boolean(),
    push: z.boolean(),
    reminderHours: z.number().min(0).max(72),
  }).optional(),
})

export const updateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['admin', 'league_manager', 'coach', 'member']),
})

export const assignTeamSchema = z.object({
  userId: z.string().uuid(),
  teamId: z.string().uuid(),
})

// Field validation schemas
export const createFieldSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  type: z.enum(['soccer', 'baseball', 'football', 'basketball', 'tennis', 'multipurpose']),
  status: z.enum(['available', 'maintenance', 'inactive']).default('available'),
  address: z.string().min(1, 'Address is required'),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  description: z.string().optional(),
  amenities: z.array(z.string()).optional(),
  images: z.array(z.string().url()).optional(),
  capacity: z.number().min(1).optional(),
  hourlyRate: z.number().min(0),
  rules: z.string().optional(),
})

export const updateFieldSchema = createFieldSchema.partial()

export const checkAvailabilitySchema = z.object({
  fieldId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
})

// Reservation validation schemas
export const createReservationSchema = z.object({
  fieldId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  purpose: z.string().min(3),
  attendees: z.number().min(1),
  notes: z.string().optional(),
  teamId: z.string().uuid().optional(),
})

export const updateReservationSchema = z.object({
  purpose: z.string().min(3).optional(),
  attendees: z.number().min(1).optional(),
  notes: z.string().optional(),
})

export const cancelReservationSchema = z.object({
  reason: z.string().min(3),
})

// Waitlist validation schemas
export const addToWaitlistSchema = z.object({
  fieldId: z.string().uuid(),
  desiredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  desiredStartTime: z.string().regex(/^\d{2}:\d{2}$/),
  desiredEndTime: z.string().regex(/^\d{2}:\d{2}$/),
  priority: z.number().min(0).max(10).default(0),
})

// Team validation schemas
export const createTeamSchema = z.object({
  name: z.string().min(2),
  coachId: z.string().uuid().optional(),
  assistantCoachIds: z.array(z.string().uuid()).optional(),
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-F]{6}$/i).optional(),
  ageGroup: z.string().optional(),
  division: z.string().optional(),
})

export const updateTeamSchema = createTeamSchema.partial()

export const addTeamMemberSchema = z.object({
  userId: z.string().uuid(),
})

// Payment validation schemas
export const createCheckoutSchema = z.object({
  reservationId: z.string().uuid(),
  returnUrl: z.string().url(),
  cancelUrl: z.string().url(),
})

export const webhookSchema = z.object({
  type: z.string(),
  data: z.object({
    object: z.any(),
  }),
})

// Analytics validation schemas
export const analyticsQuerySchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fieldId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  metric: z.enum(['utilization', 'revenue', 'activity']).optional(),
})

// Import/Export validation schemas
export const importSchema = z.object({
  type: z.enum(['users', 'teams', 'fields', 'reservations']),
  source: z.enum(['csv', 'sportsconnect']),
  data: z.any(), // Will be validated based on type
})

export const exportSchema = z.object({
  type: z.enum(['users', 'teams', 'fields', 'reservations', 'analytics']),
  format: z.enum(['csv', 'json']),
  filters: z.record(z.any()).optional(),
})

// Notification validation schemas
export const sendNotificationSchema = z.object({
  userId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  type: z.enum(['email', 'sms', 'push']),
  title: z.string().min(1),
  content: z.string().min(1),
  data: z.record(z.any()).optional(),
  scheduledFor: z.string().datetime().optional(),
})

export const markReadSchema = z.object({
  notificationIds: z.array(z.string().uuid()),
})

// Pagination and filter schemas
export const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
})

export const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})