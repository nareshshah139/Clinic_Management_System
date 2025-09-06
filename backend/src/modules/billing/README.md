# Billing & Invoicing Module

This module handles all billing and invoicing functionality for the Clinic Management System, including invoice creation, payment processing, refunds, and comprehensive financial reporting.

## Features

### Core Functionality
- **Invoice Management**: Create, update, cancel invoices with comprehensive item management
- **Payment Processing**: Process payments through multiple methods (Cash, UPI, Card, BNPL)
- **Refund Management**: Process refunds with proper tracking and reconciliation
- **Bulk Operations**: Process bulk payments for multiple invoices
- **Financial Reporting**: Comprehensive revenue reports and analytics
- **Outstanding Management**: Track and manage outstanding invoices

### Invoice Management
- **Multi-item Invoices**: Support for multiple services/products per invoice
- **GST Calculations**: Automatic GST calculation with configurable rates
- **Discount Management**: Item-level and invoice-level discounts
- **Due Date Tracking**: Automatic overdue detection and status updates
- **Recurring Invoices**: Support for recurring billing cycles
- **Invoice Numbering**: Automatic sequential invoice number generation

### Payment Processing
- **Multiple Payment Methods**: Cash, UPI, Card, Net Banking, BNPL, Cheque
- **Payment Status Tracking**: Pending, Processing, Completed, Failed, Refunded, Cancelled
- **Transaction Management**: Transaction ID and reference tracking
- **Gateway Integration**: Ready for payment gateway integration
- **Partial Payments**: Support for partial payment processing
- **Payment Confirmation**: Manual and automatic payment confirmation

### Financial Reporting
- **Revenue Reports**: Daily, weekly, monthly, yearly revenue analysis
- **Payment Summaries**: Comprehensive payment analytics
- **Method Breakdown**: Payment method analysis and trends
- **Outstanding Reports**: Outstanding invoice tracking and management
- **Doctor Analytics**: Revenue analysis by doctor
- **Category Analysis**: Revenue breakdown by service category

## API Endpoints

### Invoice Management
```http
POST   /billing/invoices                           # Create new invoice
GET    /billing/invoices                           # List invoices with filters
GET    /billing/invoices/outstanding                # Get outstanding invoices
GET    /billing/invoices/:id                       # Get invoice by ID
PATCH  /billing/invoices/:id                       # Update invoice
DELETE /billing/invoices/:id                       # Cancel invoice
```

### Payment Processing
```http
POST   /billing/payments                           # Process payment
POST   /billing/payments/bulk                      # Process bulk payment
POST   /billing/payments/:id/confirm               # Confirm payment
GET    /billing/payments                           # List payments with filters
GET    /billing/payments/summary                   # Get payment summary
```

### Refund Management
```http
POST   /billing/refunds                            # Process refund
```

### Reports & Analytics
```http
GET    /billing/reports/revenue                    # Get revenue report
GET    /billing/statistics                         # Get billing statistics
```

## Data Transfer Objects (DTOs)

### CreateInvoiceDto
```typescript
{
  patientId: string;           // UUID of the patient
  visitId?: string;            // Optional visit UUID
  appointmentId?: string;      // Optional appointment UUID
  items: InvoiceItemDto[];     // Array of invoice items (required)
  discount?: number;           // Invoice-level discount percentage
  discountReason?: string;     // Reason for discount
  notes?: string;              // Additional notes
  dueDate?: string;            // Due date for payment
  isRecurring?: boolean;       // Whether invoice is recurring
  recurringFrequency?: string; // Recurring frequency (MONTHLY, QUARTERLY, YEARLY)
  metadata?: object;           // Additional metadata
}
```

### InvoiceItemDto
```typescript
{
  name: string;                // Item name
  description?: string;        // Item description
  quantity: number;           // Quantity
  unitPrice: number;          // Unit price
  gstRate?: number;           // GST rate (default: 18%)
  discount?: number;          // Item-level discount percentage
  category?: string;          // Service category
  hsnCode?: string;          // HSN code for GST
}
```

### PaymentDto
```typescript
{
  invoiceId: string;           // Invoice UUID
  amount: number;              // Payment amount
  method: PaymentMethod;       // Payment method
  transactionId?: string;     // Transaction ID
  reference?: string;         // Payment reference
  notes?: string;             // Payment notes
  gatewayResponse?: object;   // Gateway response data
  paymentDate?: string;       // Payment date
}
```

### RefundDto
```typescript
{
  paymentId: string;           // Payment UUID
  amount: number;              // Refund amount
  reason?: string;            // Refund reason
  notes?: string;             // Refund notes
  gatewayResponse?: object;   // Gateway response data
}
```

