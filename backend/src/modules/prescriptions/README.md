# Prescriptions Module

This module handles all prescription management functionality for the Clinic Management System, including prescription creation, refill management, drug interaction checking, and prescription templates.

## Features

### Core Functionality
- **Prescription Management**: Create, update, cancel prescriptions with comprehensive drug information
- **Refill Management**: Request, approve, and reject prescription refills
- **Drug Interaction Checking**: Automatic drug interaction detection and warnings
- **Prescription Templates**: Create and manage reusable prescription templates
- **Drug Search**: Search for drugs with generic and brand name support
- **Prescription History**: Track patient prescription history and patterns
- **Expiration Tracking**: Monitor expiring prescriptions and send alerts
- **Multi-language Support**: Prescriptions in English, Telugu, and Hindi

### Prescription Management
- **Multi-drug Prescriptions**: Support for multiple medications per prescription
- **Dosage Management**: Flexible dosage units (MG, ML, MCG, IU, Tablet, Capsule, etc.)
- **Frequency Control**: Multiple frequency options (Once daily, Twice daily, As needed, etc.)
- **Duration Tracking**: Duration in days, weeks, months, or years
- **Instructions**: Detailed medication instructions and timing
- **Refill Limits**: Configurable maximum refill limits per prescription
- **Validity Period**: Automatic validity calculation based on medication duration
- **Prescription Numbering**: Sequential prescription numbers per day per branch

### Refill Management
- **Refill Requests**: Patients can request prescription refills
- **Approval Workflow**: Doctor approval required for refills
- **Refill Tracking**: Complete audit trail of refill requests and approvals
- **Status Management**: Pending, Approved, Rejected, Completed status tracking
- **Refill Limits**: Enforce maximum refill limits per prescription
- **Expiration Checks**: Prevent refills for expired prescriptions

### Drug Interaction Checking
- **Automatic Detection**: Check for drug interactions when creating prescriptions
- **Severity Levels**: Major, Moderate, Minor interaction severity
- **Recommendations**: Provide recommendations for managing interactions
- **Real-time Warnings**: Immediate warnings during prescription creation
- **Interaction Database**: Extensible drug interaction database

### Prescription Templates
- **Template Creation**: Create reusable prescription templates
- **Category Management**: Organize templates by medical specialty
- **Public/Private**: Share templates across doctors or keep private
- **Template Search**: Search templates by name, category, or specialty
- **Quick Prescription**: Use templates for faster prescription creation

### Drug Search
- **Generic Search**: Search by generic drug names
- **Brand Search**: Search by brand names
- **Category Filter**: Filter by drug categories
- **Interaction Data**: Include interaction and contraindication information
- **Dosage Forms**: Show available dosage forms for each drug

## API Endpoints

### Prescription Management
```http
POST   /prescriptions                           # Create new prescription
GET    /prescriptions                           # List prescriptions with filters
GET    /prescriptions/history                   # Get prescription history
GET    /prescriptions/expiring                  # Get expiring prescriptions
GET    /prescriptions/statistics               # Get prescription statistics
GET    /prescriptions/:id                       # Get prescription by ID
PATCH  /prescriptions/:id                       # Update prescription
DELETE /prescriptions/:id                       # Cancel prescription
```

### Refill Management
```http
POST   /prescriptions/refills                   # Request prescription refill
POST   /prescriptions/refills/:id/approve        # Approve refill request
POST   /prescriptions/refills/:id/reject        # Reject refill request
GET    /prescriptions/refills                    # List refills with filters
```

### Drug Search
```http
GET    /prescriptions/drugs/search              # Search for drugs
```

### Template Management
```http
POST   /prescriptions/templates                 # Create prescription template
GET    /prescriptions/templates                 # List prescription templates
```

### Patient-Specific Endpoints
```http
GET    /prescriptions/patient/:patientId        # Get patient prescriptions
GET    /prescriptions/patient/:patientId/history # Get patient prescription history
```

### Doctor-Specific Endpoints
```http
GET    /prescriptions/doctor/:doctorId           # Get doctor prescriptions
GET    /prescriptions/doctor/:doctorId/statistics # Get doctor prescription statistics
```

## Data Transfer Objects (DTOs)

