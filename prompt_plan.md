# Jensify - Implementation Roadmap

**Project**: Expensify Clone for Covaer Manufacturing
**Tech Stack**: Angular 20 + TypeScript + Supabase + Google Vision API
**Timeline**: Phased approach starting with Phase 0 MVP

---

## PHASE 0: Gas Receipt MVP ✅ TARGET: 2-3 weeks

### Week 1: Foundation & Setup (Days 1-7)

#### Day 1-2: Project & Database Setup
- [x] Create GitHub repository (Jensify)
- [x] Clone repository locally
- [x] Install Angular CLI
- [x] Create CLAUDE.md (project constitution)
- [x] Create spec.md (product specification)
- [x] Create prompt_plan.md (this file)
- [ ] Initialize Angular project with configuration
- [ ] Set up Supabase project
- [ ] Configure Supabase connection
- [ ] Create environment files (dev and prod)
- [ ] Add .gitignore for sensitive files

**Angular Project Setup**:
```bash
# Create Angular project with specific options
ng new expense-app --routing --style=scss --strict --standalone
cd expense-app

# Install core dependencies
npm install @supabase/supabase-js
npm install @angular/material @angular/cdk
npm install @google-cloud/vision  # Server-side only, will use Edge Function
npm install date-fns
npm install file-saver  # For CSV export

# Install dev dependencies
npm install --save-dev @types/file-saver
```

**Supabase Setup**:
- Create new project on supabase.com
- Note: Project URL, Anon Key, Service Key
- Enable Email authentication
- Configure email templates
- Set up Storage bucket: "receipts"
- Configure CORS for local development

#### Day 3: Database Schema & RLS Policies
- [ ] Create migration file for Phase 0 schema
- [ ] Create `users` table
- [ ] Create `expenses` table
- [ ] Create `receipts` table
- [ ] Add indexes for performance
- [ ] Create RLS policies for `users`
- [ ] Create RLS policies for `expenses`
- [ ] Create RLS policies for `receipts`
- [ ] Test RLS policies with sample data
- [ ] Configure Storage bucket policies

**Migration File**: `20251113_phase0_initial_schema.sql`
```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table (synced with auth.users)
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'finance', 'admin')),
  department TEXT,
  manager_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expenses table
CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) NOT NULL,
  receipt_id UUID REFERENCES receipts(id),

  -- Expense details
  merchant TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  currency TEXT DEFAULT 'USD',
  category TEXT NOT NULL DEFAULT 'Fuel',
  expense_date DATE NOT NULL,
  notes TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted', 'approved', 'rejected', 'reimbursed')),
  is_reimbursable BOOLEAN DEFAULT true,
  submitted_at TIMESTAMPTZ,
  reimbursed_at TIMESTAMPTZ,
  reimbursed_by UUID REFERENCES users(id),

  -- Policy
  policy_violations JSONB DEFAULT '[]'::jsonb,

  -- Audit
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  CONSTRAINT valid_date CHECK (expense_date <= CURRENT_DATE),
  CONSTRAINT valid_amount CHECK (amount <= 500),  -- Phase 0 policy limit
  CONSTRAINT submitted_before_reimbursed CHECK (submitted_at <= reimbursed_at OR reimbursed_at IS NULL)
);

-- Receipts table
CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) NOT NULL,

  -- File info
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('image/jpeg', 'image/png', 'application/pdf')),
  file_size INTEGER NOT NULL CHECK (file_size <= 5242880),  -- 5MB limit

  -- OCR data
  ocr_status TEXT DEFAULT 'pending' CHECK (ocr_status IN ('pending', 'processing', 'completed', 'failed')),
  ocr_data JSONB,
  ocr_confidence DECIMAL(3,2) CHECK (ocr_confidence >= 0 AND ocr_confidence <= 1),

  -- Extracted fields
  extracted_merchant TEXT,
  extracted_amount DECIMAL(10,2),
  extracted_date DATE,
  extracted_tax DECIMAL(10,2),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_expenses_user_id ON expenses(user_id);
CREATE INDEX idx_expenses_status ON expenses(status);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_expenses_created_at ON expenses(created_at DESC);
CREATE INDEX idx_receipts_expense_id ON receipts(expense_id);
CREATE INDEX idx_receipts_user_id ON receipts(user_id);
CREATE INDEX idx_receipts_ocr_status ON receipts(ocr_status);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security Policies

-- Users table policies
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own data"
ON users FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update own data"
ON users FOR UPDATE
USING (auth.uid() = id);

-- Expenses table policies
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Employees can view own expenses"
ON expenses FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('finance', 'admin')
  )
);

CREATE POLICY "Employees can create own expenses"
ON expenses FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Employees can update own draft expenses"
ON expenses FOR UPDATE
USING (
  auth.uid() = user_id AND status = 'draft'
)
WITH CHECK (
  auth.uid() = user_id AND status = 'draft'
);

CREATE POLICY "Finance can update expense status"
ON expenses FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('finance', 'admin')
  )
);

CREATE POLICY "Employees can delete own draft expenses"
ON expenses FOR DELETE
USING (auth.uid() = user_id AND status = 'draft');

-- Receipts table policies
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own receipts"
ON receipts FOR SELECT
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM users
    WHERE users.id = auth.uid()
    AND users.role IN ('finance', 'admin')
  )
);

CREATE POLICY "Users can create own receipts"
ON receipts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own receipts"
ON receipts FOR DELETE
USING (auth.uid() = user_id);

-- Storage policies (run in Supabase dashboard)
-- Bucket: receipts
-- Policy: Users can upload to their own folder
-- Policy: Users can read their own files
-- Policy: Finance can read all files
```

