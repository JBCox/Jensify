# Jensify - Product Specification

## Executive Summary

Jensify is a modern expense management platform designed initially for Covaer Manufacturing to track gas receipts for traveling employees, with a roadmap to become a full-featured platform competing with Expensify, Ramp, and Brex.

**Version**: 0.1.0
**Last Updated**: 2025-11-13
**Status**: Phase 0 - MVP Development

---

## Product Vision

### Problem Statement
Covaer Manufacturing employees travel frequently and incur gas expenses. Currently, there's no efficient system to:
- Capture and process gas receipts
- Extract receipt data automatically
- Track reimbursement status
- Generate expense reports for accounting

### Solution
A mobile-first web application that allows employees to:
1. Snap photos of gas receipts
2. Automatically extract receipt data using OCR
3. Submit expenses for reimbursement
4. Track reimbursement status

And allows finance team to:
1. Review all submitted expenses
2. Filter and search expenses
3. Export data to CSV for accounting
4. Mark expenses as reimbursed

---

## User Personas

### 1. Employee (Primary User)
**Name**: Mike the Driver
**Role**: Delivery Driver
**Goals**:
- Quickly submit gas receipts
- Ensure accurate data extraction
- Track reimbursement status

**Pain Points**:
- Receipts get lost or damaged
- Manual data entry is time-consuming
- Unclear reimbursement status

**Technical Proficiency**: Basic (uses smartphone daily)

### 2. Finance Administrator (Secondary User)
**Name**: Sarah the Finance Manager
**Role**: Finance/Accounting Manager
**Goals**:
- Review all expenses efficiently
- Export data for QuickBooks
- Ensure policy compliance
- Process reimbursements quickly

**Pain Points**:
- Manual expense review is tedious
- Difficult to track reimbursement status
- Data entry errors from handwritten receipts

**Technical Proficiency**: Intermediate (uses accounting software daily)

### 3. System Administrator (Future)
**Name**: Josh the IT Manager
**Role**: IT/Operations Manager
**Goals**:
- Configure system settings
- Manage users and permissions
- Set expense policies

**Technical Proficiency**: Advanced

---

## PHASE 0: Gas Receipt MVP

### Overview
**Timeline**: 2-3 weeks
**Scope**: Essential features for gas receipt tracking only
**Success Metric**: 90% of gas receipts successfully processed with minimal manual correction

---

### Feature 1: User Authentication

#### F1.1 User Registration
**Priority**: P0 (Critical)
**User Story**: As an employee, I want to create an account so that I can submit expenses.

**Acceptance Criteria**:
- User can register with email and password
- Password requirements: minimum 8 characters, one uppercase, one number
- Email verification required (Supabase Auth)
- Automatic role assignment: "employee" by default
- Success message shown after registration
- Redirect to login page after successful registration

**UI Requirements**:
- Clean registration form with fields:
  - Full Name (required)
  - Email (required, validated)
  - Password (required, show/hide toggle)
  - Confirm Password (required, must match)
- Submit button disabled until all fields valid
- Loading spinner during submission
- Error messages displayed inline

**Technical Requirements**:
- Use Supabase Auth for user management
- Store additional user data in `users` table
- Hash passwords (handled by Supabase)
- Implement email verification flow

**Validation Rules**:
- Email: Valid email format
- Password: Min 8 chars, 1 uppercase, 1 number, 1 special character
- Full Name: Min 2 chars, max 100 chars
- All fields required

---

#### F1.2 User Login
**Priority**: P0 (Critical)
**User Story**: As a registered user, I want to log in so that I can access my expenses.

**Acceptance Criteria**:
- User can log in with email and password
- Invalid credentials show appropriate error message
- Successful login redirects to dashboard
- Session persists across page refreshes
- "Remember me" option (7-day session vs. default)
- "Forgot password" link available

**UI Requirements**:
- Login form with fields:
  - Email (required)
  - Password (required, show/hide toggle)
  - Remember me checkbox
- Submit button disabled while logging in
- Loading spinner during authentication
- Error messages displayed prominently

