# Jensify - Completed Features

This document details all completed features in Jensify. For development guidelines, see `CLAUDE.md`. For current status, see `PROJECT_STATUS.md`.

## Table of Contents

1. [Organization Multi-Tenancy System](#organization-multi-tenancy-system)
2. [Expense Reports (Expensify-Style)](#expense-reports-expensify-style)
3. [Progressive Web App (PWA)](#progressive-web-app-pwa)
4. [Mileage Tracking with GPS](#mileage-tracking-with-gps)
5. [GPS Start/Stop Real-Time Tracking](#gps-startstop-real-time-tracking)
6. [Multi-Level Approval System](#multi-level-approval-system)

---

## Organization Multi-Tenancy System

**Completed:** November 15, 2024
**Files:** `supabase/migrations/20251115_organization_multi_tenancy.sql`, `20251115_organization_helper_functions.sql`

### Overview

Jensify supports full multi-tenant organization structure, allowing multiple companies to use the platform with complete data isolation.

### Architecture

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

✅ **User Management** ([/organization/users](expense-app/src/app/features/organization/user-management))
- Individual email invitations (Admin only)
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

### Helper Functions

**Database RPC Functions:**
- `create_organization_with_admin()` - Creates org + admin membership
- `get_organization_stats()` - Returns member/invitation counts
- `get_user_organization_context()` - Full user context
- `accept_invitation()` - Handles invitation acceptance

### Routing

- `/organization/setup` - Organization setup wizard
- `/organization/users` - User management (admin only)
- `/auth/accept-invitation?token={token}` - Accept invitation

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
  // ...
}).subscribe(/* ... */);
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

### Future Enhancements

- Multi-organization membership (users can switch between orgs)
- Department-based budgets and reporting
- Custom approval workflows per organization
- HRIS integration (BambooHR, Gusto) for auto-sync
- Domain-based auto-join
- SSO/SAML support
- Audit logs per organization

---

## Expense Reports (Expensify-Style)

**Completed:** November 18, 2024
**Files:** `supabase/migrations/20251118181705_expense_reports.sql`

### Overview

Expensify-style expense reporting allows users to group multiple expenses into reports for batch submission and approval.

### Architecture

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
Report: "Dallas Business Trip - November 2024"
├── Flight to Dallas ($350)
├── Hotel (3 nights) ($450)
├── Meals & Entertainment ($120)
├── Ground Transportation ($80)
└── Fuel ($55)
Total: $1,055 (submitted as single unit)
```

### Database Schema

**expense_reports table:**
```sql
CREATE TABLE expense_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);
```

**report_expenses table:**
```sql
CREATE TABLE report_expenses (
  report_id UUID REFERENCES expense_reports(id) ON DELETE CASCADE,
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (report_id, expense_id)
);
```

### Testing Results

- **Total Tests:** 207
- **Passing:** 194 (93.7%)
- **Bundle Size:** +102 kB (lazy loaded)
- **Build Time:** ~5.8 seconds

### Future Enhancements

- Report approval queue for managers
- Bulk approve/reject functionality
- Export report to PDF
- Email notifications on status changes
- Comments/notes on reports
- Report templates
- Per-diem calculations
- Integration with mileage tracking

---

## Progressive Web App (PWA)

**Completed:** November 21, 2024
**Files:** `ngsw-config.json`, `public/manifest.webmanifest`, `src/index.html`

### Overview

Jensify is a fully installable Progressive Web App with offline support, providing a native app-like experience on mobile and desktop.

### PWA Infrastructure

**Core Files:**
- `ngsw-config.json` - Service worker configuration
- `public/manifest.webmanifest` - PWA manifest (8 icons, shortcuts, theme)
- `src/index.html` - PWA meta tags and manifest link

### Features

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
- **InstallPrompt:** Banner to promote app installation (dismissible for 7 days)
- **OfflineIndicator:** Red banner at top when offline

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

### Future Enhancements

- Push notifications for expense approvals
- Background sync for large file uploads
- Periodic background sync for data refresh
- Share target API (share receipts from camera)
- File handling API (open receipts from file explorer)

---

## Mileage Tracking with GPS

**Completed:** November 21, 2024
**Files:** Multiple services and components

### Overview

GPS-based mileage tracking with automatic distance calculation and route visualization using Google Maps.

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

### Features

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

### Google Maps APIs Used

- **Places API** - Geocoding and reverse geocoding
- **Geometry API** - Straight-line distance calculations
- **Directions API** - Route visualization with turn-by-turn
- **Distance Matrix API** - Driving distance and duration

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

### Code Examples

**Forward Geocoding (address → coordinates):**
```typescript
geocodeAddress(address: string): Observable<LatLng> {
  const geocoder = new google.maps.Geocoder();
  return from(geocoder.geocode({ address }))
    .pipe(map(result => ({
      lat: result.results[0].geometry.location.lat(),
      lng: result.results[0].geometry.location.lng()
    })));
}
```

**Reverse Geocoding (coordinates → address):**
```typescript
reverseGeocode(lat: number, lng: number): Observable<string> {
  const geocoder = new google.maps.Geocoder();
  return from(geocoder.geocode({ location: { lat, lng } }))
    .pipe(map(result => result.results[0].formatted_address));
}
```

**Distance Calculation:**
```typescript
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

### Future Enhancements

- Real-time location tracking during trips
- Multi-stop route optimization
- Historical trip replay with timeline
- Geofencing for automatic trip detection
- Integration with car OBD-II for odometer readings
- Export routes to KML/GPX format
- Traffic-aware distance calculations
- Alternative route suggestions

---

## GPS Start/Stop Real-Time Tracking

**Completed:** November 21, 2024
**Files:** See PROJECT_STATUS.md section 14 for complete file list
**Migration:** `supabase/migrations/20251121044926_gps_tracking_enhancement.sql`

### Overview

Real-time GPS tracking for mileage trips with Start/Stop functionality, capturing actual GPS breadcrumbs and rendering true driven paths.

### Key Features

✅ **Dual-Mode Mileage UI** - Quick Entry (manual) + GPS Tracking (real-time)
✅ **Real-Time GPS Tracking** - Start/Stop buttons with live distance/duration
✅ **GPS Path Visualization** - Orange polyline showing actual driven route
✅ **Cost Optimization** - GPS tracking 37% cheaper than manual entry
✅ **Database Migration** - trip_coordinates table with Haversine functions
✅ **localStorage Persistence** - Tracking survives page refresh

### Architecture

**TripTrackingService** (280+ lines, 12 methods)
- `startTracking()` - Begins GPS watch with 10-second intervals
- `stopTracking()` - Ends GPS watch and calculates total distance
- `pauseTracking()` / `resumeTracking()` - Pause/resume functionality
- `getTrackingState()` - Observable for real-time UI updates
- `saveTrackingData()` - Persists coordinates to database
- `loadTrackingData()` - Retrieves coordinates for visualization
- Haversine distance calculation (GPS breadcrumbs)
- localStorage persistence (survives page refresh)

**Database Schema:**
```sql
CREATE TABLE trip_coordinates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID REFERENCES mileage_trips(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  sequence_number INTEGER NOT NULL
);

CREATE INDEX idx_trip_coordinates_trip_id ON trip_coordinates(trip_id);
CREATE INDEX idx_trip_coordinates_timestamp ON trip_coordinates(timestamp);
```

**Haversine Function:**
```sql
CREATE OR REPLACE FUNCTION calculate_haversine_distance(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
) RETURNS DOUBLE PRECISION AS $$
-- Returns distance in miles
-- Implementation using Earth's radius (3959 miles)
$$;
```

### Components

**TripForm** ([trip-form.ts](expense-app/src/app/features/mileage/trip-form/trip-form.ts))
- Mat-tabs for dual-mode UI (Quick Entry vs GPS Tracking)
- Real-time distance/duration display during tracking
- Start/Stop/Pause/Resume buttons
- Visual feedback for tracking state
- Auto-saves tracking data to database on stop

**TripMap** ([trip-map.ts](expense-app/src/app/shared/components/trip-map/trip-map.ts))
- Renders GPS path as orange polyline
- Displays origin/destination markers
- Auto-fits bounds to show entire route
- Supports both manual routes (Directions API) and GPS paths

**TripDetail** ([trip-detail.ts](expense-app/src/app/features/mileage/trip-detail/trip-detail.ts))
- Loads GPS coordinates from database
- Displays interactive map with GPS path
- Shows trip metadata (distance, duration, cost)

### User Workflow

1. Navigate to /mileage/new
2. Select "GPS Tracking" tab
3. Click "Start Tracking" button
4. Drive to destination (GPS captures breadcrumbs every 10 seconds)
5. Click "Stop Tracking" button
6. Review trip details (distance, duration, cost)
7. Submit trip for approval

### Cost Comparison

| Feature | Manual Entry | GPS Tracking | Savings |
|---------|--------------|--------------|---------|
| Distance Matrix API | $5.00/1000 | $0/1000 | 100% |
| Directions API | $5.00/1000 | $3.15/1000 | 37% |
| Geocoding API | $5.00/1000 | $0/1000 | 100% |
| **Total Cost** | **$15.00/1000** | **$9.45/1000** | **37%** |

### localStorage Persistence

**Data Structure:**
```typescript
interface TrackingState {
  isTracking: boolean;
  isPaused: boolean;
  startTime: string | null;
  coordinates: GPSCoordinate[];
  totalDistance: number;
  elapsedTime: number;
}
```

**Storage Key:** `jensify_trip_tracking_state`

**Benefits:**
- Survives page refresh
- Prevents data loss on accidental navigation
- Auto-recovery on app restart
- Clear on successful trip submission

### Testing

**Build Results:**
- ✅ Zero TypeScript compilation errors
- ✅ Production build successful
- ✅ All 207 tests passing
- ✅ Migration applied successfully to local and production databases

**Testing Checklist:**
- [x] Start tracking captures GPS coordinates
- [x] Stop tracking calculates total distance
- [x] Pause/resume functionality works
- [x] localStorage persists across page refresh
- [x] GPS path renders correctly on map
- [x] Distance calculation matches Haversine formula
- [ ] Test on actual mobile device with GPS
- [ ] Test battery consumption during long trips
- [ ] Test accuracy in urban environments (GPS drift)

### Future Enhancements

- Battery optimization (dynamic polling intervals)
- Offline queueing for GPS coordinates
- Trip auto-pause detection (stopped for >5 minutes)
- Multi-stop trip support
- Real-time map during tracking (live breadcrumb trail)
- Export GPS data to GPX/KML format
- Integration with vehicle OBD-II for odometer readings
- Machine learning for route optimization

---

## Multi-Level Approval System

**Completed:** November 23, 2024
**Files:** `supabase/migrations/20251123000001_multi_level_approval_system.sql`, `20251123000002_approval_engine_functions.sql`

### Overview

Jensify implements a sophisticated multi-level approval system that routes expenses and reports through sequential approval chains based on configurable workflows, amount thresholds, and role-based permissions. This matches enterprise-grade expense management platforms like Concur, Ramp, and Brex.

### Architecture

**Database Structure:**
- `approval_workflows` - Configurable approval routing rules
- `workflow_steps` - Sequential approval steps with role requirements
- `approvals` - Individual approval instances for expenses/reports
- `approval_actions` - Complete audit trail of all approval/rejection actions

**Core Engine:**
- Automatic workflow selection based on amount thresholds
- Sequential multi-step approval chains
- Role-based approver assignment
- Complete audit trail with timestamps and comments
- Real-time status tracking

**Row-Level Security (RLS):**
- Employees see their submitted items + approvals they need to act on
- Managers see their team's approvals
- Finance sees all approvals for reimbursement tracking
- Admins have full visibility and configuration access

### Key Features

✅ **Approval Queue** ([/approvals](expense-app/src/app/features/approvals/approval-queue))
- View all pending approvals requiring action
- Filter by amount range, date range, type (expense/report)
- Submitter information with avatars
- Workflow progress indicators (current step / total steps)
- Quick actions: Approve, Reject, View Details, View History
- Material table with sorting and pagination
- Real-time refresh after approval/rejection

✅ **Approve/Reject Modals**
- **Approve Dialog** - Optional comment field for approval notes
- **Reject Dialog** - Required rejection reason (min 10 characters) + optional comment
- Approval summary (submitter, merchant, amount, workflow, step)
- Form validation with clear error messages
- Success/error notifications via snackbar

✅ **Approval History Timeline** ([approval-history](expense-app/src/app/features/approvals/approval-history))
- Beautiful vertical timeline of all approval actions
- Color-coded markers (green=approved, red=rejected, blue=submitted)
- Actor information (who performed the action)
- Workflow step details
- Comments and rejection reasons
- Timestamps for full audit trail
- Glassmorphism dark mode styling

✅ **Admin Approval Settings** ([/approvals/settings](expense-app/src/app/features/approvals/approval-settings))
- Configure approval workflows (name, description, type, active/inactive)
- Amount thresholds (min/max amounts to trigger workflow)
- Dynamic approval steps with drag-and-drop reordering
- Role assignment per step (Manager, Finance, Admin)
- Create/Edit/Delete workflows
- Toggle workflow active status
- Workflows table with search and filters

✅ **Approval Engine (Database Functions)**
- `create_approval()` - Automatic workflow selection and routing
- `approve_expense()` / `approve_report()` - Process approvals, auto-advance to next step
- `reject_expense()` / `reject_report()` - Handle rejections, notify submitter
- `get_next_approver()` - Intelligent approver assignment based on role hierarchy
- Automatic status updates (pending → approved → reimbursed)

### Workflow Configuration

**Workflow Types:**
- **Expense** - Individual expense approvals
- **Report** - Batch report approvals

**Approval Steps:**
- Sequential chain of approvers
- Each step requires specific role (Manager, Finance, Admin)
- Configurable step order with drag-and-drop UI
- Optional descriptions for guidance

**Amount-Based Routing:**
```sql
-- Example: Small expenses (<$500) → Manager only
-- Medium expenses ($500-$5000) → Manager → Finance
-- Large expenses (>$5000) → Manager → Finance → Admin

workflow_1: min_amount = null, max_amount = 500
  step_1: Manager (step_order = 1)

workflow_2: min_amount = 500, max_amount = 5000
  step_1: Manager (step_order = 1)
  step_2: Finance (step_order = 2)

workflow_3: min_amount = 5000, max_amount = null
  step_1: Manager (step_order = 1)
  step_2: Finance (step_order = 2)
  step_3: Admin (step_order = 3)
```

### Approval Status Lifecycle

```
draft → submitted → pending_approval → approved → reimbursed
                                    ↓
                                 rejected (can be corrected and resubmitted)
```

**Status Meanings:**
- **draft** - User is editing, not yet submitted
- **submitted** - Submitted, creating approval workflow
- **pending_approval** - Awaiting approver action
- **approved** - All approval steps completed, ready for reimbursement
- **rejected** - Rejected at any step, can be edited and resubmitted
- **reimbursed** - Finance marked as paid (final state)

### Database Functions

**create_approval()**
```sql
-- Automatically called when expense/report is submitted
-- Selects appropriate workflow based on amount
-- Creates approval record with first step
-- Assigns to first approver based on role + manager hierarchy

SELECT create_approval('expense', expense_id, organization_id);
```

**approve_expense() / approve_report()**
```sql
-- Records approval action with comment
-- Advances to next step if available
-- Updates status to 'approved' if final step
-- Returns true on success

SELECT approve_expense(approval_id, approver_id, 'Approved - looks good');
```

**reject_expense() / reject_report()**
```sql
-- Records rejection action with reason + comment
-- Updates status to 'rejected'
-- Notifies submitter (via trigger or edge function)
-- Allows resubmission after corrections

SELECT reject_expense(approval_id, approver_id, 'Receipt unclear', 'Please upload better quality image');
```

### Services

**ApprovalService** ([core/services/approval.service.ts](expense-app/src/app/core/services/approval.service.ts))
- `getPendingApprovals(filters?)` - Fetch approvals requiring action
- `approve(approvalId, comment?)` - Approve with optional comment
- `reject(approvalId, reason, comment?)` - Reject with required reason
- `getApprovalHistory(approvalId)` - Fetch complete action timeline
- `getWorkflows()` - Admin: fetch all workflows
- `createWorkflow(data)` - Admin: create new workflow
- `updateWorkflow(id, data)` - Admin: update workflow
- `deleteWorkflow(id)` - Admin: delete workflow
- `getStatusColor(status)` - UI helper for status badges
- `getStatusDisplay(status)` - UI helper for status text

### UI Components

**Approval Queue** ([approval-queue](expense-app/src/app/features/approvals/approval-queue))
- Material table with approvals data
- Reactive filters (amount range, date range)
- Real-time filtering with RxJS observables
- Approve/Reject buttons open modal dialogs
- View Details navigates to expense/report detail page
- View History opens timeline dialog
- Auto-refresh after approval/rejection

**Approve Dialog** ([approve-dialog](expense-app/src/app/features/approvals/approve-dialog))
- Approval summary card
- Optional comment field
- Form validation
- Success/error handling
- Jensify orange theme with green success accent

**Reject Dialog** ([reject-dialog](expense-app/src/app/features/approvals/reject-dialog))
- Approval summary card
- Required rejection reason (min 10 characters)
- Optional additional comment
- Warning message about rejection impact
- Form validation
- Jensify orange theme with red danger accent

**Approval History Dialog** ([approval-history](expense-app/src/app/features/approvals/approval-history))
- Vertical timeline layout
- Color-coded action markers
- Actor avatars and names
- Workflow step information
- Comments and rejection reasons
- Timestamps with formatted dates
- Responsive mobile layout

**Approval Settings** ([approval-settings](expense-app/src/app/features/approvals/approval-settings))
- Workflows table with CRUD operations
- Create/Edit workflow form
- Dynamic step configuration
- Drag-and-drop step reordering
- Amount threshold configuration
- Active/Inactive toggle
- Delete confirmation dialogs

### Guards

**managerGuard** - Protects `/approvals` route
- Allows Manager, Finance, Admin roles
- Redirects employees to home

**adminGuard** - Protects `/approvals/settings` route
- Allows Admin role only
- Redirects non-admins to home

### Routing

- `/approvals` - Approval Queue (Manager+)
- `/approvals/settings` - Approval Settings (Admin only)

### Usage Examples

**Submit Expense for Approval:**
```typescript
// In ExpenseService
submitExpense(expenseId: string): Observable<Expense> {
  return this.supabase
    .from('expenses')
    .update({ status: 'submitted' })
    .eq('id', expenseId)
    .select('*, user:profiles(*)')
    .single()
    .pipe(
      map(({ data, error }) => {
        if (error) throw error;
        // Database trigger calls create_approval() automatically
        return data;
      })
    );
}
```

**Approve Expense:**
```typescript
// In ApprovalQueue component
onApprove(approval: ApprovalWithDetails): void {
  const dialogRef = this.dialog.open(ApproveDialog, {
    width: '600px',
    data: { approval }
  });

  dialogRef.afterClosed().subscribe(result => {
    if (result) {
      this.approvalService.approve(approval.id, result.comment).subscribe({
        next: () => {
          this.snackBar.open('Approved successfully', 'Close', { duration: 3000 });
          this.loadApprovals(); // Refresh list
        },
        error: (error) => {
          this.snackBar.open('Failed to approve', 'Close', { duration: 5000 });
        }
      });
    }
  });
}
```

**Create Approval Workflow:**
```typescript
// In ApprovalSettings component
const workflow = {
  name: 'Standard Expense Approval',
  description: 'Expenses under $500 require manager approval only',
  type: 'expense',
  min_amount: null,
  max_amount: 500,
  active: true,
  steps: [
    {
      name: 'Manager Review',
      step_order: 1,
      required_role: 'manager',
      description: 'Manager reviews for policy compliance'
    }
  ]
};

approvalService.createWorkflow(workflow).subscribe({
  next: () => {
    this.snackBar.open('Workflow created successfully', 'Close');
    this.loadWorkflows();
  }
});
```

**View Approval History:**
```typescript
// In ApprovalQueue component
onViewHistory(approval: ApprovalWithDetails): void {
  this.dialog.open(ApprovalHistoryDialog, {
    width: '700px',
    data: { approval }
  });
}
```

### Testing

**Build Results:**
- ✅ Zero TypeScript compilation errors
- ✅ Production build successful
- ✅ All migrations applied to local and production databases
- ✅ RLS policies tested and verified

**Testing Checklist:**
- [x] Create approval workflow in settings
- [x] Submit expense triggers approval creation
- [x] Correct workflow selected based on amount
- [x] Approver assignment follows role hierarchy
- [x] Approve action advances to next step
- [x] Reject action updates status and notifies submitter
- [x] Approval history shows complete audit trail
- [x] Multi-step approvals process sequentially
- [x] Amount threshold routing works correctly
- [ ] Email notifications for approval requests
- [ ] Email notifications for rejections
- [ ] Bulk approval actions
- [ ] Approval delegation

### Future Enhancements

- Email notifications via Supabase Edge Functions
- Approval delegation (out-of-office routing)
- Bulk approve/reject multiple items
- Approval SLA tracking (time to approve)
- Escalation rules (auto-approve if no action within X days)
- Conditional routing (category-based, department-based)
- Approval templates for common scenarios
- Mobile push notifications
- Integration with Slack/Teams for approvals
- Advanced reporting and analytics
- Approval bottleneck detection
- Workflow simulation and testing tools

### Security Considerations

✅ **Row-Level Security (RLS):**
- All approval tables have RLS policies
- Users can only see approvals they're involved with
- Admins have full visibility for configuration

✅ **Validation:**
- Rejection reason required (min 10 characters)
- Workflow configuration validated before save
- Amount thresholds checked for overlaps
- Step order validated for duplicates

✅ **Audit Trail:**
- Complete history of all actions
- Immutable approval_actions records
- Timestamps for all changes
- Actor tracking (who approved/rejected)

✅ **Authorization:**
- Guards prevent unauthorized route access
- Database functions verify user roles
- Approver assignment respects hierarchy
- Admin-only workflow configuration

---

## Documentation Index

For more information, see:

- **CLAUDE.md** - Development guidelines and coding standards
- **PROJECT_STATUS.md** - Current progress and metrics
- **HOW_JENSIFY_WORKS.md** - System architecture overview
- **DOCUMENTATION_INDEX.md** - Complete documentation catalog
- **FIX_AND_PREVENT_SYNC_ISSUES.md** - Database migration workflow

---

*Last Updated: 2024-11-27*
*Version: 0.1.0 (Phase 0 - Expense Receipt MVP)*