### QueryInvoicesDto
```typescript
{
  patientId?: string;         // Filter by patient
  visitId?: string;          // Filter by visit
  appointmentId?: string;    // Filter by appointment
  status?: InvoiceStatus;    // Filter by status
  startDate?: string;        // Date range start
  endDate?: string;          // Date range end
  dueDate?: string;          // Filter by due date
  search?: string;           // Search in invoice number, patient name, notes
  category?: string;         // Filter by service category
  page?: number;             // Pagination page
  limit?: number;            // Items per page
  sortBy?: string;           // Sort field
  sortOrder?: 'asc' | 'desc'; // Sort order
}
```

## Business Rules

### Invoice Creation
1. **Patient Validation**: Patient must exist and belong to the branch
2. **Visit/Appointment Validation**: If provided, must exist and belong to the branch
3. **Items Required**: At least one item must be provided
4. **Automatic Calculations**: Subtotal, discount, GST, and total are calculated automatically
5. **Invoice Numbering**: Sequential invoice numbers generated per day per branch

### Invoice Updates
1. **Status Restrictions**: Cannot update paid or cancelled invoices
2. **Recalculation**: Totals are recalculated when items are updated
3. **Audit Trail**: All changes are tracked with timestamps

### Payment Processing
1. **Amount Validation**: Payment amount cannot exceed remaining balance
2. **Status Updates**: Invoice status automatically updates based on payments
3. **Overdue Detection**: Invoices become overdue after due date
4. **Partial Payments**: Support for multiple partial payments

### Refund Processing
1. **Payment Status**: Can only refund completed payments
2. **Amount Validation**: Refund amount cannot exceed payment amount
3. **Status Updates**: Invoice status updates after refund processing

## Invoice Workflow

### 1. Invoice Creation
```
Visit Completion → Create Invoice → Add Items → Calculate Totals → Generate Invoice Number
```

### 2. Payment Processing
```
Invoice Created → Process Payment → Confirm Payment → Update Invoice Status
```

### 3. Refund Processing
```
Payment Completed → Process Refund → Update Invoice Status → Track Refund
```

## Integration Points

### Visits Module
- **Invoice Linking**: Invoices can be linked to visits for service billing
- **Service Items**: Visit services automatically added to invoice items
- **Doctor Attribution**: Revenue attribution to treating doctors

### Appointments Module
- **Appointment Linking**: Invoices can be linked to appointments
- **Consultation Fees**: Appointment fees automatically added to invoices

### Patients Module
- **Patient Information**: Patient details included in invoices
- **Payment History**: Patient payment history tracking
- **Outstanding Management**: Patient-specific outstanding invoice tracking

## Error Handling

### Common Exceptions
- **NotFoundException**: Resource not found (patient, visit, invoice, payment)
- **BadRequestException**: Invalid input data or business rule violation
- **ConflictException**: Business logic conflicts (e.g., updating paid invoice)

### Error Response Format
```typescript
{
  statusCode: number;
  message: string;
  error?: string;
}
```

## Testing

### Unit Tests
- **Service Tests**: `billing.service.spec.ts` (20 tests)
- **Controller Tests**: `billing.controller.spec.ts` (18 tests)

### Integration Tests
- **API Tests**: `billing.integration.spec.ts` (15 tests)
- **End-to-End**: Complete billing workflow tests

### Test Coverage
- **Target**: 90%+ code coverage
- **Focus Areas**: Business logic, calculations, payment processing
- **Mock Strategy**: Mock external dependencies (database, payment gateways)

## Usage Examples

### Create Invoice
```typescript
const invoice = await billingService.createInvoice({
  patientId: 'patient-123',
  visitId: 'visit-456',
  items: [
    {
      name: 'Consultation',
      description: 'General consultation',
      quantity: 1,
      unitPrice: 500,
      gstRate: 18,
    },
    {
      name: 'Medicine',
      description: 'Prescribed medicine',
      quantity: 2,
      unitPrice: 100,
      gstRate: 18,
    },
  ],
  discount: 10,
  discountReason: 'Senior citizen discount',
  notes: 'Regular patient',
  dueDate: '2024-12-30',
}, 'branch-123');
```

### Process Payment
```typescript
const payment = await billingService.processPayment({
  invoiceId: 'invoice-123',
  amount: 743.4,
  method: PaymentMethod.UPI,
  transactionId: 'TXN-123456',
  reference: 'REF-789',
  notes: 'UPI payment',
}, 'branch-123');
```

