# Fully Agentic UI Testing Skill for Jensify

## Purpose

Deploy **fully autonomous** browser-based testing that validates UI, functionality, visual correctness, accessibility, and performance - all without human intervention. This skill uses AI-powered techniques including visual regression, self-healing selectors, and natural language actions.

## Architecture

```
┌─────────────────────────────────────────┐
│     Agentic Testing Orchestrator        │
│         (Claude Code Agent)             │
└───────────────┬─────────────────────────┘
                │
    ┌───────────┴───────────┐
    │                       │
┌───▼─────┐         ┌──────▼──────┐
│ Planner │         │   Healer    │
│ Phase   │         │   Phase     │
└───┬─────┘         └──────┬──────┘
    │                      │
    └──────────┬───────────┘
               │
    ┌──────────▼───────────┐
    │  Multi-Layer Tests   │
    ├──────────────────────┤
    │ • Functional         │
    │ • Visual Regression  │
    │ • Accessibility      │
    │ • Performance        │
    │ • Responsive         │
    │ • Dark Mode          │
    └──────────────────────┘
```

## When to Use This Skill

**Use for:**
- Full application testing before deployment
- Visual regression after UI changes
- Accessibility compliance audits (WCAG 2.1 AA)
- Performance validation (Core Web Vitals)
- Cross-browser/responsive testing
- Dark mode validation

**Don't use for:**
- Unit tests (use Jasmine/Karma)
- API-only testing without UI
- Database migrations

## Prerequisites

```bash
# 1. Start dev server
cd C:\Jensify\expense-app && npm start

# 2. Verify Chrome DevTools MCP is connected
# Test with: mcp__chrome-devtools__list_pages

# 3. Create screenshot directory
mkdir -p C:\Jensify\test-screenshots\$(date +%Y-%m-%d)
```

## Test Personas

| Persona | Email | Password | Key Permissions |
|---------|-------|----------|-----------------|
| **Employee** | employee@jensify.test | Employee123! | Submit expenses, upload receipts, create trips/reports |
| **Manager** | manager@jensify.test | Manager123! | + Approve expenses, view team data |
| **Finance** | finance@jensify.test | Finance123! | + Mark reimbursed, export CSV, view all org expenses |
| **Admin** | admin@jensify.test | Admin123! | Full access: manage users, configure workflows |

---

# PART 1: MULTI-LAYER VALIDATION

## Layer 1: Functional Testing

Standard user flow testing with assertions.

```yaml
Test: Employee Creates Expense
Persona: Employee
Steps:
  1. Login as employee@jensify.test
  2. Navigate to /expenses/new
  3. Fill merchant: "Shell Gas Station"
  4. Fill amount: "45.67"
  5. Select category: "Fuel/Gas"
  6. Fill date: today
  7. Click "Save"
Assertions:
  - Success toast appears
  - Redirects to /expenses
  - New expense in list with status "draft"
  - Amount displays as "$45.67"
```

## Layer 2: Visual Regression Testing

**Methodology**: Capture baseline screenshots, compare against current state, flag visual differences.

### Screenshot Capture Protocol

```typescript
// ALWAYS use explicit PNG format to avoid media type errors
mcp__chrome-devtools__take_screenshot({
  format: 'png',
  filePath: 'C:/Jensify/test-screenshots/2025-11-26/login_baseline.png'
})
```

### Visual Diff Thresholds

| Component Type | Tolerance | Rationale |
|----------------|-----------|-----------|
| Text content | 0% | Exact match required |
| Layout/positioning | 2% | Minor rendering differences OK |
| Images/icons | 5% | Anti-aliasing variations |
| Dynamic content | Ignore | Use CSS selectors to exclude |

### Critical Visual Checkpoints

```yaml
Visual Checkpoint: Login Page
Elements to Validate:
  - Logo position and size
  - Form field alignment
  - Button colors match brand (#FF5900)
  - Error message styling (red text)
  - Mobile responsive at 375px width

Visual Checkpoint: Dashboard Metrics
Elements to Validate:
  - Metric cards uniform size
  - Numbers right-aligned
  - Currency formatting consistent
  - Status badges correct colors
  - Chart renders without overflow
```

### Baseline Management

```
C:\Jensify\test-screenshots\
├── baselines\                    # Approved reference screenshots
│   ├── login_desktop.png
│   ├── login_mobile.png
│   ├── dashboard_admin.png
│   └── expense_form.png
├── current\                      # Current test run
│   └── {timestamp}\
│       ├── login_desktop.png
│       └── diff_login_desktop.png  # Visual diff output
└── diffs\                        # Failed comparisons for review
```

