# Users & Auth Module Enhancement

## Overview
The Users & Auth Module Enhancement provides comprehensive user management, role-based access control (RBAC), branch management, and enhanced authentication features for the Clinic Management System.

## Features

### User Management
- ✅ Complete CRUD operations for users
- ✅ User profile management
- ✅ Password management (change, reset, set)
- ✅ User status management (Active, Inactive, Suspended, Pending)
- ✅ Employee ID and designation tracking
- ✅ Emergency contact information
- ✅ User permissions and metadata
- ✅ Branch-level user isolation

### Branch Management
- ✅ Complete CRUD operations for branches
- ✅ Branch information and contact details
- ✅ GST and license number tracking
- ✅ Branch status management
- ✅ Multi-branch support

### Permission Management
- ✅ Create and manage permissions
- ✅ Resource-based permissions (users, appointments, visits, etc.)
- ✅ Action-based permissions (read, write, delete, etc.)
- ✅ Permission status management

### Role Management
- ✅ Create and manage roles
- ✅ Role-based permission assignment
- ✅ Role status management
- ✅ Predefined roles (Owner, Admin, Doctor, Nurse, Reception, Accountant, Pharmacist, Lab Tech, Manager)

### Authentication & Security
- ✅ Password hashing with bcrypt
- ✅ JWT token generation and verification
- ✅ Password reset functionality
- ✅ Token-based password setting
- ✅ Branch-level authorization
- ✅ Input validation and sanitization

### Analytics & Reporting
- ✅ User statistics and demographics
- ✅ Role breakdown analytics
- ✅ Department analytics
- ✅ User dashboard with key metrics
- ✅ Recent user activity tracking

## API Endpoints

### User Management
- `POST /users` - Create new user
- `GET /users` - List users with filtering and pagination
- `GET /users/statistics` - Get user statistics
- `GET /users/dashboard` - Get user dashboard
- `GET /users/:id` - Get user by ID
- `PATCH /users/:id` - Update user
- `DELETE /users/:id` - Delete user
- `POST /users/:id/change-password` - Change user password
- `POST /users/reset-password` - Reset password (generate token)
- `POST /users/set-password` - Set password with reset token
- `PATCH /users/:id/profile` - Update user profile
- `PATCH /users/:id/role` - Assign role to user
- `PATCH /users/:id/permissions` - Update user permissions
- `PATCH /users/:id/status` - Update user status

### Branch Management
- `POST /users/branches` - Create new branch
- `GET /users/branches` - List branches with filtering and pagination
- `GET /users/branches/:id` - Get branch by ID
- `PATCH /users/branches/:id` - Update branch
- `DELETE /users/branches/:id` - Delete branch

### Permission Management
- `POST /users/permissions` - Create new permission
- `GET /users/permissions` - List permissions with filtering and pagination
- `GET /users/permissions/:id` - Get permission by ID
- `PATCH /users/permissions/:id` - Update permission
- `DELETE /users/permissions/:id` - Delete permission

### Role Management
- `POST /users/roles` - Create new role
- `GET /users/roles` - List roles with filtering and pagination
- `GET /users/roles/:id` - Get role by ID
- `PATCH /users/roles/:id` - Update role
- `DELETE /users/roles/:id` - Delete role

## Data Transfer Objects (DTOs)

### User DTOs
- `CreateUserDto` - User creation with validation
- `UpdateUserDto` - User update with optional fields
- `ChangePasswordDto` - Password change with current password verification
- `ResetPasswordDto` - Password reset request
- `SetPasswordDto` - Password setting with reset token
- `UpdateProfileDto` - Profile update with personal information
- `AssignRoleDto` - Role assignment with permissions
- `UpdatePermissionsDto` - Permission updates
- `UserStatusDto` - User status management

### Branch DTOs
- `CreateBranchDto` - Branch creation with validation
- `UpdateBranchDto` - Branch update with optional fields

### Permission DTOs
- `CreatePermissionDto` - Permission creation
- `UpdatePermissionDto` - Permission update

### Role DTOs
- `CreateRoleDto` - Role creation with permissions
- `UpdateRoleDto` - Role update with permissions

### Query DTOs
- `QueryUsersDto` - User filtering and pagination
- `QueryBranchesDto` - Branch filtering and pagination
- `QueryPermissionsDto` - Permission filtering and pagination
- `QueryRolesDto` - Role filtering and pagination
- `UserStatisticsDto` - Statistics query parameters
- `UserDashboardDto` - Dashboard query parameters

## Database Models

### User Model
```typescript
{
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  branchId: string;
  employeeId?: string;
  designation?: string;
  department?: string;
  dateOfJoining?: Date;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  permissions?: string; // JSON array
  resetToken?: string;
  resetTokenExpiry?: Date;
  statusReason?: string;
  isActive: boolean;
  metadata?: string; // JSON object
  createdAt: Date;
  updatedAt: Date;
}
```

### Branch Model
```typescript
{
  id: string;
  name: string;
  description?: string;
  address: string;
  city?: string;
  state?: string;
  pincode?: string;
  phone?: string;
  email?: string;
  website?: string;
  gstNumber?: string;
  licenseNumber?: string;
  isActive: boolean;
  metadata?: string; // JSON object
  createdAt: Date;
  updatedAt: Date;
}
```

