import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { PaymentController } from './payment.controller';
import { UnauthorizedException } from '@nestjs/common';

describe('PaymentController', () => {
  let controller: PaymentController;
  let mockPaymentService: any;

  beforeEach(() => {
    mockPaymentService = {
      createOrder: jest.fn(),
      verifyWebhookSignature: jest.fn(),
      processWebhookEvent: jest.fn(),
      verifyOrderPayment: jest.fn(),
      getUserTransactions: jest.fn(),
    };

    controller = new PaymentController(mockPaymentService as any);
  });

  describe('handleCashfreeWebhook', () => {
    it('should return HTTP 200 OK when webhook signature is valid', async () => {
      mockPaymentService.verifyWebhookSignature.mockReturnValue(true);
      mockPaymentService.processWebhookEvent.mockResolvedValue({
        success: true,
        message: 'Subscription permit activated successfully',
      });

      const mockReq: any = {
        rawBody: Buffer.from(JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' })),
        body: { type: 'PAYMENT_SUCCESS_WEBHOOK' },
      };

      const response = await controller.handleCashfreeWebhook(
        mockReq,
        'valid_signature_base64',
        Date.now().toString(),
      );

      expect(response).toEqual({
        status: 'OK',
        message: 'Subscription permit activated successfully',
      });
      expect(mockPaymentService.verifyWebhookSignature).toHaveBeenCalled();
      expect(mockPaymentService.processWebhookEvent).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException when webhook signature is invalid', async () => {
      mockPaymentService.verifyWebhookSignature.mockReturnValue(false);

      const mockReq: any = {
        rawBody: Buffer.from('{}'),
        body: {},
      };

      await expect(
        controller.handleCashfreeWebhook(mockReq, 'invalid_sig', '12345'),
      ).rejects.toThrow(UnauthorizedException);

      expect(mockPaymentService.processWebhookEvent).not.toHaveBeenCalled();
    });
  });

  describe('createOrder', () => {
    it('should invoke createOrder on PaymentService with authenticated user id', async () => {
      mockPaymentService.createOrder.mockResolvedValue({
        orderId: 'ord_123',
        paymentSessionId: 'sess_123',
      });

      const user = { sub: 'user-uuid-1' };
      const body = { planCode: 'STANDARD' };

      const result = await controller.createOrder(user, body);

      expect(result).toEqual({ orderId: 'ord_123', paymentSessionId: 'sess_123' });
      expect(mockPaymentService.createOrder).toHaveBeenCalledWith('user-uuid-1', 'STANDARD');
    });
  });

  describe('verifyOrder', () => {
    it('should invoke verifyOrderPayment on PaymentService', async () => {
      mockPaymentService.verifyOrderPayment.mockResolvedValue({
        orderId: 'ord_123',
        paymentStatus: 'SUCCESS',
      });

      const user = { sub: 'user-uuid-1' };
      const result = await controller.verifyOrder(user, 'ord_123');

      expect(result).toEqual({ orderId: 'ord_123', paymentStatus: 'SUCCESS' });
      expect(mockPaymentService.verifyOrderPayment).toHaveBeenCalledWith('user-uuid-1', 'ord_123');
    });
  });

  describe('getUserTransactions', () => {
    it('should invoke getUserTransactions on PaymentService with user id', async () => {
      const mockTx = [
        { id: 'tx-1', orderId: 'ord_1', status: 'SUCCESS', amount: 2500 },
      ];
      mockPaymentService.getUserTransactions.mockResolvedValue(mockTx);

      const user = { sub: 'user-uuid-1' };
      const result = await controller.getUserTransactions(user);

      expect(result).toEqual(mockTx);
      expect(mockPaymentService.getUserTransactions).toHaveBeenCalledWith('user-uuid-1');
    });
  });
});