## Layer 3: Accessibility Testing

### WCAG 2.1 AA Compliance Checks

```yaml
Accessibility Test: Login Form
Checks:
  - All form fields have visible labels
  - Error messages announced to screen readers
  - Focus order is logical (Tab navigation)
  - Color contrast >= 4.5:1 for text
  - Buttons have accessible names
  - Skip link available for keyboard users

Accessibility Test: Dashboard
Checks:
  - Headings hierarchy (h1 > h2 > h3)
  - Images have alt text
  - Interactive elements keyboard accessible
  - ARIA landmarks present (main, nav, banner)
  - No keyboard traps
```

### Automated A11y Validation

```typescript
// Using Chrome DevTools accessibility tree
const snapshot = await mcp__chrome-devtools__take_snapshot({ verbose: true });

// Check for accessibility violations
// - Missing labels: textbox without associated label
// - Missing alt text: image without accessible name
// - Low contrast: computed contrast ratio < 4.5:1
// - Missing headings: page has no h1
```

### Color Contrast Validation

| Element Type | WCAG AA | WCAG AAA | Our Target |
|--------------|---------|----------|------------|
| Normal text | 4.5:1 | 7:1 | 4.5:1 |
| Large text (18px+) | 3:1 | 4.5:1 | 3:1 |
| UI components | 3:1 | 3:1 | 3:1 |
| Focus indicators | 3:1 | 3:1 | 3:1 |

### Dark Mode Testing

```yaml
Dark Mode Validation:
  1. Navigate to page in light mode
  2. Take baseline screenshot
  3. Toggle to dark mode (if available) or use emulateMedia
  4. Take dark mode screenshot
  5. Validate:
     - Text remains readable (contrast check)
     - No white/bright elements bleeding through
     - Icons visible against dark background
     - Form inputs have visible borders
     - Status colors still distinguishable
```

## Layer 4: Performance Testing

### Core Web Vitals Thresholds

| Metric | Good | Needs Work | Poor |
|--------|------|------------|------|
| **LCP** (Largest Contentful Paint) | ≤2.5s | ≤4.0s | >4.0s |
| **FID** (First Input Delay) | ≤100ms | ≤300ms | >300ms |
| **CLS** (Cumulative Layout Shift) | ≤0.1 | ≤0.25 | >0.25 |
| **FCP** (First Contentful Paint) | ≤1.8s | ≤3.0s | >3.0s |
| **TBT** (Total Blocking Time) | ≤200ms | ≤600ms | >600ms |

### Performance Test Protocol

```yaml
Performance Test: Dashboard Load
Steps:
  1. Start performance trace: mcp__chrome-devtools__performance_start_trace
  2. Navigate to /home (cold load)
  3. Wait for content to stabilize
  4. Stop trace: mcp__chrome-devtools__performance_stop_trace
  5. Analyze insights for:
     - LCP element identification
     - Layout shift sources
     - Long tasks blocking main thread
     - Resource loading waterfall
```

## Layer 5: Responsive Testing

### Viewport Breakpoints

| Device | Width | Height | Test Priority |
|--------|-------|--------|---------------|
| Mobile S | 320px | 568px | High |
| Mobile M | 375px | 667px | High |
| Mobile L | 425px | 812px | Medium |
| Tablet | 768px | 1024px | High |
| Laptop | 1024px | 768px | Medium |
| Desktop | 1440px | 900px | High |

### Responsive Test Protocol

```yaml
Responsive Test: Expense Form
Viewports: [375x667, 768x1024, 1440x900]
For each viewport:
  1. Resize page: mcp__chrome-devtools__resize_page
  2. Navigate to /expenses/new
  3. Take screenshot
  4. Validate:
     - No horizontal scrolling
     - Form fields full width on mobile
     - Buttons touch-friendly (min 44x44px)
     - Labels visible (not truncated)
     - Submit button accessible without scrolling
```

---

# PART 2: SELF-HEALING TEST AUTOMATION

## Multi-Locator Strategy

When an element selector fails, try alternatives in order:

```
Primary: uid from accessibility snapshot
    ↓ (if not found)
Fallback 1: CSS selector
    ↓ (if not found)
Fallback 2: Text content match
    ↓ (if not found)
Fallback 3: ARIA role + name
    ↓ (if not found)
Fallback 4: XPath by structure
    ↓ (if not found)
Fallback 5: Visual position (last resort)
```

