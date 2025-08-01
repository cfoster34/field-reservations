// Email Notification Service
import sgMail from '@sendgrid/mail';
import { supabase } from '../supabase/client';
import { EmailTemplate, NotificationSchedule } from '../../types/communication';

// Initialize SendGrid
if (process.env.SENDGRID_API_KEY) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
}

export interface EmailData {
  to: string | string[];
  from?: string;
  subject: string;
  html: string;
  text?: string;
  templateId?: string;
  dynamicTemplateData?: Record<string, any>;
  attachments?: Array<{
    filename: string;
    content: string;
    type: string;
    disposition: string;
  }>;
}

export class EmailNotificationService {
  private static instance: EmailNotificationService;
  private defaultFromEmail: string;

  constructor() {
    this.defaultFromEmail = process.env.DEFAULT_FROM_EMAIL || 'noreply@fieldreservations.com';
  }

  static getInstance(): EmailNotificationService {
    if (!EmailNotificationService.instance) {
      EmailNotificationService.instance = new EmailNotificationService();
    }
    return EmailNotificationService.instance;
  }

  async sendEmail(emailData: EmailData): Promise<boolean> {
    try {
      const msg = {
        to: emailData.to,
        from: emailData.from || this.defaultFromEmail,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        attachments: emailData.attachments
      };

      await sgMail.send(msg);
      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  async sendTemplateEmail(
    templateName: string,
    recipientEmail: string,
    variables: Record<string, any> = {},
    leagueId?: string
  ): Promise<boolean> {
    try {
      // Get template from database
      const template = await this.getEmailTemplate(templateName, leagueId);
      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      // Replace variables in template
      const subject = this.replaceVariables(template.subject, variables);
      const htmlContent = this.replaceVariables(template.html_content, variables);
      const textContent = template.text_content 
        ? this.replaceVariables(template.text_content, variables)
        : this.htmlToText(htmlContent);

      return await this.sendEmail({
        to: recipientEmail,
        subject,
        html: htmlContent,
        text: textContent
      });
    } catch (error) {
      console.error('Failed to send template email:', error);
      return false;
    }
  }

  async sendBulkTemplateEmail(
    templateName: string,
    recipients: Array<{ email: string; variables?: Record<string, any> }>,
    globalVariables: Record<string, any> = {},
    leagueId?: string
  ): Promise<{ success: number; failed: number }> {
    const template = await this.getEmailTemplate(templateName, leagueId);
    if (!template) {
      throw new Error(`Template not found: ${templateName}`);
    }

    const results = await Promise.allSettled(
      recipients.map(recipient => {
        const mergedVariables = { ...globalVariables, ...recipient.variables };
        return this.sendTemplateEmail(templateName, recipient.email, mergedVariables, leagueId);
      })
    );

    const success = results.filter(result => 
      result.status === 'fulfilled' && result.value === true
    ).length;
    
    const failed = results.length - success;

    return { success, failed };
  }

  private async getEmailTemplate(name: string, leagueId?: string): Promise<EmailTemplate | null> {
    try {
      let query = supabase
        .from('email_templates')
        .select('*')
        .eq('name', name);

      if (leagueId) {
        query = query.or(`league_id.eq.${leagueId},is_system.eq.true`);
      } else {
        query = query.eq('is_system', true);
      }

      const { data, error } = await query
        .order('is_system', { ascending: true }) // Prioritize league-specific templates
        .limit(1)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching email template:', error);
      return null;
    }
  }

  private replaceVariables(content: string, variables: Record<string, any>): string {
    let result = content;
    
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      result = result.replace(regex, String(value));
    });

    return result;
  }

  private htmlToText(html: string): string {
    // Simple HTML to text conversion
    return html
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  // Reservation-specific email methods
  async sendReservationConfirmation(
    userEmail: string,
    reservationData: {
      field_name: string;
      date: string;
      start_time: string;
      end_time: string;
      user_name: string;
    },
    leagueId: string
  ): Promise<boolean> {
    return this.sendTemplateEmail(
      'reservation_confirmation',
      userEmail,
      reservationData,
      leagueId
    );
  }

  async sendReservationReminder(
    userEmail: string,
    reservationData: {
      field_name: string;
      date: string;
      start_time: string;
      end_time: string;
      user_name: string;
    },
    leagueId: string
  ): Promise<boolean> {
    return this.sendTemplateEmail(
      'reservation_reminder',
      userEmail,
      reservationData,
      leagueId
    );
  }

  async sendNewMessageNotification(
    userEmail: string,
    messageData: {
      sender_name: string;
      message_content: string;
      channel_name?: string;
    },
    leagueId: string
  ): Promise<boolean> {
    return this.sendTemplateEmail(
      'new_message',
      userEmail,
      messageData,
      leagueId
    );
  }

  // Template management methods
  async createEmailTemplate(
    template: Omit<EmailTemplate, 'id' | 'created_at' | 'updated_at'>
  ): Promise<EmailTemplate | null> {
    try {
      const { data, error } = await supabase
        .from('email_templates')
        .insert(template)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating email template:', error);
      return null;
    }
  }

  async updateEmailTemplate(
    id: string,
    updates: Partial<EmailTemplate>
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('email_templates')
        .update(updates)
        .eq('id', id);

      return !error;
    } catch (error) {
      console.error('Error updating email template:', error);
      return false;
    }
  }

