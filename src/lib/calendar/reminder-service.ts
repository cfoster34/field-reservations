import { createClient } from '@/lib/supabase/server'
import { EmailService } from '@/lib/notifications/email-service'
import { SMSService } from '@/lib/notifications/sms-service'
import { PushService } from '@/lib/notifications/push-service'

interface ReminderSettings {
  enabled: boolean
  methods: Array<'email' | 'sms' | 'push' | 'webhook'>
  timings: Array<{
    minutes: number
    enabled: boolean
  }>
  customMessage?: string
  webhookUrl?: string
}

interface CalendarReminder {
  id: string
  reservation_id: string
  user_id: string
  reminder_type: 'email' | 'sms' | 'push' | 'webhook'
  trigger_minutes: number
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  scheduled_for: string
  sent_at?: string
  error_message?: string
  metadata?: any
}

export class CalendarReminderService {
  private emailService: EmailService
  private smsService: SMSService
  private pushService: PushService

  constructor() {
    this.emailService = new EmailService()
    this.smsService = new SMSService()
    this.pushService = new PushService()
  }

  /**
   * Create reminders for a new reservation
   */
  async createReminders(
    reservationId: string,
    userId: string,
    reservationDate: Date,
    settings?: ReminderSettings
  ): Promise<CalendarReminder[]> {
    const supabase = createClient()
    
    // Get user's reminder preferences if not provided
    if (!settings) {
      settings = await this.getUserReminderSettings(userId)
    }
    
    if (!settings.enabled) {
      return []
    }
    
    const reminders: CalendarReminder[] = []
    
    // Create reminders for each enabled method and timing
    for (const method of settings.methods) {
      for (const timing of settings.timings) {
        if (!timing.enabled) continue
        
        const scheduledFor = new Date(reservationDate.getTime() - timing.minutes * 60 * 1000)
        
        // Only create reminders for future dates
        if (scheduledFor > new Date()) {
          const { data: reminder, error } = await supabase
            .from('calendar_reminders')
            .insert({
              reservation_id: reservationId,
              user_id: userId,
              reminder_type: method,
              trigger_minutes: timing.minutes,
              scheduled_for: scheduledFor.toISOString(),
              status: 'pending',
              metadata: {
                custom_message: settings.customMessage,
                webhook_url: method === 'webhook' ? settings.webhookUrl : undefined
              }
            })
            .select()
            .single()
          
          if (error) {
            console.error('Failed to create reminder:', error)
            continue
          }
          
          reminders.push(reminder)
        }
      }
    }
    
    return reminders
  }

  /**
   * Update reminders when reservation changes
   */
  async updateReminders(
    reservationId: string,
    newDate: Date,
    newStartTime: string
  ): Promise<void> {
    const supabase = createClient()
    
    // Get existing pending reminders
    const { data: existingReminders, error } = await supabase
      .from('calendar_reminders')
      .select('*')
      .eq('reservation_id', reservationId)
      .eq('status', 'pending')
    
    if (error || !existingReminders) {
      console.error('Failed to fetch existing reminders:', error)
      return
    }
    
    // Calculate new reservation start time
    const newReservationDateTime = new Date(`${newDate.toISOString().split('T')[0]}T${newStartTime}`)
    
    // Update each reminder's scheduled time
    for (const reminder of existingReminders) {
      const newScheduledFor = new Date(
        newReservationDateTime.getTime() - reminder.trigger_minutes * 60 * 1000
      )
      
      if (newScheduledFor > new Date()) {
        // Update to new time
        await supabase
          .from('calendar_reminders')
          .update({ scheduled_for: newScheduledFor.toISOString() })
          .eq('id', reminder.id)
      } else {
        // Cancel if the new time is in the past
        await supabase
          .from('calendar_reminders')
          .update({ status: 'cancelled' })
          .eq('id', reminder.id)
      }
    }
  }

  /**
   * Cancel reminders for a reservation
   */
  async cancelReminders(reservationId: string): Promise<void> {
    const supabase = createClient()
    
    await supabase
      .from('calendar_reminders')
      .update({ status: 'cancelled' })
      .eq('reservation_id', reservationId)
      .eq('status', 'pending')
  }