#### Day 4-5: Angular Project Structure
- [ ] Create folder structure (core, features, shared)
- [ ] Set up Angular Material theme
- [ ] Configure TailwindCSS
- [ ] Create base models/interfaces
- [ ] Create Supabase service (singleton)
- [ ] Create auth service
- [ ] Create auth guard
- [ ] Create role guard
- [ ] Create auth interceptor
- [ ] Set up routing structure

**Folder Structure**:
```
src/app/
├── core/
│   ├── services/
│   │   ├── supabase.service.ts       # Supabase client wrapper
│   │   ├── auth.service.ts           # Authentication logic
│   │   ├── expense.service.ts        # Expense CRUD operations
│   │   ├── receipt.service.ts        # Receipt upload & OCR
│   │   └── policy.service.ts         # Policy validation
│   ├── guards/
│   │   ├── auth.guard.ts             # Protect routes requiring auth
│   │   └── role.guard.ts             # Protect routes by role
│   ├── interceptors/
│   │   └── auth.interceptor.ts       # Add auth headers
│   └── models/
│       ├── user.model.ts
│       ├── expense.model.ts
│       ├── receipt.model.ts
│       └── enums.ts
├── features/
│   ├── auth/
│   │   ├── login/
│   │   ├── register/
│   │   ├── forgot-password/
│   │   └── auth-routing.ts
│   ├── expenses/
│   │   ├── expense-list/
│   │   ├── expense-detail/
│   │   ├── receipt-upload/
│   │   ├── expense-form/
│   │   └── expenses-routing.ts
│   └── finance/
│       ├── dashboard/
│       ├── expense-review/
│       └── finance-routing.ts
├── shared/
│   ├── components/
│   │   ├── receipt-viewer/
│   │   ├── expense-card/
│   │   ├── status-badge/
│   │   ├── currency-input/
│   │   └── loading-spinner/
│   ├── pipes/
│   │   ├── currency-format.pipe.ts
│   │   └── date-format.pipe.ts
│   └── directives/
├── app.component.ts
├── app.routes.ts
└── app.config.ts
```

