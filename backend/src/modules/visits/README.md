# Visits Module

This module handles all visit-related functionality for the Clinic Management System, including visit creation, documentation, completion, and comprehensive patient care management.

## Features

### Core Functionality
- **Create Visits**: Start visits from appointments or standalone
- **Visit Documentation**: Comprehensive SOAP note documentation
- **Update Visits**: Modify visit details and findings
- **Complete Visits**: Finalize visits with follow-up planning
- **Visit History**: Track patient visit history
- **Statistics**: Visit analytics and reporting

### Medical Documentation
- **Vitals Recording**: Blood pressure, heart rate, temperature, weight, height
- **Complaints Management**: Structured complaint documentation
- **Medical History**: Patient history recording
- **Physical Examination**: Comprehensive examination findings
- **Diagnosis Management**: ICD10-coded diagnosis tracking
- **Treatment Planning**: Medication and procedure planning
- **Follow-up Scheduling**: Automated follow-up management

### Integration Features
- **Appointment Linking**: Seamless integration with appointments
- **Prescription Integration**: Ready for prescription module integration
- **Consent Management**: Integration with consent forms
- **Lab Orders**: Integration with laboratory orders
- **Device Logs**: Integration with medical device logging

## API Endpoints

### Visits CRUD
```http
POST   /visits                           # Create new visit
GET    /visits                           # List visits with filters
GET    /visits/:id                       # Get visit by ID
PATCH  /visits/:id                       # Update visit
DELETE /visits/:id                       # Soft delete visit
```

### Visit Operations
```http
POST   /visits/:id/complete              # Complete visit
GET    /visits/statistics                # Get visit statistics
```

### Patient & Doctor Views
```http
GET    /visits/patient/:patientId/history # Patient visit history
GET    /visits/doctor/:doctorId          # Doctor's visits
```

## Data Transfer Objects (DTOs)

### CreateVisitDto
```typescript
{
  patientId: string;           // UUID of the patient
  doctorId: string;            // UUID of the doctor
  appointmentId?: string;      // Optional appointment UUID
  vitals?: VitalsDto;          // Patient vitals
  complaints: ComplaintDto[];  // Array of complaints (required)
  history?: string;            // Medical history
  examination?: ExaminationDto; // Physical examination
  diagnosis?: DiagnosisDto[];  // Array of diagnoses
  treatmentPlan?: TreatmentPlanDto; // Treatment plan
  attachments?: string[];     // File references
  scribeJson?: object;         // AI scribe data
  language?: Language;         // Documentation language
  notes?: string;              // Additional notes
}
```

### VitalsDto
```typescript
{
  systolicBP?: number;        // Systolic blood pressure (mmHg)
  diastolicBP?: number;       // Diastolic blood pressure (mmHg)
  heartRate?: number;         // Heart rate (bpm)
  temperature?: number;       // Temperature (°C)
  weight?: number;           // Weight (kg)
  height?: number;           // Height (cm)
  oxygenSaturation?: number;  // Oxygen saturation (%)
  respiratoryRate?: number;   // Respiratory rate (breaths/min)
  notes?: string;            // Vitals notes
}
```

### ComplaintDto
```typescript
{
  complaint: string;          // Primary complaint
  duration?: string;          // Duration (e.g., "2 days")
  severity?: string;          // Severity (Mild/Moderate/Severe)
  notes?: string;            // Additional notes
}
```

### ExaminationDto
```typescript
{
  generalAppearance?: string;     // General appearance
  skinExamination?: string;       // Skin examination findings
  cardiovascularSystem?: string;   // CVS examination
  respiratorySystem?: string;     // Respiratory examination
  abdominalExamination?: string;  // Abdominal examination
  neurologicalExamination?: string; // Neurological examination
  otherFindings?: string;         // Other findings
}
```

### DiagnosisDto
```typescript
{
  diagnosis: string;          // Diagnosis description
  icd10Code?: string;        // ICD10 code
  type?: string;             // Primary/Secondary/Differential
  notes?: string;            // Diagnosis notes
}
```

### TreatmentPlanDto
```typescript
{
  medications?: string;           // Prescribed medications
  procedures?: string;           // Required procedures
  lifestyleModifications?: string; // Lifestyle changes
  followUpInstructions?: string;  // Follow-up instructions
  followUpDate?: string;         // Follow-up date
  notes?: string;               // Treatment notes
}
```