  /**
   * Process pending reminders that are due
   */
  async processPendingReminders(): Promise<{
    processed: number
    failed: number
    errors: string[]
  }> {
    const supabase = createClient()
    
    // Get reminders that are due (with some buffer for processing delay)
    const bufferMinutes = 2
    const dueTime = new Date(Date.now() + bufferMinutes * 60 * 1000)
    
    const { data: dueReminders, error } = await supabase
      .from('calendar_reminders')
      .select(`
        *,
        reservation:reservations(
          id,
          date,
          start_time,
          end_time,
          purpose,
          attendees,
          notes,
          field:fields(name, address),
          team:teams(name)
        ),
        user:user_profiles(
          id,
          full_name,
          email,
          phone,
          notification_preferences
        )
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', dueTime.toISOString())
      .limit(100) // Process in batches
    
    if (error) {
      console.error('Failed to fetch due reminders:', error)
      return { processed: 0, failed: 0, errors: [error.message] }
    }
    
    const results = {
      processed: 0,
      failed: 0,
      errors: [] as string[]
    }
    
    // Process each reminder
    for (const reminder of dueReminders || []) {
      try {
        await this.sendReminder(reminder)
        results.processed++
        
        // Mark as sent
        await supabase
          .from('calendar_reminders')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString()
          })
          .eq('id', reminder.id)
          
      } catch (error) {
        results.failed++
        results.errors.push(`Reminder ${reminder.id}: ${error.message}`)
        
        // Mark as failed
        await supabase
          .from('calendar_reminders')
          .update({
            status: 'failed',
            error_message: error.message
          })
          .eq('id', reminder.id)
      }
    }
    
    return results
  }

  /**
   * Send a reminder using the specified method
   */
  private async sendReminder(reminder: any): Promise<void> {
    const { reservation, user } = reminder
    
    if (!reservation || !user) {
      throw new Error('Missing reservation or user data')
    }
    
    const reminderData = {
      user,
      reservation,
      triggerMinutes: reminder.trigger_minutes,
      customMessage: reminder.metadata?.custom_message
    }
    
    switch (reminder.reminder_type) {
      case 'email':
        await this.sendEmailReminder(reminderData)
        break
        
      case 'sms':
        await this.sendSMSReminder(reminderData)
        break
        
      case 'push':
        await this.sendPushReminder(reminderData)
        break
        
      case 'webhook':
        await this.sendWebhookReminder(reminderData, reminder.metadata?.webhook_url)
        break
        
      default:
        throw new Error(`Unsupported reminder type: ${reminder.reminder_type}`)
    }
  }

  /**
   * Send email reminder
   */
  private async sendEmailReminder(data: any): Promise<void> {
    const { user, reservation, triggerMinutes, customMessage } = data
    
    const timeLabel = this.formatTimeLabel(triggerMinutes)
    const reservationDateTime = new Date(`${reservation.date}T${reservation.start_time}`)
    
    const subject = `Field Reservation Reminder - ${timeLabel}`
    
    const emailContent = customMessage || this.buildReminderMessage(reservation, timeLabel)
    
    await this.emailService.sendEmail({
      to: user.email,
      subject,
      templateId: 'calendar-reminder',
      templateData: {
        user_name: user.full_name,
        field_name: reservation.field.name,
        reservation_date: reservationDateTime.toLocaleDateString(),
        reservation_time: `${reservation.start_time} - ${reservation.end_time}`,
        purpose: reservation.purpose,
        attendees: reservation.attendees,
        time_label: timeLabel,
        custom_message: customMessage,
        reservation_details: emailContent
      }
    })
  }

  /**
   * Send SMS reminder
   */
  private async sendSMSReminder(data: any): Promise<void> {
    const { user, reservation, triggerMinutes, customMessage } = data
    
    if (!user.phone) {
      throw new Error('User has no phone number for SMS reminder')
    }
    
    const timeLabel = this.formatTimeLabel(triggerMinutes)
    const message = customMessage || this.buildSMSMessage(reservation, timeLabel)
    
    await this.smsService.sendSMS({
      to: user.phone,
      message
    })
  }

  /**
   * Send push notification reminder
   */
  private async sendPushReminder(data: any): Promise<void> {
    const { user, reservation, triggerMinutes, customMessage } = data
    
    const timeLabel = this.formatTimeLabel(triggerMinutes)
    const title = `Field Reservation - ${timeLabel}`
    const body = customMessage || `${reservation.field.name} at ${reservation.start_time}`
    
    await this.pushService.sendPushNotification({
      userId: user.id,
      title,
      body,
      data: {
        type: 'calendar_reminder',
        reservation_id: reservation.id,
        trigger_minutes: triggerMinutes
      }
    })
  }

  /**
   * Send webhook reminder
   */
  private async sendWebhookReminder(data: any, webhookUrl?: string): Promise<void> {
    if (!webhookUrl) {
      throw new Error('Webhook URL not configured')
    }
    
    const { user, reservation, triggerMinutes } = data
    
    const payload = {
      type: 'calendar_reminder',
      trigger_minutes: triggerMinutes,
      user: {
        id: user.id,
        name: user.full_name,
        email: user.email
      },
      reservation: {
        id: reservation.id,
        date: reservation.date,
        start_time: reservation.start_time,
        end_time: reservation.end_time,
        purpose: reservation.purpose,
        field: reservation.field,
        team: reservation.team
      },
      timestamp: new Date().toISOString()
    }
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'FieldReservations-CalendarReminder/1.0'
      },
      body: JSON.stringify(payload)
    })
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`)
    }
  }

  /**
   * Get user's reminder preferences
   */
  private async getUserReminderSettings(userId: string): Promise<ReminderSettings> {
    const supabase = createClient()
    
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('notification_preferences')
      .eq('id', userId)
      .single()
    
    if (error || !user) {
      // Return default settings
      return this.getDefaultReminderSettings()
    }
    
    const prefs = user.notification_preferences || {}
    
    return {
      enabled: prefs.calendar_reminders?.enabled !== false,
      methods: prefs.calendar_reminders?.methods || ['email'],
      timings: prefs.calendar_reminders?.timings || [
        { minutes: 1440, enabled: true }, // 24 hours
        { minutes: 60, enabled: true }    // 1 hour
      ],
      customMessage: prefs.calendar_reminders?.custom_message,
      webhookUrl: prefs.calendar_reminders?.webhook_url
    }
  }

  /**
   * Get default reminder settings
   */
  private getDefaultReminderSettings(): ReminderSettings {
    return {
      enabled: true,
      methods: ['email'],
      timings: [
        { minutes: 1440, enabled: true }, // 24 hours before
        { minutes: 60, enabled: true }    // 1 hour before
      ]
    }
  }

  /**
   * Format time label for display
   */
  private formatTimeLabel(minutes: number): string {
    if (minutes < 60) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`
    }
    
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    
    if (remainingMinutes === 0) {
      if (hours < 24) {
        return `${hours} hour${hours !== 1 ? 's' : ''}`
      } else {
        const days = Math.floor(hours / 24)
        const remainingHours = hours % 24
        
        if (remainingHours === 0) {
          return `${days} day${days !== 1 ? 's' : ''}`
        } else {
          return `${days} day${days !== 1 ? 's' : ''} ${remainingHours} hour${remainingHours !== 1 ? 's' : ''}`
        }
      }
    } else {
      return `${hours} hour${hours !== 1 ? 's' : ''} ${remainingMinutes} minute${remainingMinutes !== 1 ? 's' : ''}`
    }
  }

  /**
   * Build reminder message
   */
  private buildReminderMessage(reservation: any, timeLabel: string): string {
    const parts: string[] = []
    
    parts.push(`Your field reservation is coming up in ${timeLabel}.`)
    parts.push(`Field: ${reservation.field.name}`)
    parts.push(`Time: ${reservation.start_time} - ${reservation.end_time}`)
    parts.push(`Purpose: ${reservation.purpose}`)
    
    if (reservation.field.address) {
      parts.push(`Location: ${reservation.field.address}`)
    }
    
    if (reservation.team) {
      parts.push(`Team: ${reservation.team.name}`)
    }
    
    if (reservation.attendees > 1) {
      parts.push(`Expected attendees: ${reservation.attendees}`)
    }
    
    if (reservation.notes) {
      parts.push(`Notes: ${reservation.notes}`)
    }
    
    return parts.join('\n')
  }

  /**
   * Build SMS message (shorter format)
   */
  private buildSMSMessage(reservation: any, timeLabel: string): string {
    const parts: string[] = []
    
    parts.push(`Field reservation in ${timeLabel}:`)
    parts.push(`${reservation.field.name}`)
    parts.push(`${reservation.start_time}-${reservation.end_time}`)
    
    if (reservation.field.address) {
      parts.push(`@ ${reservation.field.address}`)
    }
    
    return parts.join(' ')
  }

  /**
   * Get reminder statistics
   */
  async getReminderStats(): Promise<{
    total: number
    pending: number
    sent: number
    failed: number
    cancelled: number
    byType: Record<string, number>
  }> {
    const supabase = createClient()
    
    const { data: reminders, error } = await supabase
      .from('calendar_reminders')
      .select('status, reminder_type')
    
    if (error) {
      throw new Error(`Failed to fetch reminder stats: ${error.message}`)
    }
    
    const stats = {
      total: reminders?.length || 0,
      pending: 0,
      sent: 0,
      failed: 0,
      cancelled: 0,
      byType: {} as Record<string, number>
    }
    
    for (const reminder of reminders || []) {
      stats[reminder.status as keyof typeof stats]++
      stats.byType[reminder.reminder_type] = (stats.byType[reminder.reminder_type] || 0) + 1
    }
    
    return stats
  }
}

export const reminderService = new CalendarReminderService()