#### Day 6-7: Authentication UI
- [ ] Create login component
- [ ] Create register component
- [ ] Create forgot password component
- [ ] Implement form validation
- [ ] Add loading states
- [ ] Add error handling
- [ ] Style with Angular Material
- [ ] Test authentication flow
- [ ] Implement session persistence
- [ ] Add token refresh logic

**Deliverable**: Users can register, login, and logout successfully

---

### Week 2: Core Receipt Flow (Days 8-14)

#### Day 8-9: Receipt Upload & Storage
- [ ] Create receipt upload component
- [ ] Implement file input and camera access
- [ ] Add drag-and-drop functionality
- [ ] Implement file validation (type, size)
- [ ] Create image preview component
- [ ] Implement upload to Supabase Storage
- [ ] Show upload progress
- [ ] Handle upload errors and retries
- [ ] Create receipt record in database
- [ ] Test on mobile devices

**Key Features**:
- Mobile: Direct camera access via `<input type="file" capture="environment">`
- Desktop: Drag-and-drop zone
- File validation: JPG, PNG, PDF, max 5MB
- Image compression if > 2MB
- Upload progress indicator
- Error handling with retry

#### Day 10-11: OCR Integration (Google Vision API)
- [ ] Set up Google Cloud project
- [ ] Enable Vision API
- [ ] Create service account and API key
- [ ] Create Supabase Edge Function for OCR
- [ ] Implement Vision API call
- [ ] Parse OCR response
- [ ] Extract merchant name
- [ ] Extract date
- [ ] Extract amount
- [ ] Extract tax (optional)
- [ ] Calculate confidence scores
- [ ] Store raw OCR data
- [ ] Store extracted fields
- [ ] Handle OCR errors gracefully
- [ ] Test with various receipt types

**Edge Function**: `process-receipt-ocr`
```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient({
  credentials: JSON.parse(Deno.env.get('GOOGLE_VISION_CREDENTIALS')!)
});

serve(async (req) => {
  const { receipt_id } = await req.json()

  // Get receipt from database
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_KEY')!
  )

  const { data: receipt } = await supabase
    .from('receipts')
    .select('file_path')
    .eq('id', receipt_id)
    .single()

  // Download image from storage
  const { data: file } = await supabase.storage
    .from('receipts')
    .download(receipt.file_path)

  // Call Vision API
  const [result] = await client.textDetection(await file.arrayBuffer())
  const fullText = result.fullTextAnnotation.text

  // Parse text to extract fields
  const extracted = parseReceiptText(fullText)

  // Update receipt with OCR data
  await supabase
    .from('receipts')
    .update({
      ocr_status: 'completed',
      ocr_data: result,
      ocr_confidence: calculateConfidence(result),
      extracted_merchant: extracted.merchant,
      extracted_amount: extracted.amount,
      extracted_date: extracted.date,
      extracted_tax: extracted.tax
    })
    .eq('id', receipt_id)

  return new Response(JSON.stringify(extracted), {
    headers: { 'Content-Type': 'application/json' }
  })
})

function parseReceiptText(text: string) {
  // Implement parsing logic
  // Extract merchant (first line or business name)
  // Extract date (regex for date patterns)
  // Extract amount (look for "Total", "Amount")
  // Extract tax (look for "Tax", "GST")
  return {
    merchant: extractMerchant(text),
    amount: extractAmount(text),
    date: extractDate(text),
    tax: extractTax(text)
  }
}
```

#### Day 12-13: Expense Form & Verification
- [ ] Create expense form component
- [ ] Implement reactive form with validation
- [ ] Pre-fill form with OCR data
- [ ] Add editable fields for all extracted data
- [ ] Implement merchant input with autocomplete
- [ ] Add date picker
- [ ] Create currency input component
- [ ] Add category dropdown
- [ ] Implement notes textarea
- [ ] Show receipt image alongside form
- [ ] Implement form validation
- [ ] Add confidence indicators for OCR fields
- [ ] Implement save draft functionality
- [ ] Implement auto-save (every 30 seconds)
- [ ] Add policy validation checks
- [ ] Show policy warnings
- [ ] Implement submit expense action
- [ ] Add confirmation dialog
- [ ] Handle submission errors

