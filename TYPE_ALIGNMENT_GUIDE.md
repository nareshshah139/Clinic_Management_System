# Frontend-Backend Type Alignment Guide

This document explains how we keep frontend types synchronized with backend DTOs and enums to prevent silent filter failures.

## Problem Statement

**Issue #12: Frontend filtering UX vs. backend DTOs**

The pharmacy invoices UI wires many filters client-side. If any enum/field name shifts server-side, you'll get silent "0 results" without an obvious error.

## Solution

We use a hybrid approach that balances type safety with practicality:

1. **Typed Enums** (`frontend/src/lib/api-enums.ts`): Central source of truth for API enums
2. **Manual Sync**: Documented enum sources with clear maintenance instructions
3. **Type-safe Components**: Components use typed enums instead of hardcoded strings

## File Structure

```
frontend/src/lib/
├── api-enums.ts          # ✅ Typed enums matching backend
├── types.ts              # Type interfaces for API responses
└── api.ts                # API client

backend/src/modules/pharmacy/dto/
└── pharmacy-invoice.dto.ts   # Source of truth for enums

backend/prisma/
└── schema.prisma         # Database enum definitions
```

## Enum Definitions

### `api-enums.ts`

All API enums are defined as const objects with type exports:

```typescript
export const PharmacyInvoiceStatus = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  DISPENSED: 'DISPENSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
} as const;

export type PharmacyInvoiceStatus = typeof PharmacyInvoiceStatus[keyof typeof PharmacyInvoiceStatus];
```

**Benefits:**
- ✅ Compile-time type checking
- ✅ Autocomplete in IDE
- ✅ Single source of truth in frontend
- ✅ Helper functions for enum values and labels

## Usage in Components

### Before (Fragile)

```tsx
// ❌ Hardcoded strings, no type safety
<SelectItem value="DRAFT">Draft</SelectItem>
<SelectItem value="PENDING">Pending</SelectItem>
// ... more hardcoded values
```

**Problems:**
- Typos cause runtime errors
- Backend changes break silently
- No autocomplete
- Duplicate string literals everywhere

### After (Robust)

```tsx
import {
  PharmacyInvoiceStatus,
  PharmacyInvoiceStatusLabels,
  getEnumValues,
} from '@/lib/api-enums';

// ✅ Type-safe, generated from enum
<SelectContent>
  <SelectItem value="all">All statuses</SelectItem>
  {getEnumValues(PharmacyInvoiceStatus).map((status) => (
    <SelectItem key={status} value={status}>
      {PharmacyInvoiceStatusLabels[status]}
    </SelectItem>
  ))}
</SelectContent>
```

**Benefits:**
- ✅ Type errors at compile time
- ✅ Single loop, no duplication
- ✅ Consistent labels
- ✅ Easy to maintain

## Maintenance Process

### When Backend Enums Change

1. **Update Prisma Schema** (`backend/prisma/schema.prisma`)
   ```prisma
   enum PharmacyInvoiceStatus {
     DRAFT
     PENDING
     CONFIRMED
     DISPENSED
     COMPLETED
     CANCELLED
     // NEW_STATUS  // Add here
   }
   ```

2. **Update Backend DTO** (`backend/src/modules/pharmacy/dto/pharmacy-invoice.dto.ts`)
   ```typescript
   import { PharmacyInvoiceStatus } from '@prisma/client';
   
   export class QueryPharmacyInvoiceDto {
     @IsOptional()
     @IsEnum(PharmacyInvoiceStatus)
     status?: PharmacyInvoiceStatus;
   }
   ```

3. **Update Frontend Enum** (`frontend/src/lib/api-enums.ts`)
   ```typescript
   export const PharmacyInvoiceStatus = {
     DRAFT: 'DRAFT',
     // ... existing values
     NEW_STATUS: 'NEW_STATUS',  // Add here
   } as const;
   
   export const PharmacyInvoiceStatusLabels: Record<PharmacyInvoiceStatus, string> = {
     // ... existing labels
     NEW_STATUS: 'New Status',  // Add label
   };
   ```

4. **Run Type Check**
   ```bash
   cd frontend
   npm run build  # TypeScript will catch any mismatches
   ```

### Automated Type Generation (Future)

For larger teams or more frequent changes, consider:

```json
// frontend/package.json
{
  "scripts": {
    "generate:types": "openapi-typescript http://localhost:4000/docs-json -o src/lib/api-types.ts"
  }
}
```

Then run:
```bash
npm run generate:types
```

This generates TypeScript types from the backend's OpenAPI/Swagger spec.

## Best Practices

### 1. Always Use Enum Constants

❌ **Bad:**
```typescript
if (invoice.status === 'DRAFT') { }
params.status = 'CONFIRMED';
```

✅ **Good:**
```typescript
import { PharmacyInvoiceStatus } from '@/lib/api-enums';

if (invoice.status === PharmacyInvoiceStatus.DRAFT) { }
params.status = PharmacyInvoiceStatus.CONFIRMED;
```

### 2. Use Helper Functions

```typescript
import { getEnumValues, PharmacyInvoiceStatus } from '@/lib/api-enums';

// Get all status values as array
const allStatuses = getEnumValues(PharmacyInvoiceStatus);
```

### 3. Type Filter States

```typescript
import { type PharmacyInvoiceStatus } from '@/lib/api-enums';

type StatusFilter = PharmacyInvoiceStatus | 'all';
const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
```

### 4. Use Label Maps for Display

```typescript
import { PharmacyInvoiceStatusLabels } from '@/lib/api-enums';

<Badge>{PharmacyInvoiceStatusLabels[invoice.status]}</Badge>
```

## Components Updated

The following components now use typed enums:

- ✅ `PharmacyInvoiceList.tsx` - Status, payment status, payment method filters
- 🔄 `PharmacyInvoiceBuilderFixed.tsx` - Payment method, status selects (TODO)
- 🔄 Other pharmacy components (TODO)

## Related Issues

- Issue #10: Reports & lists - Database indexes added for performance
- Issue #11: Pharmacy status-driven side-effects - Centralized and idempotent
- Issue #12: Frontend filtering UX - **This document** ✅

## Testing

After making enum changes:

```bash
# Backend
cd backend
npm run build
npm test

# Frontend
cd frontend
npm run build  # TypeScript will catch type errors
npm run lint
npm test
```

## Summary

- ✅ **Type Safety**: Compile-time checking of enum values
- ✅ **Maintainability**: Single source of truth per layer
- ✅ **Developer Experience**: Autocomplete and inline documentation
- ✅ **Error Prevention**: Silent filter failures become compile errors

For questions or improvements, see the team documentation or open an issue.

