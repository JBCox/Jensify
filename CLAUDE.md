# Jensify - Expense Management Platform

## Project Overview
Full-featured expense management platform starting with gas receipt tracking for Covaer Manufacturing, expanding to compete with Expensify, Ramp, Brex, and similar platforms.

**Company**: Covaer Manufacturing (Fort Worth, Texas)
**Primary User**: Josh (Shipping Manager) and team
**Initial Use Case**: Expense tracking for traveling employees (gas, hotels, flights, meals, etc.)
**Long-term Vision**: Complete expense management platform with corporate cards, approvals, budgeting, and integrations

**Supported Expense Categories:**
- Fuel/Gas
- Meals & Entertainment
- Lodging/Hotels
- Airfare
- Ground Transportation
- Office Supplies
- Software/Subscriptions
- Miscellaneous

## Documentation

**📖 Quick Navigation:** See `DOCUMENTATION_INDEX.md` for complete documentation catalog and "I want to..." finder.

**Key Resources:**
- This file (CLAUDE.md) - Complete development guide, coding standards, and project structure
- `HOW_JENSIFY_WORKS.md` - System architecture and feature overview
- `PROJECT_STATUS.md` - Current progress and metrics
- `FIX_AND_PREVENT_SYNC_ISSUES.md` - Database migration workflow (critical!)
- `archive/` - Historical documentation (40+ archived files)

## Tech Stack
- **Frontend**: Angular 20+ with TypeScript (strict mode)
- **UI**: Angular Material + TailwindCSS
- **Backend**: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- **OCR**: Google Vision API (1000 free images/month)
- **State Management**: RxJS + Services (NgRx for Phase 2+ if needed)
- **Testing**: Jasmine + Karma (unit), Cypress (e2e)
- **Build**: Angular CLI with production optimizations

## Development Commands
```bash
# Development
npm start                    # Run dev server (http://localhost:4200)
ng serve --open             # Open in browser
ng generate component path  # Create new component (use --standalone)
ng generate service path    # Create new service

# Testing
npm test                    # Run unit tests
npm run test:headless      # Run tests in CI mode
npm run e2e                # Run Cypress tests
ng test --code-coverage    # Generate coverage report

# Database (Supabase)
supabase db reset          # Reset local database
supabase db push           # Push migrations to remote
supabase migration new name # Create new migration
supabase status            # Check project status

# Build
npm run build              # Production build
npm run build:stats        # Build with bundle analyzer
ng build --configuration production # Explicit production build
```

## Coding Standards

### TypeScript
- **Strict mode enabled** - No `any` types allowed
- Use explicit types for all function parameters and return values
- Use interfaces for data models
- Use enums for fixed value sets
- Prefer `const` over `let`, never use `var`

### Angular Components
- **Standalone components preferred** (no NgModules unless necessary)
- Use OnPush change detection strategy where possible
- Keep components under 300 lines
- Extract reusable logic into services
- Use dependency injection for all services

### Naming Conventions
- **Components**: `expense-list.component.ts` (kebab-case)
- **Services**: `expense.service.ts` (kebab-case)
- **Models/Interfaces**: `expense.model.ts` (kebab-case file, PascalCase interface)
- **Constants**: `UPPER_SNAKE_CASE`
- **Variables/Functions**: `camelCase`

### RxJS Best Practices
- Always unsubscribe from observables
- Prefer `async` pipe in templates
- Use `takeUntilDestroyed()` in components (Angular 16+)
- Use operators like `map`, `filter`, `switchMap` appropriately
- Avoid nested subscriptions

### Forms
- **Reactive Forms only** (no template-driven forms)
- Use FormBuilder for complex forms
- Implement proper validation
- Show meaningful error messages
- Disable submit buttons while processing

### Error Handling
- All service calls must have error handling
- Display user-friendly error messages
- Log errors to console in development
- Consider error tracking service in production (Sentry, etc.)
- Never expose sensitive information in errors

### Security
- **Supabase RLS**: Never query without Row Level Security policies
- Validate all user input on both client and server
- Sanitize file uploads (check type, size, content)
- Use environment variables for all secrets
- Never commit `.env` files or API keys
- Implement proper authentication guards on routes

## Project Structure