**Technical Requirements**:
- Use Supabase Auth session management
- Store JWT token securely
- Implement auto-refresh token mechanism
- Redirect to originally requested page after login

---

#### F1.3 Password Reset
**Priority**: P1 (High)
**User Story**: As a user, I want to reset my password if I forget it.

**Acceptance Criteria**:
- User can request password reset via email
- Password reset link sent to registered email
- Link expires after 1 hour
- User can set new password via link
- Success message shown after reset
- Automatic login after password reset

---

### Feature 2: Receipt Upload & OCR

#### F2.1 Receipt Photo Capture
**Priority**: P0 (Critical)
**User Story**: As an employee, I want to take a photo of my gas receipt so that I can submit it for reimbursement.

**Acceptance Criteria**:
- Mobile: Direct camera access
- Desktop: File upload (drag-and-drop or click)
- Supported formats: JPG, PNG, PDF
- Max file size: 5MB
- Image preview before upload
- Ability to retake/re-upload
- Multiple receipts can be queued (Phase 1)

**UI Requirements**:
- Large, prominent "Add Receipt" button
- Camera interface on mobile devices
- Drag-and-drop zone on desktop
- File type and size validation
- Preview thumbnail after capture
- Clear error messages for invalid files

**Technical Requirements**:
- Use HTML5 File API and Camera API
- Validate file type and size client-side
- Upload to Supabase Storage
- Generate unique file names (UUID)
- Compress images if > 2MB before upload
- Store file metadata in `receipts` table

**Edge Cases**:
- No camera permission: Fallback to file upload
- Offline: Queue upload for when online
- Large files: Show compression progress
- Upload failure: Allow retry

---

#### F2.2 OCR Processing (Google Vision API)
**Priority**: P0 (Critical)
**User Story**: As an employee, I want receipt data extracted automatically so that I don't have to type it manually.

**Acceptance Criteria**:
- OCR triggered automatically after upload
- Extract the following fields:
  - Merchant name
  - Date and time of purchase
  - Total amount
  - Tax amount (if visible)
  - Payment method (if visible)
  - Address (for location tracking)
- Processing completes within 3 seconds
- Confidence score displayed for each field
- User can see OCR status (processing, completed, failed)
- Fallback: Manual entry if OCR fails

**UI Requirements**:
- Loading indicator during OCR processing
- Progress message: "Extracting data from receipt..."
- Display extracted fields with confidence indicators
- Highlight low-confidence fields for review
- Allow inline editing of any field

**Technical Requirements**:
- Integrate Google Vision API
- Use TEXT_DETECTION and DOCUMENT_TEXT_DETECTION
- Parse response to extract structured data:
  - Merchant: First line or business name
  - Date: Look for date patterns (MM/DD/YYYY, etc.)
  - Amount: Look for "Total", "Amount", patterns
  - Tax: Look for "Tax", "GST", "VAT" patterns
- Store raw OCR data in `receipts.ocr_data` (JSONB)
- Store extracted fields in separate columns
- Store confidence scores
- Handle API errors gracefully

**OCR Parsing Rules**:
```
Merchant Name:
  - First line of text OR
  - Line containing common business words (store, shop, gas, fuel)
  - Clean up extra spaces and special characters

Date:
  - Match patterns: MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD
  - Look for keywords: "Date", "Date:", "Transaction Date"
  - Default to today if not found

Amount:
  - Look for "Total", "Amount Due", "Balance", "Total Sale"
  - Match currency patterns: $XX.XX, XX.XX USD
  - Take highest amount found (usually total)

Tax:
  - Look for "Tax", "Sales Tax", "GST", "VAT"
  - Match amount patterns near tax keywords
  - Optional field

Address:
  - Look for address patterns (street, city, state, zip)
  - Usually near top of receipt
  - Optional field
```

**Error Handling**:
- API failure: Show user-friendly message, enable manual entry
- Low confidence (< 70%): Flag field for review
- Missing required fields: Prompt user to enter manually
- Invalid data format: Show validation errors

---

#### F2.3 OCR Data Verification
**Priority**: P0 (Critical)
**User Story**: As an employee, I want to verify and correct OCR data before submitting so that my expense is accurate.

