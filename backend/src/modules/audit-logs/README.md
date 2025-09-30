# Audit Logs Module

This module provides comprehensive audit logging and querying capabilities for the Clinic Management System. It allows administrators to track all data modifications across the system for compliance, security, and troubleshooting purposes.

## Features

### Core Functionality
- **Automatic Audit Tracking**: All database mutations (create, update, delete) are automatically logged
- **Comprehensive Metadata**: Captures user ID, IP address, user agent, entity type, entity ID, old values, and new values
- **Query Interface**: Rich querying capabilities with filtering, pagination, and sorting
- **Export Functionality**: Export audit logs in JSON or CSV format
- **Statistics**: Generate audit statistics and reports
- **Entity History**: View complete history for specific entities
- **User Activity**: Track activity for individual users
- **RBAC Integration**: Role-based access control for viewing audit logs

### Security Features
- **Immutable Logs**: Audit logs cannot be modified or deleted via API
- **Sensitive Data Redaction**: Passwords and sensitive fields are automatically redacted
- **IP Tracking**: Records IP address for all operations
- **User Agent Tracking**: Records browser/client information

## API Endpoints

### Query Audit Logs
```http
GET /audit-logs
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 50, max: 100)
- `entity`: Filter by entity type (e.g., "Patient", "Visit")
- `entityId`: Filter by specific entity ID
- `action`: Filter by action type (e.g., "CREATE", "UPDATE", "DELETE")
- `userId`: Filter by user ID
- `startDate`: Filter by start date (ISO 8601)
- `endDate`: Filter by end date (ISO 8601)
- `search`: Search across entity, entityId, and action
- `sortBy`: Sort field (timestamp, action, entity, userId)
- `sortOrder`: Sort order (asc, desc)

**Example:**
```bash
curl -X GET "http://localhost:4000/audit-logs?entity=Patient&action=CREATE&page=1&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "data": [
    {
      "id": "clx123abc",
      "userId": "clx456def",
      "action": "CREATE",
      "entity": "Patient",
      "entityId": "clx789ghi",
      "oldValues": null,
      "newValues": "{\"name\":\"John Doe\",\"email\":\"john@example.com\"}",
      "ipAddress": "192.168.1.1",
      "userAgent": "Mozilla/5.0...",
      "timestamp": "2025-09-30T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

### Get Audit Log Statistics
```http
GET /audit-logs/statistics
```

**Query Parameters:**
- `startDate`: Filter by start date (ISO 8601)
- `endDate`: Filter by end date (ISO 8601)

**Example:**
```bash
curl -X GET "http://localhost:4000/audit-logs/statistics?startDate=2025-01-01&endDate=2025-12-31" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "totalLogs": 10000,
  "actionBreakdown": [
    { "action": "CREATE", "count": 5000 },
    { "action": "UPDATE", "count": 3000 },
    { "action": "DELETE", "count": 2000 }
  ],
  "entityBreakdown": [
    { "entity": "Patient", "count": 4000 },
    { "entity": "Visit", "count": 3000 },
    { "entity": "Appointment", "count": 2000 }
  ],
  "topUsers": [
    { "userId": "clx123abc", "count": 2000 },
    { "userId": "clx456def", "count": 1500 }
  ]
}
```

### Export Audit Logs (CSV)
```http
GET /audit-logs/export
```

Downloads audit logs as CSV file with applied filters.

**Example:**
```bash
curl -X GET "http://localhost:4000/audit-logs/export?entity=Patient&startDate=2025-01-01" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o audit-logs.csv
```

### Export Audit Logs (JSON)
```http
GET /audit-logs/export/json
```

Returns audit logs as JSON with applied filters (max 10,000 records).

### Get Entity History
```http
GET /audit-logs/entity/:entity/:entityId
```

Get complete audit history for a specific entity.

**Example:**
```bash
curl -X GET "http://localhost:4000/audit-logs/entity/Patient/clx123abc" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get User Activity
```http
GET /audit-logs/user/:userId
```

Get all audit logs for a specific user.

**Example:**
```bash
curl -X GET "http://localhost:4000/audit-logs/user/clx123abc?page=1&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get My Activity
```http
GET /audit-logs/my-activity
```

Get audit logs for the currently authenticated user.

**Example:**
```bash
curl -X GET "http://localhost:4000/audit-logs/my-activity?page=1&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get Single Audit Log
```http
GET /audit-logs/:id
```

Get detailed information about a specific audit log entry.

**Example:**
```bash
curl -X GET "http://localhost:4000/audit-logs/clx123abc" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Permissions

### Required Roles

- **Query Audit Logs**: `ADMIN`, `SUPER_ADMIN`
- **View Statistics**: `ADMIN`, `SUPER_ADMIN`
- **Export Logs**: `ADMIN`, `SUPER_ADMIN` + `audit:export` permission
- **View Entity History**: `ADMIN`, `SUPER_ADMIN`, `DOCTOR` (limited to own patients)
- **View User Activity**: `ADMIN`, `SUPER_ADMIN`
- **View My Activity**: All authenticated users

### Required Permissions

- `audit:read`: Read audit logs
- `audit:export`: Export audit logs

## Implementation Details

### Automatic Logging

Audit logging is implemented at the Prisma client level using Prisma's `$extends` API. All database mutations are automatically intercepted and logged to the `audit_logs` table.

**Logged Operations:**
- `create`: Single record creation
- `createMany`: Bulk record creation
- `update`: Single record update
- `updateMany`: Bulk record updates
- `upsert`: Insert or update operation
- `delete`: Single record deletion
- `deleteMany`: Bulk record deletions

### Request Context

Audit logs capture request context using `AsyncLocalStorage`:
- **userId**: ID of the authenticated user (if available)
- **ipAddress**: Client IP address (from `x-forwarded-for` or `req.ip`)
- **userAgent**: Client user agent string

### Sensitive Data Redaction

The following fields are automatically redacted in audit logs:
- `password`
- `resetToken`
- `resetTokenExpiry`

Additional fields can be added to the redaction list in `PrismaService`.

### Data Structure

**AuditLog Model:**
```prisma
model AuditLog {
  id        String   @id @default(cuid())
  userId    String?  // User who performed the action
  action    String   // CREATE, UPDATE, DELETE, etc.
  entity    String   // Entity type (e.g., "Patient")
  entityId  String   // ID of the affected entity
  oldValues String?  // JSON string of previous values (for updates/deletes)
  newValues String?  // JSON string of new values
  ipAddress String?  // Client IP address
  userAgent String?  // Client user agent
  timestamp DateTime @default(now())
}
```

## Usage Examples

### View Recent Patient Modifications
```bash
curl -X GET "http://localhost:4000/audit-logs?entity=Patient&action=UPDATE&limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Track User Activity for Compliance
```bash
curl -X GET "http://localhost:4000/audit-logs/user/clx123abc?startDate=2025-09-01&endDate=2025-09-30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Export Monthly Audit Report
```bash
curl -X GET "http://localhost:4000/audit-logs/export?startDate=2025-09-01&endDate=2025-09-30" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -o monthly-audit-report.csv
```

### View Complete History of a Patient Record
```bash
curl -X GET "http://localhost:4000/audit-logs/entity/Patient/clx123abc" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Generate System-Wide Statistics
```bash
curl -X GET "http://localhost:4000/audit-logs/statistics" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Maintenance

### Log Retention

The module includes a maintenance method to delete old logs:

```typescript
await auditLogsService.deleteOldLogs(90); // Delete logs older than 90 days
```

This should be scheduled as a cron job or called periodically based on your retention policy.

### Database Indexes

For optimal query performance, ensure the following indexes exist:

```sql
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity);
CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

## Compliance Considerations

### HIPAA Compliance
- All patient data modifications are logged
- Logs include who, what, when, and where (IP)
- Logs are immutable (no API endpoints for modification/deletion)
- Sensitive data is redacted

### GDPR Compliance
- Audit logs track data access and modifications
- Logs can be exported for data subject access requests
- User activity can be tracked and reported
- Consider data retention policies for audit logs

### Best Practices
- Regular review of audit logs for suspicious activity
- Export and archive logs periodically
- Implement log retention policies based on regulatory requirements
- Monitor for unusual patterns (e.g., bulk deletions, after-hours access)

## Troubleshooting

### Audit Logs Not Being Created

1. Check that `RequestContextInterceptor` is registered globally in `AppModule`
2. Verify Prisma client extension is properly initialized in `PrismaService`
3. Check application logs for audit logging errors

### Performance Issues

1. Add database indexes on frequently queried fields
2. Implement log archival strategy
3. Consider partitioning audit logs table by date
4. Use pagination when querying large datasets

### Missing User Context

1. Ensure JWT authentication is working
2. Verify `RequestContextInterceptor` is extracting user information
3. Check that requests include valid JWT tokens

---

**Last Updated:** September 30, 2025  
**Version:** 1.0.0

