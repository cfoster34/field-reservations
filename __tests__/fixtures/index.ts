import { faker } from '@faker-js/faker'
import type { User, Field, Reservation, Payment } from '@/types'

// User fixtures
export const createMockUser = (overrides?: Partial<User>): User => ({
  id: faker.string.uuid(),
  email: faker.internet.email(),
  full_name: faker.person.fullName(),
  phone: faker.phone.number(),
  role: 'player',
  team_id: null,
  avatar_url: faker.image.avatar(),
  email_verified: true,
  created_at: faker.date.past().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides,
})

export const createMockAdmin = (overrides?: Partial<User>): User => ({
  ...createMockUser(),
  role: 'admin',
  ...overrides,
})

export const createMockCoach = (overrides?: Partial<User>): User => ({
  ...createMockUser(),
  role: 'coach',
  team_id: faker.string.uuid(),
  ...overrides,
})

// Field fixtures
export const createMockField = (overrides?: Partial<Field>): Field => ({
  id: faker.string.uuid(),
  name: faker.company.name() + ' Field',
  type: faker.helpers.arrayElement(['soccer', 'basketball', 'tennis', 'volleyball']),
  description: faker.lorem.paragraph(),
  hourly_rate: faker.number.int({ min: 20, max: 100 }),
  capacity: faker.number.int({ min: 10, max: 50 }),
  location: faker.location.streetAddress(),
  amenities: faker.helpers.arrayElements(['parking', 'restrooms', 'concessions', 'lighting']),
  active: true,
  availability_start: '06:00',
  availability_end: '22:00',
  booking_window_days: 30,
  min_booking_duration: 60,
  max_booking_duration: 180,
  advance_booking_hours: 2,
  image_url: faker.image.url(),
  created_at: faker.date.past().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides,
})

// Reservation fixtures
export const createMockReservation = (overrides?: Partial<Reservation>): Reservation => {
  const startTime = faker.date.future()
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000) // 2 hours later
  
  return {
    id: faker.string.uuid(),
    field_id: faker.string.uuid(),
    user_id: faker.string.uuid(),
    start_time: startTime.toISOString(),
    end_time: endTime.toISOString(),
    status: faker.helpers.arrayElement(['pending', 'confirmed', 'cancelled', 'completed']),
    total_cost: faker.number.int({ min: 50, max: 200 }),
    booking_type: faker.helpers.arrayElement(['regular', 'recurring', 'tournament']),
    participants: faker.number.int({ min: 1, max: 20 }),
    notes: faker.lorem.sentence(),
    created_at: faker.date.past().toISOString(),
    updated_at: faker.date.recent().toISOString(),
    ...overrides,
  }
}

// Payment fixtures
export const createMockPayment = (overrides?: Partial<Payment>): Payment => ({
  id: faker.string.uuid(),
  reservation_id: faker.string.uuid(),
  stripe_payment_intent_id: 'pi_' + faker.string.alphanumeric(24),
  amount: faker.number.int({ min: 50, max: 200 }),
  currency: 'usd',
  status: faker.helpers.arrayElement(['pending', 'succeeded', 'failed', 'cancelled']),
  payment_method: faker.helpers.arrayElement(['card', 'bank_transfer']),
  created_at: faker.date.past().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides,
})

// Team fixtures
export const createMockTeam = (overrides?: any) => ({
  id: faker.string.uuid(),
  name: faker.company.name() + ' Team',
  sport: faker.helpers.arrayElement(['soccer', 'basketball', 'volleyball']),
  coach_id: faker.string.uuid(),
  description: faker.lorem.paragraph(),
  max_members: faker.number.int({ min: 15, max: 30 }),
  created_at: faker.date.past().toISOString(),
  updated_at: faker.date.recent().toISOString(),
  ...overrides,
})

// Analytics fixtures
export const createMockAnalyticsData = () => ({
  totalRevenue: faker.number.int({ min: 10000, max: 100000 }),
  totalBookings: faker.number.int({ min: 100, max: 1000 }),
  averageBookingValue: faker.number.int({ min: 50, max: 150 }),
  fieldUtilization: faker.number.float({ min: 0.6, max: 0.95, fractionDigits: 2 }),
  peakHours: ['18:00', '19:00', '20:00'],
  popularFields: [
    { fieldId: faker.string.uuid(), bookings: faker.number.int({ min: 50, max: 200 }) },
    { fieldId: faker.string.uuid(), bookings: faker.number.int({ min: 30, max: 150 }) },
  ],
})

// Notification fixtures
export const createMockNotification = (overrides?: any) => ({
  id: faker.string.uuid(),
  user_id: faker.string.uuid(),
  type: faker.helpers.arrayElement(['booking_confirmation', 'payment_reminder', 'cancellation']),
  title: faker.lorem.words(3),
  message: faker.lorem.sentence(),
  read: faker.datatype.boolean(),
  created_at: faker.date.past().toISOString(),
  ...overrides,
})

// Calendar event fixtures
export const createMockCalendarEvent = (overrides?: any) => ({
  id: faker.string.uuid(),
  reservation_id: faker.string.uuid(),
  title: faker.lorem.words(3),
  description: faker.lorem.sentence(),
  start_time: faker.date.future().toISOString(),
  end_time: faker.date.future().toISOString(),
  location: faker.location.streetAddress(),
  attendees: [faker.internet.email(), faker.internet.email()],
  ...overrides,
})

// Test data collections
export const testFixtures = {
  users: {
    admin: createMockAdmin(),
    coach: createMockCoach(),
    player: createMockUser(),
  },
  fields: Array.from({ length: 5 }, () => createMockField()),
  reservations: Array.from({ length: 10 }, () => createMockReservation()),
  payments: Array.from({ length: 10 }, () => createMockPayment()),
  teams: Array.from({ length: 3 }, () => createMockTeam()),
}