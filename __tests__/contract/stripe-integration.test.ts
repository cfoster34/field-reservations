import nock from 'nock'
import { PaymentService } from '@/lib/stripe/payment-service'
import { createMockPayment, createMockUser } from '../fixtures'

describe('Stripe API Contract Tests', () => {
  let paymentService: PaymentService
  const STRIPE_API_BASE = 'https://api.stripe.com'

  beforeAll(() => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123456789'
    paymentService = new PaymentService()
  })

  beforeEach(() => {
    nock.cleanAll()
  })

  afterAll(() => {
    nock.cleanAll()
  })

  describe('Payment Intent Creation', () => {
    it('should create payment intent with correct structure', async () => {
      const expectedPaymentIntent = {
        id: 'pi_test_payment_intent',
        object: 'payment_intent',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
        client_secret: 'pi_test_client_secret',
        created: Math.floor(Date.now() / 1000),
        description: 'Field reservation payment',
        metadata: {
          reservation_id: 'reservation-123',
          user_id: 'user-123',
        },
      }

      // Mock Stripe API response
      nock(STRIPE_API_BASE)
        .post('/v1/payment_intents')
        .reply(200, expectedPaymentIntent)

      const result = await paymentService.createPaymentIntent({
        amount: 5000,
        currency: 'usd',
        description: 'Field reservation payment',
        metadata: {
          reservation_id: 'reservation-123',
          user_id: 'user-123',
        },
      })

      expect(result).toMatchObject({
        id: expect.stringMatching(/^pi_/),
        client_secret: expect.stringMatching(/^pi_.*_secret_/),
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
      })
    })

    it('should handle payment intent creation errors', async () => {
      nock(STRIPE_API_BASE)
        .post('/v1/payment_intents')
        .reply(400, {
          error: {
            type: 'invalid_request_error',
            code: 'amount_too_small',
            message: 'Amount must be at least $0.50 usd',
          },
        })

      await expect(
        paymentService.createPaymentIntent({
          amount: 30, // Too small
          currency: 'usd',
        })
      ).rejects.toThrow('Amount must be at least $0.50 usd')
    })
  })

  describe('Customer Creation', () => {
    it('should create customer with correct structure', async () => {
      const expectedCustomer = {
        id: 'cus_test_customer',
        object: 'customer',
        email: 'test@example.com',
        name: 'Test User',
        created: Math.floor(Date.now() / 1000),
        default_source: null,
        sources: {
          object: 'list',
          data: [],
          has_more: false,
          total_count: 0,
          url: '/v1/customers/cus_test_customer/sources',
        },
      }

      nock(STRIPE_API_BASE)
        .post('/v1/customers')
        .reply(200, expectedCustomer)

      const result = await paymentService.createCustomer({
        email: 'test@example.com',
        name: 'Test User',
      })

      expect(result).toMatchObject({
        id: expect.stringMatching(/^cus_/),
        email: 'test@example.com',
        name: 'Test User',
        object: 'customer',
      })
    })
  })

  describe('Webhook Signature Verification', () => {
    it('should verify webhook signatures correctly', () => {
      const payload = JSON.stringify({
        id: 'evt_test_webhook',
        object: 'event',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_payment_intent',
            status: 'succeeded',
          },
        },
      })

      const secret = 'whsec_test_secret'
      const timestamp = Math.floor(Date.now() / 1000)
      const signature = paymentService.constructWebhookSignature(payload, secret, timestamp)

      const isValid = paymentService.verifyWebhookSignature(
        payload,
        signature,
        secret,
        timestamp
      )

      expect(isValid).toBe(true)
    })

    it('should reject invalid webhook signatures', () => {
      const payload = JSON.stringify({ test: 'data' })
      const invalidSignature = 'invalid_signature'
      const secret = 'whsec_test_secret'
      const timestamp = Math.floor(Date.now() / 1000)

      const isValid = paymentService.verifyWebhookSignature(
        payload,
        invalidSignature,
        secret,
        timestamp
      )

      expect(isValid).toBe(false)
    })
  })

  describe('Refund Processing', () => {
    it('should process refunds with correct structure', async () => {
      const expectedRefund = {
        id: 'ref_test_refund',
        object: 'refund',
        amount: 2500,
        charge: 'ch_test_charge',
        created: Math.floor(Date.now() / 1000),
        currency: 'usd',
        status: 'succeeded',
        reason: 'requested_by_customer',
      }

      nock(STRIPE_API_BASE)
        .post('/v1/refunds')
        .reply(200, expectedRefund)

      const result = await paymentService.createRefund({
        charge: 'ch_test_charge',
        amount: 2500,
        reason: 'requested_by_customer',
      })

      expect(result).toMatchObject({
        id: expect.stringMatching(/^ref_/),
        amount: 2500,
        status: 'succeeded',
        reason: 'requested_by_customer',
      })
    })
  })

  describe('Subscription Management', () => {
    it('should create subscriptions with correct structure', async () => {
      const expectedSubscription = {
        id: 'sub_test_subscription',
        object: 'subscription',
        customer: 'cus_test_customer',
        status: 'active',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 30,
        items: {
          object: 'list',
          data: [
            {
              id: 'si_test_item',
              price: {
                id: 'price_test_price',
                recurring: {
                  interval: 'month',
                },
              },
            },
          ],
        },
      }

      nock(STRIPE_API_BASE)
        .post('/v1/subscriptions')
        .reply(200, expectedSubscription)

      const result = await paymentService.createSubscription({
        customer: 'cus_test_customer',
        items: [{ price: 'price_test_price' }],
      })

      expect(result).toMatchObject({
        id: expect.stringMatching(/^sub_/),
        customer: 'cus_test_customer',
        status: 'active',
        object: 'subscription',
      })
    })
  })

  describe('Rate Limiting Compliance', () => {
    it('should handle rate limiting correctly', async () => {
      // First request succeeds
      nock(STRIPE_API_BASE)
        .post('/v1/payment_intents')
        .reply(200, { id: 'pi_success' })

      // Second request is rate limited
      nock(STRIPE_API_BASE)
        .post('/v1/payment_intents')
        .reply(429, {
          error: {
            type: 'rate_limit_error',
            message: 'Too many requests',
          },
        })

      // Third request succeeds after retry
      nock(STRIPE_API_BASE)
        .post('/v1/payment_intents')
        .delay(1000)
        .reply(200, { id: 'pi_retry_success' })

      const first = await paymentService.createPaymentIntent({ amount: 1000, currency: 'usd' })
      expect(first.id).toBe('pi_success')

      // Should handle rate limiting with retry
      const retried = await paymentService.createPaymentIntentWithRetry({ amount: 1000, currency: 'usd' })
      expect(retried.id).toBe('pi_retry_success')
    })
  })

  describe('API Version Compatibility', () => {
    it('should work with current Stripe API version', async () => {
      const expectedResponse = {
        id: 'pi_test',
        object: 'payment_intent',
        amount: 1000,
        currency: 'usd',
      }

      nock(STRIPE_API_BASE)
        .post('/v1/payment_intents')
        .matchHeader('stripe-version', '2023-10-16') // Current API version
        .reply(200, expectedResponse)

      const result = await paymentService.createPaymentIntent({
        amount: 1000,
        currency: 'usd',
      })

      expect(result.id).toBe('pi_test')
    })

    it('should handle API version deprecation warnings', async () => {
      nock(STRIPE_API_BASE)
        .post('/v1/payment_intents')
        .reply(200, { id: 'pi_test' }, {
          'stripe-should-upgrade': 'true',
          'stripe-version-upgrade-available': '2024-01-01',
        })

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation()

      await paymentService.createPaymentIntent({
        amount: 1000,
        currency: 'usd',
      })

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stripe API version upgrade available')
      )

      consoleSpy.mockRestore()
    })
  })
})

