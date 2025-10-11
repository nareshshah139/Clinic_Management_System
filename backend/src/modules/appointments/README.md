# Appointments Module

This module handles all appointment-related functionality for the Clinic Management System, including scheduling, rescheduling, conflict detection, and availability management.

## Features

### Core Functionality
- **Create Appointments**: Schedule new appointments with conflict detection
- **View Appointments**: List appointments with filtering and pagination
- **Update Appointments**: Modify appointment details and status
- **Reschedule Appointments**: Move appointments to different time slots
- **Cancel Appointments**: Cancel appointments with proper status management
- **Bulk Operations**: Update multiple appointments simultaneously

### Scheduling Features
- **Availability Check**: Get available time slots for doctors and rooms
- **Conflict Detection**: Prevent double-booking of doctors and rooms
- **Alternative Suggestions**: Suggest alternative slots when conflicts occur
- **Token Generation**: Automatic token number generation for queue management
- **Business Hours Validation**: Ensure appointments are within clinic hours

### Schedule Management
- **Doctor Schedule**: View all appointments for a specific doctor
- **Room Schedule**: View all appointments for a specific room
- **Time Slot Management**: Generate and validate time slots
- **Buffer Time**: Add buffer time between appointments

## API Endpoints

### Appointments CRUD
```http
POST   /appointments                    # Create new appointment
GET    /appointments                    # List appointments with filters
GET    /appointments/:id                # Get appointment by ID
PATCH  /appointments/:id                # Update appointment
DELETE /appointments/:id                # Cancel appointment
```

### Scheduling Operations
```http
GET    /appointments/available-slots    # Get available time slots
POST   /appointments/:id/reschedule     # Reschedule appointment
POST   /appointments/bulk-update        # Bulk update appointments
```

### Schedule Views
```http
GET    /appointments/doctor/:doctorId/schedule  # Doctor's daily schedule
GET    /appointments/room/:roomId/schedule      # Room's daily schedule
```

## Data Transfer Objects (DTOs)

### CreateAppointmentDto
```typescript
{
  patientId: string;        // UUID of the patient
  doctorId: string;         // UUID of the doctor
  roomId?: string;          // Optional room UUID
  date: string;             // ISO date string
  slot: string;             // Time slot (e.g., "10:00-10:30")
  visitType?: VisitType;    // OPD, TELEMED, PROCEDURE
  notes?: string;           // Optional notes
  source?: string;          // Lead source (Walk-in, WhatsApp, etc.)
}
```

### QueryAppointmentsDto
```typescript
{
  doctorId?: string;        // Filter by doctor
  patientId?: string;       // Filter by patient
  roomId?: string;          // Filter by room
  date?: string;            // Filter by specific date
  startDate?: string;       // Date range start
  endDate?: string;         // Date range end
  status?: AppointmentStatus; // Filter by status
  visitType?: VisitType;    // Filter by visit type
  search?: string;          // Search in patient name, phone, notes
  page?: number;            // Pagination page (default: 1)
  limit?: number;           // Items per page (default: 20)
  sortBy?: string;          // Sort field (default: 'date')
  sortOrder?: 'asc' | 'desc'; // Sort order (default: 'desc')
}
```

### AvailableSlotsDto
```typescript
{
  doctorId: string;         // Doctor UUID
  roomId?: string;          // Optional room UUID
  date: string;             // Target date
  durationMinutes?: number; // Slot duration (default: 30)
}
```

## Business Rules

### Appointment Creation
1. **Patient Validation**: Patient must exist and belong to the branch
2. **Doctor Validation**: Doctor must exist, be active, and belong to the branch
3. **Room Validation**: Room must exist, be active, and belong to the branch (if specified)
4. **Time Validation**: 
   - Appointment cannot be in the past
   - Must be within business hours (9 AM - 6 PM)
   - Time slot format must be valid (HH:MM-HH:MM)
5. **Conflict Detection**: No overlapping appointments for doctor or room

### Rescheduling Rules
1. **Status Check**: Cannot reschedule completed or cancelled appointments
2. **Advance Notice**: Minimum 2 hours advance notice required (configurable)
3. **Conflict Check**: New time slot must be available
4. **Status Reset**: Status resets to SCHEDULED after rescheduling

### Cancellation Rules
1. **Status Check**: Cannot cancel completed or in-progress appointments
2. **Soft Delete**: Appointments are marked as CANCELLED, not deleted
3. **Token Preservation**: Token numbers are preserved for audit trail

## Appointment Statuses

```typescript
enum AppointmentStatus {
  SCHEDULED   // Initial status when created
  CONFIRMED   // Patient confirmed attendance
  CHECKED_IN  // Patient arrived and checked in
  IN_PROGRESS // Consultation in progress
  COMPLETED   // Appointment finished
  CANCELLED   // Appointment cancelled
  NO_SHOW     // Patient didn't show up
}
```

## Time Slot Management

### Slot Format
- Format: `HH:MM-HH:MM` (24-hour format)
- Examples: `09:00-09:30`, `14:15-15:00`
- Validation: Start time must be before end time