**Form Fields**:
- Merchant (required, text, autocomplete)
- Date (required, date picker, cannot be future, max 90 days old)
- Amount (required, currency, > $0, ≤ $500)
- Tax (optional, currency, ≥ $0)
- Category (dropdown, default "Fuel")
- Notes (optional, textarea, max 500 chars)

**Validation Rules**:
- Real-time validation with debounce (300ms)
- Error messages displayed inline
- Submit button disabled until valid
- Draft saves even if invalid

#### Day 14: Expense List View (Employee)
- [ ] Create expense list component
- [ ] Fetch expenses from Supabase
- [ ] Display expenses in card/table layout
- [ ] Show receipt thumbnail
- [ ] Show merchant, date, amount, status
- [ ] Implement status badges
- [ ] Add sort functionality (date, amount)
- [ ] Add filter by status
- [ ] Implement search by merchant
- [ ] Add pagination (20 per page)
- [ ] Implement click to view detail
- [ ] Add empty state
- [ ] Add loading skeleton
- [ ] Implement pull-to-refresh (mobile)
- [ ] Test responsiveness

**Deliverable**: Complete employee expense submission flow working

---

### Week 3: Finance Dashboard & Polish (Days 15-21)

#### Day 15-16: Finance Dashboard
- [ ] Create finance dashboard component
- [ ] Fetch all expenses (with employee info)
- [ ] Display in table layout
- [ ] Add summary cards (total pending, amounts, etc.)
- [ ] Implement filters (employee, date range, status)
- [ ] Add search functionality
- [ ] Implement sorting
- [ ] Add pagination (50 per page)
- [ ] Show policy violation indicators
- [ ] Add bulk selection (for future batch actions)
- [ ] Test with large dataset
- [ ] Optimize performance

#### Day 17: Mark Reimbursed & Export CSV
- [ ] Add "Mark Reimbursed" button/action
- [ ] Implement confirmation dialog
- [ ] Update expense status and timestamp
- [ ] Add success notification
- [ ] Implement CSV export functionality
- [ ] Format CSV with all required columns
- [ ] Generate filename with date
- [ ] Trigger download
- [ ] Test export with various filters
- [ ] Test CSV import into QuickBooks

**CSV Export Columns**:
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
- Receipt URL (Supabase Storage public link)

#### Day 18-19: Testing & Bug Fixes
- [ ] Write unit tests for services
- [ ] Write unit tests for components (critical paths)
- [ ] Run test coverage report
- [ ] Achieve 70%+ coverage
- [ ] Write E2E tests for main flows:
  - [ ] Register and login
  - [ ] Upload receipt and submit expense
  - [ ] Finance reviews and marks reimbursed
  - [ ] Export to CSV
- [ ] Fix all failing tests
- [ ] Test on multiple browsers
- [ ] Test on actual mobile devices (iOS, Android)
- [ ] Fix responsive layout issues
- [ ] Fix accessibility issues
- [ ] Performance testing
- [ ] Security audit (RLS policies, input validation)

#### Day 20: UI/UX Polish
- [ ] Refine color scheme and typography
- [ ] Add consistent spacing and padding
- [ ] Improve button states (hover, active, disabled)
- [ ] Add smooth transitions
- [ ] Improve loading states
- [ ] Add skeleton loaders
- [ ] Improve error messages
- [ ] Add success animations
- [ ] Create onboarding/tutorial (optional)
- [ ] Add tooltips for complex features
- [ ] Test with actual users (Covaer employees)
- [ ] Gather feedback
- [ ] Make quick improvements

