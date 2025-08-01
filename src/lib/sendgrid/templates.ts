export const emailTemplates = {
  reservationConfirmation: (data: {
    userName: string
    fieldName: string
    date: string
    time: string
    reservationId: string
  }) => ({
    subject: `Reservation Confirmed - ${data.fieldName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0284c7;">Reservation Confirmed</h1>
        <p>Hi ${data.userName},</p>
        <p>Your reservation has been confirmed with the following details:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Field:</strong> ${data.fieldName}</p>
          <p><strong>Date:</strong> ${data.date}</p>
          <p><strong>Time:</strong> ${data.time}</p>
          <p><strong>Reservation ID:</strong> ${data.reservationId}</p>
        </div>
        <p>Please arrive 10 minutes before your scheduled time.</p>
        <p>If you need to cancel or modify your reservation, please log in to your account.</p>
        <p>Best regards,<br>Field Reservations Team</p>
      </div>
    `,
    text: `
      Reservation Confirmed
      
      Hi ${data.userName},
      
      Your reservation has been confirmed with the following details:
      
      Field: ${data.fieldName}
      Date: ${data.date}
      Time: ${data.time}
      Reservation ID: ${data.reservationId}
      
      Please arrive 10 minutes before your scheduled time.
      
      If you need to cancel or modify your reservation, please log in to your account.
      
      Best regards,
      Field Reservations Team
    `
  }),

  reservationReminder: (data: {
    userName: string
    fieldName: string
    date: string
    time: string
    hoursUntil: number
  }) => ({
    subject: `Reminder: Field Reservation Tomorrow - ${data.fieldName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #0284c7;">Reservation Reminder</h1>
        <p>Hi ${data.userName},</p>
        <p>This is a reminder that you have a field reservation in ${data.hoursUntil} hours:</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Field:</strong> ${data.fieldName}</p>
          <p><strong>Date:</strong> ${data.date}</p>
          <p><strong>Time:</strong> ${data.time}</p>
        </div>
        <p>Don't forget to bring your equipment!</p>
        <p>Best regards,<br>Field Reservations Team</p>
      </div>
    `,
    text: `
      Reservation Reminder
      
      Hi ${data.userName},
      
      This is a reminder that you have a field reservation in ${data.hoursUntil} hours:
      
      Field: ${data.fieldName}
      Date: ${data.date}
      Time: ${data.time}
      
      Don't forget to bring your equipment!
      
      Best regards,
      Field Reservations Team
    `
  }),

  reservationCancellation: (data: {
    userName: string
    fieldName: string
    date: string
    time: string
    reservationId: string
  }) => ({
    subject: `Reservation Cancelled - ${data.fieldName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #dc2626;">Reservation Cancelled</h1>
        <p>Hi ${data.userName},</p>
        <p>Your reservation has been cancelled:</p>
        <div style="background-color: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Field:</strong> ${data.fieldName}</p>
          <p><strong>Date:</strong> ${data.date}</p>
          <p><strong>Time:</strong> ${data.time}</p>
          <p><strong>Reservation ID:</strong> ${data.reservationId}</p>
        </div>
        <p>If you did not request this cancellation, please contact us immediately.</p>
        <p>Best regards,<br>Field Reservations Team</p>
      </div>
    `,
    text: `
      Reservation Cancelled
      
      Hi ${data.userName},
      
      Your reservation has been cancelled:
      
      Field: ${data.fieldName}
      Date: ${data.date}
      Time: ${data.time}
      Reservation ID: ${data.reservationId}
      
      If you did not request this cancellation, please contact us immediately.
      
      Best regards,
      Field Reservations Team
    `
  })
}