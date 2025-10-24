# Quick Guide Usage Examples

## How to Add a Quick Guide to a New Page

### Example 1: Simple Page with One Section

```tsx
'use client';

import { QuickGuide } from '@/components/common/QuickGuide';
import MyPageContent from '@/components/my-page/MyPageContent';

export default function MyPage() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">My Page</h1>
          <p className="text-gray-600">Description of what this page does</p>
        </div>
        <QuickGuide
          title="My Page Guide"
          sections={[
            {
              title: "How to Use This Page",
              items: [
                "Step 1: Do something first",
                "Step 2: Then do something else",
                "Step 3: Finally, complete the task"
              ]
            }
          ]}
        />
      </div>
      <MyPageContent />
    </div>
  );
}
```

### Example 2: Page with Multiple Sections

```tsx
'use client';

import { QuickGuide } from '@/components/common/QuickGuide';
import DataTable from '@/components/data-table/DataTable';

export default function ComplexPage() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Complex Page</h1>
          <p className="text-gray-600">Manage complex workflows</p>
        </div>
        <QuickGuide
          title="Complete Guide"
          sections={[
            {
              title: "Getting Started",
              items: [
                "Create your first item by clicking 'Add New'",
                "Fill in all required fields marked with *",
                "Click 'Save' to store your changes"
              ]
            },
            {
              title: "Advanced Features",
              items: [
                "Use filters to narrow down results",
                "Export data in CSV or PDF format",
                "Bulk operations available via checkboxes"
              ]
            },
            {
              title: "Tips & Tricks",
              items: [
                "Double-click any row to edit quickly",
                "Use keyboard shortcuts: Ctrl+S to save, Ctrl+F to search",
                "Enable auto-save in settings to never lose work"
              ]
            }
          ]}
        />
      </div>
      <DataTable />
    </div>
  );
}
```

### Example 3: Conditional Sections Based on User Role

```tsx
'use client';

import { QuickGuide } from '@/components/common/QuickGuide';
import { useDashboardUser } from '@/components/layout/dashboard-user-context';

export default function RoleBasedPage() {
  const { user } = useDashboardUser();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'OWNER';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-600">Configure your system</p>
        </div>
        <QuickGuide
          title="Settings Guide"
          sections={[
            {
              title: "Basic Settings",
              items: [
                "Update your profile information",
                "Change notification preferences",
                "Configure display options"
              ]
            },
            // Only show admin section if user is admin
            ...(isAdmin ? [{
              title: "Admin Settings",
              items: [
                "Manage system-wide configurations",
                "Configure security settings",
                "Access audit logs and reports"
              ]
            }] : [])
          ]}
        />
      </div>
      {/* Rest of page content */}
    </div>
  );
}
```

### Example 4: Custom Button Styling

```tsx
'use client';

import { QuickGuide } from '@/components/common/QuickGuide';

export default function CustomStyledPage() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">My Page</h1>
        
        {/* Ghost variant for minimal look */}
        <QuickGuide
          title="Help"
          triggerText="Need Help?"
          triggerVariant="ghost"
          triggerClassName="text-blue-600"
          sections={[
            {
              items: [
                "Quick tip 1",
                "Quick tip 2"
              ]
            }
          ]}
        />
      </div>
    </div>
  );
}
```

### Example 5: Guide Within a Card

```tsx
'use client';

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { QuickGuide } from '@/components/common/QuickGuide';

export default function CardWithGuide() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Data Analytics</CardTitle>
            <CardDescription>View and analyze your data</CardDescription>
          </div>
          <QuickGuide
            title="Analytics Guide"
            triggerVariant="ghost"
            sections={[
              {
                title: "Understanding Charts",
                items: [
                  "Bar charts show comparisons over time",
                  "Pie charts display proportions",
                  "Line graphs indicate trends"
                ]
              },
              {
                title: "Filtering Data",
                items: [
                  "Select date range at the top",
                  "Use category filters on the left",
                  "Apply multiple filters simultaneously"
                ]
              }
            ]}
          />
        </div>
      </CardHeader>
      <CardContent>
        {/* Charts and analytics content */}
      </CardContent>
    </Card>
  );
}
```

## Best Practices

### 1. Guide Content
- **Be Concise**: Keep each bullet point under 100 characters
- **Action-Oriented**: Start with verbs (Click, Select, Enter, etc.)
- **Sequential**: Order steps logically from first to last
- **Complete**: Cover all major features of the page

### 2. Organization
- **Logical Sections**: Group related items together
- **Progressive Complexity**: Start simple, advance to complex features
- **Clear Titles**: Use descriptive section titles
- **Appropriate Depth**: 2-4 sections per guide, 3-5 items per section

### 3. Placement
- **Consistent Location**: Always top-right of the page
- **Clear Visibility**: Don't hide guide button in dropdowns
- **Accessible**: Ensure keyboard navigation works
- **Responsive**: Test on mobile devices

### 4. Writing Style
- **Simple Language**: Avoid jargon where possible
- **User Perspective**: Write from the user's point of view
- **Positive Tone**: Frame actions positively
- **Clear Instructions**: Be specific about what to do

## Common Patterns

### Pattern 1: Three-Section Guide
Most pages follow this pattern:
1. **Getting Started**: Basic operations
2. **Key Features**: Main functionality
3. **Advanced/Tips**: Power user features

### Pattern 2: Role-Based Guide
For pages with different user roles:
1. **Common Features**: Available to all users
2. **Role-Specific**: Features for specific roles
3. **Permissions**: What each role can do

### Pattern 3: Workflow Guide
For process-oriented pages:
1. **Preparation**: What you need before starting
2. **Step-by-Step**: The main workflow
3. **Completion**: Finalizing and reviewing

## Testing Your Guide

Before deploying, verify:
- [ ] Guide button is visible and accessible
- [ ] All sections render correctly
- [ ] Content is accurate and up-to-date
- [ ] No spelling or grammar errors
- [ ] Mobile layout works properly
- [ ] Dialog can be closed easily
- [ ] Content fits within dialog (no overflow issues)

## Updating Existing Guides

When page functionality changes:
1. Review the guide for accuracy
2. Update any changed workflows
3. Add new features to appropriate sections
4. Remove deprecated features
5. Test the updated guide

## Localization (Future)

When adding multi-language support:
```tsx
import { useTranslation } from 'next-i18next';

function MyPage() {
  const { t } = useTranslation('guides');
  
  return (
    <QuickGuide
      title={t('myPage.title')}
      sections={[
        {
          title: t('myPage.section1.title'),
          items: t('myPage.section1.items', { returnObjects: true })
        }
      ]}
    />
  );
}
```

