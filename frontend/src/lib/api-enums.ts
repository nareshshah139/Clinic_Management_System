/**
 * API Enums - Generated from backend DTOs
 * Keep in sync with backend/src/modules/pharmacy/dto/pharmacy-invoice.dto.ts
 * and backend/prisma/schema.prisma
 */

// Pharmacy Invoice Status
export const PharmacyInvoiceStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  DISPENSED: 'DISPENSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type PharmacyInvoiceStatus = typeof PharmacyInvoiceStatus[keyof typeof PharmacyInvoiceStatus];

// Pharmacy Payment Status
export const PharmacyPaymentStatus = {
  PENDING: 'PENDING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REFUNDED: 'REFUNDED',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
} as const;

export type PharmacyPaymentStatus = typeof PharmacyPaymentStatus[keyof typeof PharmacyPaymentStatus];

// Pharmacy Payment Method
export const PharmacyPaymentMethod = {
  CASH: 'CASH',
  CARD: 'CARD',
  UPI: 'UPI',
  NETBANKING: 'NETBANKING',
  WALLET: 'WALLET',
  INSURANCE: 'INSURANCE',
} as const;

export type PharmacyPaymentMethod = typeof PharmacyPaymentMethod[keyof typeof PharmacyPaymentMethod];

// Pharmacy Item Type
export const PharmacyItemType = {
  DRUG: 'DRUG',
  PACKAGE: 'PACKAGE',
} as const;

export type PharmacyItemType = typeof PharmacyItemType[keyof typeof PharmacyItemType];

// Helper to get all values from an enum object
export function getEnumValues<T extends Record<string, string>>(enumObj: T): T[keyof T][] {
  return Object.values(enumObj);
}

// Helper to get display label for enum values
export const PharmacyInvoiceStatusLabels: Record<PharmacyInvoiceStatus, string> = {
  DRAFT: 'Draft',
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  DISPENSED: 'Dispensed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const PharmacyPaymentStatusLabels: Record<PharmacyPaymentStatus, string> = {
  PENDING: 'Pending',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
  REFUNDED: 'Refunded',
  PARTIALLY_PAID: 'Partially Paid',
};

export const PharmacyPaymentMethodLabels: Record<PharmacyPaymentMethod, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  UPI: 'UPI',
  NETBANKING: 'Net Banking',
  WALLET: 'Wallet',
  INSURANCE: 'Insurance',
};

