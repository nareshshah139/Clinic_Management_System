'use client';

import UsersManagement from '@/components/users/UsersManagement';
import { QuickGuide } from '@/components/common/QuickGuide';

export default function UsersPage() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users Management</h1>
          <p className="text-gray-600">Manage clinic staff and user accounts</p>
        </div>
        <QuickGuide
          title="Users Management Guide"
          sections={[
            {
              title: "Adding Users",
              items: [
                "Click 'Add User' to create new staff accounts",
                "Select user role: Doctor, Nurse, Therapist, Reception, Admin, or Owner",
                "Fill in user details including name, email, and credentials",
                "Assign specializations and departments as needed"
              ]
            },
            {
              title: "User Roles",
              items: [
                "Doctor: Full access to patient care and prescriptions",
                "Nurse: Can record vitals, complaints, and basic assessments",
                "Therapist: Can record vitals and capture photos (20-25% of visit)",
                "Reception: Basic patient information and photo capture",
                "Admin/Owner: Full system access and administrative controls"
              ]
            },
            {
              title: "Managing Users",
              items: [
                "Edit user information by clicking on a user row",
                "Activate/deactivate user accounts as needed",
                "View user activity and assignment history",
                "Reset passwords and manage permissions"
              ]
            }
          ]}
        />
      </div>
      <UsersManagement />
    </div>
  );
} 