#### Day 21: Deployment & Documentation
- [ ] Create production build
- [ ] Optimize bundle size
- [ ] Set up hosting (Vercel/Netlify)
- [ ] Configure custom domain (optional)
- [ ] Set up environment variables in hosting
- [ ] Deploy to production
- [ ] Test production deployment
- [ ] Configure Supabase for production URL
- [ ] Set up SSL certificate
- [ ] Create user documentation:
  - [ ] How to register
  - [ ] How to upload receipts
  - [ ] How to submit expenses
  - [ ] How to check status
- [ ] Create finance documentation:
  - [ ] How to review expenses
  - [ ] How to mark reimbursed
  - [ ] How to export to CSV
- [ ] Create README.md for developers
- [ ] Document deployment process
- [ ] Create CHANGELOG.md

**Deliverable**: Phase 0 MVP deployed to production and ready for use!

---

## PHASE 1: General Expenses + Approvals ⏳ TARGET: 4-6 weeks

### Sprint 1: Expense Types & Categories (Week 4-5)

#### Database Updates
- [ ] Add `categories` table
- [ ] Add category management
- [ ] Update `expenses` table for new categories
- [ ] Add `mileage` table
- [ ] Add `expense_splits` table for split expenses
- [ ] Create migrations

#### Category Management
- [ ] Create admin panel for categories
- [ ] Add default categories:
  - [ ] Fuel/Gas
  - [ ] Meals & Entertainment
  - [ ] Lodging
  - [ ] Airfare
  - [ ] Ground Transportation
  - [ ] Office Supplies
  - [ ] Software/Subscriptions
  - [ ] Miscellaneous
- [ ] Allow custom categories per company
- [ ] Category icons and colors

#### Mileage Tracking
- [ ] Create mileage entry form
- [ ] Add start/end address inputs
- [ ] Integrate Google Maps Distance Matrix API
- [ ] Calculate distance automatically
- [ ] Show route on map
- [ ] Apply IRS mileage rate (configurable)
- [ ] Calculate reimbursement amount
- [ ] Support multiple vehicles
- [ ] Add vehicle management

#### Expense Splitting
- [ ] Add split expense UI
- [ ] Split by percentage
- [ ] Split by amount
- [ ] Split by project/department/client
- [ ] Show split distribution
- [ ] Validate split totals

#### Itemization
- [ ] Allow multiple line items per expense
- [ ] Line item details (description, amount, category)
- [ ] Display itemized view
- [ ] Calculate totals

---

### Sprint 2: Reports & Workflows (Week 6-7)

#### Expense Reports
- [ ] Create `expense_reports` table
- [ ] Create report creation UI
- [ ] Group expenses by trip/purpose
- [ ] Add report title and description
- [ ] Calculate report totals
- [ ] Report status workflow
- [ ] Report detail view
- [ ] Edit report (add/remove expenses)
- [ ] Submit entire report
- [ ] Report list view

#### Report Statuses
- [ ] Draft
- [ ] Submitted
- [ ] Under Review
- [ ] Approved
- [ ] Rejected (with reason)
- [ ] Partially Reimbursed
- [ ] Fully Reimbursed
- [ ] Closed

---

### Sprint 3: Approval System (Week 8-9)

#### Database Updates
- [ ] Create `approvals` table
- [ ] Create `approval_workflows` table
- [ ] Add delegation support

#### Approval Workflows
- [ ] Define workflow rules
- [ ] Sequential approvals (Level 1 → Level 2 → Finance)
- [ ] Parallel approvals (multiple approvers at once)
- [ ] Conditional routing based on amount/category
- [ ] Configure workflows per department/role

#### Approval UI
- [ ] Create approval queue component
- [ ] Show pending approvals
- [ ] Approval detail view
- [ ] Approve/Reject actions
- [ ] Add comments to approval
- [ ] Bulk approve
- [ ] Delegation UI (assign to someone else)
- [ ] Escalation alerts

#### Notifications
- [ ] Email notification on submission
- [ ] Email notification to approvers
- [ ] Email notification on approval/rejection
- [ ] In-app notifications
- [ ] Notification preferences

---

### Sprint 4: Policy Engine (Week 10)

