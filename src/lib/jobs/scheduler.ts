import { createClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/sendgrid/client'
import { getNotificationTemplate } from '@/lib/sendgrid/templates'

// Job configuration
export const JOBS = {
  SEND_PENDING_NOTIFICATIONS: 'send_pending_notifications',
  SEND_RESERVATION_REMINDERS: 'send_reservation_reminders',
  PROCESS_EXPIRED_WAITLIST: 'process_expired_waitlist',
  CLEANUP_OLD_NOTIFICATIONS: 'cleanup_old_notifications',
  UPDATE_FIELD_UTILIZATION: 'update_field_utilization',
}

// Send pending notifications
export async function sendPendingNotifications() {
  const supabase = createClient()
  
  // Get notifications scheduled for now or past
  const { data: notifications, error } = await supabase
    .from('notifications')
    .select(`
      *,
      user:user_profiles (
        id,
        email,
        full_name,
        notification_preferences
      )
    `)
    .eq('is_sent', false)
    .lte('scheduled_for', new Date().toISOString())
    .limit(100)

  if (error) {
    console.error('Error fetching pending notifications:', error)
    return { success: false, error }
  }

  let sentCount = 0
  let failedCount = 0

  for (const notification of notifications || []) {
    try {
      const preferences = notification.user?.notification_preferences || {}
      
      // Check if user wants this type of notification
      if (notification.type === 'email' && preferences.email !== false) {
        await sendEmail({
          to: notification.user.email,
          subject: notification.title,
          templateId: getNotificationTemplate('generic'),
          dynamicTemplateData: {
            name: notification.user.full_name,
            title: notification.title,
            content: notification.content,
            actionUrl: notification.data?.actionUrl,
            actionText: notification.data?.actionText,
          },
        })
      }
      
      // Mark as sent
      await supabase
        .from('notifications')
        .update({
          is_sent: true,
          sent_at: new Date().toISOString(),
        })
        .eq('id', notification.id)
      
      sentCount++
    } catch (error) {
      console.error(`Failed to send notification ${notification.id}:`, error)
      failedCount++
    }
  }

  return {
    success: true,
    sentCount,
    failedCount,
  }
}

// Send reservation reminders
export async function sendReservationReminders() {
  const supabase = createClient()
  
  // Get upcoming reservations that need reminders
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  
  const dayAfter = new Date(tomorrow)
  dayAfter.setDate(dayAfter.getDate() + 1)

  const { data: reservations, error } = await supabase
    .from('reservations')
    .select(`
      *,
      field:fields (
        name,
        address
      ),
      user:user_profiles (
        id,
        email,
        full_name,
        notification_preferences
      ),
      team:teams (
        name
      )
    `)
    .eq('status', 'confirmed')
    .gte('date', tomorrow.toISOString().split('T')[0])
    .lt('date', dayAfter.toISOString().split('T')[0])

  if (error) {
    console.error('Error fetching reservations for reminders:', error)
    return { success: false, error }
  }

  let reminderCount = 0

  for (const reservation of reservations || []) {
    const preferences = reservation.user?.notification_preferences || {}
    const reminderHours = preferences.reminderHours || 24
    
    // Calculate when to send reminder
    const reservationTime = new Date(`${reservation.date}T${reservation.start_time}`)
    const reminderTime = new Date(reservationTime.getTime() - (reminderHours * 60 * 60 * 1000))
    
    if (reminderTime <= new Date()) {
      // Check if reminder already sent
      const { data: existingReminder } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', reservation.user_id)
        .eq('data->>reservationId', reservation.id)
        .eq('data->>type', 'reminder')
        .single()

      if (!existingReminder) {
        // Create reminder notification
        await supabase
          .from('notifications')
          .insert({
            user_id: reservation.user_id,
            type: 'email',
            title: 'Upcoming Field Reservation',
            content: `Reminder: You have a field reservation tomorrow at ${reservation.field.name} from ${reservation.start_time} to ${reservation.end_time}.`,
            data: {
              reservationId: reservation.id,
              type: 'reminder',
              fieldName: reservation.field.name,
              fieldAddress: reservation.field.address,
              date: reservation.date,
              startTime: reservation.start_time,
              endTime: reservation.end_time,
              teamName: reservation.team?.name,
            },
            scheduled_for: new Date().toISOString(),
          })
        
        reminderCount++
      }
    }
  }

  return {
    success: true,
    reminderCount,
  }
}

// Process expired waitlist entries
export async function processExpiredWaitlist() {
  const supabase = createClient()
  
  // Remove expired waitlist entries
  const { error, count } = await supabase
    .from('waitlist')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .not('expires_at', 'is', null)

  if (error) {
    console.error('Error removing expired waitlist entries:', error)
    return { success: false, error }
  }

  // Process waitlist for recently cancelled reservations
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
  
  const { data: cancelledReservations } = await supabase
    .from('reservations')
    .select('field_id, date, start_time, end_time')
    .eq('status', 'cancelled')
    .gte('cancelled_at', oneDayAgo.toISOString())
    .gte('date', new Date().toISOString().split('T')[0])

  let processedCount = 0

  for (const slot of cancelledReservations || []) {
    // Check if slot is still available
    const { data: hasConflict } = await supabase
      .rpc('check_reservation_conflict', {
        p_field_id: slot.field_id,
        p_date: slot.date,
        p_start_time: slot.start_time,
        p_end_time: slot.end_time,
      })

    if (!hasConflict) {
      // Process waitlist for this slot
      const { data: notifiedUserId } = await supabase
        .rpc('process_waitlist_for_slot', {
          p_field_id: slot.field_id,
          p_date: slot.date,
          p_start_time: slot.start_time,
          p_end_time: slot.end_time,
        })

      if (notifiedUserId) {
        processedCount++
      }
    }
  }

  return {
    success: true,
    removedCount: count || 0,
    processedCount,
  }
}

// Cleanup old notifications
export async function cleanupOldNotifications() {
  const supabase = createClient()
  
  // Delete read notifications older than 30 days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  
  const { error, count } = await supabase
    .from('notifications')
    .delete()
    .eq('is_read', true)
    .lt('created_at', thirtyDaysAgo.toISOString())

  if (error) {
    console.error('Error cleaning up old notifications:', error)
    return { success: false, error }
  }

  return {
    success: true,
    deletedCount: count || 0,
  }
}

// Update field utilization stats
export async function updateFieldUtilizationStats() {
  const supabase = createClient()
  
  // Refresh the materialized view
  const { error } = await supabase.rpc('refresh_materialized_view', {
    view_name: 'field_utilization_stats',
  })

  if (error) {
    console.error('Error updating field utilization stats:', error)
    return { success: false, error }
  }

  return {
    success: true,
    updatedAt: new Date().toISOString(),
  }
}

// Main job runner
export async function runScheduledJob(jobName: string) {
  console.log(`Running scheduled job: ${jobName}`)
  
  try {
    let result
    
    switch (jobName) {
      case JOBS.SEND_PENDING_NOTIFICATIONS:
        result = await sendPendingNotifications()
        break
      case JOBS.SEND_RESERVATION_REMINDERS:
        result = await sendReservationReminders()
        break
      case JOBS.PROCESS_EXPIRED_WAITLIST:
        result = await processExpiredWaitlist()
        break
      case JOBS.CLEANUP_OLD_NOTIFICATIONS:
        result = await cleanupOldNotifications()
        break
      case JOBS.UPDATE_FIELD_UTILIZATION:
        result = await updateFieldUtilizationStats()
        break
      default:
        throw new Error(`Unknown job: ${jobName}`)
    }
    
    console.log(`Job ${jobName} completed:`, result)
    return result
  } catch (error) {
    console.error(`Job ${jobName} failed:`, error)
    return { success: false, error }
  }
}