## Element Fingerprinting

For each critical element, store multiple identifiers:

```yaml
Element: Sign In Button
Fingerprint:
  primary_uid: "170_16"
  css_selector: "button[type='submit']"
  text_content: "Sign In"
  aria_role: "button"
  aria_name: "Sign In"
  xpath: "//button[contains(text(),'Sign In')]"
  position: { x: 450, y: 380 }
  visual_hash: "a3f2b8c1..."  # Screenshot region hash
```

## Self-Healing Workflow

```yaml
When element not found:
  1. Log: "Primary selector failed: {selector}"
  2. Try each fallback in order
  3. If fallback succeeds:
     a. Log: "Healed using: {fallback_type}"
     b. Update test with new primary selector
     c. Continue test execution
  4. If all fallbacks fail:
     a. Take diagnostic screenshot
     b. Capture page snapshot
     c. Flag for human review
     d. Skip test (don't fail entire suite)
```

## AI-Powered Element Discovery

When selectors fail, use natural language to find elements:

```yaml
Natural Language Fallback:
  1. Describe element: "the orange submit button at bottom of login form"
  2. Use accessibility snapshot to find matching element
  3. Consider:
     - Role (button, link, textbox)
     - Visible text
     - Position (top, bottom, left, right)
     - Color (if distinguishable)
     - Context (form, dialog, sidebar)
```

---

# PART 3: TEST SCENARIOS (26 Tests)

## Category 1: Authentication (4 tests)

### Test 1.1: Successful Login
```yaml
Persona: Employee
Layers: [functional, visual, accessibility, performance]
Steps:
  1. Navigate to /auth/login
  2. [VISUAL] Screenshot: login_initial.png
  3. [A11Y] Verify form labels present
  4. Fill email: employee@jensify.test
  5. Fill password: Employee123!
  6. [PERF] Start timing
  7. Click "Sign In"
  8. Wait for dashboard
  9. [PERF] Record login time (<2s target)
  10. [VISUAL] Screenshot: dashboard_after_login.png
Assertions:
  - Redirects to /home
  - Shows Employee Dashboard
  - Navigation appropriate for role
```

### Test 1.2: Invalid Credentials
```yaml
Persona: N/A
Layers: [functional, visual, accessibility]
Steps:
  1. Navigate to /auth/login
  2. Fill email: employee@jensify.test
  3. Fill password: WrongPassword123!
  4. Click "Sign In"
  5. [A11Y] Verify error announced to screen reader
  6. [VISUAL] Screenshot: login_error.png
Assertions:
  - Stays on login page
  - Error message visible
  - Error has role="alert" or aria-live
  - Password field cleared
```

### Test 1.3: Registration Flow
```yaml
Persona: New user
Layers: [functional, visual, accessibility]
Steps:
  1. Navigate to /auth/register
  2. [VISUAL] Screenshot: register_form.png
  3. [A11Y] Verify password requirements announced
  4. Fill form with valid data
  5. Submit
Assertions:
  - Success message shown
  - Redirects to organization setup
```

### Test 1.4: Password Reset
```yaml
Persona: N/A
Layers: [functional, visual]
Steps:
  1. Navigate to /auth/forgot-password
  2. [VISUAL] Screenshot: forgot_password.png
  3. Enter email
  4. Submit
Assertions:
  - Success message shown
  - Clear instructions displayed
```

## Category 2: Role-Based Access (4 tests)

### Test 2.1: Employee Restrictions
```yaml
Persona: Employee
Layers: [functional, visual]
Steps:
  1. Login as employee
  2. [VISUAL] Screenshot sidebar: employee_sidebar.png
  3. Attempt navigation to /approvals
  4. Attempt navigation to /organization/users
Assertions:
  - Sidebar shows: Dashboard, Expenses, Reports, Mileage
  - Sidebar hides: Approvals, User Management, Finance
  - /approvals redirects to /home
  - /organization/users redirects to /home
```

### Test 2.2: Manager Access
```yaml
Persona: Manager
Layers: [functional, visual]
Steps:
  1. Login as manager
  2. [VISUAL] Screenshot sidebar: manager_sidebar.png
  3. Navigate to /approvals
  4. [VISUAL] Screenshot: approval_queue.png
Assertions:
  - Sidebar shows: + Approvals
  - Approval queue loads
  - Can see team expenses
```

