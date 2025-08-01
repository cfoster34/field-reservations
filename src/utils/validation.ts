import { z } from 'zod'

// Common validation schemas
export const emailSchema = z.string().email('Invalid email address')

export const phoneSchema = z.string().regex(
  /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/,
  'Invalid phone number'
)

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')

// User validation schemas
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  phoneNumber: phoneSchema.optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
})

// Reservation validation schemas
export const reservationSchema = z.object({
  fieldId: z.string().min(1, 'Field is required'),
  date: z.string().min(1, 'Date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  purpose: z.string().min(3, 'Purpose must be at least 3 characters'),
  attendees: z.number().min(1, 'At least 1 attendee is required'),
  notes: z.string().optional(),
})

// Field validation schemas
export const fieldSchema = z.object({
  name: z.string().min(3, 'Name must be at least 3 characters'),
  description: z.string().optional(),
  location: z.object({
    address: z.string().min(1, 'Address is required'),
    city: z.string().min(1, 'City is required'),
    state: z.string().min(1, 'State is required'),
    zipCode: z.string().regex(/^\d{5}(-\d{4})?$/, 'Invalid zip code'),
    coordinates: z.object({
      lat: z.number(),
      lng: z.number(),
    }),
  }),
  type: z.enum(['grass', 'turf', 'dirt', 'court', 'indoor']),
  sport: z.array(z.enum(['soccer', 'baseball', 'football', 'basketball', 'tennis', 'volleyball', 'other'])),
  capacity: z.number().min(1, 'Capacity must be at least 1'),
  pricing: z.object({
    basePrice: z.number().min(0, 'Price cannot be negative'),
    deposit: z.number().min(0, 'Deposit cannot be negative').optional(),
  }),
})

export type LoginInput = z.infer<typeof loginSchema>
export type RegisterInput = z.infer<typeof registerSchema>
export type ReservationInput = z.infer<typeof reservationSchema>
export type FieldInput = z.infer<typeof fieldSchema>