### CreatePrescriptionDto
```typescript
{
  patientId: string;           // UUID of the patient
  visitId: string;            // UUID of the visit
  doctorId: string;           // UUID of the doctor
  items: PrescriptionItemDto[]; // Array of prescription items (required)
  diagnosis?: string;          // Diagnosis for the prescription
  notes?: string;              // Additional notes
  language?: PrescriptionLanguage; // Language (EN, TE, HI)
  validUntil?: string;         // Validity end date
  maxRefills?: number;         // Maximum refills allowed (0-5)
  followUpInstructions?: string; // Follow-up instructions
  metadata?: object;           // Additional metadata
}
```

### PrescriptionItemDto
```typescript
{
  drugName: string;            // Drug name
  genericName?: string;        // Generic name
  brandName?: string;         // Brand name
  dosage: number;             // Dosage amount
  dosageUnit: DosageUnit;     // Dosage unit (MG, ML, MCG, etc.)
  frequency: Frequency;       // Frequency (ONCE_DAILY, TWICE_DAILY, etc.)
  duration: number;           // Duration number
  durationUnit: DurationUnit; // Duration unit (DAYS, WEEKS, MONTHS, YEARS)
  instructions?: string;      // Medication instructions
  route?: string;             // Administration route (Oral, Topical, etc.)
  timing?: string;            // Timing instructions (Before meals, etc.)
  quantity?: number;          // Quantity prescribed
  notes?: string;             // Additional notes
  isGeneric?: boolean;        // Whether generic is preferred
  hsnCode?: string;          // HSN code for billing
  mrp?: number;              // Maximum retail price
  gstRate?: number;          // GST rate (default: 18%)
}
```

### RefillPrescriptionDto
```typescript
{
  prescriptionId: string;     // Prescription UUID
  reason?: string;            // Reason for refill
  notes?: string;             // Additional notes
  requestedDate?: string;     // Requested refill date
  metadata?: object;          // Additional metadata
}
```

### ApproveRefillDto
```typescript
{
  refillId: string;           // Refill UUID
  notes?: string;             // Approval notes
  approvedDate?: string;      // Approval date
  metadata?: object;          // Additional metadata
}
```

### PrescriptionTemplateDto
```typescript
{
  name: string;               // Template name
  description?: string;       // Template description
  items: PrescriptionItemDto[]; // Template items
  category?: string;          // Medical category
  specialty?: string;        // Medical specialty
  isPublic?: boolean;        // Whether template is public
  metadata?: object;         // Additional metadata
}
```

### QueryPrescriptionsDto
```typescript
{
  patientId?: string;         // Filter by patient
  visitId?: string;          // Filter by visit
  doctorId?: string;         // Filter by doctor
  status?: PrescriptionStatus; // Filter by status
  language?: PrescriptionLanguage; // Filter by language
  startDate?: string;        // Date range start
  endDate?: string;          // Date range end
  validUntil?: string;       // Filter by validity date
  search?: string;           // Search in drug names, diagnosis, notes
  drugName?: string;         // Filter by specific drug
  isExpired?: boolean;       // Filter expired prescriptions
  hasRefills?: boolean;      // Filter prescriptions with refills
  page?: number;             // Pagination page
  limit?: number;            // Items per page
  sortBy?: string;           // Sort field
  sortOrder?: 'asc' | 'desc'; // Sort order
}
```

## Business Rules

### Prescription Creation
1. **Patient Validation**: Patient must exist and belong to the branch
2. **Visit Validation**: Visit must exist and belong to the branch
3. **Doctor Validation**: Doctor must exist and have DOCTOR role
4. **Items Required**: At least one prescription item must be provided
5. **Drug Interactions**: Check for drug interactions and provide warnings
6. **Validity Calculation**: Automatic validity period calculation based on medication duration
7. **Prescription Numbering**: Sequential prescription numbers generated per day per branch

### Prescription Updates
1. **Status Restrictions**: Cannot update completed or cancelled prescriptions
2. **Validity Recalculation**: Validity period recalculated when items are updated
3. **Audit Trail**: All changes are tracked with timestamps

### Refill Processing
1. **Prescription Status**: Can only request refills for active prescriptions
2. **Expiration Check**: Cannot request refills for expired prescriptions
3. **Refill Limits**: Cannot exceed maximum refills per prescription
4. **Pending Refills**: Cannot request new refill if one is already pending
5. **Approval Required**: Doctor approval required for all refills

### Drug Interaction Checking
1. **Automatic Detection**: Check interactions when creating prescriptions
2. **Severity Levels**: Categorize interactions by severity
3. **Recommendations**: Provide management recommendations
4. **Real-time Warnings**: Display warnings during prescription creation