#### Policy Rules
- [ ] Create `policies` table
- [ ] Create policy rule engine
- [ ] Policy rules:
  - [ ] Max amount per category
  - [ ] Max amount per day/week/month
  - [ ] Required fields by category
  - [ ] Receipt requirement thresholds
  - [ ] Banned merchants
  - [ ] Allowed categories per role
  - [ ] Per diem rates
- [ ] Policy enforcement (soft vs. hard)
- [ ] Policy violation reporting

#### Admin UI
- [ ] Policy management dashboard
- [ ] Create/edit/delete policies
- [ ] Assign policies to departments/roles
- [ ] Policy audit trail

---

### Sprint 5: Communication (Week 11)

#### Commenting System
- [ ] Create `comments` table
- [ ] Add comments to expenses
- [ ] Add comments to reports
- [ ] @mention functionality
- [ ] Threaded conversations
- [ ] Real-time updates
- [ ] Email notifications for comments

#### Enhanced Notifications
- [ ] Notification center UI
- [ ] Mark as read/unread
- [ ] Notification preferences per user
- [ ] Email digest (daily summary)
- [ ] Push notifications (PWA)

---

## PHASE 2: Cards + Reimbursements ⏳ TARGET: 6-8 weeks

### Sprint 6: Card Integration (Week 12-13)
- [ ] Research and select card processor API (Plaid, Finicity, MX)
- [ ] Set up Plaid account
- [ ] Integrate Plaid Link
- [ ] Connect bank/card accounts
- [ ] Sync transactions
- [ ] Create `card_transactions` table
- [ ] Import transactions automatically
- [ ] Transaction list view
- [ ] Match transactions to receipts (automatic)
- [ ] Match transactions to receipts (manual)
- [ ] Reconciliation dashboard
- [ ] Unmatched transaction alerts

### Sprint 7: Reimbursement Processing (Week 14-15)
- [ ] Research ACH payment providers (Stripe, Dwolla, Plaid)
- [ ] Set up payment provider account
- [ ] Integrate payment API
- [ ] Create `reimbursements` table
- [ ] Create reimbursement queue
- [ ] Batch reimbursements
- [ ] Schedule reimbursement runs
- [ ] Payment status tracking
- [ ] Payment confirmation emails
- [ ] Bank account verification
- [ ] Payment reconciliation

### Sprint 8: Budgeting (Week 16)
- [ ] Create `budgets` table
- [ ] Budget creation UI
- [ ] Budget allocation by dept/category/project
- [ ] Real-time budget tracking
- [ ] Budget vs. actual reports
- [ ] Budget alerts (50%, 75%, 90%, 100%)
- [ ] Budget rollover options
- [ ] Budget amendments
- [ ] Budget forecasting

### Sprint 9: Analytics Dashboard (Week 17-18)
- [ ] Executive dashboard design
- [ ] Spend by category chart
- [ ] Spend by employee chart
- [ ] Spend over time chart
- [ ] Top merchants
- [ ] Policy compliance metrics
- [ ] Average approval time
- [ ] Reimbursement time metrics
- [ ] Export analytics to PDF
- [ ] Scheduled reports (email)
- [ ] Custom report builder

### Sprint 10: Testing & Deployment (Week 19-20)
- [ ] Comprehensive testing
- [ ] Security audit
- [ ] Performance optimization
- [ ] Load testing (simulate 100+ users)
- [ ] Deploy Phase 2

---

## PHASE 3: Extended Features ⏳ ONGOING

### Quarter 1 (Weeks 21-32)

#### Accounting Integrations
- [ ] QuickBooks Online integration
- [ ] Xero integration
- [ ] NetSuite integration (enterprise)
- [ ] CSV export templates for other systems
- [ ] GL code mapping
- [ ] Automated sync schedules

