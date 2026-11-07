import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Checks whether MSG91 credentials are configured.
   */
  isConfigured(): boolean {
    const authKey = this.configService.get<string>('MSG91_AUTH_KEY')?.trim();
    const templateId = this.configService.get<string>('MSG91_TEMPLATE_ID')?.trim();
    return Boolean(authKey && templateId);
  }

  /**
   * Normalizes phone number to E.164 digits without '+' (e.g. 919876543210)
   * which MSG91 API expects.
   */
  private formatMobileForMsg91(phone: string): string {
    const cleaned = (phone || '').replace(/\D/g, '');
    // If standard 10-digit Indian number without country code, prepend 91
    if (cleaned.length === 10) {
      return `91${cleaned}`;
    }
    return cleaned;
  }

  /**
   * Sends OTP via MSG91 OTP API (v5)
   * Endpoint: POST https://control.msg91.com/api/v5/otp
   *
   * @param phone Destination phone number
   * @param otp 6-digit OTP code
   */
  async sendOtp(phone: string, otp: string): Promise<boolean> {
    const authKey = this.configService.get<string>('MSG91_AUTH_KEY')?.trim();
    const templateId = this.configService.get<string>('MSG91_TEMPLATE_ID')?.trim();
    const expiryMinutes = this.configService.get<number>('MSG91_OTP_EXPIRY_MINUTES') || 10;

    const formattedMobile = this.formatMobileForMsg91(phone);
    const maskedMobile =
      formattedMobile.length >= 7
        ? `${formattedMobile.slice(0, 3)}****${formattedMobile.slice(-4)}`
        : '***';

    if (!authKey || !templateId) {
      this.logger.warn(
        `[MSG91] Credentials missing (MSG91_AUTH_KEY / MSG91_TEMPLATE_ID). Mobile OTP simulated for ${maskedMobile}. Default OTP: ${otp}`,
      );
      return false;
    }

    try {
      const url = new URL('https://control.msg91.com/api/v5/otp');
      url.searchParams.set('template_id', templateId);
      url.searchParams.set('mobile', formattedMobile);
      url.searchParams.set('authkey', authKey);
      url.searchParams.set('otp', otp);
      url.searchParams.set('otp_expiry', String(expiryMinutes));

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: authKey,
        },
      });

      const responseData = (await response.json().catch(() => null)) as any;

      if (!response.ok || (responseData && responseData.type === 'error')) {
        this.logger.error(
          `[MSG91] Failed to send OTP to ${maskedMobile}: ${JSON.stringify(responseData || response.statusText)}`,
        );
        return false;
      }

      this.logger.log(`[MSG91] OTP sent successfully to ${maskedMobile}`);
      return true;
    } catch (error: any) {
      this.logger.error(`[MSG91] Error sending OTP to ${maskedMobile}: ${error?.message || error}`);
      return false;
    }
  }
}