### Default Configuration
- **Business Hours**: 9:00 AM - 6:00 PM
- **Default Duration**: 30 minutes
- **Buffer Time**: 5 minutes between appointments
- **Advance Booking**: Up to 90 days in future

### Conflict Detection
1. **Doctor Conflicts**: Check for overlapping appointments for the same doctor
2. **Room Conflicts**: Check for overlapping appointments for the same room
3. **Time Overlap**: Use precise time overlap detection algorithm
4. **Status Filtering**: Ignore cancelled appointments in conflict detection

## Token System

### Token Generation
- **Daily Reset**: Token numbers reset daily per branch
- **Sequential**: Tokens are generated sequentially (1, 2, 3, ...)
- **Unique**: Each appointment gets a unique token for the day
- **Preserved**: Token numbers are preserved even if appointment is cancelled

### Token Display
- **Format**: Branch prefix + Token number (e.g., "TK001", "TK002")
- **Usage**: Used for patient queue management and calling system

## Error Handling

### Common Exceptions
- **NotFoundException**: Resource not found (patient, doctor, room, appointment)
- **BadRequestException**: Invalid input data or business rule violation
- **ConflictException**: Scheduling conflicts with alternative suggestions

### Error Response Format
```typescript
{
  statusCode: number;
  message: string;
  error?: string;
  conflicts?: SchedulingConflict[];      // For scheduling conflicts
  suggestions?: string[];                // Alternative time slots
}
```

## Testing

### Unit Tests
- **Service Tests**: `appointments.service.spec.ts`
- **Controller Tests**: `appointments.controller.spec.ts`
- **Utils Tests**: `scheduling.utils.spec.ts`

### Integration Tests
- **API Tests**: `appointments.integration.spec.ts`
- **Database Integration**: Tests with real database operations
- **End-to-End**: Complete appointment lifecycle tests

### Test Coverage
- **Target**: 90%+ code coverage
- **Focus Areas**: Business logic, error handling, edge cases
- **Mock Strategy**: Mock external dependencies (database, guards)

## Usage Examples

### Create Appointment
```typescript
const appointment = await appointmentsService.create({
  patientId: 'patient-123',
  doctorId: 'doctor-456',
  roomId: 'room-789',
  date: '2024-12-25',
  slot: '10:00-10:30',
  visitType: VisitType.OPD,
  notes: 'Regular checkup',
  source: 'Walk-in'
}, 'branch-123');
```

### Get Available Slots
```typescript
const slots = await appointmentsService.getAvailableSlots({
  doctorId: 'doctor-456',
  date: '2024-12-25',
  durationMinutes: 30
}, 'branch-123');

console.log(slots.availableSlots); // ['09:00-09:30', '09:30-10:00', ...]
```

### Reschedule Appointment
```typescript
const rescheduled = await appointmentsService.reschedule('appointment-123', {
  date: '2024-12-26',
  slot: '14:00-14:30',
  notes: 'Patient requested different time'
}, 'branch-123');
```

## Dependencies

### Internal Dependencies
- **PrismaService**: Database operations
- **JwtAuthGuard**: Authentication and authorization
- **SchedulingUtils**: Time slot and scheduling utilities

### External Dependencies
- **@nestjs/common**: NestJS core functionality
- **@prisma/client**: Database client and types
- **class-validator**: DTO validation
- **class-transformer**: Data transformation

## Performance Considerations

### Database Optimization
- **Indexes**: Ensure proper indexes on frequently queried fields
- **Pagination**: Use cursor-based pagination for large datasets
- **Eager Loading**: Use `include` strategically to avoid N+1 queries

### Caching Strategy
- **Available Slots**: Cache available slots for popular time ranges
- **Doctor Schedules**: Cache daily schedules for active doctors
- **Invalidation**: Clear cache when appointments are created/modified

### Concurrent Access
- **Optimistic Locking**: Use version fields for conflict resolution
- **Atomic Operations**: Use database transactions for multi-step operations
- **Race Conditions**: Handle concurrent appointment creation gracefully

## Security Considerations

### Authentication
- **JWT Guards**: All endpoints protected by JWT authentication
- **Branch Isolation**: Users can only access appointments from their branch
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

# Business Rules
MIN_ADVANCE_HOURS=2
MAX_ADVANCE_DAYS=90
DEFAULT_SLOT_DURATION=30
BUSINESS_START_HOUR=9
BUSINESS_END_HOUR=18
```

### Module Configuration
```typescript
@Module({
  imports: [PrismaModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
```

## Future Enhancements

### Planned Features
1. **Recurring Appointments**: Support for recurring appointment patterns
2. **Waitlist Management**: Queue patients for cancelled slots
3. **SMS/Email Notifications**: Automated reminders and confirmations
4. **Video Consultation**: Integration with telemedicine platforms
5. **AI Scheduling**: Intelligent scheduling based on patient preferences
6. **Mobile App Integration**: Real-time sync with mobile applications

### Technical Improvements
1. **Event Sourcing**: Track all appointment state changes
2. **CQRS Pattern**: Separate read/write models for better performance
3. **Microservices**: Split into smaller, focused services
4. **GraphQL API**: Alternative to REST for flexible querying
5. **Real-time Updates**: WebSocket support for live schedule updates