### QueryVisitsDto
```typescript
{
  patientId?: string;        // Filter by patient
  doctorId?: string;         // Filter by doctor
  appointmentId?: string;    // Filter by appointment
  date?: string;             // Filter by specific date
  startDate?: string;        // Date range start
  endDate?: string;          // Date range end
  search?: string;           // Search in complaints, notes
  diagnosis?: string;        // Filter by diagnosis
  icd10Code?: string;        // Filter by ICD10 code
  page?: number;             // Pagination page
  limit?: number;            // Items per page
  sortBy?: string;           // Sort field
  sortOrder?: 'asc' | 'desc'; // Sort order
}
```

## Business Rules

### Visit Creation
1. **Patient Validation**: Patient must exist and belong to the branch
2. **Doctor Validation**: Doctor must exist, be active, and belong to the branch
3. **Appointment Validation**: If appointment is provided, it must exist and match patient/doctor
4. **Complaints Required**: At least one complaint must be provided
5. **Conflict Prevention**: Only one visit per appointment allowed

### Visit Updates
1. **JSON Serialization**: Complex objects are stored as JSON strings
2. **Partial Updates**: Only provided fields are updated
3. **Validation**: All updates maintain data integrity

### Visit Completion
1. **Status Update**: Linked appointment status changes to COMPLETED
2. **Follow-up Planning**: Optional follow-up date and instructions
3. **Final Documentation**: Completion notes are added

### Visit Deletion
1. **Soft Delete**: Visits are not physically deleted
2. **Prescription Check**: Cannot delete visits with associated prescriptions
3. **Audit Trail**: Deletion is marked in notes field

## Visit Workflow

### 1. Visit Creation
```
Patient Check-in → Create Visit → Link to Appointment → Start Documentation
```

### 2. Documentation Process
```
Vitals → Complaints → History → Examination → Diagnosis → Treatment Plan
```

### 3. Visit Completion
```
Final Review → Complete Visit → Update Appointment Status → Schedule Follow-up
```

## Integration Points

### Appointments Module
- **Status Updates**: Automatically updates appointment status
- **Data Linking**: Links visits to appointments for continuity
- **Token Integration**: Maintains appointment token numbers

### Prescriptions Module (Future)
- **Visit Linking**: Prescriptions will link to visits
- **Medication History**: Visit history includes prescribed medications

### Consents Module (Future)
- **Consent Tracking**: Visits will track required consents
- **Compliance**: Ensure consents are obtained before procedures

### Lab Orders Module (Future)
- **Order Tracking**: Lab orders will link to visits
- **Results Integration**: Lab results will be associated with visits

### Device Logs Module (Future)
- **Treatment Logging**: Device treatments will link to visits
- **Parameter Tracking**: Treatment parameters will be recorded

## Error Handling

### Common Exceptions
- **NotFoundException**: Resource not found (patient, doctor, visit)
- **BadRequestException**: Invalid input data or business rule violation
- **ConflictException**: Visit already exists for appointment

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
- **Service Tests**: `visits.service.spec.ts` (18 tests)
- **Controller Tests**: `visits.controller.spec.ts` (16 tests)

### Integration Tests
- **API Tests**: `visits.integration.spec.ts` (12 tests)
- **End-to-End**: Complete visit lifecycle tests

### Test Coverage
- **Target**: 90%+ code coverage
- **Focus Areas**: Business logic, error handling, JSON serialization
- **Mock Strategy**: Mock external dependencies (database, guards)

## Usage Examples

### Create Visit
```typescript
const visit = await visitsService.create({
  patientId: 'patient-123',
  doctorId: 'doctor-456',
  appointmentId: 'appointment-789',
  vitals: {
    systolicBP: 120,
    diastolicBP: 80,
    heartRate: 72,
    temperature: 36.5,
    weight: 70,
    height: 175,
  },
  complaints: [
    {
      complaint: 'Headache',
      duration: '2 days',
      severity: 'Moderate',
    },
  ],
  examination: {
    generalAppearance: 'Well appearing',
    skinExamination: 'Normal',
  },
  diagnosis: [
    {
      diagnosis: 'Tension headache',
      icd10Code: 'G44.2',
      type: 'Primary',
    },
  ],
  treatmentPlan: {
    medications: 'Paracetamol 500mg TID',
    followUpInstructions: 'Return if symptoms worsen',
  },
}, 'branch-123');
```

