// SMS Notification Service
import { supabase } from '../supabase/client';
import { SmsTemplate } from '../../types/communication';

// You would typically use Twilio, AWS SNS, or another SMS provider
interface SMSProvider {
  sendSMS(to: string, body: string): Promise<boolean>;
  sendBulkSMS(messages: Array<{ to: string; body: string }>): Promise<{ success: number; failed: number }>;
}

// Twilio SMS Provider Implementation
class TwilioSMSProvider implements SMSProvider {
  private accountSid: string;
  private authToken: string;
  private fromNumber: string;
  private client: any;

  constructor() {
    this.accountSid = process.env.TWILIO_ACCOUNT_SID || '';
    this.authToken = process.env.TWILIO_AUTH_TOKEN || '';
    this.fromNumber = process.env.TWILIO_FROM_NUMBER || '';
    
    if (this.accountSid && this.authToken) {
      // In a real implementation, you would import and initialize Twilio client
      // const twilio = require('twilio');
      // this.client = twilio(this.accountSid, this.authToken);
    }
  }

  async sendSMS(to: string, body: string): Promise<boolean> {
    try {
      // Simulate Twilio API call
      if (!this.client) {
        console.log(`SMS would be sent to ${to}: ${body}`);
        return true; // Simulate success for demo
      }

      const message = await this.client.messages.create({
        body,
        from: this.fromNumber,
        to
      });

      return !!message.sid;
    } catch (error) {
      console.error('Failed to send SMS:', error);
      return false;
    }
  }

  async sendBulkSMS(messages: Array<{ to: string; body: string }>): Promise<{ success: number; failed: number }> {
    const results = await Promise.allSettled(
      messages.map(msg => this.sendSMS(msg.to, msg.body))
    );

    const success = results.filter(result => 
      result.status === 'fulfilled' && result.value === true
    ).length;
    
    const failed = results.length - success;

    return { success, failed };
  }
}

export class SMSNotificationService {
  private static instance: SMSNotificationService;
  private provider: SMSProvider;

  constructor() {
    this.provider = new TwilioSMSProvider();
  }

  static getInstance(): SMSNotificationService {
    if (!SMSNotificationService.instance) {
      SMSNotificationService.instance = new SMSNotificationService();
    }
    return SMSNotificationService.instance;
  }

  async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    // Validate and format phone number
    const formattedNumber = this.formatPhoneNumber(phoneNumber);
    if (!formattedNumber) {
      console.error('Invalid phone number:', phoneNumber);
      return false;
    }

    // Truncate message to SMS limits (160 characters for single SMS)
    const truncatedMessage = message.length > 160 ? 
      message.substring(0, 157) + '...' : message;