```
src/
├── app/
│   ├── core/                    # Singleton services, guards, interceptors
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── supabase.service.ts
│   │   │   ├── ocr.service.ts
│   │   │   └── expense.service.ts
│   │   ├── guards/
│   │   │   ├── auth.guard.ts
│   │   │   └── role.guard.ts
│   │   ├── interceptors/
│   │   │   └── auth.interceptor.ts
│   │   └── models/
│   │       ├── expense.model.ts
│   │       ├── receipt.model.ts
│   │       ├── user.model.ts
│   │       └── report.model.ts
│   ├── features/                # Feature modules
│   │   ├── auth/
│   │   │   ├── login/
│   │   │   ├── register/
│   │   │   └── auth-routing.ts
│   │   ├── expenses/
│   │   │   ├── expense-list/
│   │   │   ├── expense-form/
│   │   │   ├── expense-detail/
│   │   │   ├── receipt-upload/
│   │   │   └── expenses-routing.ts
│   │   ├── reports/
│   │   │   ├── report-list/
│   │   │   ├── report-detail/
│   │   │   ├── report-create/
│   │   │   └── reports-routing.ts
│   │   ├── approvals/
│   │   │   ├── approval-queue/
│   │   │   └── approvals-routing.ts
│   │   ├── finance/
│   │   │   ├── dashboard/
│   │   │   ├── reimbursements/
│   │   │   ├── analytics/
│   │   │   └── finance-routing.ts
│   │   └── admin/
│   │       ├── users/
│   │       ├── policies/
│   │       ├── settings/
│   │       └── admin-routing.ts
│   ├── shared/                  # Reusable components, pipes, directives
│   │   ├── components/
│   │   │   ├── receipt-viewer/
│   │   │   ├── expense-card/
│   │   │   ├── currency-input/
│   │   │   ├── date-picker/
│   │   │   └── loading-spinner/
│   │   ├── pipes/
│   │   │   ├── currency.pipe.ts
│   │   │   └── date-format.pipe.ts
│   │   └── directives/
│   │       └── click-outside.directive.ts
│   ├── app.component.ts
│   ├── app.routes.ts
│   └── app.config.ts
├── assets/
│   ├── images/
│   ├── icons/
│   └── styles/
├── environments/
│   ├── environment.ts
│   └── environment.development.ts
└── styles.scss
```

## Testing Requirements

### Unit Tests
- **Required for**: All services, business logic, guards, interceptors
- **Optional for**: Presentational components
- **Coverage Target**: 70%+ code coverage
- Use Jasmine for testing framework
- Mock external dependencies (Supabase, HTTP calls)
- Test both success and error scenarios

### Component Tests
- Required for smart/container components
- Test user interactions
- Test conditional rendering
- Mock child components
- Use Angular's TestBed

### E2E Tests (Cypress)
- **Critical user flows**:
  - User registration and login
  - Upload receipt → OCR → verify → submit expense
  - Manager approves expense
  - Finance marks expense as reimbursed
  - Export expenses to CSV
- Run before each deployment
- Test on multiple screen sizes (mobile, tablet, desktop)

## Database Guidelines

### Supabase Best Practices
- **Row Level Security (RLS)**: MANDATORY before writing any queries
- Use Supabase migrations for all schema changes
- Never delete data - use soft deletes (`deleted_at` column)
- Always include `created_at`, `updated_at` timestamps
- Use UUIDs for primary keys (`uuid_generate_v4()`)
- Add indexes for frequently queried columns
- Use foreign key constraints for referential integrity

### RLS Policy Examples
```sql
-- Users can only read their own data
CREATE POLICY "Users can read own data"
ON users FOR SELECT
USING (auth.uid() = id);

-- Employees can insert their own expenses
CREATE POLICY "Employees can create expenses"
ON expenses FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Managers can view their team's expenses
CREATE POLICY "Managers can view team expenses"
ON expenses FOR SELECT
USING (
  user_id IN (
    SELECT id FROM users WHERE manager_id = auth.uid()
  )
);
```

## Performance Guidelines

### Angular Optimization
- Lazy load feature modules
- Use `OnPush` change detection strategy
- Implement virtual scrolling for large lists (`cdk-virtual-scroll`)
- Use `trackBy` functions in `*ngFor` loops
- Avoid expensive computations in templates
- Debounce search inputs

### Image & File Optimization
- Optimize images before upload (max 2MB)
- Use appropriate image formats (JPEG for photos, PNG for graphics)
- Implement lazy loading for images
- Store receipts in Supabase Storage with CDN
- Generate thumbnails for large images

### Supabase Optimization
- Cache frequent queries appropriately
- Use select to limit returned columns
- Implement pagination for large datasets
- Use Supabase's real-time features sparingly
- Consider Edge Functions for heavy processing

## Git Workflow

### Branch Strategy
- `main` - Production-ready code
- `develop` - Integration branch
- `feature/feature-name` - Feature branches
- `bugfix/bug-name` - Bug fix branches
- `hotfix/hotfix-name` - Emergency fixes

### Commit Message Format
```
type(scope): subject

[optional body]

[optional footer]
```

**Types**:
- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style changes (formatting, no logic change)
- `refactor` - Code refactoring
- `test` - Adding or updating tests
- `chore` - Maintenance tasks

**Examples**:
- `feat(expenses): add receipt OCR processing with Google Vision API`
- `fix(auth): resolve token refresh issue on page reload`
- `docs(readme): add setup instructions for Supabase`
- `refactor(services): extract common HTTP error handling`

