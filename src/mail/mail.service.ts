import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    this.initTransporter();
  }

  private initTransporter() {
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();

    if (!user || !pass) {
      this.logger.warn(
        'Gmail SMTP credentials (SMTP_USER / SMTP_PASS) not configured. Email OTPs will run in simulated development mode.',
      );
      return;
    }

    const host = this.configService.get<string>('SMTP_HOST') || 'smtp.gmail.com';
    const port = Number(this.configService.get<number>('SMTP_PORT')) || 465;
    const secure = this.configService.get<string>('SMTP_SECURE') !== 'false';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass,
      },
    });

    this.logger.log(`Gmail SMTP transporter initialized for account: ${user} (${host}:${port})`);
  }

  isConfigured(): boolean {
    const user = this.configService.get<string>('SMTP_USER')?.trim();
    const pass = this.configService.get<string>('SMTP_PASS')?.trim();
    return Boolean(user && pass);
  }

  async sendOtpEmail(to: string, otp: string, purpose?: string): Promise<boolean> {
    const normalizedTo = (to || '').trim().toLowerCase();
    if (!normalizedTo) return false;

    if (!this.transporter || !this.isConfigured()) {
      this.logger.log(
        `[SIMULATED-EMAIL] OTP to ${normalizedTo}: ${otp} (purpose: ${purpose || 'general'})`,
      );
      return true;
    }

    const smtpUser = this.configService.get<string>('SMTP_USER')?.trim();
    const fromAddress =
      this.configService.get<string>('EMAIL_FROM')?.trim() ||
      `"Ishtam Chat" <${smtpUser}>`;

    let subject = 'Your Ishtam Chat Verification Code';
    let heading = 'Your Verification Code';
    let subtext = 'Use this 6-digit code to complete verification for your account.';

    if (purpose === 'change_email') {
      subject = 'Verify Your New Email Address - Ishtam Chat';
      heading = 'Verify Your New Email';
      subtext = 'We received a request to update your registered email address on Ishtam Chat.';
    } else if (purpose === 'reset_password') {
      subject = 'Reset Your Password - Ishtam Chat';
      heading = 'Reset Your Password';
      subtext = 'Use the 6-digit verification code below to securely reset your password on Ishtam Chat.';
    } else if (purpose === 'login') {
      subject = 'Your Login Verification Code - Ishtam Chat';
      heading = 'Login Verification Code';
      subtext = 'Use the code below to securely sign in to your Ishtam Chat account.';
    } else if (purpose === 'register') {
      subject = 'Complete Your Registration - Ishtam Chat';
      heading = 'Welcome to Ishtam Chat';
      subtext = 'Verify your email address to complete your registration and activate your profile.';
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #FAF6F0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #211B1E;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #FAF6F0; padding: 40px 15px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width: 520px; background-color: #FFFFFF; border-radius: 20px; overflow: hidden; box-shadow: 0 4px 20px rgba(122, 24, 53, 0.08); border: 1px solid #EAD8C7;">
          <!-- Header Banner -->
          <tr>
            <td style="background: linear-gradient(135deg, #80132E 0%, #A22749 100%); padding: 32px 30px; text-align: center;">
              <h1 style="margin: 0; color: #FFFFFF; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">Ishtam Chat</h1>
              <p style="margin: 6px 0 0; color: #FCE8EE; font-size: 13px; font-weight: 500;">Trusted Kerala Matrimonial Platform</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 36px 32px 28px;">
              <h2 style="margin: 0 0 10px; color: #211B1E; font-size: 20px; font-weight: 700;">${heading}</h2>
              <p style="margin: 0 0 24px; color: #665C60; font-size: 14px; line-height: 1.6;">${subtext}</p>
              
              <!-- OTP Box -->
              <div style="background-color: #FFF9F6; border: 2px dashed #DCCBBA; border-radius: 16px; padding: 24px 20px; text-align: center; margin-bottom: 24px;">
                <span style="display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #80132E; font-weight: 700; margin-bottom: 8px;">Verification Code</span>
                <span style="display: inline-block; font-size: 36px; font-weight: 800; letter-spacing: 10px; color: #80132E; font-family: 'Courier New', Courier, monospace;">${otp}</span>
                <span style="display: block; font-size: 12px; color: #766B6F; margin-top: 10px;">⏱️ Valid for 10 minutes</span>
              </div>

              <!-- Security Notice -->
              <div style="background-color: #FAF3EC; border-radius: 12px; padding: 14px 16px; margin-bottom: 24px; border: 1px solid #EAD8C7;">
                <p style="margin: 0; font-size: 12px; line-height: 1.5; color: #4A3F43;">
                  <strong>🔒 Security Tip:</strong> Never share this code with anyone. Ishtam Chat staff will never ask for your verification code or password.
                </p>
              </div>

              <p style="margin: 0; font-size: 12px; color: #9C8F94; line-height: 1.5;">
                If you did not request this verification code, someone may have entered your email by mistake. You can safely ignore this email.
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #F8F4F1; padding: 20px 30px; text-align: center; border-top: 1px solid #EAD8C7;">
              <p style="margin: 0; font-size: 11px; color: #9C8F94;">
                &copy; ${new Date().getFullYear()} Ishtam Chat. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      const info = await this.transporter.sendMail({
        from: fromAddress,
        to: normalizedTo,
        subject,
        html,
        text: `${heading}\n\nYour 6-digit verification code is: ${otp}\n\nThis code is valid for 10 minutes. Never share this code with anyone.`,
      });

      this.logger.log(`[MAIL-SERVICE] OTP email sent successfully to ${normalizedTo} (MessageId: ${info.messageId})`);
      return true;
    } catch (error: any) {
      this.logger.error(`[MAIL-SERVICE] Failed to send email to ${normalizedTo}: ${error.message}`, error.stack);
      return false;
    }
  }
}
