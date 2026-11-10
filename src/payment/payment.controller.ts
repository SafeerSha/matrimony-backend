import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Req,
  Headers,
  UseGuards,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Request } from 'express';

export const SkipThrottle = (skip = true) => SetMetadata('throttler:skip', skip);

@ApiTags('Payments')
@Controller('payments')
export class PaymentController {
  private readonly logger = new Logger(PaymentController.name);

  constructor(private readonly paymentService: PaymentService) {}

  /**
   * Initializes a Cashfree payment order for subscription upgrade.
   */
  @ApiOperation({ summary: 'Create a Cashfree payment order' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Post('create-order')
  async createOrder(@CurrentUser() user: any, @Body() body: CreateOrderDto) {
    const userId = user?.sub || user?.id;
    this.logger.log(`[PaymentController] POST /payments/create-order requested by user ${userId} for plan ${body.planCode}`);
    return this.paymentService.createOrder(userId, body.planCode);
  }

  /**
   * Cashfree Webhook listener: Handles real-time server-to-server notifications.
   * Public endpoint verified via HMAC-SHA256 signature.
   */
  @ApiOperation({ summary: 'Cashfree Webhook Handler' })
  @SkipThrottle()
  @HttpCode(HttpStatus.OK)
  @Post('webhook')
  async handleCashfreeWebhook(
    @Req() req: Request & { rawBody?: Buffer | string },
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
  ) {
    this.logger.log(
      `[PaymentController] POST /payments/webhook received. Signature header: ${signature ? 'present' : 'missing'}, timestamp: ${timestamp || 'missing'}`,
    );

    // 1. Extract raw body buffer/string
    const rawBody = req.rawBody || JSON.stringify(req.body || {});

    // 2. Cryptographic signature check
    const isValid = this.paymentService.verifyWebhookSignature(
      signature || '',
      timestamp || '',
      rawBody,
    );

    if (!isValid) {
      this.logger.warn('[PaymentController] Unauthorized webhook rejected: Invalid signature or timestamp');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    // 3. Process the verified event (Payment success / failure)
    const result = await this.paymentService.processWebhookEvent(req.body);

    this.logger.log(`[PaymentController] Webhook processed successfully. Result: ${result.message}`);

    // 4. Return fast HTTP 200 OK so Cashfree acknowledges delivery
    return {
      status: 'OK',
      message: result.message,
    };
  }

  /**
   * User transaction history: Lists all payment attempts, successes, and cancellations.
   */
  @ApiOperation({ summary: 'Get user payment transaction history' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('transactions')
  async getUserTransactions(@CurrentUser() user: any) {
    const userId = user?.sub || user?.id;
    this.logger.log(`[PaymentController] GET /payments/transactions requested by user ${userId}`);
    return this.paymentService.getUserTransactions(userId);
  }

  /**
   * Fallback verification endpoint: Frontend calls this after gateway redirection.
   */
  @ApiOperation({ summary: 'Verify Cashfree order payment status directly' })
  @ApiBearerAuth('JWT-auth')
  @UseGuards(JwtAuthGuard)
  @Get('verify/:orderId')
  async verifyOrder(@CurrentUser() user: any, @Param('orderId') orderId: string) {
    const userId = user?.sub || user?.id;
    this.logger.log(`[PaymentController] GET /payments/verify/${orderId} requested by user ${userId}`);
    return this.paymentService.verifyOrderPayment(userId, orderId);
  }
}