describe('SendGrid API Contract Tests', () => {
  const SENDGRID_API_BASE = 'https://api.sendgrid.com'

  beforeEach(() => {
    nock.cleanAll()
    process.env.SENDGRID_API_KEY = 'SG.test_api_key'
  })

  afterAll(() => {
    nock.cleanAll()
  })

  describe('Email Sending', () => {
    it('should send emails with correct structure', async () => {
      nock(SENDGRID_API_BASE)
        .post('/v3/mail/send')
        .reply(202, {})

      const { EmailNotificationService } = require('@/lib/notifications/email-service')
      const emailService = EmailNotificationService.getInstance()

      const result = await emailService.sendEmail({
        to: 'test@example.com',
        from: 'noreply@fieldreservations.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
        text: 'Test content',
      })

      expect(result).toBe(true)
    })

    it('should handle SendGrid API errors', async () => {
      nock(SENDGRID_API_BASE)
        .post('/v3/mail/send')
        .reply(400, {
          errors: [
            {
              message: 'The from address does not match a verified Sender Identity',
              field: 'from',
              help: 'https://sendgrid.com/docs/for-developers/sending-email/sender-identity/',
            },
          ],
        })

      const { EmailNotificationService } = require('@/lib/notifications/email-service')
      const emailService = EmailNotificationService.getInstance()

      const result = await emailService.sendEmail({
        to: 'test@example.com',
        from: 'invalid@domain.com',
        subject: 'Test Email',
        html: '<p>Test content</p>',
      })

      expect(result).toBe(false)
    })
  })

  describe('Template Email Sending', () => {
    it('should send template emails correctly', async () => {
      nock(SENDGRID_API_BASE)
        .post('/v3/mail/send')
        .reply(202, {})

      const { EmailNotificationService } = require('@/lib/notifications/email-service')
      const emailService = EmailNotificationService.getInstance()

      // Mock template retrieval
      jest.spyOn(emailService, 'getEmailTemplate').mockResolvedValue({
        id: 'template-1',
        name: 'reservation_confirmation',
        subject: 'Reservation Confirmed - {{field_name}}',
        html_content: '<p>Your reservation for {{field_name}} is confirmed!</p>',
        text_content: 'Your reservation for {{field_name}} is confirmed!',
      })

      const result = await emailService.sendTemplateEmail(
        'reservation_confirmation',
        'user@example.com',
        { field_name: 'Soccer Field A' }
      )

      expect(result).toBe(true)
    })
  })

  describe('Webhook Processing', () => {
    it('should process delivery events correctly', async () => {
      const { EmailNotificationService } = require('@/lib/notifications/email-service')
      const emailService = EmailNotificationService.getInstance()

      const webhookEvents = [
        {
          email: 'user@example.com',
          timestamp: 1633024800,
          event: 'delivered',
          sg_message_id: 'message-id-123',
          response: '250 OK',
        },
        {
          email: 'user@example.com',
          timestamp: 1633024820,
          event: 'open',
          sg_message_id: 'message-id-123',
          useragent: 'Mozilla/5.0...',
          ip: '192.168.1.1',
        },
      ]

      await expect(
        emailService.handleSendGridWebhook(webhookEvents)
      ).resolves.not.toThrow()
    })
  })
})