  async deleteEmailTemplate(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('email_templates')
        .delete()
        .eq('id', id)
        .eq('is_system', false); // Only allow deletion of non-system templates

      return !error;
    } catch (error) {
      console.error('Error deleting email template:', error);
      return false;
    }
  }

  async getEmailTemplates(leagueId?: string): Promise<EmailTemplate[]> {
    try {
      let query = supabase
        .from('email_templates')
        .select('*');

      if (leagueId) {
        query = query.or(`league_id.eq.${leagueId},is_system.eq.true`);
      } else {
        query = query.eq('is_system', true);
      }

      const { data, error } = await query.order('name');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching email templates:', error);
      return [];
    }
  }

  // Email analytics and tracking
  async trackEmailDelivery(
    notificationId: string,
    status: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed',
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase
        .from('email_delivery_logs')
        .insert({
          notification_id: notificationId,
          status,
          metadata,
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error tracking email delivery:', error);
    }
  }

  // Webhook handling for SendGrid events
  async handleSendGridWebhook(events: any[]): Promise<void> {
    for (const event of events) {
      try {
        const notificationId = event.sg_message_id || event.smtp_id;
        
        switch (event.event) {
          case 'delivered':
            await this.trackEmailDelivery(notificationId, 'delivered', event);
            break;
          case 'open':
            await this.trackEmailDelivery(notificationId, 'opened', event);
            break;
          case 'click':
            await this.trackEmailDelivery(notificationId, 'clicked', event);
            break;
          case 'bounce':
            await this.trackEmailDelivery(notificationId, 'bounced', event);
            await this.handleEmailBounce(event.email, event.reason);
            break;
          case 'dropped':
          case 'deferred':
            await this.trackEmailDelivery(notificationId, 'failed', event);
            break;
        }
      } catch (error) {
        console.error('Error handling SendGrid webhook event:', error);
      }
    }
  }

  private async handleEmailBounce(email: string, reason: string): Promise<void> {
    // Handle bounced emails by updating user preferences or marking as invalid
    try {
      await supabase
        .from('user_profiles')
        .update({
          notification_preferences: {
            email: false // Disable email notifications for bounced addresses
          }
        })
        .eq('email', email);

      console.log(`Email notifications disabled for bounced address: ${email}`);
    } catch (error) {
      console.error('Error handling email bounce:', error);
    }
  }
}

// Email scheduling service
export class EmailSchedulingService {
  async scheduleEmail(
    schedule: Omit<NotificationSchedule, 'id' | 'created_at' | 'updated_at' | 'last_run_at' | 'next_run_at'>
  ): Promise<NotificationSchedule | null> {
    try {
      const { data, error } = await supabase
        .from('notification_schedules')
        .insert({
          ...schedule,
          next_run_at: this.calculateNextRun(schedule.cron_expression)
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error scheduling email:', error);
      return null;
    }
  }

  async processScheduledEmails(): Promise<void> {
    try {
      // Get scheduled emails that are due
      const { data: schedules, error } = await supabase
        .from('notification_schedules')
        .select('*')
        .eq('is_active', true)
        .eq('template_type', 'email')
        .lte('next_run_at', new Date().toISOString());

      if (error) throw error;

      const emailService = EmailNotificationService.getInstance();

      for (const schedule of schedules || []) {
        try {
          // Get target users based on audience criteria
          const recipients = await this.getScheduleRecipients(schedule);
          
          if (recipients.length > 0) {
            await emailService.sendBulkTemplateEmail(
              schedule.template_id || 'default',
              recipients.map(r => ({ email: r.email, variables: r.variables })),
              schedule.variables,
              schedule.league_id
            );
          }

          // Update schedule with next run time
          await supabase
            .from('notification_schedules')
            .update({
              last_run_at: new Date().toISOString(),
              next_run_at: this.calculateNextRun(schedule.cron_expression)
            })
            .eq('id', schedule.id);

        } catch (error) {
          console.error(`Error processing scheduled email ${schedule.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Error processing scheduled emails:', error);
    }
  }

  private async getScheduleRecipients(
    schedule: NotificationSchedule
  ): Promise<Array<{ email: string; variables: Record<string, any> }>> {
    const audience = schedule.target_audience as any;
    
    let query = supabase
      .from('user_profiles')
      .select('id, email, full_name, role')
      .eq('league_id', schedule.league_id)
      .eq('is_active', true);

    // Apply audience filters
    if (audience.roles && audience.roles.length > 0) {
      query = query.in('role', audience.roles);
    }
    
    if (audience.teams && audience.teams.length > 0) {
      query = query.in('team_id', audience.teams);
    }

    const { data: users, error } = await query;
    
    if (error) {
      console.error('Error getting schedule recipients:', error);
      return [];
    }

    return (users || []).map(user => ({
      email: user.email,
      variables: {
        user_name: user.full_name,
        user_id: user.id,
        ...schedule.variables
      }
    }));
  }

  private calculateNextRun(cronExpression: string): string {
    // Simple cron parsing - in production, use a proper cron library
    const now = new Date();
    
    // For demo purposes, just add 24 hours
    const nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    
    return nextRun.toISOString();
  }
}

export default EmailNotificationService;