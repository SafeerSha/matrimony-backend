import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubscriptionService, SUBSCRIPTION_PLANS } from '../subscription/subscription.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as crypto from 'crypto';

export interface ConfigServiceLike {
  get<T = any>(key: string): T | undefined;
}

export interface CashfreeOrderResponse {
  cfOrderId: string | number;
  orderId: string;
  paymentSessionId: string;
  orderStatus: string;
  amount: number;
  currency: string;
  planCode: string;
}

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly subscriptionService: SubscriptionService,
    @Optional() private readonly notificationsService?: NotificationsService,
    @Optional() private readonly configService?: ConfigServiceLike,
  ) {}

  private async sendPaymentNotification(
    userId: string,
    type: 'PAYMENT_SUCCESS' | 'PAYMENT_FAILED' | 'PAYMENT_PENDING',
    content: string,
    orderId: string,
  ) {
    if (!this.notificationsService) return;
    try {
      // Prevent duplicate notification for same orderId & type
      const existing = await this.prisma.notification.findFirst({
        where: {
          userId,
          type,
          referenceId: orderId,
        },
      });
      if (existing) return;

      await this.notificationsService.createNotification(
        userId,
        type,
        content,
        orderId,
      );
      this.logger.log(`[PaymentService] Notification created: type=${type}, userId=${userId}, orderId=${orderId}`);
    } catch (err: any) {
      this.logger.error(`[PaymentService] Failed to send payment notification: ${err?.message}`);
    }
  }

  private getCashfreeConfig() {
    const appId =
      this.configService?.get<string>('CASHFREE_APP_ID') ||
      process.env.CASHFREE_APP_ID ||
      '';
    const secretKey =
      this.configService?.get<string>('CASHFREE_SECRET_KEY') ||
      process.env.CASHFREE_SECRET_KEY ||
      '';
    const env = (
      this.configService?.get<string>('CASHFREE_ENV') ||
      process.env.CASHFREE_ENV ||
      'TEST'
    ).toUpperCase();

    const baseUrl =
      env === 'PRODUCTION'
        ? 'https://api.cashfree.com/pg'
        : 'https://sandbox.cashfree.com/pg';

    const apiVersion =
      this.configService?.get<string>('CASHFREE_API_VERSION') ||
      process.env.CASHFREE_API_VERSION ||
      '2023-08-01';

    return { appId, secretKey, env, baseUrl, apiVersion };
  }

  /**
   * Creates a Cashfree payment order for a selected subscription plan.
   */
  async createOrder(userId: string, planCode: string): Promise<CashfreeOrderResponse> {
    const normalizedCode = (planCode || '').toUpperCase();

    // 1. Resolve Plan from database or static definitions
    const dbPlan = await this.prisma.plan.findFirst({
      where: {
        OR: [{ code: normalizedCode }, { id: planCode }],
        isActive: true,
      },
    });
    const fallbackPlan = SUBSCRIPTION_PLANS.find((p) => p.id === normalizedCode);
    const plan = dbPlan || fallbackPlan;

    if (!plan) {
      throw new BadRequestException(`Subscription plan '${planCode}' not found or inactive.`);
    }

    const resolvedPlanCode: string = (plan as any).code || plan.id;

    // 2. Fetch User & Profile details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });

    if (!user) {
      throw new NotFoundException('User account not found.');
    }

    const { appId, secretKey, baseUrl, apiVersion, env } = this.getCashfreeConfig();

    // 3. Prepare unique Order ID (max 45 chars, alphanumeric + _ -)
    const orderId = `ord_${userId.replace(/-/g, '').slice(0, 8)}_${resolvedPlanCode}_${Date.now()}`.slice(0, 45);

    this.logger.log(
      `[PaymentService] Initiating order: orderId=${orderId}, userId=${userId}, plan=${resolvedPlanCode}, price=₹${plan.price}, gatewayEnv=${env}`,
    );

    // 4. Sanitize customer details for Cashfree
    const customerId = `cust_${user.id.replace(/-/g, '').slice(0, 30)}`;
    const customerName =
      [user.firstName || user.profile?.firstName, user.lastName || user.profile?.lastName]
        .filter(Boolean)
        .join(' ')
        .trim() || 'Valued Member';

    const customerEmail = user.email || `user_${user.id.slice(0, 8)}@ishtamchat.com`;
    const rawPhone = (user.phone || '').replace(/[^0-9]/g, '');
    const customerPhone = rawPhone.length >= 10 ? rawPhone.slice(-10) : '9999999999';

    let frontendBaseUrl = (
      this.configService?.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      this.configService?.get<string>('NEXT_PUBLIC_APP_URL') ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://ishtamchat.com'
    )
      .trim()
      .replace(/\/+$/, '');

    // Defensively ensure return_url lands cleanly on /app/subscription without duplicated /app path
    if (frontendBaseUrl.endsWith('/app')) {
      frontendBaseUrl = frontendBaseUrl.slice(0, -4);
    }

    // 5. If credentials are missing in local dev, return simulated checkout
    if (!appId || !secretKey) {
      if (process.env.NODE_ENV === 'production') {
        throw new BadRequestException(
          'Payment gateway credentials (CASHFREE_APP_ID / CASHFREE_SECRET_KEY) are not configured on the server.',
        );
      }

      this.logger.warn(
        `Cashfree credentials not found. Simulating development order: ${orderId} for ₹${plan.price}`,
      );

      try {
        await (this.prisma as any).paymentTransaction.upsert({
          where: { orderId },
          create: {
            userId,
            orderId,
            cfOrderId: `sim_${Date.now()}`,
            planCode: resolvedPlanCode,
            planName: plan.name,
            amount: plan.price,
            currency: 'INR',
            status: 'PENDING',
            paymentMessage: 'Simulated order initiated',
          },
          update: {
            status: 'PENDING',
          },
        });
      } catch (err: any) {
        this.logger.error(`[PaymentService] Failed to record simulated transaction: ${err?.message}`);
      }

      return {
        cfOrderId: `sim_${Date.now()}`,
        orderId,
        paymentSessionId: `session_simulated_${Date.now()}`,
        orderStatus: 'ACTIVE',
        amount: plan.price,
        currency: 'INR',
        planCode: resolvedPlanCode,
      };
    }

    // 6. Call Cashfree Orders API
    const payload = {
      order_id: orderId,
      order_amount: plan.price,
      order_currency: 'INR',
      customer_details: {
        customer_id: customerId,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
      },
      order_meta: {
        return_url: `${frontendBaseUrl}/app/subscription?order_id={order_id}`,
      },
      order_tags: {
        userId: user.id,
        planCode: resolvedPlanCode,
      },
    };

    try {
      const response = await fetch(`${baseUrl}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-client-id': appId,
          'x-client-secret': secretKey,
          'x-api-version': apiVersion,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error(
          `[PaymentService] Cashfree create order failed for orderId=${orderId}, status=${response.status}: ${JSON.stringify(data)}`,
        );
        throw new BadRequestException(
          data?.message || 'Failed to initialize payment order with payment gateway.',
        );
      }

      this.logger.log(
        `[PaymentService] Cashfree order created successfully: orderId=${data.order_id}, cfOrderId=${data.cf_order_id}, status=${data.order_status}`,
      );

      try {
        await (this.prisma as any).paymentTransaction.upsert({
          where: { orderId: data.order_id },
          create: {
            userId,
            orderId: data.order_id,
            cfOrderId: data.cf_order_id ? String(data.cf_order_id) : undefined,
            planCode: resolvedPlanCode,
            planName: plan.name,
            amount: plan.price,
            currency: 'INR',
            status: 'PENDING',
            paymentMessage: 'Order initiated, awaiting payment',
          },
          update: {
            cfOrderId: data.cf_order_id ? String(data.cf_order_id) : undefined,
            status: 'PENDING',
          },
        });
      } catch (err: any) {
        this.logger.error(`[PaymentService] Failed to record live transaction: ${err?.message}`);
      }

      return {
        cfOrderId: data.cf_order_id,
        orderId: data.order_id,
        paymentSessionId: data.payment_session_id,
        orderStatus: data.order_status,
        amount: plan.price,
        currency: 'INR',
        planCode: resolvedPlanCode,
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error initiating Cashfree order: ${err?.message}`, err?.stack);
      throw new BadRequestException('Unable to communicate with payment gateway. Please try again.');
    }
  }

  /**
   * Verifies the cryptographic HMAC-SHA256 signature sent by Cashfree.
   */
  verifyWebhookSignature(
    signature: string,
    timestamp: string,
    rawBody: Buffer | string,
  ): boolean {
    if (!signature || !timestamp) {
      this.logger.warn('[PaymentService] Webhook signature verification failed: Missing signature or timestamp header');
      return false;
    }

    const { secretKey } = this.getCashfreeConfig();

    // If secret key is not configured in local development, skip only in non-production
    if (!secretKey) {
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn('[PaymentService] CASHFREE_SECRET_KEY is empty in development. Allowing webhook for local testing.');
        return true;
      }
      this.logger.error('[PaymentService] CASHFREE_SECRET_KEY is not configured in production.');
      return false;
    }

    // Protect against replay attacks (allow up to 10 minutes tolerance)
    const tsNumber = parseInt(timestamp, 10);
    if (!isNaN(tsNumber)) {
      const timestampMs = tsNumber > 9999999999 ? tsNumber : tsNumber * 1000;
      const ageMs = Math.abs(Date.now() - timestampMs);
      if (ageMs > 10 * 60 * 1000) {
        this.logger.warn(`[PaymentService] Webhook timestamp expired or out of window: ${timestamp} (age: ${ageMs}ms, tolerance: 10m)`);
        return false;
      }
    }

    const rawBodyString = Buffer.isBuffer(rawBody) ? rawBody.toString('utf-8') : (rawBody || '');
    const signedPayload = timestamp + rawBodyString;

    try {
      const expectedSignature = crypto
        .createHmac('sha256', secretKey)
        .update(signedPayload)
        .digest('base64');

      const receivedBuf = Buffer.from(signature, 'base64');
      const expectedBuf = Buffer.from(expectedSignature, 'base64');

      if (receivedBuf.length !== expectedBuf.length) {
        this.logger.warn('[PaymentService] Webhook signature length mismatch.');
        return false;
      }

      const isValid = crypto.timingSafeEqual(receivedBuf, expectedBuf);
      if (!isValid) {
        this.logger.warn('[PaymentService] Webhook signature cryptographic mismatch.');
      } else {
        this.logger.log('[PaymentService] Webhook signature cryptographically verified successfully.');
      }
      return isValid;
    } catch (err: any) {
      this.logger.error(`[PaymentService] Error computing webhook signature: ${err?.message}`);
      return false;
    }
  }

  /**
   * Processes the verified Cashfree webhook payload.
   */
  async processWebhookEvent(rawPayload: any): Promise<{ success: boolean; message: string }> {
    const payload = typeof rawPayload === 'string' ? JSON.parse(rawPayload) : rawPayload;
    const eventType = payload?.type;
    const eventData = payload?.data || {};

    this.logger.log(
      `[PaymentService] Processing verified Cashfree webhook event: ${eventType}, orderId=${eventData.order?.order_id || 'N/A'}, paymentId=${eventData.payment?.cf_payment_id || 'N/A'}`,
    );

    // Handle dashboard test ping from Cashfree Dashboard
    const isTestPing =
      payload?.test === true ||
      eventData?.order?.order_id?.toString().startsWith('TEST_') ||
      eventData?.payment?.cf_payment_id === 123456 ||
      eventType === 'WEBHOOK_TEST';

    if (isTestPing) {
      this.logger.log('[PaymentService] Cashfree dashboard test ping received and verified successfully.');
      return { success: true, message: 'Test webhook verified successfully' };
    }

    switch (eventType) {
      case 'PAYMENT_SUCCESS_WEBHOOK':
      case 'PAYMENT_SUCCESS': {
        const order = eventData.order || {};
        const payment = eventData.payment || {};
        const customer = eventData.customer_details || {};

        const paymentStatus = payment.payment_status || order.order_status;
        if (paymentStatus !== 'SUCCESS') {
          this.logger.warn(`[PaymentService] Webhook indicated non-SUCCESS status: ${paymentStatus}`);
          return { success: true, message: `Ignored status ${paymentStatus}` };
        }

        const cfPaymentId = payment.cf_payment_id ? String(payment.cf_payment_id) : `CF-${Date.now()}`;
        const paymentAmount = Number(payment.payment_amount || order.order_amount || 0);

        // Resolve userId and planCode
        let userId = order.order_tags?.userId;
        let planCode = order.order_tags?.planCode;

        // Fallback 1: Parse from order_id pattern 'ord_<userId8>_<planCode>_<timestamp>'
        const orderId: string = order.order_id || '';
        if ((!userId || !planCode) && orderId.startsWith('ord_')) {
          const parts = orderId.split('_');
          if (parts.length >= 3) {
            planCode = planCode || parts[2];
          }
        }

        // Fallback 2: Check customer_id if it maps to a user
        if (!userId && customer.customer_id) {
          const rawCustId = customer.customer_id.replace(/^cust_/, '');
          const matchedUser = await this.prisma.user.findFirst({
            where: {
              OR: [
                { id: customer.customer_id },
                { id: { startsWith: rawCustId } },
              ],
            },
          });
          if (matchedUser) {
            userId = matchedUser.id;
          }
        }

        if (!userId) {
          this.logger.warn(`Could not correlate webhook payment to a user. Order ID: ${orderId}`);
          return { success: true, message: 'Payment recorded but user could not be correlated' };
        }

        // Idempotency check: Don't activate if this paymentId was already processed
        const existingSub = await this.prisma.subscription.findUnique({
          where: { userId },
        });

        if (existingSub?.paymentId === cfPaymentId && existingSub.status === 'ACTIVE') {
          this.logger.log(`Payment ${cfPaymentId} already processed for user ${userId}. Idempotent return.`);
          return { success: true, message: 'Payment already processed' };
        }

        // Activate the subscription permit
        await this.subscriptionService.activatePermit(
          userId,
          planCode || 'BASIC',
          {
            paymentId: cfPaymentId,
            amount: paymentAmount,
          },
        );

        // Update transaction and trigger in-app notification
        try {
          await (this.prisma as any).paymentTransaction.updateMany({
            where: { orderId },
            data: {
              status: 'SUCCESS',
              cfPaymentId,
              amount: paymentAmount,
              paymentMethod: payment.payment_group || 'ONLINE',
              paymentMessage: 'Payment verified via webhook',
            },
          });
        } catch (e: any) {
          this.logger.error(`[PaymentService] Failed to update transaction on webhook: ${e?.message}`);
        }

        await this.sendPaymentNotification(
          userId,
          'PAYMENT_SUCCESS',
          `Your payment of ₹${paymentAmount} was successful! Chat permit activated.`,
          orderId,
        );

        this.logger.log(
          `Chat permit activated successfully via Cashfree Webhook for user ${userId} (Plan: ${planCode}, Payment: ${cfPaymentId})`,
        );

        return { success: true, message: 'Subscription permit activated successfully' };
      }

      case 'PAYMENT_FAILED_WEBHOOK':
      case 'PAYMENT_FAILED': {
        const orderId = eventData.order?.order_id;
        const reason = eventData.payment?.payment_message || 'Payment failed';
        this.logger.warn(`Cashfree payment failed for order ${orderId}: ${reason}`);

        if (orderId) {
          try {
            await (this.prisma as any).paymentTransaction.updateMany({
              where: { orderId },
              data: {
                status: 'FAILED',
                paymentMessage: reason,
              },
            });
            const tx = await (this.prisma as any).paymentTransaction.findUnique({ where: { orderId } });
            if (tx?.userId) {
              await this.sendPaymentNotification(
                tx.userId,
                'PAYMENT_FAILED',
                `Payment for ${tx.planName || 'permit'} was unsuccessful: ${reason}`,
                orderId,
              );
            }
          } catch (e: any) {
            this.logger.error(`[PaymentService] Failed to record failure event: ${e?.message}`);
          }
        }
        return { success: true, message: 'Failure event recorded' };
      }

      case 'PAYMENT_USER_DROPPED_WEBHOOK':
      case 'USER_DROPPED': {
        const orderId = eventData.order?.order_id;
        this.logger.log(`Cashfree payment dropped by user for order ${orderId}`);
        if (orderId) {
          try {
            await (this.prisma as any).paymentTransaction.updateMany({
              where: { orderId },
              data: {
                status: 'USER_DROPPED',
                paymentMessage: 'Customer dismissed payment window',
              },
            });
          } catch (e: any) {
            this.logger.error(`[PaymentService] Failed to record drop event: ${e?.message}`);
          }
        }
        return { success: true, message: 'Drop event recorded' };
      }

      case 'PAYMENT_PENDING_WEBHOOK':
      case 'PAYMENT_PENDING': {
        const orderId = eventData.order?.order_id;
        this.logger.log(`Cashfree payment is pending confirmation for order ${orderId}`);
        if (orderId) {
          try {
            await (this.prisma as any).paymentTransaction.updateMany({
              where: { orderId },
              data: {
                status: 'PENDING',
                paymentMessage: 'Payment awaiting bank confirmation',
              },
            });
          } catch (e: any) {
            this.logger.error(`[PaymentService] Failed to record pending event: ${e?.message}`);
          }
        }
        return { success: true, message: 'Pending status recorded' };
      }

      case 'REFUND_STATUS_WEBHOOK':
      case 'PAYMENT_REFUND_WEBHOOK': {
        const orderId = eventData.order?.order_id;
        const refundAmount = eventData.refund?.refund_amount;
        this.logger.warn(`Cashfree refund processed for order ${orderId}: amount ₹${refundAmount}`);
        return { success: true, message: 'Refund event recorded' };
      }

      default:
        this.logger.log(`Unhandled Cashfree event type: ${eventType}`);
        return { success: true, message: `Event ${eventType} acknowledged` };
    }
  }

  /**
   * Fallback client verification: Checks payment status with Cashfree API directly.
   */
  async verifyOrderPayment(userId: string, orderId: string) {
    if (!orderId) {
      throw new BadRequestException('Order ID is required.');
    }

    // Security Check: Verify that the orderId belongs to this user (prevent IDOR)
    const expectedUserPrefix = userId.replace(/-/g, '').slice(0, 8);
    if (orderId.startsWith('ord_') && !orderId.startsWith(`ord_${expectedUserPrefix}_`)) {
      this.logger.warn(`[PaymentService] IDOR Security Alert: User ${userId} tried to verify unauthorized order ${orderId}`);
      throw new ForbiddenException('You are not authorized to verify this payment order.');
    }

    this.logger.log(`[PaymentService] Verifying order payment: orderId=${orderId}, userId=${userId}`);

    const { appId, secretKey, baseUrl, apiVersion } = this.getCashfreeConfig();

    if (!appId || !secretKey) {
      // In dev fallback
      const sub = await this.subscriptionService.getUserSubscription(userId);
      this.logger.warn(`[PaymentService] Dev credentials missing. Returning local fallback for order ${orderId}`);
      return {
        orderId,
        paymentStatus: sub.isSubscribed ? 'SUCCESS' : 'PENDING',
        subscription: sub,
      };
    }

    try {
      const response = await fetch(`${baseUrl}/orders/${encodeURIComponent(orderId)}/payments`, {
        method: 'GET',
        headers: {
          'x-client-id': appId,
          'x-client-secret': secretKey,
          'x-api-version': apiVersion,
        },
      });

      const payments = await response.json();

      if (!response.ok) {
        this.logger.error(`[PaymentService] Error querying Cashfree payments for order ${orderId}: ${JSON.stringify(payments)}`);
        throw new BadRequestException('Could not verify payment status with payment gateway.');
      }

      // Check if any payment attempt was successful
      const paymentList = Array.isArray(payments) ? payments : [];
      const successfulPayment = paymentList.find(
        (p: any) => (p.payment_status || p.status) === 'SUCCESS',
      );

      this.logger.log(
        `[PaymentService] Cashfree query for order ${orderId}: ${paymentList.length} payment attempt(s) found. HasSuccess=${Boolean(successfulPayment)}`,
      );

      if (successfulPayment) {
        const cfPaymentId = String(successfulPayment.cf_payment_id || successfulPayment.payment_id);
        const amount = Number(successfulPayment.payment_amount || successfulPayment.amount || 0);

        // Fetch user subscription status
        const currentSub = await this.prisma.subscription.findUnique({
          where: { userId },
        });

        // If not already activated with this payment, activate now
        if (currentSub?.paymentId !== cfPaymentId) {
          // Resolve plan code from order_id or fallback
          let planCode = 'BASIC';
          if (orderId.startsWith('ord_')) {
            const parts = orderId.split('_');
            if (parts.length >= 3) planCode = parts[2];
          }

          await this.subscriptionService.activatePermit(userId, planCode, {
            paymentId: cfPaymentId,
            amount,
          });
        }

        const updatedSub = await this.subscriptionService.getUserSubscription(userId);
        this.logger.log(
          `[PaymentService] Order ${orderId} verified as SUCCESS. Payment: ${cfPaymentId}, Amount: ₹${amount}, User: ${userId}`,
        );

        // Update transaction table
        try {
          await (this.prisma as any).paymentTransaction.updateMany({
            where: { orderId },
            data: {
              status: 'SUCCESS',
              cfPaymentId,
              amount,
              paymentMethod: successfulPayment.payment_group || 'ONLINE',
              paymentMessage: 'Payment verified successfully',
            },
          });
        } catch (e: any) {
          this.logger.error(`[PaymentService] Failed to update transaction record: ${e?.message}`);
        }

        // Trigger in-app notification
        const tx = await (this.prisma as any).paymentTransaction.findUnique({ where: { orderId } }).catch(() => null);
        const planTitle = tx?.planName || 'Chat Permit';
        await this.sendPaymentNotification(
          userId,
          'PAYMENT_SUCCESS',
          `Your payment of ₹${amount} for ${planTitle} was successful! Chat permit activated.`,
          orderId,
        );

        return {
          orderId,
          paymentStatus: 'SUCCESS',
          paymentId: cfPaymentId,
          subscription: updatedSub,
        };
      }

      if (paymentList.length === 0) {
        this.logger.log(`[PaymentService] Order ${orderId} verified: No payment attempt recorded (USER_DROPPED)`);

        try {
          await (this.prisma as any).paymentTransaction.updateMany({
            where: { orderId },
            data: {
              status: 'USER_DROPPED',
              paymentMessage: 'Session dismissed before attempting payment',
            },
          });
        } catch (e: any) {
          this.logger.error(`[PaymentService] Failed to update dropped transaction: ${e?.message}`);
        }

        return {
          orderId,
          paymentStatus: 'USER_DROPPED',
          message: 'Payment session was closed or not completed. No amount was debited.',
        };
      }

      const latestPayment = paymentList[0];
      const rawStatus = (latestPayment?.payment_status || latestPayment?.status || '').toUpperCase();

      this.logger.log(
        `[PaymentService] Order ${orderId} resolved status: ${rawStatus || 'PENDING'} for user ${userId}. Message: ${latestPayment?.payment_message || 'N/A'}`,
      );

      if (rawStatus === 'USER_DROPPED' || rawStatus === 'CANCELLED') {
        try {
          await (this.prisma as any).paymentTransaction.updateMany({
            where: { orderId },
            data: {
              status: 'USER_DROPPED',
              paymentMessage: latestPayment?.payment_message || 'Customer cancelled checkout',
            },
          });
        } catch (e: any) {
          this.logger.error(`[PaymentService] Failed to update cancelled transaction: ${e?.message}`);
        }

        return {
          orderId,
          paymentStatus: 'USER_DROPPED',
          message: latestPayment?.payment_message || 'Payment was cancelled. No amount was debited.',
        };
      }

      if (rawStatus === 'FAILED' || rawStatus === 'DECLINED') {
        const failureReason = latestPayment?.payment_message || 'Payment failed or was declined by the bank.';
        try {
          await (this.prisma as any).paymentTransaction.updateMany({
            where: { orderId },
            data: {
              status: 'FAILED',
              cfPaymentId: latestPayment?.cf_payment_id ? String(latestPayment.cf_payment_id) : undefined,
              paymentMethod: latestPayment?.payment_group || 'ONLINE',
              paymentMessage: failureReason,
            },
          });
        } catch (e: any) {
          this.logger.error(`[PaymentService] Failed to update failed transaction: ${e?.message}`);
        }

        const tx = await (this.prisma as any).paymentTransaction.findUnique({ where: { orderId } }).catch(() => null);
        const planTitle = tx?.planName || 'Chat Permit';
        await this.sendPaymentNotification(
          userId,
          'PAYMENT_FAILED',
          `Your payment for ${planTitle} could not be completed: ${failureReason}`,
          orderId,
        );

        return {
          orderId,
          paymentStatus: 'FAILED',
          message: failureReason,
        };
      }

      // Still PENDING
      try {
        await (this.prisma as any).paymentTransaction.updateMany({
          where: { orderId },
          data: {
            status: 'PENDING',
            paymentMessage: latestPayment?.payment_message || 'Awaiting confirmation from bank',
          },
        });
      } catch (e: any) {
        this.logger.error(`[PaymentService] Failed to update pending transaction: ${e?.message}`);
      }

      const tx = await (this.prisma as any).paymentTransaction.findUnique({ where: { orderId } }).catch(() => null);
      const planTitle = tx?.planName || 'Chat Permit';
      await this.sendPaymentNotification(
        userId,
        'PAYMENT_PENDING',
        `Your payment for ${planTitle} (Ref: ${orderId}) is awaiting bank settlement.`,
        orderId,
      );

      return {
        orderId,
        paymentStatus: 'PENDING',
        message:
          latestPayment?.payment_message ||
          'Payment is being confirmed by your bank. Your permit will activate once confirmed.',
      };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      this.logger.error(`Error verifying order ${orderId}: ${err?.message}`);
      throw new BadRequestException('Failed to check payment status.');
    }
  }

  /**
   * Retrieves the transaction history for a user.
   */
  async getUserTransactions(userId: string) {
    try {
      return await (this.prisma as any).paymentTransaction.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    } catch (err: any) {
      this.logger.error(`[PaymentService] Failed to query transactions for user ${userId}: ${err?.message}`);
      return [];
    }
  }
}