describe('Google Calendar API Contract Tests', () => {
  const GOOGLE_API_BASE = 'https://www.googleapis.com'

  beforeEach(() => {
    nock.cleanAll()
  })

  afterAll(() => {
    nock.cleanAll()
  })

  describe('Calendar Integration', () => {
    it('should create calendar events with correct structure', async () => {
      const expectedEvent = {
        kind: 'calendar#event',
        id: 'event_id_123',
        status: 'confirmed',
        htmlLink: 'https://www.google.com/calendar/event?eid=...',
        created: '2024-01-01T10:00:00.000Z',
        updated: '2024-01-01T10:00:00.000Z',
        summary: 'Field Reservation - Soccer Field A',
        description: 'Team practice session',
        start: {
          dateTime: '2024-03-15T10:00:00-05:00',
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: '2024-03-15T12:00:00-05:00',
          timeZone: 'America/New_York',
        },
        attendees: [
          {
            email: 'user@example.com',
            responseStatus: 'accepted',
          },
        ],
      }

      nock(GOOGLE_API_BASE)
        .post('/calendar/v3/calendars/primary/events')
        .reply(200, expectedEvent)

      const { GoogleCalendarService } = require('@/lib/calendar/google-calendar')
      const calendarService = new GoogleCalendarService('test_access_token')

      const result = await calendarService.createEvent({
        summary: 'Field Reservation - Soccer Field A',
        description: 'Team practice session',
        start: {
          dateTime: '2024-03-15T10:00:00-05:00',
          timeZone: 'America/New_York',
        },
        end: {
          dateTime: '2024-03-15T12:00:00-05:00',
          timeZone: 'America/New_York',
        },
        attendees: [{ email: 'user@example.com' }],
      })

      expect(result).toMatchObject({
        id: expect.any(String),
        summary: 'Field Reservation - Soccer Field A',
        status: 'confirmed',
      })
    })

    it('should handle calendar API authentication errors', async () => {
      nock(GOOGLE_API_BASE)
        .post('/calendar/v3/calendars/primary/events')
        .reply(401, {
          error: {
            code: 401,
            message: 'Invalid Credentials',
            status: 'UNAUTHENTICATED',
          },
        })

      const { GoogleCalendarService } = require('@/lib/calendar/google-calendar')
      const calendarService = new GoogleCalendarService('invalid_token')

      await expect(
        calendarService.createEvent({
          summary: 'Test Event',
          start: { dateTime: '2024-03-15T10:00:00Z' },
          end: { dateTime: '2024-03-15T12:00:00Z' },
        })
      ).rejects.toThrow('Invalid Credentials')
    })
  })

  describe('Calendar Sync', () => {
    it('should sync calendar events correctly', async () => {
      const calendarList = {
        kind: 'calendar#calendarList',
        items: [
          {
            kind: 'calendar#calendarListEntry',
            id: 'primary',
            summary: 'Primary Calendar',
            accessRole: 'owner',
          },
        ],
      }

      const eventsList = {
        kind: 'calendar#events',
        items: [
          {
            kind: 'calendar#event',
            id: 'event1',
            summary: 'Existing Event',
            start: { dateTime: '2024-03-15T10:00:00Z' },
            end: { dateTime: '2024-03-15T12:00:00Z' },
          },
        ],
      }

      nock(GOOGLE_API_BASE)
        .get('/calendar/v3/users/me/calendarList')
        .reply(200, calendarList)

      nock(GOOGLE_API_BASE)
        .get('/calendar/v3/calendars/primary/events')
        .query(true)
        .reply(200, eventsList)

      const { GoogleCalendarService } = require('@/lib/calendar/google-calendar')
      const calendarService = new GoogleCalendarService('test_access_token')

      const result = await calendarService.syncCalendars()

      expect(result).toMatchObject({
        calendars: expect.arrayContaining([
          expect.objectContaining({
            id: 'primary',
            summary: 'Primary Calendar',
          }),
        ]),
        events: expect.arrayContaining([
          expect.objectContaining({
            id: 'event1',
            summary: 'Existing Event',
          }),
        ]),
      })
    })
  })
})