    return await this.provider.sendSMS(formattedNumber, truncatedMessage);
  }

  async sendTemplateSMS(
    templateName: string,
    phoneNumber: string,
    variables: Record<string, any> = {},
    leagueId?: string
  ): Promise<boolean> {
    try {
      // Get template from database
      const template = await this.getSMSTemplate(templateName, leagueId);
      if (!template) {
        throw new Error(`SMS template not found: ${templateName}`);
      }

      // Replace variables in template
      const content = this.replaceVariables(template.content, variables);

      return await this.sendSMS(phoneNumber, content);
    } catch (error) {
      console.error('Failed to send template SMS:', error);
      return false;
    }
  }

  async sendBulkTemplateSMS(
    templateName: string,
    recipients: Array<{ phoneNumber: string; variables?: Record<string, any> }>,
    globalVariables: Record<string, any> = {},
    leagueId?: string
  ): Promise<{ success: number; failed: number }> {
    const template = await this.getSMSTemplate(templateName, leagueId);
    if (!template) {
      throw new Error(`SMS template not found: ${templateName}`);
    }

    const messages = recipients.map(recipient => {
      const mergedVariables = { ...globalVariables, ...recipient.variables };
      const content = this.replaceVariables(template.content, mergedVariables);
      
      return {
        to: this.formatPhoneNumber(recipient.phoneNumber) || '',
        body: content
      };
    }).filter(msg => msg.to); // Filter out invalid phone numbers

    return await this.provider.sendBulkSMS(messages);
  }

  private async getSMSTemplate(name: string, leagueId?: string): Promise<SmsTemplate | null> {
    try {
      let query = supabase
        .from('sms_templates')
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
      console.error('Error fetching SMS template:', error);
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

  private formatPhoneNumber(phoneNumber: string): string | null {
    // Remove all non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Check if it's a valid US phone number (10 digits) or international (11+ digits)
    if (cleaned.length === 10) {
      return `+1${cleaned}`; // Add US country code
    } else if (cleaned.length === 11 && cleaned.startsWith('1')) {
      return `+${cleaned}`;
    } else if (cleaned.length >= 11) {
      return `+${cleaned}`;
    }
    
    return null; // Invalid phone number
  }

  // Reservation-specific SMS methods
  async sendReservationConfirmation(
    phoneNumber: string,
    reservationData: {
      field_name: string;
      date: string;
      start_time: string;
      user_name: string;
    },
    leagueId: string
  ): Promise<boolean> {
    return this.sendTemplateSMS(
      'reservation_confirmation',
      phoneNumber,
      reservationData,
      leagueId
    );
  }

  async sendReservationReminder(
    phoneNumber: string,
    reservationData: {
      field_name: string;
      date: string;
      start_time: string;
      user_name: string;
    },
    leagueId: string
  ): Promise<boolean> {
    return this.sendTemplateSMS(
      'reservation_reminder',
      phoneNumber,
      reservationData,
      leagueId
    );
  }

  async sendUrgentAnnouncement(
    phoneNumber: string,
    message: string,
    leagueId: string
  ): Promise<boolean> {
    return this.sendTemplateSMS(
      'urgent_announcement',
      phoneNumber,
      { message },
      leagueId
    );
  }

  // Emergency broadcast SMS
  async sendEmergencyBroadcast(
    leagueId: string,
    message: string,
    targetRoles: string[] = ['admin', 'coach', 'member']
  ): Promise<{ success: number; failed: number }> {
    try {
      // Get users with phone numbers and SMS enabled
      const { data: users, error } = await supabase
        .from('user_profiles')
        .select('phone, full_name, notification_preferences')
        .eq('league_id', leagueId)
        .in('role', targetRoles)
        .not('phone', 'is', null);

      if (error) throw error;

      const recipients = (users || [])
        .filter(user => {
          const prefs = user.notification_preferences as any;
          return prefs?.sms && user.phone;
        })
        .map(user => ({
          phoneNumber: user.phone,
          variables: { user_name: user.full_name, message }
        }));

      if (recipients.length === 0) {
        return { success: 0, failed: 0 };
      }

      return await this.sendBulkTemplateSMS(
        'urgent_announcement',
        recipients,
        { message },
        leagueId
      );
    } catch (error) {
      console.error('Error sending emergency broadcast:', error);
      return { success: 0, failed: 1 };
    }
  }

  // Template management methods
  async createSMSTemplate(
    template: Omit<SmsTemplate, 'id' | 'created_at' | 'updated_at'>
  ): Promise<SmsTemplate | null> {
    try {
      const { data, error } = await supabase
        .from('sms_templates')
        .insert(template)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error creating SMS template:', error);
      return null;
    }
  }

  async updateSMSTemplate(
    id: string,
    updates: Partial<SmsTemplate>
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('sms_templates')
        .update(updates)
        .eq('id', id);

      return !error;
    } catch (error) {
      console.error('Error updating SMS template:', error);
      return false;
    }
  }

  async deleteSMSTemplate(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('sms_templates')
        .delete()
        .eq('id', id)
        .eq('is_system', false); // Only allow deletion of non-system templates

      return !error;
    } catch (error) {
      console.error('Error deleting SMS template:', error);
      return false;
    }
  }

  async getSMSTemplates(leagueId?: string): Promise<SmsTemplate[]> {
    try {
      let query = supabase
        .from('sms_templates')
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
      console.error('Error fetching SMS templates:', error);
      return [];
    }
  }

  // SMS delivery tracking
  async trackSMSDelivery(
    notificationId: string,
    phoneNumber: string,
    status: 'sent' | 'delivered' | 'failed' | 'undelivered',
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      await supabase
        .from('sms_delivery_logs')
        .insert({
          notification_id: notificationId,
          phone_number: phoneNumber,
          status,
          metadata,
          timestamp: new Date().toISOString()
        });
    } catch (error) {
      console.error('Error tracking SMS delivery:', error);
    }
  }

  // Webhook handling for SMS provider events (e.g., Twilio)
  async handleSMSWebhook(webhookData: any): Promise<void> {
    try {
      const { MessageStatus, MessageSid, To } = webhookData;
      
      switch (MessageStatus) {
        case 'delivered':
          await this.trackSMSDelivery(MessageSid, To, 'delivered', webhookData);
          break;
        case 'failed':
        case 'undelivered':
          await this.trackSMSDelivery(MessageSid, To, 'failed', webhookData);
          break;
        case 'sent':
          await this.trackSMSDelivery(MessageSid, To, 'sent', webhookData);
          break;
      }
    } catch (error) {
      console.error('Error handling SMS webhook:', error);
    }
  }

  // Rate limiting and compliance
  private rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  private checkRateLimit(phoneNumber: string): boolean {
    const now = Date.now();
    const key = phoneNumber;
    const limit = this.rateLimitMap.get(key);

    if (!limit || now > limit.resetTime) {
      // Reset or create new limit (5 SMS per hour)
      this.rateLimitMap.set(key, {
        count: 1,
        resetTime: now + 60 * 60 * 1000 // 1 hour from now
      });
      return true;
    }

    if (limit.count >= 5) {
      return false; // Rate limit exceeded
    }

    limit.count++;
    return true;
  }

  // Opt-out management
  async handleOptOut(phoneNumber: string): Promise<void> {
    try {
      // Disable SMS notifications for this phone number
      await supabase
        .from('user_profiles')
        .update({
          notification_preferences: {
            sms: false
          }
        })
        .eq('phone', phoneNumber);

      // Log the opt-out
      await supabase
        .from('sms_opt_outs')
        .insert({
          phone_number: phoneNumber,
          opted_out_at: new Date().toISOString()
        });

      console.log(`SMS opt-out processed for ${phoneNumber}`);
    } catch (error) {
      console.error('Error handling SMS opt-out:', error);
    }
  }

  async handleOptIn(phoneNumber: string): Promise<void> {
    try {
      // Re-enable SMS notifications
      await supabase
        .from('user_profiles')
        .update({
          notification_preferences: {
            sms: true
          }
        })
        .eq('phone', phoneNumber);

      // Remove from opt-out list
      await supabase
        .from('sms_opt_outs')
        .delete()
        .eq('phone_number', phoneNumber);

      console.log(`SMS opt-in processed for ${phoneNumber}`);
    } catch (error) {
      console.error('Error handling SMS opt-in:', error);
    }
  }
}

export default SMSNotificationService;