## Prescription Workflow

### 1. Prescription Creation
```
Visit Completion → Create Prescription → Add Drug Items → Check Interactions → Generate Prescription Number → Set Validity Period
```

### 2. Refill Workflow
```
Patient Request → Doctor Review → Approve/Reject → Update Prescription Status → Track Refill History
```

### 3. Template Workflow
```
Create Template → Save Template → Use Template → Generate Prescription → Customize as Needed
```

## Integration Points

### Visits Module
- **Prescription Linking**: Prescriptions linked to visits for context
- **Diagnosis Integration**: Prescription diagnosis from visit diagnosis
- **Doctor Attribution**: Prescription doctor from visit doctor
- **Service Integration**: Prescription items can include visit services

### Patients Module
- **Patient Information**: Patient details included in prescriptions
- **Prescription History**: Complete patient prescription history
- **Allergy Integration**: Drug allergy checking and warnings
- **Medical History**: Integration with patient medical history

### Billing Module
- **Prescription Items**: Prescription items can be billed
- **HSN Codes**: HSN codes for GST calculation
- **Pricing**: MRP and GST rates for billing
- **Insurance**: Integration with insurance coverage

## Error Handling

### Common Exceptions
- **NotFoundException**: Resource not found (patient, visit, doctor, prescription, refill)
- **BadRequestException**: Invalid input data or business rule violation
- **ConflictException**: Business logic conflicts (e.g., pending refill exists)

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
- **Service Tests**: `prescriptions.service.spec.ts` (25 tests)
- **Controller Tests**: `prescriptions.controller.spec.ts` (20 tests)

### Integration Tests
- **API Tests**: `prescriptions.integration.spec.ts` (18 tests)
- **End-to-End**: Complete prescription workflow tests

### Test Coverage
- **Target**: 90%+ code coverage
- **Focus Areas**: Business logic, drug interactions, refill management
- **Mock Strategy**: Mock external dependencies (database, drug APIs)

## Usage Examples

### Create Prescription
```typescript
const prescription = await prescriptionsService.createPrescription({
  patientId: 'patient-123',
  visitId: 'visit-456',
  doctorId: 'doctor-789',
  items: [
    {
      drugName: 'Paracetamol',
      genericName: 'Acetaminophen',
      dosage: 500,
      dosageUnit: DosageUnit.MG,
      frequency: Frequency.TWICE_DAILY,
      duration: 7,
      durationUnit: DurationUnit.DAYS,
      instructions: 'Take with food',
      route: 'Oral',
      timing: 'After meals',
      quantity: 14,
      isGeneric: true,
    },
    {
      drugName: 'Amoxicillin',
      genericName: 'Amoxicillin',
      dosage: 250,
      dosageUnit: DosageUnit.MG,
      frequency: Frequency.THREE_TIMES_DAILY,
      duration: 10,
      durationUnit: DurationUnit.DAYS,
      instructions: 'Take as directed',
      route: 'Oral',
      quantity: 30,
      isGeneric: true,
    },
  ],
  diagnosis: 'Fever and infection',
  notes: 'Patient has mild fever',
  language: PrescriptionLanguage.EN,
  maxRefills: 2,
  followUpInstructions: 'Follow up in 1 week',
}, 'branch-123');
```

### Request Refill
```typescript
const refill = await prescriptionsService.requestRefill({
  prescriptionId: 'prescription-123',
  reason: 'Patient needs more medication',
  notes: 'Refill requested by patient',
}, 'branch-123');
```

### Approve Refill
```typescript
const approvedRefill = await prescriptionsService.approveRefill({
  refillId: 'refill-123',
  notes: 'Approved by doctor',
}, 'branch-123', 'doctor-123');
```

### Search Drugs
```typescript
const drugs = await prescriptionsService.searchDrugs({
  query: 'paracetamol',
  isGeneric: true,
  limit: 10,
});
```

### Get Prescription Statistics
```typescript
const stats = await prescriptionsService.getPrescriptionStatistics({
  startDate: '2024-12-01',
  endDate: '2024-12-31',
  groupBy: 'day',
  doctorId: 'doctor-123',
}, 'branch-123');
```

