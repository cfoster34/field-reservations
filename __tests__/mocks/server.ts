import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

// Mock handlers for external APIs
const handlers = [
  // Supabase Auth endpoints
  http.post('https://test.supabase.co/auth/v1/signup', () => {
    return HttpResponse.json({
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
        email_confirmed_at: new Date().toISOString(),
      },
      session: {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
      },
    })
  }),

  http.post('https://test.supabase.co/auth/v1/token', () => {
    return HttpResponse.json({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      user: {
        id: 'test-user-id',
        email: 'test@example.com',
      },
    })
  }),

  // Supabase REST API endpoints
  http.get('https://test.supabase.co/rest/v1/fields', () => {
    return HttpResponse.json([
      {
        id: 'field-1',
        name: 'Soccer Field A',
        type: 'soccer',
        hourly_rate: 50,
        active: true,
        created_at: new Date().toISOString(),
      },
      {
        id: 'field-2',
        name: 'Basketball Court B',
        type: 'basketball',
        hourly_rate: 30,
        active: true,
        created_at: new Date().toISOString(),
      },
    ])
  }),

  http.get('https://test.supabase.co/rest/v1/reservations', () => {
    return HttpResponse.json([
      {
        id: 'reservation-1',
        field_id: 'field-1',
        user_id: 'test-user-id',
        start_time: new Date(Date.now() + 86400000).toISOString(),
        end_time: new Date(Date.now() + 90000000).toISOString(),
        status: 'confirmed',
        total_cost: 50,
        created_at: new Date().toISOString(),
      },
    ])
  }),

  http.post('https://test.supabase.co/rest/v1/reservations', () => {
    return HttpResponse.json({
      id: 'new-reservation-id',
      field_id: 'field-1',
      user_id: 'test-user-id',
      start_time: new Date(Date.now() + 86400000).toISOString(),
      end_time: new Date(Date.now() + 90000000).toISOString(),
      status: 'confirmed',
      total_cost: 50,
      created_at: new Date().toISOString(),
    })
  }),

  // Stripe API endpoints
  http.post('https://api.stripe.com/v1/payment_intents', () => {
    return HttpResponse.json({
      id: 'pi_test_payment_intent',
      client_secret: 'pi_test_client_secret',
      status: 'requires_payment_method',
      amount: 5000,
      currency: 'usd',
    })
  }),

  http.post('https://api.stripe.com/v1/customers', () => {
    return HttpResponse.json({
      id: 'cus_test_customer',
      email: 'test@example.com',
      created: Math.floor(Date.now() / 1000),
    })
  }),

  // SendGrid API endpoints
  http.post('https://api.sendgrid.com/v3/mail/send', () => {
    return HttpResponse.json({
      message: 'success',
    })
  }),

  // Google Calendar API
  http.get('https://www.googleapis.com/calendar/v3/calendars', () => {
    return HttpResponse.json({
      items: [
        {
          id: 'primary',
          summary: 'Test Calendar',
          primary: true,
        },
      ],
    })
  }),

  // Generic error handler for unhandled requests
  http.all('*', ({ request }) => {
    console.warn(`Unhandled request: ${request.method} ${request.url}`)
    return HttpResponse.json(
      { error: 'Not found' },
      { status: 404 }
    )
  }),
]

export const server = setupServer(...handlers)