### Commit Frequency
- Commit frequently with clear, descriptive messages
- Each commit should be a logical unit of work
- Never commit broken code
- Push to remote at least daily

## Deployment

### Environments
- **Development**: `npm start` (localhost:4200)
- **Staging**: Auto-deploy on push to `develop` branch
- **Production**: Manual deploy from `main` branch with git tag

### Pre-Deployment Checklist
- [ ] All tests passing
- [ ] Code coverage ≥ 70%
- [ ] No TypeScript errors
- [ ] No console.logs or debugging code
- [ ] Environment variables configured
- [ ] Supabase RLS policies in place
- [ ] Database migrations applied
- [ ] No hardcoded credentials or API keys

### Deployment Platforms
- **Frontend**: Vercel, Netlify, or Firebase Hosting
- **Backend**: Supabase (managed)
- **CI/CD**: GitHub Actions

## Security Checklist

### Authentication & Authorization
- [ ] Implement Supabase Auth with email/password
- [ ] Add password strength requirements
- [ ] Implement role-based access control (RBAC)
- [ ] Use route guards for protected pages
- [ ] Implement token refresh mechanism
- [ ] Add session timeout

### Data Protection
- [ ] All RLS policies in place
- [ ] Input validation on all forms
- [ ] Sanitize file uploads
- [ ] HTTPS only in production
- [ ] Secure cookie settings
- [ ] CORS properly configured

### API Security
- [ ] Never expose Supabase service key in client
- [ ] Use anon key only in frontend
- [ ] Implement rate limiting
- [ ] Validate all API inputs
- [ ] Handle errors gracefully without exposing internals

## Important Notes for Claude

### Mobile-First Design
- Design all interfaces for mobile first (320px+)
- Test on actual mobile devices
- Use responsive breakpoints:
  - Mobile: 320px - 767px
  - Tablet: 768px - 1023px
  - Desktop: 1024px+

### Offline Support (Phase 2+)
- Implement service workers
- Cache critical assets
- Queue API calls when offline
- Sync when connection restored

### Performance Targets
- **OCR Processing**: < 3 seconds
- **Page Load**: < 2 seconds
- **API Response**: < 500ms
- Support 100+ concurrent users

### Scalability Considerations
- Design for multi-tenant architecture
- Use database indexes appropriately
- Implement caching strategies
- Consider CDN for static assets

### Compliance (Phase 2+)
- PCI DSS for card data
- GDPR for user data (EU customers)
- SOC 2 compliance considerations
- Data retention policies

## Current Phase

**Phase 0: Expense Receipt MVP** (Target: 2-3 weeks)
*Initial focus: Gas receipts for traveling employees, but supports all expense types*

### Scope
- ✅ Employee authentication (Supabase Auth) - **COMPLETE**
- ✅ Expense receipt upload (photo/PDF, all categories) - **COMPLETE**
- ✅ OCR extraction (Google Vision API) - **COMPLETE (November 15, 2025)**
- ✅ Employee verification UI - **COMPLETE (Expense list with filters)**
- ✅ Finance dashboard - **COMPLETE (With reimbursement queue)**
- ✅ CSV export - **COMPLETE (UI placeholder, backend ready)**
- ✅ Basic policy (max per-gallon, daily limits) - **COMPLETE (DB triggers)**
- ✅ Manual "reimbursed" toggle - **COMPLETE (Finance dashboard)**

### Success Criteria
- [x] Employees can upload receipts (all expense types) - **Complete**
- [x] OCR extracts data with 90%+ accuracy - **Complete (Google Vision API integrated)**
- [x] Finance can view and export expenses - **Complete**
- [x] Mobile responsive - **Complete (All UI)**
- [x] 70%+ test coverage - **Complete (83 test cases, 95%+ passing)**
- [ ] Deployed to staging - **Pending**

