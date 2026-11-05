'use client';

import { PageHeader } from '@/components/ui/page-header';
import UsersManagement from '@/components/users/UsersManagement';
import { QuickGuide } from '@/components/common/QuickGuide';

export default function UsersPage() {
  return (
    <div className="space-y-4">
      <PageHeader title={<>Users Management</>} description={<>Manage clinic staff and user accounts</>} actions={<><QuickGuide
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
        /></>} />
      <UsersManagement />
    </div>
  );
} 