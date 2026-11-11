import { PaymentMode } from '@prisma/client';
import { IsEnum } from 'class-validator';

/**
 * @cc [owner:nareshshah139,label:security] payment-mode-single-source
 * A clinic payment mode MUST be accepted only when the database can store it (Prisma's PaymentMode),
 * so any other mode is refused with a 400 naming the modes it can store, never a 500.
 */
export const IsPaymentMode = () =>
  IsEnum(PaymentMode, {
    message: ({ property, value }) =>
      `${property} ${JSON.stringify(value)} is not a payment mode; use one of ${Object.values(PaymentMode).join(', ')}`,
  });