### Test 2.3: Finance Access
```yaml
Persona: Finance
Layers: [functional, visual]
Steps:
  1. Login as finance
  2. Navigate to /finance
  3. [VISUAL] Screenshot: finance_dashboard.png
Assertions:
  - Finance dashboard accessible
  - Can see all org expenses
  - Export button visible
```

### Test 2.4: Admin Full Access
```yaml
Persona: Admin
Layers: [functional, visual]
Steps:
  1. Login as admin
  2. [VISUAL] Screenshot sidebar: admin_sidebar.png
  3. Navigate to /organization/users
  4. Navigate to /approvals/settings
Assertions:
  - All menu items visible
  - User management accessible
  - Workflow settings accessible
```

## Category 3: Expense CRUD (4 tests)

### Test 3.1: Create Manual Expense
```yaml
Persona: Employee
Layers: [functional, visual, accessibility]
Steps:
  1. Login as employee
  2. Navigate to /expenses/new
  3. [VISUAL] Screenshot: expense_form_empty.png
  4. [A11Y] Verify all fields have labels
  5. Fill: merchant="Shell", amount="45.67", category="Fuel", date=today
  6. Click Save
  7. [VISUAL] Screenshot: expense_saved.png
Assertions:
  - Success toast appears
  - Expense in list with status "draft"
  - Amount formatted as $45.67
```

### Test 3.2: Upload Receipt with OCR
```yaml
Persona: Employee
Layers: [functional, visual, performance]
Steps:
  1. Navigate to /expenses/new
  2. Click "Upload Receipt"
  3. Upload test_receipt.png
  4. [PERF] Measure OCR time (<3s target)
  5. [VISUAL] Screenshot: ocr_extracted.png
  6. Verify pre-filled fields
  7. Save expense
Assertions:
  - Receipt preview shown
  - Merchant extracted
  - Amount extracted
  - Date extracted
  - OCR accuracy >= 90%
```

### Test 3.3: Edit Draft Expense
```yaml
Persona: Employee
Layers: [functional]
Steps:
  1. Create draft expense
  2. Click Edit
  3. Change amount to "50.00"
  4. Save
Assertions:
  - Changes saved
  - Updated amount displayed
  - Status remains "draft"
```

### Test 3.4: Delete Draft Expense
```yaml
Persona: Employee
Layers: [functional, accessibility]
Steps:
  1. Create draft expense
  2. Click Delete
  3. [A11Y] Verify confirmation dialog has focus trap
  4. Confirm deletion
Assertions:
  - Confirmation dialog shown
  - Expense removed from list
  - Success message
```

## Category 4: Expense Reports (4 tests)

### Test 4.1: Create Report
```yaml
Persona: Employee
Layers: [functional, visual]
Steps:
  1. Ensure 3+ draft expenses exist
  2. Navigate to /reports
  3. Click "New Report"
  4. Fill title: "November Travel"
  5. Select date range
  6. Select expenses
  7. [VISUAL] Screenshot: report_create.png
  8. Save
Assertions:
  - Report created with status "draft"
  - Selected expenses linked
  - Total calculated correctly
```

### Test 4.2: Submit Report
```yaml
Persona: Employee
Layers: [functional]
Steps:
  1. Open draft report
  2. Click "Submit for Approval"
  3. Confirm
Assertions:
  - Status changes to "submitted"
  - Cannot edit report
  - Timestamp recorded
```

### Test 4.3: Approve Report
```yaml
Persona: Manager
Layers: [functional, visual]
Steps:
  1. Login as manager
  2. Navigate to /approvals
  3. Find submitted report
  4. [VISUAL] Screenshot: approval_detail.png
  5. Click Approve
  6. Add comment
Assertions:
  - Status changes to "approved"
  - Approval recorded with timestamp
  - Comment saved
```

### Test 4.4: Reject Report
```yaml
Persona: Manager
Layers: [functional]
Steps:
  1. Find submitted report
  2. Click Reject
  3. Enter reason: "Missing receipts"
Assertions:
  - Status changes to "rejected"
  - Reason recorded
  - Employee can see reason
```

## Category 5: Mileage Tracking (2 tests)

### Test 5.1: Manual Mileage Entry
```yaml
Persona: Employee
Layers: [functional, visual]
Steps:
  1. Navigate to /mileage/new
  2. Select "Quick Entry" tab
  3. [VISUAL] Screenshot: mileage_form.png
  4. Fill start: "123 Main St, Fort Worth, TX"
  5. Fill end: "456 Oak Ave, Dallas, TX"
  6. Fill purpose: "Client meeting"
  7. Click Calculate
  8. Save
Assertions:
  - Distance calculated via Google Maps
  - Amount = distance * IRS rate
  - Trip saved successfully
```

