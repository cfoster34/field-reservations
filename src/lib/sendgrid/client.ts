import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

export interface EmailOptions {
  to: string | string[]
  subject: string
  text?: string
  html?: string
  templateId?: string
  dynamicTemplateData?: Record<string, any>
}

export async function sendEmail(options: EmailOptions) {
  const msg = {
    to: options.to,
    from: process.env.SENDGRID_FROM_EMAIL!,
    replyTo: process.env.SENDGRID_REPLY_TO_EMAIL!,
    subject: options.subject,
    text: options.text,
    html: options.html,
    templateId: options.templateId,
    dynamicTemplateData: options.dynamicTemplateData,
  }

  try {
    await sgMail.send(msg)
    return { success: true }
  } catch (error) {
    console.error('SendGrid error:', error)
    return { success: false, error }
  }
}

export async function sendBulkEmail(emails: EmailOptions[]) {
  const messages = emails.map(email => ({
    to: email.to,
    from: process.env.SENDGRID_FROM_EMAIL!,
    replyTo: process.env.SENDGRID_REPLY_TO_EMAIL!,
    subject: email.subject,
    text: email.text,
    html: email.html,
    templateId: email.templateId,
    dynamicTemplateData: email.dynamicTemplateData,
  }))

  try {
    await sgMail.send(messages)
    return { success: true }
  } catch (error) {
    console.error('SendGrid bulk error:', error)
    return { success: false, error }
  }
}