**Acceptance Criteria**:
- All extracted fields displayed in editable form
- User can modify any field
- Required fields clearly marked
- Real-time validation as user types
- Save draft without submitting
- Submit button enabled only when all required fields valid
- Receipt image displayed alongside form for reference

**UI Requirements**:
- Split view: Receipt image on left, form on right (desktop)
- Stacked view: Image above, form below (mobile)
- Form fields:
  - Merchant (required, text input)
  - Date (required, date picker)
  - Total Amount (required, currency input with $ symbol)
  - Tax Amount (optional, currency input)
  - Category (dropdown: "Fuel/Gas" default for Phase 0)
  - Notes (optional, textarea)
- Visual indicators:
  - Green check for high confidence fields (>90%)
  - Yellow warning for low confidence fields (<70%)
  - Red error for validation failures
- Buttons: "Save Draft", "Submit Expense"

**Validation Rules**:
- Merchant: Required, 2-100 characters
- Date: Required, cannot be in future, not older than 90 days
- Amount: Required, > $0, max $500 (policy limit)
- Tax: Optional, if provided must be ≥ $0
- Notes: Optional, max 500 characters

**Technical Requirements**:
- Use Angular Reactive Forms
- Implement custom validators
- Debounce input validation (300ms)
- Auto-save draft every 30 seconds
- Store draft in local storage as backup

---

### Feature 3: Expense Management

#### F3.1 Expense List View (Employee)
**Priority**: P0 (Critical)
**User Story**: As an employee, I want to see all my submitted expenses so that I can track their status.

**Acceptance Criteria**:
- Display all expenses for logged-in user
- Show expense details:
  - Receipt thumbnail
  - Merchant name
  - Date
  - Amount
  - Status (Draft, Submitted, Approved, Rejected, Reimbursed)
  - Submission date
- Sort options: Date (newest first, oldest first), Amount (high to low, low to high)
- Filter by status
- Search by merchant name
- Pagination (20 expenses per page)
- Click expense to view details

**UI Requirements**:
- Card-based layout on mobile
- Table layout on desktop
- Status badges with color coding:
  - Draft: Gray
  - Submitted: Blue
  - Approved: Green
  - Rejected: Red
  - Reimbursed: Purple
- Empty state: "No expenses yet" with "Add Receipt" button
- Loading skeleton while fetching data

**Technical Requirements**:
- Fetch expenses from Supabase with RLS
- Use pagination (limit 20, offset-based)
- Implement client-side filtering and sorting
- Cache results for 5 minutes
- Real-time updates when new expense added

---

#### F3.2 Expense Detail View
**Priority**: P1 (High)
**User Story**: As an employee, I want to view my expense details so that I can see the full information and status.

**Acceptance Criteria**:
- Display all expense information:
  - Full receipt image (zoomable)
  - All extracted and verified fields
  - Submission date/time
  - Status with timestamp
  - Reimbursement date (if applicable)
  - Any comments from finance (Phase 1)
- Actions based on status:
  - Draft: Edit or Delete
  - Submitted: View only
  - Rejected: View rejection reason, Edit and Resubmit
  - Approved/Reimbursed: View only

**UI Requirements**:
- Full-screen receipt viewer with zoom and pan
- Information displayed in clear sections
- Status timeline showing progression
- Action buttons at bottom
- Back button to return to list

---

#### F3.3 Submit Expense
**Priority**: P0 (Critical)
**User Story**: As an employee, I want to submit my verified expense so that it can be reviewed for reimbursement.

**Acceptance Criteria**:
- User can submit expense from verification screen
- Confirmation dialog before submission
- Expense status changes to "Submitted"
- User receives confirmation message
- Cannot edit expense after submission
- User redirected to expense list after submission

**UI Requirements**:
- Primary "Submit Expense" button
- Confirmation modal:
  - "Are you sure you want to submit this expense?"
  - Show expense summary (merchant, date, amount)
  - "Cancel" and "Confirm" buttons
- Success toast: "Expense submitted successfully!"