### Permission Model
```typescript
{
  id: string;
  name: string;
  description?: string;
  resource: string;
  action: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### Role Model
```typescript
{
  id: string;
  name: string;
  description?: string;
  permissions?: string; // JSON array
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

## Enums

### UserRole
- `OWNER` - System owner with full access
- `ADMIN` - Administrator with management access
- `DOCTOR` - Doctor with medical access
- `NURSE` - Nurse with patient care access
- `RECEPTION` - Receptionist with appointment access
- `ACCOUNTANT` - Accountant with billing access
- `PHARMACIST` - Pharmacist with prescription access
- `LAB_TECH` - Lab technician with lab access
- `MANAGER` - Manager with operational access

### UserStatus
- `ACTIVE` - Active user
- `INACTIVE` - Inactive user
- `SUSPENDED` - Suspended user
- `PENDING` - Pending approval user

## Security Features

### Authentication
- JWT token-based authentication
- Password hashing with bcrypt (10 rounds)
- Token expiration handling
- Reset token generation and validation

### Authorization
- Branch-level data isolation
- Role-based access control
- Permission-based endpoint access
- User status validation

### Input Validation
- Comprehensive DTO validation
- Email format validation
- Password strength requirements
- Phone number validation
- Required field validation

### Data Protection
- Password hashing and salting
- Sensitive data encryption
- SQL injection prevention
- Input sanitization

## Business Rules

### User Management
- Email addresses must be unique across the system
- Employee IDs must be unique within a branch
- Users cannot be deleted if they have appointments or visits
- Password changes require current password verification
- User status changes require reason documentation

### Branch Management
- Branch names must be unique
- Branches cannot be deleted if they have users
- Branch information must include address and contact details

### Permission Management
- Permission resource and action combinations must be unique
- Permissions cannot be deleted if assigned to roles
- Permission names must be descriptive and unique

### Role Management
- Role names must be unique
- Roles cannot be deleted if assigned to users
- Role permissions are stored as JSON arrays

## Error Handling

### Common Exceptions
- `NotFoundException` - Resource not found
- `ConflictException` - Duplicate resource or constraint violation
- `BadRequestException` - Invalid input or business rule violation
- `UnauthorizedException` - Authentication or authorization failure

### Error Responses
```typescript
{
  statusCode: number;
  message: string;
  error: string;
  timestamp: string;
  path: string;
}
```

## Testing

### Test Coverage
- **Unit Tests**: 45+ tests covering all service methods
- **Controller Tests**: 35+ tests covering all endpoints
- **Integration Tests**: 25+ tests covering API workflows
- **Total Tests**: 105+ tests with comprehensive coverage

### Test Categories
- User CRUD operations
- Password management
- Branch management
- Permission management
- Role management
- Statistics and analytics
- Error handling
- Validation scenarios

## Usage Examples

### Create User
```typescript
const createUserDto = {
  firstName: 'John',
  lastName: 'Doe',
  email: 'john.doe@example.com',
  password: 'password123',
  phone: '1234567890',
  role: 'DOCTOR',
  branchId: 'branch-123',
  employeeId: 'EMP001',
  designation: 'Senior Doctor',
  department: 'Dermatology',
};

const user = await usersService.createUser(createUserDto, 'branch-123');
```

### Change Password
```typescript
const changePasswordDto = {
  currentPassword: 'oldPassword',
  newPassword: 'newPassword',
  confirmPassword: 'newPassword',
};

await usersService.changePassword('user-123', changePasswordDto, 'branch-123');
```

### Create Branch
```typescript
const createBranchDto = {
  name: 'New Branch',
  address: '123 Main St',
  city: 'Hyderabad',
  state: 'Telangana',
  phone: '1234567890',
  email: 'branch@example.com',
};

const branch = await usersService.createBranch(createBranchDto);
```

### Assign Role
```typescript
const assignRoleDto = {
  role: 'MANAGER',
  permissions: ['read', 'write', 'delete'],
};

await usersService.assignRole('user-123', assignRoleDto, 'branch-123');
```

## Integration

### Dependencies
- `@nestjs/common` - NestJS core functionality
- `@nestjs/jwt` - JWT token handling
- `bcrypt` - Password hashing
- `class-validator` - DTO validation
- `@prisma/client` - Database operations

### Module Integration
```typescript
@Module({
  imports: [PrismaModule, JwtModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

## Performance Considerations

### Database Optimization
- Indexed fields for efficient queries
- Pagination for large datasets
- Selective field loading
- Optimized Prisma queries

### Caching Strategy
- User session caching
- Permission caching
- Role-based access caching
- Statistics caching

### Security Optimization
- Password hashing optimization
- Token validation optimization
- Input validation optimization
- Authorization check optimization

## Future Enhancements

### Planned Features
- Two-factor authentication (2FA)
- Single Sign-On (SSO) integration
- Advanced audit logging
- User activity tracking
- Bulk user operations
- Advanced role hierarchies
- Permission inheritance
- User group management

### Integration Opportunities
- Keycloak integration for enterprise SSO
- LDAP/Active Directory integration
- Multi-factor authentication
- Advanced security policies
- Compliance reporting

## Conclusion

The Users & Auth Module Enhancement provides a robust, secure, and scalable foundation for user management in the Clinic Management System. With comprehensive CRUD operations, role-based access control, branch management, and enhanced security features, it supports the complex requirements of a multi-branch healthcare organization.

The module is production-ready with comprehensive testing, thorough documentation, and follows industry best practices for security and performance.