### Create Prescription Template
```typescript
const template = await prescriptionsService.createPrescriptionTemplate({
  name: 'Common Cold Template',
  description: 'Template for common cold treatment',
  items: [
    {
      drugName: 'Paracetamol',
      dosage: 500,
      dosageUnit: DosageUnit.MG,
      frequency: Frequency.TWICE_DAILY,
      duration: 5,
      durationUnit: DurationUnit.DAYS,
    },
  ],
  category: 'Respiratory',
  specialty: 'General Medicine',
  isPublic: false,
}, 'branch-123', 'doctor-123');
```

## Dependencies

### Internal Dependencies
- **PrismaService**: Database operations
- **JwtAuthGuard**: Authentication and authorization
- **Visits Module**: Prescription linking and context
- **Patients Module**: Patient information and history
- **Billing Module**: Prescription item billing

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
- **JSON Storage**: Efficient JSON serialization for prescription items

### Caching Strategy
- **Drug Database**: Cache drug information and interactions
- **Templates**: Cache frequently used prescription templates
- **Patient History**: Cache patient prescription history
- **Invalidation**: Clear cache when prescriptions are updated

### Concurrent Access
- **Optimistic Locking**: Use version fields for conflict resolution
- **Atomic Operations**: Use database transactions for multi-step operations
- **Race Conditions**: Handle concurrent refill requests gracefully

## Security Considerations

### Authentication
- **JWT Guards**: All endpoints protected by JWT authentication
- **Branch Isolation**: Users can only access prescriptions from their branch
- **Role-Based Access**: Different permissions based on user roles

### Data Validation
- **Input Sanitization**: All inputs validated using DTOs
- **Business Rules**: Server-side validation of business rules
- **SQL Injection**: Prisma ORM provides protection against SQL injection

### Prescription Security
- **Doctor Authorization**: Only prescribing doctor can modify prescriptions
- **Refill Controls**: Proper authorization for refill processing
- **Audit Trail**: Complete audit trail of all prescription changes

## Configuration

### Environment Variables
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/clinic_db"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="24h"

# Drug Database (Future)
DRUG_DATABASE_API_KEY="your-drug-api-key"
DRUG_INTERACTION_API_URL="https://api.drug-interactions.com"

# Prescription Settings
PRESCRIPTION_NUMBER_PREFIX="RX"
DEFAULT_VALIDITY_DAYS=30
MAX_REFILLS_PER_PRESCRIPTION=5
```

### Module Configuration
```typescript
@Module({
  imports: [PrismaModule],
  controllers: [PrescriptionsController],
  providers: [PrescriptionsService],
  exports: [PrescriptionsService],
})
export class PrescriptionsModule {}
```

## Future Enhancements

### Planned Features
1. **Drug Database Integration**: Real drug database API integration
2. **QR Code Generation**: QR codes for prescription verification
3. **PDF Generation**: Prescription PDF generation with digital signature
4. **SMS Notifications**: SMS alerts for prescription refills and expirations
5. **Insurance Integration**: Insurance coverage checking for medications
6. **Pharmacy Integration**: Direct pharmacy ordering and delivery

### Technical Improvements
1. **Event Sourcing**: Track all prescription state changes
2. **CQRS Pattern**: Separate read/write models for better performance
3. **Microservices**: Split into smaller, focused services
4. **Real-time Updates**: WebSocket support for live prescription updates
5. **Blockchain Integration**: Immutable prescription records

## File Structure
```
src/modules/prescriptions/
├── prescriptions.controller.ts    # REST API endpoints
├── prescriptions.service.ts        # Business logic (1000+ lines)
├── prescriptions.module.ts         # Module configuration
├── dto/
│   ├── prescription.dto.ts         # Prescription and refill DTOs
│   └── query-prescription.dto.ts   # Query DTOs
├── tests/
│   ├── prescriptions.service.spec.ts      # Service unit tests
│   ├── prescriptions.controller.spec.ts  # Controller unit tests
│   └── prescriptions.integration.spec.ts # Integration tests
└── README.md                       # Comprehensive documentation
```

## Success Metrics
- ✅ Complete prescription management workflow
- ✅ Multi-drug prescription support
- ✅ Comprehensive refill management
- ✅ Drug interaction checking and warnings
- ✅ Prescription template system
- ✅ Multi-language support
- ✅ Integration with visits and patients modules
- ✅ Comprehensive test coverage
- ✅ Production-ready API with documentation
- ✅ Expiration tracking and alerts
- ✅ Prescription history and analytics

The prescriptions module provides a robust foundation for comprehensive prescription management and drug safety in the clinic management system.