### Test 5.2: GPS Tracking Mode
```yaml
Persona: Employee
Layers: [functional, visual]
Steps:
  1. Navigate to /mileage/new
  2. Select "GPS Tracking" tab
  3. [VISUAL] Screenshot: gps_tracking.png
  4. Verify Start button visible
  5. Verify map displays
Assertions:
  - GPS tracking UI renders
  - Map loads without errors
  - Start/Stop buttons functional
```

## Category 6: Form Validation (3 tests)

### Test 6.1: Required Fields
```yaml
Persona: Employee
Layers: [functional, accessibility]
Steps:
  1. Navigate to /expenses/new
  2. Leave merchant blank
  3. Fill amount only
  4. Click Save
Assertions:
  - Form does not submit
  - Merchant field shows error
  - [A11Y] Error has aria-invalid="true"
  - [A11Y] Error message linked via aria-describedby
```

### Test 6.2: Amount Validation
```yaml
Persona: Employee
Layers: [functional]
Steps:
  1. Navigate to /expenses/new
  2. Test invalid amounts:
     a. "-50.00" (negative)
     b. "abc" (non-numeric)
     c. "0" (zero)
Assertions:
  - All invalid inputs rejected
  - Appropriate error messages
```

### Test 6.3: Date Validation
```yaml
Persona: Employee
Layers: [functional]
Steps:
  1. Navigate to /expenses/new
  2. Enter future date
  3. Try to save
Assertions:
  - Error: "Date cannot be in the future"
  - Does not save
```

## Category 7: Empty States & Errors (3 tests)

### Test 7.1: Empty Expense List
```yaml
Persona: New Employee (no expenses)
Layers: [functional, visual, accessibility]
Steps:
  1. Login as user with no expenses
  2. Navigate to /expenses
  3. [VISUAL] Screenshot: empty_state.png
Assertions:
  - Empty state illustration shown
  - Helpful message displayed
  - CTA button to create expense
  - [A11Y] Empty state announced
```

### Test 7.2: 404 Page
```yaml
Persona: Any
Layers: [functional, visual]
Steps:
  1. Navigate to /nonexistent-route
  2. [VISUAL] Screenshot: 404_page.png
Assertions:
  - 404 error page shown
  - Link to home provided
  - Auth state maintained
```

### Test 7.3: API Error Handling
```yaml
Persona: Employee
Layers: [functional, visual]
Note: Requires simulating network error
Steps:
  1. Intercept API calls
  2. Force 500 error
  3. Attempt action
Assertions:
  - User-friendly error message
  - No technical details exposed
  - Retry option if applicable
```

## Category 8: Mobile Responsiveness (2 tests)

### Test 8.1: Mobile Login
```yaml
Persona: Employee
Viewport: 375x667
Layers: [functional, visual, accessibility]
Steps:
  1. Resize to mobile viewport
  2. Navigate to /auth/login
  3. [VISUAL] Screenshot: login_mobile.png
  4. Fill credentials
  5. Sign in
Assertions:
  - No horizontal scroll
  - Form fields full width
  - Buttons touch-friendly (min 44px)
  - Keyboard doesn't obscure fields
```

### Test 8.2: Mobile Navigation
```yaml
Persona: Employee
Viewport: 375x667
Layers: [functional, visual]
Steps:
  1. Login on mobile
  2. [VISUAL] Screenshot: mobile_dashboard.png
  3. Verify sidebar is drawer
  4. Open drawer (hamburger)
  5. [VISUAL] Screenshot: mobile_drawer_open.png
  6. Click menu item
Assertions:
  - Sidebar hidden by default
  - Hamburger menu visible
  - Drawer slides smoothly
  - Drawer closes on selection
```

---

# PART 4: TEST EXECUTION

## Full Test Run Protocol

```yaml
Before All Tests:
  1. Verify dev server running (http://localhost:4200)
  2. Create screenshot directory for today
  3. Reset database if needed (optional)
  4. Clear browser state

For Each Test:
  1. Log test name and persona
  2. Execute steps with layer-specific validations
  3. Capture screenshots at checkpoints
  4. Record any failures with context
  5. Self-heal if selectors fail
  6. Continue to next test (don't abort suite)

After All Tests:
  1. Generate summary report
  2. Compile visual diff report
  3. List accessibility violations
  4. Note performance metrics
  5. Document self-healing actions
```

## Execution Commands