describe('API Contract Validation', () => {
  describe('Response Schema Validation', () => {
    it('should validate Stripe payment intent response schema', () => {
      const paymentIntentResponse = {
        id: 'pi_test_123',
        object: 'payment_intent',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
        client_secret: 'pi_test_123_secret_abc',
        created: 1633024800,
      }

      const schema = {
        type: 'object',
        required: ['id', 'object', 'amount', 'currency', 'status', 'client_secret'],
        properties: {
          id: { type: 'string', pattern: '^pi_' },
          object: { type: 'string', enum: ['payment_intent'] },
          amount: { type: 'number', minimum: 0 },
          currency: { type: 'string', minLength: 3, maxLength: 3 },
          status: { type: 'string' },
          client_secret: { type: 'string', pattern: '^pi_.*_secret_' },
          created: { type: 'number' },
        },
      }

      const { validateSchema } = require('@/lib/validation/schema-validator')
      const isValid = validateSchema(paymentIntentResponse, schema)

      expect(isValid).toBe(true)
    })

    it('should validate SendGrid email response schema', () => {
      const emailResponse = {
        message: 'success',
      }

      const schema = {
        type: 'object',
        properties: {
          message: { type: 'string' },
          errors: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                field: { type: 'string' },
                help: { type: 'string' },
              },
            },
          },
        },
      }

      const { validateSchema } = require('@/lib/validation/schema-validator')
      const isValid = validateSchema(emailResponse, schema)

      expect(isValid).toBe(true)
    })
  })

  describe('Error Response Handling', () => {
    it('should handle standard error response formats', () => {
      const errorFormats = [
        // Stripe error format
        {
          error: {
            type: 'invalid_request_error',
            code: 'parameter_missing',
            message: 'Missing required param: amount',
            param: 'amount',
          },
        },
        // SendGrid error format
        {
          errors: [
            {
              message: 'The from address does not match a verified Sender Identity',
              field: 'from',
              help: 'https://sendgrid.com/docs/...',
            },
          ],
        },
        // Google API error format
        {
          error: {
            code: 400,
            message: 'Invalid request',
            status: 'INVALID_ARGUMENT',
            details: [
              {
                '@type': 'type.googleapis.com/google.rpc.BadRequest',
                fieldViolations: [
                  {
                    field: 'summary',
                    description: 'Required field is missing',
                  },
                ],
              },
            ],
          },
        },
      ]

      const { parseAPIError } = require('@/lib/integrations/error-parser')

      errorFormats.forEach((errorFormat, index) => {
        const parsedError = parseAPIError(errorFormat)
        expect(parsedError).toMatchObject({
          message: expect.any(String),
          code: expect.any(String),
          details: expect.any(Object),
        })
      })
    })
  })
})