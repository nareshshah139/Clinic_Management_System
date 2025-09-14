import { Controller, Get, Post, Body, Query, Param, Req } from '@nestjs/common';
import { OneMgService } from './one-mg.service';

@Controller('pharmacy/1mg')
export class OneMgController {
  constructor(private readonly svc: OneMgService) {}

  @Get('search')
  search(@Query('q') q: string, @Query('limit') limit?: number) {
    return this.svc.searchProducts(q || '', Number(limit) || 10);
  }

  @Get('products/:sku')
  getProduct(@Param('sku') sku: string) {
    return this.svc.getProduct(sku);
  }

  @Post('check-inventory')
  checkInventory(@Body() payload: any) {
    return this.svc.checkInventory(payload);
  }

  @Post('orders')
  createOrder(@Body() payload: any) {
    return this.svc.createOrder(payload);
  }

  @Post('orders/:id/confirm')
  confirmOrder(@Param('id') id: string, @Body() payload: any) {
    return this.svc.confirmOrder(id, payload);
  }

  @Post('webhooks/payment')
  paymentWebhook(@Req() req: any, @Body() body: any) {
    return this.svc.handlePaymentWebhook(req, body);
  }

  @Post('webhooks/order-status')
  orderStatusWebhook(@Req() req: any, @Body() body: any) {
    return this.svc.handleOrderStatusWebhook(req, body);
  }
} 