### Get Revenue Report
```typescript
const report = await billingService.getRevenueReport({
  startDate: '2024-12-01',
  endDate: '2024-12-31',
  groupBy: 'day',
  doctorId: 'doctor-123',
}, 'branch-123');
```

### Process Refund
```typescript
const refund = await billingService.processRefund({
  paymentId: 'payment-123',
  amount: 100,
  reason: 'Patient request',
  notes: 'Partial refund for service issue',
}, 'branch-123');
```

## Dependencies

### Internal Dependencies
- **PrismaService**: Database operations
- **JwtAuthGuard**: Authentication and authorization
- **Visits Module**: Service linking and doctor attribution
- **Appointments Module**: Consultation fee linking
- **Patients Module**: Patient information and history

### External Dependencies
- **@nestjs/common**: NestJS core functionality
- **@prisma/client**: Database client and types
- **class-validator**: DTO validation
- **class-transformer**: Data transformation

## Performance Considerations

### Database Optimization
- **Indexes**: Ensure proper indexes on frequently queried fields
- **Pagination**: Use cursor-based pagination for large datasets
- **Selective Loading**: Load only required fields in list views
- **JSON Storage**: Efficient JSON serialization for complex data

### Caching Strategy
- **Payment Summaries**: Cache payment summaries for quick access
- **Revenue Reports**: Cache revenue reports with appropriate TTL
- **Outstanding Invoices**: Cache outstanding invoice lists
- **Invalidation**: Clear cache when payments are processed

### Concurrent Access
- **Optimistic Locking**: Use version fields for conflict resolution
- **Atomic Operations**: Use database transactions for multi-step operations
- **Race Conditions**: Handle concurrent payment processing gracefully

## Security Considerations

### Authentication
- **JWT Guards**: All endpoints protected by JWT authentication
- **Branch Isolation**: Users can only access invoices from their branch
- **Role-Based Access**: Different permissions based on user roles

### Data Validation
- **Input Sanitization**: All inputs validated using DTOs
- **Business Rules**: Server-side validation of business rules
- **SQL Injection**: Prisma ORM provides protection against SQL injection

### Financial Security
- **Amount Validation**: Strict validation of payment amounts
- **Transaction Tracking**: Complete audit trail of all transactions
- **Refund Controls**: Proper authorization for refund processing

## Configuration

### Environment Variables
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/clinic_db"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="24h"

# Payment Gateway (Future)
RAZORPAY_KEY_ID="your-razorpay-key"
RAZORPAY_KEY_SECRET="your-razorpay-secret"

# GST Configuration
DEFAULT_GST_RATE=18
GST_ENABLED=true

# Invoice Settings
INVOICE_NUMBER_PREFIX="INV"
DEFAULT_DUE_DAYS=30
```

### Module Configuration
```typescript
@Module({
  imports: [PrismaModule],
  controllers: [BillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
```

## Future Enhancements

### Planned Features
1. **Payment Gateway Integration**: Razorpay, Cashfree integration
2. **Invoice Templates**: Customizable invoice templates
3. **Automated Billing**: Recurring invoice automation
4. **Multi-currency Support**: Support for multiple currencies
5. **Tax Management**: Advanced tax calculation and reporting
6. **Financial Analytics**: Advanced financial analytics and insights

### Technical Improvements
1. **Event Sourcing**: Track all financial state changes
2. **CQRS Pattern**: Separate read/write models for better performance
3. **Microservices**: Split into smaller, focused services
4. **Real-time Updates**: WebSocket support for live payment updates
5. **Blockchain Integration**: Immutable transaction records

## File Structure
```
src/modules/billing/
├── billing.controller.ts       # REST API endpoints
├── billing.service.ts          # Business logic (800+ lines)
├── billing.module.ts           # Module configuration
├── dto/
│   ├── invoice.dto.ts          # Invoice and payment DTOs
│   └── query-billing.dto.ts    # Query DTOs
├── tests/
│   ├── billing.service.spec.ts      # Service unit tests
│   ├── billing.controller.spec.ts   # Controller unit tests
│   └── billing.integration.spec.ts  # Integration tests
└── README.md                  # Comprehensive documentation
```

## Success Metrics
- ✅ Complete invoice management workflow
- ✅ Multi-method payment processing
- ✅ Comprehensive refund management
- ✅ Financial reporting and analytics
- ✅ Integration with visits and appointments modules
- ✅ Comprehensive test coverage
- ✅ Production-ready API with documentation
- ✅ GST calculation and compliance
- ✅ Outstanding invoice management
- ✅ Bulk payment processing

The billing module provides a robust foundation for comprehensive financial management and reporting in the clinic management system.
