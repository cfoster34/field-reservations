import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import EmailNotificationService from '../../../lib/notifications/email-service';
import SMSNotificationService from '../../../lib/notifications/sms-service';
import { ServerPushNotificationService } from '../../../lib/notifications/push-service';

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action, ...data } = body;

    switch (action) {
      case 'send_notification':
        return await handleSendNotification(supabase, user, data);
      case 'send_bulk_notification':
        return await handleSendBulkNotification(supabase, user, data);
      case 'process_scheduled_notifications':
        return await handleProcessScheduledNotifications(supabase);
      case 'update_notification_preferences':
        return await handleUpdateNotificationPreferences(supabase, user, data);
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Communication API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function handleSendNotification(supabase: any, user: any, data: any) {
  const { type, recipients, template, variables, priority = 3 } = data;
  
  const results = {
    email: { success: 0, failed: 0 },
    sms: { success: 0, failed: 0 },
    push: { success: 0, failed: 0 }
  };

  // Get user profile for league context
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('league_id, role')
    .eq('id', user.id)
    .single();

  if (!userProfile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  // Check permissions
  if (userProfile.role !== 'admin' && userProfile.role !== 'coach') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  // Get recipient details
  const { data: recipientUsers } = await supabase
    .from('user_profiles')
    .select('id, email, phone, full_name, notification_preferences')
    .in('id', recipients)
    .eq('league_id', userProfile.league_id);

  if (!recipientUsers || recipientUsers.length === 0) {
    return NextResponse.json({ error: 'No valid recipients found' }, { status: 400 });
  }

  // Send notifications based on type
  if (type.includes('email')) {
    const emailService = EmailNotificationService.getInstance();
    const emailRecipients = recipientUsers
      .filter(u => u.notification_preferences?.email && u.email)
      .map(u => ({
        email: u.email,
        variables: { ...variables, user_name: u.full_name }
      }));

    if (emailRecipients.length > 0) {
      const emailResult = await emailService.sendBulkTemplateEmail(
        template,
        emailRecipients,
        variables,
        userProfile.league_id
      );
      results.email = emailResult;
    }
  }

  if (type.includes('sms')) {
    const smsService = SMSNotificationService.getInstance();
    const smsRecipients = recipientUsers
      .filter(u => u.notification_preferences?.sms && u.phone)
      .map(u => ({
        phoneNumber: u.phone,
        variables: { ...variables, user_name: u.full_name }
      }));

    if (smsRecipients.length > 0) {
      const smsResult = await smsService.sendBulkTemplateSMS(
        template,
        smsRecipients,
        variables,
        userProfile.league_id
      );
      results.sms = smsResult;
    }
  }

  if (type.includes('push')) {
    const pushService = new ServerPushNotificationService();
    const pushRecipients = recipientUsers
      .filter(u => u.notification_preferences?.push)
      .map(u => u.id);

    if (pushRecipients.length > 0) {
      const pushResult = await pushService.sendNotificationToUsers(
        pushRecipients,
        {
          title: variables.title || 'New Notification',
          body: variables.message || 'You have a new notification',
          category: variables.category || 'system',
          priority,
          data: variables.data || {}
        }
      );
      results.push = pushResult;
    }
  }

  return NextResponse.json({ success: true, results });
}

async function handleSendBulkNotification(supabase: any, user: any, data: any) {
  const { type, audience, template, variables, priority = 3 } = data;
  
  // Get user profile for league context
  const { data: userProfile } = await supabase
    .from('user_profiles')
    .select('league_id, role')
    .eq('id', user.id)
    .single();

  if (!userProfile) {
    return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
  }

  // Check permissions
  if (userProfile.role !== 'admin') {
    return NextResponse.json({ error: 'Admin permissions required for bulk notifications' }, { status: 403 });
  }

  // Build recipient query based on audience
  let query = supabase
    .from('user_profiles')
    .select('id, email, phone, full_name, notification_preferences, role')
    .eq('league_id', userProfile.league_id)
    .eq('is_active', true);

  if (audience.roles && audience.roles.length > 0) {
    query = query.in('role', audience.roles);
  }

  if (audience.teams && audience.teams.length > 0) {
    query = query.in('team_id', audience.teams);
  }

  const { data: recipients } = await query;

  if (!recipients || recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients found matching criteria' }, { status: 400 });
  }

  // Send notifications using the single notification handler
  return await handleSendNotification(supabase, user, {
    type,
    recipients: recipients.map(r => r.id),
    template,
    variables,
    priority
  });
}

async function handleProcessScheduledNotifications(supabase: any) {
  try {
    // Get due scheduled notifications
    const { data: schedules } = await supabase
      .from('notification_schedules')
      .select('*')
      .eq('is_active', true)
      .lte('next_run_at', new Date().toISOString());

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ message: 'No scheduled notifications due' });
    }

    const results = [];

    for (const schedule of schedules) {
      try {
        // Get target recipients
        let query = supabase
          .from('user_profiles')
          .select('id, email, phone, full_name, notification_preferences')
          .eq('league_id', schedule.league_id)
          .eq('is_active', true);

        const audience = schedule.target_audience as any;
        if (audience.roles) {
          query = query.in('role', audience.roles);
        }
        if (audience.teams) {
          query = query.in('team_id', audience.teams);
        }

        const { data: recipients } = await query;

        if (recipients && recipients.length > 0) {
          // Send notifications based on template type
          if (schedule.template_type === 'email') {
            const emailService = EmailNotificationService.getInstance();
            const emailRecipients = recipients
              .filter(u => u.notification_preferences?.email && u.email)
              .map(u => ({
                email: u.email,
                variables: { ...schedule.variables, user_name: u.full_name }
              }));

            if (emailRecipients.length > 0) {
              await emailService.sendBulkTemplateEmail(
                schedule.template_id || 'default',
                emailRecipients,
                schedule.variables,
                schedule.league_id
              );
            }
          }

          // Update schedule with next run time
          const nextRun = new Date();
          nextRun.setDate(nextRun.getDate() + 1); // Simple daily repeat

          await supabase
            .from('notification_schedules')
            .update({
              last_run_at: new Date().toISOString(),
              next_run_at: nextRun.toISOString()
            })
            .eq('id', schedule.id);

          results.push({
            schedule_id: schedule.id,
            recipients_count: recipients.length,
            status: 'completed'
          });
        }
      } catch (error) {
        console.error(`Error processing schedule ${schedule.id}:`, error);
        results.push({
          schedule_id: schedule.id,
          status: 'failed',
          error: error.message
        });
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error) {
    console.error('Error processing scheduled notifications:', error);
    return NextResponse.json({ error: 'Failed to process scheduled notifications' }, { status: 500 });
  }
}

async function handleUpdateNotificationPreferences(supabase: any, user: any, data: any) {
  const { preferences } = data;

  try {
    const { error } = await supabase
      .from('user_profiles')
      .update({
        notification_preferences: preferences
      })
      .eq('id', user.id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Preferences updated successfully' });
  } catch (error) {
    console.error('Error updating notification preferences:', error);
    return NextResponse.json({ error: 'Failed to update preferences' }, { status: 500 });
  }
}

// GET endpoint for retrieving communication data
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    switch (action) {
      case 'unread_counts':
        return await getUnreadCounts(supabase, user);
      case 'notification_preferences':
        return await getNotificationPreferences(supabase, user);
      case 'templates':
        return await getTemplates(supabase, user, searchParams.get('type') || 'email');
      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (error) {
    console.error('Communication GET API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function getUnreadCounts(supabase: any, user: any) {
  try {
    // Get unread notifications count
    const { data: notifications, error: notifError } = await supabase
      .from('notifications')
      .select('category')
      .eq('user_id', user.id)
      .eq('is_read', false);

    if (notifError) throw notifError;

    // Get unread messages count (simplified)
    const { count: messagesCount, error: msgError } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false);

    if (msgError) throw msgError;

    const counts = {
      total: (notifications?.length || 0) + (messagesCount || 0),
      notifications: notifications?.length || 0,
      messages: messagesCount || 0,
      categories: {
        message: notifications?.filter(n => n.category === 'message').length || 0,
        reservation: notifications?.filter(n => n.category === 'reservation').length || 0,
        announcement: notifications?.filter(n => n.category === 'announcement').length || 0,
        system: notifications?.filter(n => n.category === 'system').length || 0
      }
    };

    return NextResponse.json({ success: true, counts });
  } catch (error) {
    console.error('Error getting unread counts:', error);
    return NextResponse.json({ error: 'Failed to get unread counts' }, { status: 500 });
  }
}

async function getNotificationPreferences(supabase: any, user: any) {
  try {
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('notification_preferences')
      .eq('id', user.id)
      .single();

    if (error) throw error;

    return NextResponse.json({ 
      success: true, 
      preferences: profile.notification_preferences || {
        email: true,
        sms: false,
        push: true,
        reminder_hours: 24
      }
    });
  } catch (error) {
    console.error('Error getting notification preferences:', error);
    return NextResponse.json({ error: 'Failed to get preferences' }, { status: 500 });
  }
}

async function getTemplates(supabase: any, user: any, type: string) {
  try {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('league_id')
      .eq('id', user.id)
      .single();

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 404 });
    }

    const tableName = type === 'sms' ? 'sms_templates' : 'email_templates';
    
    const { data: templates, error } = await supabase
      .from(tableName)
      .select('*')
      .or(`league_id.eq.${userProfile.league_id},is_system.eq.true`)
      .order('name');

    if (error) throw error;

    return NextResponse.json({ success: true, templates: templates || [] });
  } catch (error) {
    console.error('Error getting templates:', error);
    return NextResponse.json({ error: 'Failed to get templates' }, { status: 500 });
  }
}