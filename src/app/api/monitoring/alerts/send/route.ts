import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as Sentry from '@sentry/nextjs';
import { AlertChannel } from '@/lib/monitoring/alerts';

export async function POST(request: NextRequest) {
  try {
    const { alert, channel } = await request.json();
    
    if (!alert || !channel) {
      return NextResponse.json(
        { error: 'Invalid alert data' },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    // Store alert in database
    const { error: dbError } = await supabase
      .from('monitoring_alerts')
      .insert({
        rule_id: alert.ruleId,
        type: alert.type,
        severity: alert.severity,
        message: alert.message,
        details: alert.details,
        channel,
        resolved: alert.resolved || false,
        timestamp: alert.timestamp,
      });

    if (dbError) {
      console.error('Error storing alert:', dbError);
    }

    // Send notification based on channel
    switch (channel) {
      case AlertChannel.EMAIL:
        await sendEmailAlert(alert);
        break;
      
      case AlertChannel.SMS:
        await sendSmsAlert(alert);
        break;
      
      case AlertChannel.SLACK:
        await sendSlackAlert(alert);
        break;
      
      case AlertChannel.WEBHOOK:
        await sendWebhookAlert(alert);
        break;
      
      case AlertChannel.PAGERDUTY:
        await sendPagerDutyAlert(alert);
        break;
      
      default:
        throw new Error(`Unknown alert channel: ${channel}`);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error sending alert:', error);
    Sentry.captureException(error);
    
    return NextResponse.json(
      { error: 'Failed to send alert' },
      { status: 500 }
    );
  }
}

async function sendEmailAlert(alert: any) {
  // Import email service
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);

  const severityColors = {
    low: '#10B981',
    medium: '#F59E0B',
    high: '#EF4444',
    critical: '#991B1B',
  };

  const msg = {
    to: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
    from: process.env.SENDGRID_FROM_EMAIL || 'alerts@field-reservations.com',
    subject: `[${alert.severity.toUpperCase()}] ${alert.message}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${severityColors[alert.severity]}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">${alert.message}</h2>
        </div>
        <div style="background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
          <p><strong>Type:</strong> ${alert.type}</p>
          <p><strong>Severity:</strong> ${alert.severity}</p>
          <p><strong>Time:</strong> ${new Date(alert.timestamp).toLocaleString()}</p>
          ${alert.resolved ? '<p><strong>Status:</strong> RESOLVED ✓</p>' : ''}
          
          <h3>Details:</h3>
          <pre style="background-color: #e5e7eb; padding: 10px; border-radius: 4px; overflow-x: auto;">
${JSON.stringify(alert.details, null, 2)}
          </pre>
          
          <p style="margin-top: 20px;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/monitoring/alerts" 
               style="background-color: #3B82F6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 4px;">
              View in Dashboard
            </a>
          </p>
        </div>
      </div>
    `,
  };

  await sgMail.send(msg);
}

async function sendSmsAlert(alert: any) {
  // This would integrate with Twilio or another SMS provider
  // For now, just log it
  console.log('SMS Alert:', alert.message);
  
  // Example Twilio integration:
  // const twilio = require('twilio');
  // const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  // 
  // await client.messages.create({
  //   body: `[${alert.severity.toUpperCase()}] ${alert.message}`,
  //   from: process.env.TWILIO_PHONE_NUMBER,
  //   to: process.env.ALERT_SMS_RECIPIENTS,
  // });
}

async function sendSlackAlert(alert: any) {
  if (!process.env.SLACK_WEBHOOK_URL) {
    console.log('Slack webhook not configured');
    return;
  }

  const severityEmojis = {
    low: ':white_check_mark:',
    medium: ':warning:',
    high: ':exclamation:',
    critical: ':rotating_light:',
  };

  const payload = {
    text: `${severityEmojis[alert.severity]} ${alert.message}`,
    attachments: [
      {
        color: alert.severity === 'critical' ? 'danger' : 
               alert.severity === 'high' ? 'warning' : 
               alert.severity === 'medium' ? '#ff9800' : 'good',
        fields: [
          {
            title: 'Type',
            value: alert.type,
            short: true,
          },
          {
            title: 'Severity',
            value: alert.severity.toUpperCase(),
            short: true,
          },
          {
            title: 'Time',
            value: new Date(alert.timestamp).toLocaleString(),
            short: true,
          },
          {
            title: 'Status',
            value: alert.resolved ? 'RESOLVED ✓' : 'ACTIVE',
            short: true,
          },
        ],
        footer: 'Field Reservations Monitoring',
        ts: Math.floor(new Date(alert.timestamp).getTime() / 1000),
      },
    ],
  };

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function sendWebhookAlert(alert: any) {
  if (!process.env.ALERT_WEBHOOK_URL) {
    console.log('Alert webhook not configured');
    return;
  }

  await fetch(process.env.ALERT_WEBHOOK_URL, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'X-Alert-Type': alert.type,
      'X-Alert-Severity': alert.severity,
    },
    body: JSON.stringify(alert),
  });
}

async function sendPagerDutyAlert(alert: any) {
  if (!process.env.PAGERDUTY_INTEGRATION_KEY) {
    console.log('PagerDuty not configured');
    return;
  }

  const event = {
    routing_key: process.env.PAGERDUTY_INTEGRATION_KEY,
    event_action: alert.resolved ? 'resolve' : 'trigger',
    dedup_key: `${alert.type}-${alert.ruleId}`,
    payload: {
      summary: alert.message,
      severity: alert.severity === 'critical' ? 'critical' : 
                alert.severity === 'high' ? 'error' : 
                alert.severity === 'medium' ? 'warning' : 'info',
      source: 'Field Reservations Monitoring',
      timestamp: alert.timestamp,
      custom_details: alert.details,
    },
  };

  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
}