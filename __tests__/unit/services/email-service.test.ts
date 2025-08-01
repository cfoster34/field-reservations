import { EmailNotificationService, EmailSchedulingService } from '@/lib/notifications/email-service'
import sgMail from '@sendgrid/mail'
import { createClient } from '@/lib/supabase/client'
import { createMockUser } from '../../fixtures'

// Mock dependencies
jest.mock('@sendgrid/mail')
jest.mock('@/lib/supabase/client')

const mockSgMail = sgMail as jest.Mocked<typeof sgMail>
const mockSupabase = {
  from: jest.fn().mockReturnThis(),
  select: jest.fn().mockReturnThis(),
  insert: jest.fn().mockReturnThis(),
  update: jest.fn().mockReturnThis(),
  delete: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  or: jest.fn().mockReturnThis(),
  in: jest.fn().mockReturnThis(),
  lte: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  single: jest.fn(),
}

;(createClient as jest.MockedFunction<typeof createClient>).mockReturnValue(mockSupabase as any)

describe('EmailNotificationService', () => {
  let emailService: EmailNotificationService
  
  beforeEach() => {
    jest.clearAllMocks()
    emailService = EmailNotificationService.getInstance()
    
    // Reset environment variables
    process.env.SENDGRID_API_KEY = 'test-api-key'
    process.env.DEFAULT_FROM_EMAIL = 'test@example.com'
  })

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = EmailNotificationService.getInstance()
      const instance2 = EmailNotificationService.getInstance()
      expect(instance1).toBe(instance2)
    })
  })

  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      mockSgMail.send.mockResolvedValue([{} as any, {}])

      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
        text: 'Test text',
      }

      const result = await emailService.sendEmail(emailData)

      expect(result).toBe(true)
      expect(mockSgMail.send).toHaveBeenCalledWith({
        to: 'recipient@example.com',
        from: 'test@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
        text: 'Test text',
        attachments: undefined,
      })
    })

    it('should handle email sending failure', async () => {
      mockSgMail.send.mockRejectedValue(new Error('SendGrid error'))

      const emailData = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
      }

      const result = await emailService.sendEmail(emailData)

      expect(result).toBe(false)
    })

    it('should use custom from email when provided', async () => {
      mockSgMail.send.mockResolvedValue([{} as any, {}])

      const emailData = {
        to: 'recipient@example.com',
        from: 'custom@example.com',
        subject: 'Test Subject',
        html: '<p>Test HTML</p>',
      }

      await emailService.sendEmail(emailData)

      expect(mockSgMail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'custom@example.com',
        })
      )
    })
  })

  describe('sendTemplateEmail', () => {
    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'template-1',
          name: 'test-template',
          subject: 'Hello {{user_name}}',
          html_content: '<p>Welcome {{user_name}} to {{site_name}}</p>',
          text_content: 'Welcome {{user_name}} to {{site_name}}',
        },
        error: null,
      })
    })

    it('should send template email successfully', async () => {
      mockSgMail.send.mockResolvedValue([{} as any, {}])

      const result = await emailService.sendTemplateEmail(
        'test-template',
        'user@example.com',
        { user_name: 'John Doe', site_name: 'Field Reservations' }
      )

      expect(result).toBe(true)
      expect(mockSgMail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Hello John Doe',
          html: '<p>Welcome John Doe to Field Reservations</p>',
          text: 'Welcome John Doe to Field Reservations',
        })
      )
    })

    it('should handle missing template', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: new Error('Template not found'),
      })

      const result = await emailService.sendTemplateEmail(
        'missing-template',
        'user@example.com'
      )

      expect(result).toBe(false)
    })

    it('should convert HTML to text when text content is missing', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'template-1',
          name: 'test-template',
          subject: 'Test',
          html_content: '<p>Hello <strong>{{user_name}}</strong></p>',
          text_content: null,
        },
        error: null,
      })
      mockSgMail.send.mockResolvedValue([{} as any, {}])

      await emailService.sendTemplateEmail(
        'test-template',
        'user@example.com',
        { user_name: 'John' }
      )

      expect(mockSgMail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello John',
        })
      )
    })
  })

  describe('sendBulkTemplateEmail', () => {
    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'template-1',
          name: 'bulk-template',
          subject: 'Hello {{user_name}}',
          html_content: '<p>Hello {{user_name}}</p>',
          text_content: 'Hello {{user_name}}',
        },
        error: null,
      })
    })

    it('should send bulk emails and return success/failure counts', async () => {
      // Mock successful sends
      mockSgMail.send.mockResolvedValue([{} as any, {}])

      const recipients = [
        { email: 'user1@example.com', variables: { user_name: 'User 1' } },
        { email: 'user2@example.com', variables: { user_name: 'User 2' } },
        { email: 'user3@example.com', variables: { user_name: 'User 3' } },
      ]

      const result = await emailService.sendBulkTemplateEmail(
        'bulk-template',
        recipients
      )

      expect(result).toEqual({ success: 3, failed: 0 })
      expect(mockSgMail.send).toHaveBeenCalledTimes(3)
    })

    it('should handle partial failures in bulk sending', async () => {
      // Mock some failures
      mockSgMail.send
        .mockResolvedValueOnce([{} as any, {}]) // Success
        .mockRejectedValueOnce(new Error('Failed')) // Failure
        .mockResolvedValueOnce([{} as any, {}]) // Success

      const recipients = [
        { email: 'user1@example.com', variables: { user_name: 'User 1' } },
        { email: 'user2@example.com', variables: { user_name: 'User 2' } },
        { email: 'user3@example.com', variables: { user_name: 'User 3' } },
      ]

      const result = await emailService.sendBulkTemplateEmail(
        'bulk-template',
        recipients
      )

      expect(result).toEqual({ success: 2, failed: 1 })
    })
  })

  describe('replaceVariables', () => {
    it('should replace template variables correctly', () => {
      const service = emailService as any
      const template = 'Hello {{name}}, welcome to {{site}}!'
      const variables = { name: 'John', site: 'Field Reservations' }

      const result = service.replaceVariables(template, variables)

      expect(result).toBe('Hello John, welcome to Field Reservations!')
    })

    it('should handle variables with spaces', () => {
      const service = emailService as any
      const template = 'Hello {{ name }}, welcome to {{ site }}!'
      const variables = { name: 'John', site: 'Field Reservations' }

      const result = service.replaceVariables(template, variables)

      expect(result).toBe('Hello John, welcome to Field Reservations!')
    })

    it('should leave unreplaced variables as-is', () => {
      const service = emailService as any
      const template = 'Hello {{name}}, your {{status}} is {{undefined_var}}'
      const variables = { name: 'John', status: 'active' }

      const result = service.replaceVariables(template, variables)

      expect(result).toBe('Hello John, your active is {{undefined_var}}')
    })
  })

  describe('htmlToText', () => {
    it('should convert HTML to plain text', () => {
      const service = emailService as any
      const html = '<p>Hello <strong>world</strong>!</p><br><a href="#">Link</a>'

      const result = service.htmlToText(html)

      expect(result).toBe('Hello world!Link')
    })

    it('should handle HTML entities', () => {
      const service = emailService as any
      const html = 'Hello &amp; welcome &lt;user&gt; &quot;test&quot;'

      const result = service.htmlToText(html)

      expect(result).toBe('Hello & welcome <user> "test"')
    })
  })

  describe('reservation methods', () => {
    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'template-1',
          name: 'reservation_confirmation',
          subject: 'Reservation Confirmed for {{field_name}}',
          html_content: '<p>Hi {{user_name}}, your reservation is confirmed!</p>',
          text_content: 'Hi {{user_name}}, your reservation is confirmed!',
        },
        error: null,
      })
      mockSgMail.send.mockResolvedValue([{} as any, {}])
    })

    it('should send reservation confirmation', async () => {
      const reservationData = {
        field_name: 'Soccer Field A',
        date: '2024-01-15',
        start_time: '10:00',
        end_time: '12:00',
        user_name: 'John Doe',
      }

      const result = await emailService.sendReservationConfirmation(
        'user@example.com',
        reservationData,
        'league-1'
      )

      expect(result).toBe(true)
      expect(mockSgMail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Reservation Confirmed for Soccer Field A',
        })
      )
    })

    it('should send reservation reminder', async () => {
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'template-2',
          name: 'reservation_reminder',
          subject: 'Reminder: {{field_name}} at {{start_time}}',
          html_content: '<p>Reminder for {{user_name}}</p>',
          text_content: 'Reminder for {{user_name}}',
        },
        error: null,
      })

      const reservationData = {
        field_name: 'Basketball Court',
        date: '2024-01-16',
        start_time: '14:00',
        end_time: '16:00',
        user_name: 'Jane Smith',
      }

      const result = await emailService.sendReservationReminder(
        'user@example.com',
        reservationData,
        'league-1'
      )

      expect(result).toBe(true)
    })
  })

  describe('template management', () => {
    it('should create email template', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: 'new-template', name: 'test' },
        error: null,
      })

      const template = {
        name: 'test-template',
        subject: 'Test Subject',
        html_content: '<p>Test</p>',
        text_content: 'Test',
        league_id: 'league-1',
        is_system: false,
      }

      const result = await emailService.createEmailTemplate(template)

      expect(result).toEqual({ id: 'new-template', name: 'test' })
      expect(mockSupabase.insert).toHaveBeenCalledWith(template)
    })

    it('should update email template', async () => {
      mockSupabase.eq.mockResolvedValue({ error: null })

      const result = await emailService.updateEmailTemplate('template-1', {
        subject: 'Updated Subject',
      })

      expect(result).toBe(true)
      expect(mockSupabase.update).toHaveBeenCalledWith({
        subject: 'Updated Subject',
      })
    })

    it('should delete email template', async () => {
      mockSupabase.eq.mockResolvedValue({ error: null })

      const result = await emailService.deleteEmailTemplate('template-1')

      expect(result).toBe(true)
      expect(mockSupabase.delete).toHaveBeenCalled()
      expect(mockSupabase.eq).toHaveBeenCalledWith('is_system', false)
    })
  })

  describe('webhook handling', () => {
    it('should handle SendGrid webhook events', async () => {
      const events = [
        {
          event: 'delivered',
          sg_message_id: 'msg-1',
          email: 'user@example.com',
        },
        {
          event: 'open',
          sg_message_id: 'msg-2',
          email: 'user@example.com',
        },
        {
          event: 'bounce',
          sg_message_id: 'msg-3',
          email: 'bounce@example.com',
          reason: 'Invalid email',
        },
      ]

      await emailService.handleSendGridWebhook(events)

      expect(mockSupabase.insert).toHaveBeenCalledTimes(4) // 3 tracking + 1 bounce update
    })
  })
})

