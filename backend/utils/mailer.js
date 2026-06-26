const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendOTPEmail(toEmail, otp, firstName) {
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to: toEmail,
    subject: 'Your TravelElite verification code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; color: #1f2937;">
        <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">Hello ${firstName},</p>
        <h1 style="font-size: 24px; margin: 0 0 16px;">Verify your TravelElite email</h1>
        <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
          Use this 6-digit code to complete your signup. It expires in 10 minutes.
        </p>
        <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; text-align: center; padding: 20px; border-radius: 16px; background: #f3f4f6; color: #111827;">
          ${otp}
        </div>
        <p style="font-size: 13px; line-height: 1.6; margin: 24px 0 0; color: #6b7280;">
          If you did not create a TravelElite account, you can ignore this email.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error('[Resend] Failed:', error);
    throw error;
  }

  console.log('[Resend] Email sent, id:', data.id);
}

module.exports = {
  sendOTPEmail,
};