**Technical Requirements**:
- Update expense status in database
- Set `submitted_at` timestamp
- Cannot modify expense after submission (enforce in RLS)
- Trigger notification to finance team (Phase 1)

---

### Feature 4: Finance Dashboard

#### F4.1 All Expenses View (Finance)
**Priority**: P0 (Critical)
**User Story**: As a finance admin, I want to see all submitted expenses so that I can review and process them.

**Acceptance Criteria**:
- Display all expenses from all employees
- Show employee name with each expense
- Filter by:
  - Employee
  - Date range
  - Status
  - Amount range
- Search by merchant or employee name
- Sort by date, amount, employee
- Bulk selection for actions (Phase 1)
- Export selected/filtered expenses to CSV

**UI Requirements**:
- Table layout with columns:
  - Receipt thumbnail
  - Employee name
  - Merchant
  - Date
  - Amount
  - Status
  - Actions (View, Mark Reimbursed)
- Filter panel (collapsible on mobile)
- Search bar at top
- Export button
- Summary cards at top:
  - Total pending expenses
  - Total amount pending
  - Total reimbursed this month

**Technical Requirements**:
- Fetch all expenses with employee info (JOIN users)
- RLS policy: Only finance role can view all expenses
- Implement server-side filtering for large datasets
- Pagination with limit 50
- Real-time updates when expenses submitted

---

#### F4.2 Mark Expense as Reimbursed
**Priority**: P0 (Critical)
**User Story**: As a finance admin, I want to mark expenses as reimbursed so that employees know they've been paid.

**Acceptance Criteria**:
- Finance can click "Mark Reimbursed" button on any submitted expense
- Confirmation dialog shown
- Expense status changes to "Reimbursed"
- `reimbursed_at` timestamp recorded
- Employee notified (Phase 1)
- Cannot un-mark once reimbursed (requires admin role in future)

**UI Requirements**:
- "Mark Reimbursed" button on each expense row
- Confirmation modal:
  - "Mark this expense as reimbursed?"
  - Show expense details
  - "Cancel" and "Confirm" buttons
- Success toast notification
- Button disabled after action

---

#### F4.3 Export to CSV
**Priority**: P0 (Critical)
**User Story**: As a finance admin, I want to export expenses to CSV so that I can import them into QuickBooks.

**Acceptance Criteria**:
- Export button on dashboard
- Exports currently filtered/selected expenses
- CSV includes columns:
  - Employee Name
  - Employee Email
  - Merchant
  - Date
  - Amount
  - Tax
  - Category
  - Status
  - Submitted Date
  - Reimbursed Date
  - Receipt URL
- File naming: `expenses_YYYY-MM-DD.csv`
- Download starts immediately
- Success message shown

**UI Requirements**:
- "Export to CSV" button in header
- Loading indicator during export
- Success toast: "Exported X expenses to CSV"

**Technical Requirements**:
- Generate CSV client-side using library (e.g., PapaParse)
- Format dates consistently (YYYY-MM-DD)
- Format currency with 2 decimal places
- Escape special characters in CSV
- Include header row

**CSV Format Example**:
```csv
Employee Name,Employee Email,Merchant,Date,Amount,Tax,Category,Status,Submitted Date,Reimbursed Date,Receipt URL
John Doe,john@covaer.com,Shell Gas Station,2025-11-10,45.50,3.50,Fuel,Reimbursed,2025-11-11,2025-11-12,https://...
```

---

### Feature 5: Basic Policy Enforcement

#### F5.1 Gas Receipt Policy Rules (Phase 0)
**Priority**: P1 (High)
**User Story**: As a finance admin, I want expenses to be checked against policy rules so that invalid expenses are flagged.

**Initial Policy Rules**:
1. Max single receipt amount: $500
2. Max per-day total: $750
3. Date cannot be > 90 days old
4. Date cannot be in future
5. Receipt must be legible (future: image quality check)

**Acceptance Criteria**:
- Policy checks run automatically when expense submitted
- Policy violations flagged but don't block submission
- Violations displayed to finance on dashboard
- Violations displayed to employee when submitting
- Warning messages clear and actionable