describe('EmailSchedulingService', () => {
  let schedulingService: EmailSchedulingService

  beforeEach(() => {
    jest.clearAllMocks()
    schedulingService = new EmailSchedulingService()
  })

  describe('scheduleEmail', () => {
    it('should create scheduled email', async () => {
      mockSupabase.single.mockResolvedValue({
        data: { id: 'schedule-1', template_id: 'template-1' },
        error: null,
      })

      const schedule = {
        template_id: 'template-1',
        league_id: 'league-1',
        template_type: 'email' as const,
        cron_expression: '0 9 * * *',
        target_audience: { roles: ['player'] },
        variables: { site_name: 'Field Reservations' },
        is_active: true,
      }

      const result = await schedulingService.scheduleEmail(schedule)

      expect(result).toEqual({ id: 'schedule-1', template_id: 'template-1' })
      expect(mockSupabase.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          ...schedule,
          next_run_at: expect.any(String),
        })
      )
    })
  })

  describe('processScheduledEmails', () => {
    it('should process due scheduled emails', async () => {
      // Mock scheduled emails query
      mockSupabase.lte.mockResolvedValue({
        data: [
          {
            id: 'schedule-1',
            template_id: 'reminder-template',
            league_id: 'league-1',
            cron_expression: '0 9 * * *',
            target_audience: { roles: ['player'] },
            variables: { site_name: 'Field Reservations' },
          },
        ],
        error: null,
      })

      // Mock recipients query
      mockSupabase.eq.mockResolvedValue({
        data: [
          { id: 'user-1', email: 'user1@example.com', full_name: 'User 1', role: 'player' },
          { id: 'user-2', email: 'user2@example.com', full_name: 'User 2', role: 'player' },
        ],
        error: null,
      })

      // Mock template query
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'reminder-template',
          name: 'reminder',
          subject: 'Daily Reminder',
          html_content: '<p>Hello {{user_name}}</p>',
          text_content: 'Hello {{user_name}}',
        },
        error: null,
      })

      mockSgMail.send.mockResolvedValue([{} as any, {}])

      await schedulingService.processScheduledEmails()

      expect(mockSupabase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          last_run_at: expect.any(String),
          next_run_at: expect.any(String),
        })
      )
    })
  })
})