### Get Patient History
```typescript
const history = await visitsService.getPatientVisitHistory({
  patientId: 'patient-123',
  startDate: '2024-01-01',
  endDate: '2024-12-31',
  limit: 50,
}, 'branch-123');
```

### Complete Visit
```typescript
const completedVisit = await visitsService.complete('visit-123', {
  finalNotes: 'Visit completed successfully',
  followUpDate: '2024-12-30',
  followUpInstructions: 'Return in 1 week for follow-up',
}, 'branch-123');
```

## Dependencies

### Internal Dependencies
- **PrismaService**: Database operations
- **JwtAuthGuard**: Authentication and authorization
- **Appointments Module**: Status updates and linking

### External Dependencies
- **@nestjs/common**: NestJS core functionality
- **@prisma/client**: Database client and types
- **class-validator**: DTO validation
- **class-transformer**: Data transformation

## Performance Considerations

### Database Optimization
- **JSON Storage**: Efficient JSON serialization for complex data
- **Indexes**: Ensure proper indexes on frequently queried fields
- **Pagination**: Use cursor-based pagination for large datasets
- **Selective Loading**: Load only required fields in list views

### Caching Strategy
- **Patient History**: Cache recent patient visit history
- **Doctor Statistics**: Cache doctor visit statistics
- **Invalidation**: Clear cache when visits are created/modified

### Concurrent Access
- **Optimistic Locking**: Use version fields for conflict resolution
- **Atomic Operations**: Use database transactions for multi-step operations
- **Race Conditions**: Handle concurrent visit creation gracefully

## Security Considerations

### Authentication
- **JWT Guards**: All endpoints protected by JWT authentication
- **Branch Isolation**: Users can only access visits from their branch
- **Role-Based Access**: Different permissions based on user roles

### Data Validation
- **Input Sanitization**: All inputs validated using DTOs
- **Business Rules**: Server-side validation of business rules
- **SQL Injection**: Prisma ORM provides protection against SQL injection

### Audit Trail
- **Change Tracking**: Track who made changes and when
- **Soft Deletes**: Preserve data for audit purposes
- **Logging**: Log important operations and errors

## Configuration

### Environment Variables
```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/clinic_db"

# JWT
JWT_SECRET="your-secret-key"
JWT_EXPIRES_IN="24h"

# Visit Settings
DEFAULT_VISIT_LANGUAGE="EN"
MAX_ATTACHMENTS_PER_VISIT=10
VISIT_RETENTION_DAYS=2555  # 7 years
```

### Module Configuration
```typescript
@Module({
  imports: [PrismaModule],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
```

## Future Enhancements

### Planned Features
1. **AI Integration**: Automated SOAP note generation
2. **Template System**: Predefined visit templates
3. **Voice Recording**: Voice-to-text for documentation
4. **Image Integration**: Photo attachments for examinations
5. **Real-time Collaboration**: Multi-doctor visit documentation
6. **Mobile App Integration**: Mobile visit documentation

### Technical Improvements
1. **Event Sourcing**: Track all visit state changes
- **CQRS Pattern**: Separate read/write models for better performance
- **Microservices**: Split into smaller, focused services
- **GraphQL API**: Alternative to REST for flexible querying
- **Real-time Updates**: WebSocket support for live updates

## File Structure
```
src/modules/visits/
├── visits.controller.ts       # REST API endpoints
├── visits.service.ts          # Business logic
├── visits.module.ts           # Module configuration
├── dto/
│   ├── create-visit.dto.ts    # Creation DTOs
│   └── query-visit.dto.ts     # Query DTOs
├── tests/
│   ├── visits.service.spec.ts      # Service unit tests
│   ├── visits.controller.spec.ts   # Controller unit tests
│   └── visits.integration.spec.ts  # Integration tests
└── README.md                  # Comprehensive documentation
```

## Success Metrics
- ✅ Complete visit documentation workflow
- ✅ Integration with appointments module
- ✅ Comprehensive test coverage
- ✅ Production-ready API with documentation
- ✅ JSON serialization for complex medical data
- ✅ Patient history tracking
- ✅ Doctor visit analytics
- ✅ Follow-up management system

The visits module provides a robust foundation for comprehensive patient care documentation and management.