#### Bill Pay & Invoicing
- [ ] Vendor management
- [ ] Bill capture (email-in)
- [ ] Bill OCR
- [ ] Bill approval workflows
- [ ] Payment scheduling
- [ ] Check printing
- [ ] Invoice creation
- [ ] Invoice templates
- [ ] Invoice delivery
- [ ] Payment tracking

### Quarter 2 (Weeks 33-44)

#### Advanced Features
- [ ] AI-powered expense categorization
- [ ] Fraud detection system
- [ ] Anomaly detection
- [ ] Predictive analytics
- [ ] Smart approval routing
- [ ] Duplicate detection
- [ ] Merchant normalization

#### Mobile Native App
- [ ] React Native or Flutter setup
- [ ] Native camera integration
- [ ] Offline mode with queue
- [ ] Push notifications
- [ ] Biometric authentication
- [ ] Native performance optimization

### Quarter 3 (Weeks 45-56)

#### Enterprise Features
- [ ] Multi-entity support
- [ ] Multi-currency
- [ ] International tax handling (VAT, GST)
- [ ] SSO integration (Google Workspace, Azure AD, Okta)
- [ ] SCIM provisioning
- [ ] Advanced audit logs
- [ ] Compliance reports
- [ ] Data retention policies
- [ ] GDPR compliance
- [ ] SOC 2 compliance

---

## Critical Success Metrics

### Phase 0 Goals
- [ ] 95% receipt upload success rate
- [ ] 90% OCR accuracy (minimal manual corrections)
- [ ] < 2 minute average submission time
- [ ] < 5 minute finance review time per expense
- [ ] 70%+ code coverage
- [ ] Zero critical security vulnerabilities
- [ ] 90%+ user adoption within 2 weeks
- [ ] 8/10+ user satisfaction score

### Phase 1 Goals
- [ ] Multi-category expense support
- [ ] < 24 hour average approval time
- [ ] 95% policy compliance rate
- [ ] Automated approval for 70% of expenses

### Phase 2 Goals
- [ ] 100% card transaction matching
- [ ] < 5 day average reimbursement time
- [ ] Budget tracking for all departments
- [ ] Advanced analytics operational

---

## Risk Mitigation

### Technical Risks
1. **OCR Accuracy Issues**
   - Mitigation: Manual edit option, multiple OCR providers (fallback)

2. **Google Vision API Costs**
   - Mitigation: Monitor usage, implement caching, set up alerts

3. **Mobile Browser Compatibility**
   - Mitigation: Extensive testing, progressive enhancement

4. **Performance with Large Datasets**
   - Mitigation: Pagination, indexing, caching, lazy loading

### Business Risks
1. **User Adoption Challenges**
   - Mitigation: Training materials, onboarding flow, support documentation

2. **Data Migration from Old System**
   - Mitigation: Import tool, CSV templates, manual entry assistance

3. **Compliance Requirements**
   - Mitigation: Legal review, audit trails, data retention policies

---

## Development Workflow

### Daily Workflow
1. Review current task in prompt_plan.md
2. Read relevant sections of spec.md and CLAUDE.md
3. Write tests first (TDD approach)
4. Implement feature
5. Run tests and fix failures
6. Manual testing on dev environment
7. Commit with clear message
8. Update prompt_plan.md (check off completed tasks)
9. Push to GitHub

### Weekly Workflow
1. Sprint planning (review upcoming tasks)
2. Update prompt_plan.md with any changes
3. Deploy to staging
4. QA testing on staging
5. Demo to stakeholders (Josh)
6. Gather feedback
7. Adjust plan as needed

### Communication
- Daily standup notes (async)
- Weekly progress report to Josh
- Bi-weekly demo/review meetings
- Slack/email for urgent issues

---

## Notes

- This is a living document - update as needed
- Mark tasks complete with ✅
- Add new tasks as discovered
- Adjust timelines based on actual progress
- Celebrate milestones! 🎉

---

*Last Updated: 2025-11-13*
*Current Phase: Phase 0 - Week 1 (Foundation & Setup)*
*Next Milestone: Complete authentication and database setup*