**UI Requirements**:
- Warning banner on submission if policy violated:
  - "⚠️ This expense may violate company policy: [reason]"
  - "You can still submit, but it may require additional review"
- Finance dashboard shows violation icon on expenses
- Tooltip/modal with violation details

**Technical Requirements**:
- Policy checks in service layer
- Store violations in `expenses.policy_violations` (JSONB array)
- Example structure:
```json
[
  {
    "rule": "max_single_receipt",
    "limit": 500,
    "actual": 550,
    "message": "Receipt amount exceeds $500 limit"
  }
]
```

---

### Feature 6: User Roles & Permissions

#### F6.1 Role-Based Access Control
**Priority**: P0 (Critical)

**Roles**:
1. **Employee** (default)
   - View own expenses
   - Create, edit (draft only), submit expenses
   - Upload receipts
   - Cannot view other employees' expenses

2. **Finance**
   - All employee permissions
   - View all expenses from all employees
   - Mark expenses as reimbursed
   - Export data to CSV
   - View analytics (Phase 1)

3. **Admin** (Phase 1)
   - All finance permissions
   - Manage users (create, edit, delete)
   - Configure policy rules
   - View audit logs
   - System settings

**Technical Requirements**:
- Role stored in `users.role` column
- RLS policies enforce role-based data access
- Route guards prevent unauthorized access
- UI elements conditionally rendered based on role

**RLS Policies**:
```sql
-- Employees can only see their own expenses
CREATE POLICY "Employees view own expenses"
ON expenses FOR SELECT
USING (auth.uid() = user_id);

-- Finance can see all expenses
CREATE POLICY "Finance view all expenses"
ON expenses FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('finance', 'admin')
  )
);

-- Only finance can update reimbursed status
CREATE POLICY "Finance mark reimbursed"
ON expenses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('finance', 'admin')
  )
);
```

---

## Data Model (Phase 0)

### Tables

#### users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  department TEXT,
  manager_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### expenses
```sql
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) NOT NULL,
  receipt_id UUID REFERENCES receipts(id),

  -- Expense details
  merchant TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT DEFAULT 'USD',
  category TEXT NOT NULL DEFAULT 'Fuel',
  expense_date DATE NOT NULL,
  notes TEXT,

  -- Status
  status TEXT DEFAULT 'draft',
  is_reimbursable BOOLEAN DEFAULT true,
  submitted_at TIMESTAMPTZ,
  reimbursed_at TIMESTAMPTZ,

  -- Policy
  policy_violations JSONB DEFAULT '[]',

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### receipts
```sql
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) NOT NULL,

  -- File info
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_size INTEGER NOT NULL,

  -- OCR data
  ocr_status TEXT DEFAULT 'pending',
  ocr_data JSONB,
  ocr_confidence DECIMAL(3,2),

  -- Extracted fields
  extracted_merchant TEXT,
  extracted_amount DECIMAL(10,2),
  extracted_date DATE,
  extracted_tax DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API Endpoints (Supabase)

### Authentication
- `POST /auth/v1/signup` - Register new user
- `POST /auth/v1/login` - Login user
- `POST /auth/v1/logout` - Logout user
- `POST /auth/v1/recover` - Password reset request
- `PUT /auth/v1/user` - Update user (password reset)

### Expenses
- `GET /rest/v1/expenses` - List expenses (filtered by RLS)
- `GET /rest/v1/expenses?id=eq.{id}` - Get single expense
- `POST /rest/v1/expenses` - Create expense
- `PATCH /rest/v1/expenses?id=eq.{id}` - Update expense
- `DELETE /rest/v1/expenses?id=eq.{id}` - Delete expense (soft delete)

### Receipts
- `POST /rest/v1/receipts` - Create receipt record
- `GET /rest/v1/receipts?expense_id=eq.{id}` - Get receipt for expense

### Storage
- `POST /storage/v1/object/receipts/{file}` - Upload receipt file
- `GET /storage/v1/object/public/receipts/{file}` - Download receipt