```typescript
// Navigate with retry
async function navigateWithRetry(url: string, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    await mcp__chrome-devtools__navigate_page({ type: 'url', url });
    await mcp__chrome-devtools__wait_for({ text: 'expectedContent', timeout: 5000 });
    return; // Success
  }
  throw new Error(`Failed to navigate to ${url} after ${maxRetries} attempts`);
}

// Screenshot with naming convention
async function screenshot(testId: string, step: string) {
  const date = new Date().toISOString().split('T')[0];
  const path = `C:/Jensify/test-screenshots/${date}/${testId}_${step}.png`;
  await mcp__chrome-devtools__take_screenshot({ format: 'png', filePath: path });
  return path;
}

// Accessibility check
async function checkAccessibility() {
  const snapshot = await mcp__chrome-devtools__take_snapshot({ verbose: true });
  // Parse snapshot for violations
  // Return list of issues
}
```

---

# PART 5: REPORTING

## Test Report Template

```markdown
# Jensify Agentic Test Report

**Date:** {YYYY-MM-DD}
**Duration:** {X} minutes
**Agent:** Claude (Agentic Testing Skill v2.0)

## Executive Summary

| Metric | Value |
|--------|-------|
| Total Tests | 26 |
| Passed | {X} |
| Failed | {X} |
| Skipped | {X} |
| Self-Healed | {X} |

## Layer Coverage

| Layer | Tests | Pass Rate |
|-------|-------|-----------|
| Functional | 26 | {X}% |
| Visual | 18 | {X}% |
| Accessibility | 12 | {X}% |
| Performance | 4 | {X}% |
| Responsive | 8 | {X}% |

## Visual Regression Summary

- Baseline screenshots: {X}
- Current screenshots: {X}
- Visual diffs detected: {X}
- Approved changes: {X}
- New issues: {X}

## Accessibility Violations

| Severity | Count | Examples |
|----------|-------|----------|
| Critical | {X} | Missing form labels |
| Serious | {X} | Low contrast text |
| Moderate | {X} | Missing alt text |
| Minor | {X} | Redundant ARIA |

## Performance Metrics

| Page | LCP | FCP | CLS | TBT |
|------|-----|-----|-----|-----|
| Login | {X}s | {X}s | {X} | {X}ms |
| Dashboard | {X}s | {X}s | {X} | {X}ms |
| Expense Form | {X}s | {X}s | {X} | {X}ms |

## Self-Healing Log

| Test | Original Selector | Healed Using | Reason |
|------|------------------|--------------|--------|
| 1.1 | uid=170_16 | button[type=submit] | UID changed |

## Issues Found

### Issue #1: {Title}
- **Severity:** {Critical/High/Medium/Low}
- **Layer:** {Functional/Visual/A11y/Perf}
- **Test:** {Test ID}
- **Description:** {Details}
- **Screenshot:** {Path}
- **Suggested Fix:** {Optional}

## Recommendations

1. {Recommendation 1}
2. {Recommendation 2}
3. {Recommendation 3}
```

---

# PART 6: BEST PRACTICES

## DO:

- Always take fresh snapshots before interacting with elements
- Use explicit PNG format for screenshots
- Wait for page loads before assertions
- Test both light and dark modes
- Validate at multiple viewport sizes
- Document every failure with screenshots
- Self-heal selectors before failing tests
- Run full suite before deployments

## DON'T:

- Seed data via SQL (use UI flows)
- Hard-code UIDs (they change between runs)
- Skip accessibility checks
- Ignore visual diffs without review
- Test only happy paths
- Leave test data in production

## Screenshot Naming Convention

```
{test_category}_{test_number}_{step}_{viewport}.png

Examples:
auth_1.1_login_initial_desktop.png
auth_1.1_login_success_mobile.png
expense_3.2_ocr_extracted_tablet.png
visual_diff_dashboard_admin.png
```

---

# RESEARCH SOURCES

This skill incorporates best practices from:

- **Applitools**: Visual AI and autonomous testing
- **Percy/Chromatic**: Visual regression methodology
- **Playwright Test Agents**: Planner/Generator/Healer pattern
- **Netflix SafeTest**: Component isolation testing
- **Airbnb**: Screenshot testing in CI/CD
- **Stagehand**: AI-powered browser automation
- **WCAG 2.1**: Accessibility compliance standards
- **Core Web Vitals**: Performance metrics

---

**Version:** 2.0.0
**Last Updated:** 2025-11-26
**Author:** Claude (Anthropic)