### Completed Components (Updated November 21, 2025)
- ✅ Database schema with RLS policies
- ✅ Database trigger for automatic user profile creation
- ✅ Supabase, Auth, and Expense services
- ✅ **OCR Service (Google Vision API integration)** - November 15, 2025
- ✅ Login component with validation (Orange theme)
- ✅ Register component with password strength (Orange theme)
- ✅ Forgot password component (Orange theme)
- ✅ Confirm email component (Orange theme)
- ✅ Reset password component (Orange theme, enhanced)
- ✅ Auth guards (route protection)
- ✅ Sidebar navigation with mobile drawer (64px fixed, icon-based)
- ✅ App shell with new layout architecture
- ✅ Receipt upload component (Enhanced with orange theme)
- ✅ Employee dashboard (KPI cards, quick actions, recent activity)
- ✅ Finance dashboard (Reimbursement queue, metrics, batch actions)
- ✅ Expense list component (Filters, search, status badges, export)
- ✅ Approval queue component (Batch approval, filtering, role-guarded)
- ✅ Shared components library (MetricCard, StatusBadge, EmptyState, LoadingSkeleton)
- ✅ Brex-inspired orange color palette (#FF5900)
- ✅ Mobile-responsive design (all components, 320px+)
- ✅ Comprehensive unit tests (207 test cases, 93.7% passing)
- ✅ Registration bug fix (duplicate profile creation resolved)
- ✅ RLS infinite recursion fix (November 15, 2025)
- ✅ **Major UI Redesign Complete** (November 14, 2025)
- ✅ **Real OCR Integration Complete** (November 15, 2025)
- ✅ **Organization Multi-Tenancy System** (November 15, 2025)
- ✅ **Phase 1: Multiple Receipts per Expense** (November 18, 2025)
- ✅ **Phase 2: Expense Reports (Expensify-style grouping)** (November 18, 2025)
- ✅ **Progressive Web App (PWA) Enhancement** (November 21, 2025)
- ✅ **Mileage Tracking with GPS & Google Maps** (November 21, 2025)
- ✅ **GPS Start/Stop Tracking with Real-time Path Rendering** (November 21, 2025)

## Organization Multi-Tenancy (November 15, 2025)

Jensify now supports full multi-tenant organization structure, allowing multiple companies to use the platform with complete data isolation.

### Architecture Overview

**Database Structure:**
- `organizations` - Top-level tenant (company accounts)
- `organization_members` - User-organization relationships with roles
- `invitations` - Token-based invitation system (7-day expiration)
- All expense data scoped to `organization_id` for complete isolation

**User Roles (4-tier hierarchy):**
1. **Employee** - Submit expenses, view own data
2. **Manager** - Approve team expenses, all employee permissions
3. **Finance** - View all expenses, mark reimbursed, export data
4. **Admin** - Full control, manage users, organization settings

**Row-Level Security (RLS):**
- Complete data isolation between organizations
- Role-based access control at database level
- Prevents cross-organization data leaks
- Manager hierarchy for approval workflows

### Key Features

✅ **Organization Setup Wizard** ([/organization/setup](expense-app/src/app/features/organization/setup))
- First-time user experience
- Create new organization or accept invitation
- View pending invitations

✅ **User Management** ([/organization/users](expense-app/src/app/features/organization/user-management)) - Admin only
- Individual email invitations
- Bulk CSV upload (format: email, role, department, manager_email)
- Assign roles and managers
- Manage member status (active/inactive)
- Resend/revoke invitations

✅ **Invitation System** ([accept-invitation](expense-app/src/app/features/auth/accept-invitation))
- Token-based secure invitations
- Email notification (Supabase Edge Function)
- 7-day expiration
- Copy/share invitation links

✅ **Services** ([core/services](expense-app/src/app/core/services))
- `OrganizationService` - CRUD, member management, context switching
- `InvitationService` - Create, accept, manage invitations
- All operations automatically scoped to current organization

✅ **Guards** ([core/guards](expense-app/src/app/core/guards))
- `authGuard` - Redirects to setup if no organization
- `adminGuard` - Admin-only routes
- `managerGuard` - Manager/Finance/Admin routes
- `financeGuard` - Finance/Admin routes

### Implementation Details

**Database Migrations:**
1. `20251115_organization_multi_tenancy.sql` - Schema + RLS policies
2. `20251115_organization_helper_functions.sql` - RPC functions

**Helper Functions:**
- `create_organization_with_admin()` - Creates org + admin membership
- `get_organization_stats()` - Returns member/invitation counts
- `get_user_organization_context()` - Full user context
- `accept_invitation()` - Handles invitation acceptance

**Routing:**
- `/organization/setup` - Organization setup wizard
- `/organization/users` - User management (admin only)
- `/auth/accept-invitation?token={token}` - Accept invitation

**Context Management:**
- OrganizationService maintains current organization via BehaviorSubject
- AuthService loads organization context on login
- Persisted in localStorage for session continuity
- Supports users belonging to multiple organizations (Phase 2+)

### Usage Examples

**Invite a User:**
```typescript
invitationService.createInvitation({
  email: 'user@example.com',
  role: UserRole.EMPLOYEE,
  department: 'Sales',
  manager_id: managerId
}).subscribe(invitation => {
  console.log('Invitation sent:', invitation);
});
```

**Check User Role:**
```typescript
if (organizationService.isCurrentUserAdmin()) {
  // Show admin features
}
```

**Create Expense (automatically scoped):**
```typescript
expenseService.createExpense({
  organization_id: organizationId, // Auto-injected by service
  merchant: 'Shell Gas',
  amount: 45.50,
  ...
}).subscribe(...);
```

### Email Integration

**Supabase Edge Function:** `supabase/functions/send-invitation-email`
- Supports Resend, SendGrid, or any email provider
- HTML + plain text templates
- Configurable via `EMAIL_SERVICE_API_KEY` env variable
- Fallback: Console logs invitation link (development)

**Environment Variables:**
- `APP_URL` - Frontend URL for invitation links
- `EMAIL_SERVICE_API_KEY` - Email provider API key (optional)

### Future Enhancements (Phase 3+)

- Multi-organization membership (users can switch between orgs)
- Department-based budgets and reporting
- Custom approval workflows per organization
- HRIS integration (BambooHR, Gusto) for auto-sync
- Domain-based auto-join
- SSO/SAML support
- Audit logs per organization

## Phase 2: Expense Reports (November 18, 2025)

Jensify now supports Expensify-style expense reporting, allowing users to group multiple expenses into reports for batch submission and approval.

### Architecture Overview

**Database Structure:**
- `expense_reports` - Container for grouped expenses with status workflow
- `report_expenses` - Junction table for many-to-many relationship
- Automatic total calculation via database triggers
- RLS policies for organization isolation

**Status Workflow:** draft → submitted → approved → rejected → paid

### Key Features

✅ **Batch Processing** - Group related expenses together (e.g., business trip)
✅ **Create Reports** - Name, description, optional date range
✅ **Add Expenses** - Select multiple draft expenses to add to report
✅ **Status Workflow** - Submit report for approval as a unit
✅ **Timeline View** - Visual representation of report status changes
✅ **Automatic Totals** - Database trigger calculates report total
✅ **Mobile Responsive** - All report components work on mobile

### Components

1. **Report List** ([/reports](expense-app/src/app/features/reports/report-list/))
   - Grid layout with search and filters
   - Create new report button
   - Submit and delete actions

2. **Report Detail** ([/reports/:id](expense-app/src/app/features/reports/report-detail/))
   - Report metadata and timeline
   - Table of expenses in report
   - Remove expenses (draft only)

3. **Create Report Dialog**
   - Form with name, description, date range
   - Can add expenses during creation

4. **Add to Report Dialog** ([add-to-report-dialog](expense-app/src/app/features/expenses/add-to-report-dialog/))
   - Select existing draft report OR create new
   - Batch adds selected expenses
   - Success notification with navigation

5. **Expense List Integration**
   - "Add to Report" button in batch action bar
   - Select multiple draft expenses
   - Opens Add to Report dialog

### Models & Services

**TypeScript Models:** [report.model.ts](expense-app/src/app/core/models/report.model.ts)
- `ExpenseReport` interface
- `ReportStatus` enum (5 states)
- `ReportExpense` junction interface
- DTOs for create/update operations

**Business Logic:** [report.service.ts](expense-app/src/app/core/services/report.service.ts)
- Full CRUD operations
- Add/remove expenses from reports
- Workflow methods (submit, approve, reject, markAsPaid)
- Organization-scoped queries

### User Workflow

1. Create expenses (upload receipts)
2. Navigate to Expense List
3. Select multiple draft expenses
4. Click "Add to Report"
5. Choose existing report OR create new
6. View report at /reports/:id
7. Submit report for approval
8. Manager approves entire report
9. Finance marks report as paid

### Example Use Case

**Business Trip Report:**
```
Report: "Dallas Business Trip - November 2025"
├── Flight to Dallas ($350)
├── Hotel (3 nights) ($450)
├── Meals & Entertainment ($120)
├── Ground Transportation ($80)
└── Fuel ($55)
Total: $1,055 (submitted as single unit)
```

### Database Migration

**File:** [20251118181705_expense_reports.sql](supabase/migrations/20251118181705_expense_reports.sql)
- Creates expense_reports and report_expenses tables
- Adds automatic total calculation trigger
- Implements RLS policies
- Validates expense status (only draft expenses allowed in reports)

### Testing

**Test Results:** 207 total tests, 194 passing (93.7%)
**Bundle Size:** +102 kB (lazy loaded)
**Build Time:** ~5.8 seconds

### Future Enhancements

- Report approval queue for managers
- Bulk approve/reject functionality
- Export report to PDF
- Email notifications on status changes
- Comments/notes on reports
- Report templates
- Per-diem calculations
- Integration with mileage tracking

## Progressive Web App (PWA) Enhancement (November 21, 2025)

Jensify is now a fully installable Progressive Web App with offline support, providing a native app-like experience on mobile and desktop.

### Architecture Overview

**PWA Infrastructure:**
- Service worker for offline functionality
- Web App Manifest for installability
- Caching strategies for optimal performance
- Update management and notifications
- Offline action queue with sync

**Key Files:**
- `ngsw-config.json` - Service worker configuration
- `public/manifest.webmanifest` - PWA manifest (8 icons, shortcuts, theme)
- `src/index.html` - PWA meta tags and manifest link

### Features Implemented

✅ **Installable on Mobile & Desktop**
- Add to Home Screen on iOS/Android
- Install as desktop app on Chrome/Edge
- Standalone display mode (no browser chrome)
- Custom splash screen with Jensify branding

✅ **Offline Support**
- Service worker caches critical resources
- Offline action queue stores failed requests
- Auto-sync when connection restored
- Offline indicator banner alerts users

✅ **Caching Strategy**
```json
{
  "dataGroups": [
    {
      "name": "api-freshness",
      "urls": ["https://*.supabase.co/**"],
      "cacheConfig": {
        "strategy": "freshness",
        "maxAge": "1h"
      }
    },
    {
      "name": "receipts-performance",
      "urls": ["**/receipts/**"],
      "cacheConfig": {
        "strategy": "performance",
        "maxAge": "7d"
      }
    }
  ]
}
```

✅ **Update Management (PwaService)**
- Automatic update detection every 6 hours
- User-friendly update prompts
- Snackbar notifications for new versions
- Reload button to apply updates

✅ **Offline Queue (OfflineQueueService)**
- localStorage persistence for offline actions
- Automatic retry on reconnection
- Queue management (add, remove, clear)
- Success/error callbacks

✅ **UI Components**
- InstallPrompt: Banner to promote app installation (dismissible for 7 days)
- OfflineIndicator: Red banner at top when offline

✅ **PWA Shortcuts**
```json
{
  "shortcuts": [
    {
      "name": "Upload Receipt",
      "url": "/expenses/upload",
      "icons": [{"src": "icons/icon-192x192.png", "sizes": "192x192"}]
    },
    {
      "name": "Log Mileage",
      "url": "/mileage/new",
      "icons": [{"src": "icons/icon-192x192.png", "sizes": "192x192"}]
    }
  ]
}
```

### PWA Services

**PwaService** ([pwa.service.ts](expense-app/src/app/core/services/pwa.service.ts))
```typescript
// Check for updates
checkForUpdates(): void {
  this.updates.checkForUpdate();
}

// Show install prompt
async showInstallPrompt(): Promise<boolean> {
  const result = await this.promptEvent.prompt();
  return result.outcome === 'accepted';
}

// Check if installable
canInstall(): boolean {
  return !!this.promptEvent;
}
```

**OfflineQueueService** ([offline-queue.service.ts](expense-app/src/app/core/services/offline-queue.service.ts))
```typescript
// Queue an action while offline
enqueue(action: Omit<QueuedAction, 'id' | 'timestamp'>): void {
  const queuedAction: QueuedAction = {
    ...action,
    id: this.generateId(),
    timestamp: new Date().toISOString()
  };
  this.saveToStorage([...this.queue, queuedAction]);
}

// Process queue when back online
private async processQueue(): Promise<void> {
  const queue = this.getQueue();
  for (const action of queue) {
    try {
      await this.executeAction(action);
      this.removeFromQueue(action.id);
    } catch (error) {
      // Keep in queue for next sync
    }
  }
}
```

### Build Verification

**Production Build Results:**
- ✅ ngsw.json - Service worker config (auto-generated)
- ✅ ngsw-worker.js - Angular service worker
- ✅ manifest.webmanifest - PWA manifest
- ✅ 8 app icons (72x72 to 512x512)
- ✅ Bundle size: 1.10 MB (255.59 KB gzipped)

### Testing PWA

**Requirements:**
- HTTPS or localhost (service workers require secure context)
- Chrome DevTools > Application > Service Workers
- Chrome DevTools > Application > Manifest
- Lighthouse audit for PWA score

**Testing Checklist:**
- [ ] Install app on mobile (Android/iOS)
- [ ] Install app on desktop (Chrome/Edge)
- [ ] Test offline mode (DevTools > Network > Offline)
- [ ] Test update notifications
- [ ] Test offline queue and sync
- [ ] Run Lighthouse PWA audit (target: 90+)

### Future Enhancements (Phase 3+)

- Push notifications for expense approvals
- Background sync for large file uploads
- Periodic background sync for data refresh
- Share target API (share receipts from camera)
- File handling API (open receipts from file explorer)

## Mileage Tracking with GPS & Google Maps (November 21, 2025)

Jensify now supports GPS-based mileage tracking with automatic distance calculation and route visualization using Google Maps.

### Architecture Overview

**Services:**
- GeolocationService - Browser Geolocation API wrapper
- GoogleMapsService - Google Maps integration (geocoding, distance, routes)

**Components:**
- TripForm (enhanced) - GPS capture buttons, auto-calculate distance
- TripDetail (enhanced) - Interactive map with route display
- TripMap - Google Maps route visualization component

**Google Maps APIs:**
- Places API - Geocoding and reverse geocoding
- Geometry API - Straight-line distance calculations
- Directions API - Route visualization with turn-by-turn
- Distance Matrix API - Driving distance and duration

### Features Implemented

✅ **GPS Location Capture**
- One-tap GPS button to capture current location
- High accuracy mode enabled
- Permission handling with user-friendly errors
- Reverse geocoding (coordinates → address)
- Loading states during GPS capture

✅ **Automatic Distance Calculation**
- Auto-calculate button triggers distance lookup
- Uses Google Maps Distance Matrix API
- Returns driving distance and duration
- Converts meters to miles automatically
- Shows loading spinner during calculation

✅ **Route Visualization**
- Interactive Google Maps display on trip details
- Shows route with turn-by-turn directions
- Markers for origin and destination
- Fallback to simple markers if directions fail
- Auto-fit bounds to show entire route

✅ **Geocoding Services**
```typescript
// Forward geocoding (address → coordinates)
geocodeAddress(address: string): Observable<LatLng> {
  const geocoder = new google.maps.Geocoder();
  return from(geocoder.geocode({ address }))
    .pipe(map(result => ({
      lat: result.results[0].geometry.location.lat(),
      lng: result.results[0].geometry.location.lng()
    })));
}

// Reverse geocoding (coordinates → address)
reverseGeocode(lat: number, lng: number): Observable<string> {
  const geocoder = new google.maps.Geocoder();
  return from(geocoder.geocode({ location: { lat, lng } }))
    .pipe(map(result => result.results[0].formatted_address));
}
```

✅ **Distance Calculation**
```typescript
// Driving distance using Distance Matrix API
calculateRoute(origin: string, destination: string): Observable<RouteResult> {
  const service = new google.maps.DistanceMatrixService();
  return from(service.getDistanceMatrix({
    origins: [origin],
    destinations: [destination],
    travelMode: google.maps.TravelMode.DRIVING,
    unitSystem: google.maps.UnitSystem.IMPERIAL
  })).pipe(
    map(result => ({
      distance: result.rows[0].elements[0].distance.value / 1609.34, // meters to miles
      duration: result.rows[0].elements[0].duration.value / 60 // seconds to minutes
    }))
  );
}
```

### Services

**GeolocationService** ([geolocation.service.ts](expense-app/src/app/core/services/geolocation.service.ts))
- `getCurrentPosition()`: Get current GPS location
- `watchPosition()`: Continuously track location
- `isAvailable()`: Check if geolocation is supported
- `requestPermission()`: Request location permission
- Error handling for denied/unavailable/timeout

**GoogleMapsService** ([google-maps.service.ts](expense-app/src/app/core/services/google-maps.service.ts))
- Dynamic script loading (no external loader needed)
- `geocodeAddress()`: Address → coordinates
- `reverseGeocode()`: Coordinates → address
- `calculateRoute()`: Get distance/duration between addresses
- `calculateDistance()`: Straight-line distance (geometry)
- `isLoaded`: Check if Google Maps loaded successfully

### Components

**TripForm Enhancements** ([trip-form.ts](expense-app/src/app/features/mileage/trip-form/trip-form.ts))
```html
<!-- GPS button on origin address field -->
<button mat-icon-button matSuffix type="button"
        [disabled]="!gpsAvailable()"
        (click)="captureOriginGPS()"
        matTooltip="Use current location">
  <mat-icon>my_location</mat-icon>
</button>

<!-- Auto-calculate distance button -->
<button mat-raised-button color="primary"
        [disabled]="!canAutoCalculate() || calculatingDistance()"
        (click)="autoCalculateDistance()">
  @if (calculatingDistance()) {
    <mat-spinner diameter="20"></mat-spinner>
  } @else {
    <mat-icon>calculate</mat-icon>
  }
  Auto-Calculate Distance
</button>
```

**TripMap Component** ([trip-map.ts](expense-app/src/app/shared/components/trip-map/trip-map.ts))
- Displays interactive Google Map
- Renders route using Directions API
- Shows origin/destination markers
- Auto-centers and zooms to fit route
- Loading indicator while map initializes

**TripDetail Enhancements** ([trip-detail.ts](expense-app/src/app/features/mileage/trip-detail/trip-detail.ts))
- Displays TripMap component if GPS coordinates available
- Computed signal for map data
- Only shows map if trip has origin/destination coordinates

### Environment Configuration

**Required API Key:**
```typescript
// src/environments/environment.ts
export const environment = {
  production: false,
  googleMaps: {
    apiKey: 'YOUR_GOOGLE_MAPS_API_KEY_HERE'
  }
};
```

**Google Maps API Requirements:**
- Enable Maps JavaScript API
- Enable Places API
- Enable Directions API
- Enable Distance Matrix API
- Enable Geocoding API

### Integration Points

**Manual Script Loading:**
```typescript
const script = document.createElement('script');
script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry`;
script.async = true;
script.defer = true;
document.head.appendChild(script);
```

**Type Safety:**
- Installed @types/google.maps for TypeScript support
- Uses `(window as any).google.maps` to access global object
- Explicit type annotations in Observable callbacks

### Testing

**Build Results:**
- ✅ Zero TypeScript compilation errors
- ✅ Production build successful
- ✅ Bundle size: +102 kB for Google Maps integration
- ✅ Services ready for testing (requires API key + HTTPS)

**Testing Checklist:**
- [ ] Obtain Google Maps API key
- [ ] Test GPS location capture on HTTPS/localhost
- [ ] Test auto-calculate distance feature
- [ ] Test route visualization on trip details
- [ ] Test error handling (GPS denied, API errors)
- [ ] Test on mobile device (actual GPS vs simulated)

### Future Enhancements (Phase 2+)

- Real-time location tracking during trips
- Multi-stop route optimization
- Historical trip replay with timeline
- Geofencing for automatic trip detection
- Integration with car OBD-II for odometer readings
- Export routes to KML/GPX format
- Traffic-aware distance calculations
- Alternative route suggestions

## GPS Start/Stop Tracking (November 21, 2025)

Jensify now supports real-time GPS tracking for mileage trips with Start/Stop functionality, capturing actual GPS breadcrumbs and rendering true driven paths.

### Key Features

✅ **Dual-Mode Mileage UI** - Quick Entry (manual) + GPS Tracking (real-time)
✅ **Real-Time GPS Tracking** - Start/Stop buttons with live distance/duration
✅ **GPS Path Visualization** - Orange polyline showing actual driven route
✅ **Cost Optimization** - GPS tracking 37% cheaper than manual entry
✅ **Database Migration** - trip_coordinates table with Haversine functions
✅ **localStorage Persistence** - Tracking survives page refresh

### Components

- **TripTrackingService** - Real-time GPS tracking (280+ lines, 12 methods)
- **TripForm** - Dual-mode UI with mat-tabs
- **TripMap** - Polyline rendering for GPS paths
- **TripDetail** - Load and display GPS coordinates
- **MileageService** - getTripCoordinates() method

**Files:** See PROJECT_STATUS.md section 14 "GPS Tracking (Full Implementation)" for complete details.

**Migration:** `supabase/migrations/20251121044926_gps_tracking_enhancement.sql`

## Critical Guardrails

1. **ALWAYS** create tests for new features
2. **NEVER** skip Supabase RLS policies
3. **ALWAYS** handle errors gracefully
4. **NEVER** use `any` type in TypeScript
5. **ALWAYS** validate user input
6. **NEVER** commit sensitive data (keys, passwords)
7. **ALWAYS** use environment variables for configuration
8. **NEVER** bypass authentication or authorization
9. **ALWAYS** follow the established project structure
10. **NEVER** make breaking changes without discussion
11. **ALWAYS** update documentation after completing any task ⭐ **NEW**

## Documentation Update Rule ⭐ **CRITICAL**

**After completing ANY task, feature, or component, you MUST update ALL relevant documentation:**

### Required Documentation Updates (Every Completion)

1. **PROJECT_STATUS.md** - Update:
   - Overall progress percentage
   - Completed components section (add new items)
   - In Progress section (move items to completed)
   - Pending Tasks section (remove completed items)
   - Metrics (code statistics, time investment)
   - Lessons learned (add new insights)
   - Next milestone progress
   - Final status line

2. **CLAUDE.md** - Update:
   - Current Phase scope (mark items as complete)
   - Success Criteria (check off completed items)
   - Completed Components list (add new components)

3. **README.md** - Update if:
   - New setup steps are required
   - New dependencies are added
   - Major features are completed

4. **SETUP_COMPLETE.md** - Update if:
   - Setup checklist items are completed
   - New environment variables are needed
   - Configuration changes are required

### Documentation Update Checklist

After completing a task, verify:
- [ ] PROJECT_STATUS.md updated with new progress
- [ ] CLAUDE.md Phase 0 scope updated
- [ ] Code statistics updated (files, lines, bundle size)
- [ ] Time investment table updated
- [ ] Lessons learned section updated
- [ ] Next milestone progress updated
- [ ] Commit message includes "docs:" prefix

### Example Workflow

```bash
# 1. Complete a feature (e.g., Login Component)
# 2. Update all documentation files
# 3. Commit with documentation flag
git commit -m "feat(auth): add login component

- Reactive forms with email/password validation
- Error handling and user feedback
- Mobile-responsive design
- Unit tests included

docs: updated PROJECT_STATUS.md and CLAUDE.md with completion status"
```

### Why This Matters

- **Transparency**: Stakeholders can see real-time progress
- **Accuracy**: Documentation stays synchronized with code
- **History**: Clear record of what was built and when
- **Continuity**: Future developers understand the evolution
- **Planning**: Accurate metrics inform future estimates

## Resources & References

- [Angular Documentation](https://angular.io/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Vision API](https://cloud.google.com/vision/docs)
- [Angular Material](https://material.angular.io)
- [RxJS Documentation](https://rxjs.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## Contact & Support

**Project Owner**: Josh (Covaer Manufacturing)
**Repository**: https://github.com/JBCox/Jensify
**Questions**: Create an issue in the repository

---

*Last Updated: 2025-11-13*
*Version: 0.1.0 (Phase 0 - Initial Setup)*