### Edge Functions (Future)
- `POST /functions/v1/process-ocr` - Process OCR asynchronously
- `POST /functions/v1/export-csv` - Generate CSV export

---

## Non-Functional Requirements

### Performance
- Page load time: < 2 seconds
- OCR processing: < 3 seconds
- API response time: < 500ms
- Support 100 concurrent users
- Handle 10,000 expenses/month

### Security
- HTTPS only
- Secure password storage (bcrypt via Supabase)
- JWT token authentication
- Row-level security on all tables
- File upload validation (type, size, content)
- XSS protection
- CSRF protection
- Rate limiting on API (Supabase default: 60 req/min)

### Scalability
- Database indexing on frequently queried columns
- CDN for static assets (Supabase Storage CDN)
- Lazy loading for large lists
- Pagination for data fetching
- Image compression before upload

### Usability
- Mobile-first responsive design
- Works on iOS Safari, Android Chrome
- Desktop: Chrome, Firefox, Safari, Edge
- Accessible (WCAG 2.1 AA compliance goal)
- Intuitive navigation
- Clear error messages
- Loading indicators for all async actions

### Reliability
- 99.9% uptime (Supabase SLA)
- Automatic retries for failed uploads
- Data backup (Supabase daily backups)
- Graceful error handling
- No data loss on network interruptions

---

## Future Phases (High-Level)

### Phase 1: General Expenses + Approvals (4-6 weeks)
- Multiple expense categories
- Multi-level approval workflows
- Expense reports
- Policy engine
- Email notifications
- Commenting system

### Phase 2: Cards + Reimbursements (6-8 weeks)
- Corporate card integration (Plaid)
- Receipt matching to card transactions
- ACH payment integration
- Budgeting system
- Advanced analytics dashboard

### Phase 3: Extended Features (Ongoing)
- Travel expense tracking
- Bill pay
- Invoicing
- Accounting integrations (QuickBooks, Xero)
- Mobile native app
- AI-powered categorization

---

## Success Metrics (Phase 0)

### Adoption Metrics
- User registration rate: 90%+ of employees within 2 weeks
- Active users: 80%+ submit at least one expense per month
- Receipt upload success rate: 95%+

### Performance Metrics
- OCR accuracy: 90%+ (fields extracted correctly without manual edit)
- Average submission time: < 2 minutes from photo to submit
- Finance processing time: < 5 minutes per expense review

### Quality Metrics
- Bug reports: < 5 critical bugs in first month
- User satisfaction: 8/10+ rating
- Data accuracy: 99%+ (no duplicate or lost expenses)

### Business Metrics
- Time saved per employee: 10 minutes per expense
- Time saved for finance: 50% reduction in processing time
- Policy compliance: 95%+ expenses within policy

---

## Assumptions & Dependencies

### Assumptions
- Employees have smartphones with cameras
- Reliable internet connection for uploads
- Gas receipts are standard format (thermal paper, printed)
- Reimbursement processed outside system (via accounting software)

### Dependencies
- Supabase account and project setup
- Google Cloud account for Vision API
- Domain name for production deployment (optional for Phase 0)
- Email service for notifications (Supabase built-in for Phase 0)

### Risks
- OCR accuracy may vary with receipt quality (mitigation: manual edit option)
- Google Vision API costs if exceeding 1000 images/month (mitigation: monitor usage)
- User adoption challenges (mitigation: training and onboarding materials)
- Mobile browser compatibility issues (mitigation: thorough testing)

---

## Glossary

- **OCR**: Optical Character Recognition - technology to extract text from images
- **RLS**: Row Level Security - database-level security in Supabase
- **JWT**: JSON Web Token - authentication token format
- **CSV**: Comma-Separated Values - spreadsheet file format
- **ACH**: Automated Clearing House - electronic bank payment system
- **MVP**: Minimum Viable Product - simplest version with core features
- **P0/P1/P2**: Priority levels (P0 = Critical, P1 = High, P2 = Medium)

---

*Document Version: 1.0*
*Prepared by: Claude AI Assistant*
*Approved by: Josh (Covaer Manufacturing)*
