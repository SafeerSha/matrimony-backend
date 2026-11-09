import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PaymentService } from './payment.service';
import * as crypto from 'crypto';

describe('PaymentService', () => {
  let service: PaymentService;
  let mockPrisma: any;
  let mockConfig: any;
  let mockSubscription: any;

  const testSecret = 'test_secret_key_1234567890';
  const testAppId = 'test_app_id_123456';

  beforeEach(() => {
    mockPrisma = {
      plan: {
        findFirst: jest.fn(),
      },
      user: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      subscription: {
        findUnique: jest.fn(),
      },
    };

    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'CASHFREE_SECRET_KEY') return testSecret;
        if (key === 'CASHFREE_APP_ID') return testAppId;
        if (key === 'CASHFREE_ENV') return 'TEST';
        if (key === 'CASHFREE_API_VERSION') return '2023-08-01';
        return null;
      }),
    };

    mockSubscription = {
      activatePermit: jest.fn(),
      getUserSubscription: jest.fn(),
    };

    service = new PaymentService(mockPrisma, mockSubscription as any, mockConfig as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyWebhookSignature', () => {
    it('should return true for valid cryptographic signature and recent timestamp', () => {
      const now = Date.now().toString();
      const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: 'test' } } });
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(now + body)
        .digest('base64');

      const isValid = service.verifyWebhookSignature(signature, now, body);
      expect(isValid).toBe(true);
    });

    it('should return false for tampered signature', () => {
      const now = Date.now().toString();
      const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
      const badSignature = Buffer.from('invalid_signature_bytes_here').toString('base64');

      const isValid = service.verifyWebhookSignature(badSignature, now, body);
      expect(isValid).toBe(false);
    });

    it('should return false for expired timestamp (> 10 minutes old)', () => {
      const oldTimestamp = (Date.now() - 15 * 60 * 1000).toString(); // 15 mins ago
      const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
      const signature = crypto
        .createHmac('sha256', testSecret)
        .update(oldTimestamp + body)
        .digest('base64');

      const isValid = service.verifyWebhookSignature(signature, oldTimestamp, body);
      expect(isValid).toBe(false);
    });

    it('should return false if headers are missing', () => {
      expect(service.verifyWebhookSignature('', '', '{}')).toBe(false);
    });
  });

  describe('processWebhookEvent', () => {
    it('should activate permit on PAYMENT_SUCCESS_WEBHOOK', async () => {
      const payload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: {
          order: {
            order_id: 'ord_u123_STANDARD_12345678',
            order_amount: 1250,
            order_tags: {
              userId: 'user-uuid-123',
              planCode: 'STANDARD',
            },
          },
          payment: {
            cf_payment_id: 99887766,
            payment_status: 'SUCCESS',
            payment_amount: 1250,
          },
        },
      };

      mockPrisma.subscription.findUnique.mockResolvedValue(null);
      mockSubscription.activatePermit.mockResolvedValue({ success: true });

      const result = await service.processWebhookEvent(payload);

      expect(result.success).toBe(true);
      expect(mockSubscription.activatePermit).toHaveBeenCalledWith(
        'user-uuid-123',
        'STANDARD',
        { paymentId: '99887766', amount: 1250 },
      );
    });

    it('should be idempotent and not reactivate if already processed with same paymentId', async () => {
      const payload = {
        type: 'PAYMENT_SUCCESS_WEBHOOK',
        data: {
          order: {
            order_id: 'ord_u123_STANDARD_12345678',
            order_tags: {
              userId: 'user-uuid-123',
              planCode: 'STANDARD',
            },
          },
          payment: {
            cf_payment_id: 99887766,
            payment_status: 'SUCCESS',
            payment_amount: 1250,
          },
        },
      };

      // Already active with same cf_payment_id
      mockPrisma.subscription.findUnique.mockResolvedValue({
        paymentId: '99887766',
        status: 'ACTIVE',
      });

      const result = await service.processWebhookEvent(payload);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Payment already processed');
      expect(mockSubscription.activatePermit).not.toHaveBeenCalled();
    });

    it('should handle Cashfree dashboard test ping cleanly without errors', async () => {
      const testPingPayload = {
        test: true,
        type: 'WEBHOOK_TEST',
        data: {
          order: { order_id: 'TEST_ORDER_1234' },
          payment: { cf_payment_id: 123456 },
        },
      };

      const result = await service.processWebhookEvent(testPingPayload);

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test webhook verified');
      expect(mockSubscription.activatePermit).not.toHaveBeenCalled();
    });

    it('should not activate permit on PAYMENT_FAILED_WEBHOOK', async () => {
      const payload = {
        type: 'PAYMENT_FAILED_WEBHOOK',
        data: {
          order: { order_id: 'ord_u123_STANDARD_12345678' },
          payment: {
            payment_status: 'FAILED',
            payment_message: 'Insufficient funds in account',
          },
        },
      };

      const result = await service.processWebhookEvent(payload);

      expect(result.success).toBe(true);
      expect(mockSubscription.activatePermit).not.toHaveBeenCalled();
    });
  });
});
