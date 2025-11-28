# Budget Management Implementation Plan

## Overview

Add budget tracking to Jensify, allowing organizations to set spending limits and track actual vs. planned spend by department, category, or organization-wide.

## Design Principles

1. **Non-breaking** - All changes are additive; existing functionality remains untouched
2. **Soft enforcement** - Budget warnings, not hard blocks (like existing policy_violations)
3. **Follow existing patterns** - Use same service/model/migration patterns already in codebase
4. **Phased rollout** - Can deploy incrementally and test each phase

---

## Phase 1: Database Schema (Migration)

### New Tables

```sql
-- Budgets table (defines a budget with period and limit)
CREATE TABLE budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Budget scope (what this budget applies to)
  name TEXT NOT NULL,                    -- "Q4 2024 Travel", "Engineering Monthly"
  budget_type TEXT NOT NULL CHECK (budget_type IN ('organization', 'department', 'category', 'user')),

  -- Scope filters (nullable based on budget_type)
  department TEXT,                       -- For department budgets
  category TEXT,                         -- For category budgets
  user_id UUID REFERENCES auth.users(id), -- For per-user budgets

  -- Budget amount and period
  amount DECIMAL(12,2) NOT NULL,         -- Budget limit
  period TEXT NOT NULL CHECK (period IN ('monthly', 'quarterly', 'yearly', 'custom')),
  start_date DATE NOT NULL,
  end_date DATE,                         -- NULL for recurring budgets

  -- Alerts
  alert_threshold_percent INTEGER DEFAULT 80, -- Alert at 80% by default

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Audit
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budget tracking (real-time spend tracking, updated by trigger)
CREATE TABLE budget_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Tracking period (for recurring budgets, one row per period)
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,

  -- Amounts (updated by trigger on expense changes)
  spent_amount DECIMAL(12,2) DEFAULT 0,
  pending_amount DECIMAL(12,2) DEFAULT 0,  -- Submitted but not approved

  -- Computed
  remaining_amount DECIMAL(12,2) GENERATED ALWAYS AS (
    (SELECT amount FROM budgets WHERE id = budget_id) - spent_amount - pending_amount
  ) STORED,

  -- Alert tracking
  alert_sent_at TIMESTAMPTZ,             -- When 80% alert was sent
  exceeded_at TIMESTAMPTZ,               -- When budget was exceeded

  -- Audit
  last_calculated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Indexes

```sql
CREATE INDEX idx_budgets_org_id ON budgets(organization_id);
CREATE INDEX idx_budgets_type ON budgets(organization_id, budget_type);
CREATE INDEX idx_budgets_active ON budgets(organization_id, is_active) WHERE is_active = true;
CREATE INDEX idx_budget_tracking_budget ON budget_tracking(budget_id);
CREATE INDEX idx_budget_tracking_period ON budget_tracking(period_start, period_end);
```

### RLS Policies

```sql
-- Budgets: Admin/Finance can manage, others can view
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view org budgets" ON budgets
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );

CREATE POLICY "Admin/Finance can manage budgets" ON budgets
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND role IN ('admin', 'finance') AND is_active = true
    )
  );

-- Budget tracking: Same as budgets
ALTER TABLE budget_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view budget tracking" ON budget_tracking
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM organization_members
      WHERE user_id = auth.uid() AND is_active = true
    )
  );
```

### Trigger for Auto-Updating Budget Tracking

```sql
-- Function to update budget tracking when expenses change
CREATE OR REPLACE FUNCTION update_budget_tracking()
RETURNS TRIGGER AS $$
BEGIN
  -- This function recalculates budget_tracking.spent_amount and pending_amount
  -- when an expense is inserted, updated, or deleted

  -- Find matching budgets and update their tracking
  UPDATE budget_tracking bt
  SET
    spent_amount = (
      SELECT COALESCE(SUM(e.amount), 0)
      FROM expenses e
      WHERE e.organization_id = bt.organization_id
        AND e.expense_date BETWEEN bt.period_start AND bt.period_end
        AND e.status IN ('approved', 'reimbursed')
        AND (
          -- Match by budget type
          (SELECT budget_type FROM budgets WHERE id = bt.budget_id) = 'organization'
          OR (
            (SELECT budget_type FROM budgets WHERE id = bt.budget_id) = 'department'
            AND e.user_id IN (
              SELECT user_id FROM organization_members
              WHERE department = (SELECT department FROM budgets WHERE id = bt.budget_id)
            )
          )
          OR (
            (SELECT budget_type FROM budgets WHERE id = bt.budget_id) = 'category'
            AND e.category = (SELECT category FROM budgets WHERE id = bt.budget_id)
          )
          OR (
            (SELECT budget_type FROM budgets WHERE id = bt.budget_id) = 'user'
            AND e.user_id = (SELECT user_id FROM budgets WHERE id = bt.budget_id)
          )
        )
    ),
    pending_amount = (
      SELECT COALESCE(SUM(e.amount), 0)
      FROM expenses e
      WHERE e.organization_id = bt.organization_id
        AND e.expense_date BETWEEN bt.period_start AND bt.period_end
        AND e.status = 'submitted'
        -- Same matching logic as above...
    ),
    last_calculated_at = NOW()
  WHERE bt.organization_id = COALESCE(NEW.organization_id, OLD.organization_id)
    AND bt.period_start <= COALESCE(NEW.expense_date, OLD.expense_date)::date
    AND bt.period_end >= COALESCE(NEW.expense_date, OLD.expense_date)::date;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER expense_budget_tracking
  AFTER INSERT OR UPDATE OR DELETE ON expenses
  FOR EACH ROW
  EXECUTE FUNCTION update_budget_tracking();
```

---

## Phase 2: Angular Models & Service

### Models (`expense-app/src/app/core/models/budget.model.ts`)

```typescript
export type BudgetType = 'organization' | 'department' | 'category' | 'user';
export type BudgetPeriod = 'monthly' | 'quarterly' | 'yearly' | 'custom';

export interface Budget {
  id: string;
  organization_id: string;
  name: string;
  budget_type: BudgetType;
  department?: string;
  category?: string;
  user_id?: string;
  amount: number;
  period: BudgetPeriod;
  start_date: string;
  end_date?: string;
  alert_threshold_percent: number;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface BudgetTracking {
  id: string;
  budget_id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  spent_amount: number;
  pending_amount: number;
  remaining_amount: number;
  alert_sent_at?: string;
  exceeded_at?: string;
  last_calculated_at: string;
  // Populated
  budget?: Budget;
}

export interface BudgetWithTracking extends Budget {
  tracking?: BudgetTracking;
  percent_used: number;
  status: 'under' | 'warning' | 'exceeded';
}

export interface CreateBudgetDto {
  name: string;
  budget_type: BudgetType;
  department?: string;
  category?: string;
  user_id?: string;
  amount: number;
  period: BudgetPeriod;
  start_date: string;
  end_date?: string;
  alert_threshold_percent?: number;
}

export interface BudgetCheckResult {
  budget_id: string;
  budget_name: string;
  budget_amount: number;
  spent_amount: number;
  pending_amount: number;
  remaining_amount: number;
  percent_used: number;
  status: 'under' | 'warning' | 'exceeded';
  message: string;
}
```

### Service (`expense-app/src/app/core/services/budget.service.ts`)

```typescript
@Injectable({ providedIn: 'root' })
export class BudgetService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);

  // CRUD operations
  getBudgets(includeTracking = true): Observable<BudgetWithTracking[]> { ... }
  getBudgetById(id: string): Observable<BudgetWithTracking> { ... }
  createBudget(dto: CreateBudgetDto): Observable<Budget> { ... }
  updateBudget(id: string, dto: Partial<CreateBudgetDto>): Observable<Budget> { ... }
  deleteBudget(id: string): Observable<void> { ... }

  // Budget checking (called before expense submission)
  checkExpenseAgainstBudgets(expense: {
    amount: number;
    category: string;
    user_id: string;
    expense_date: string;
  }): Observable<BudgetCheckResult[]> { ... }

  // Dashboard data
  getBudgetSummary(): Observable<{
    total_budgets: number;
    under_budget: number;
    at_warning: number;
    exceeded: number;
  }> { ... }
}
```

---

## Phase 3: Budget Management UI (Admin)

### New Component: `expense-app/src/app/features/organization/budget-management/`

**Features:**
- List all budgets with status (progress bars showing % used)
- Create new budget dialog
- Edit/delete existing budgets
- Filter by type (org, department, category, user)
- Show historical spend trends per budget

**UI Design:**
- Follows existing Material Design patterns
- Progress bars with color coding (green → yellow → red)
- Card-based layout consistent with other dashboards

---

## Phase 4: Integration with Expense Submission

### Expense Form Integration

When user creates/submits an expense:
1. Call `budgetService.checkExpenseAgainstBudgets()`
2. If any budgets are at warning or exceeded, show alert (non-blocking)
3. Add budget warnings to `policy_violations` array for tracking

```typescript
// In expense-form.ts onSubmit()
this.budgetService.checkExpenseAgainstBudgets({
  amount: this.form.value.amount,
  category: this.form.value.category,
  user_id: this.supabase.userId,
  expense_date: this.form.value.expense_date
}).subscribe(warnings => {
  if (warnings.some(w => w.status === 'exceeded')) {
    // Show warning dialog but allow submission
    this.showBudgetWarningDialog(warnings);
  }
});
```

---

## Phase 5: Dashboard Integration

### Finance Dashboard Updates

Add a "Budget Status" section showing:
- Summary cards: Under Budget / Warning / Exceeded counts
- Top 5 budgets nearing limit
- Link to full budget management page

### Employee Dashboard Updates

Add a "My Budget Status" card showing:
- Personal budget (if set) usage
- Department budget usage
- Category budgets relevant to recent expenses

---

## File Changes Summary

### New Files
- `supabase/migrations/20251128000001_budget_management.sql`
- `expense-app/src/app/core/models/budget.model.ts`
- `expense-app/src/app/core/services/budget.service.ts`
- `expense-app/src/app/core/services/budget.service.spec.ts`
- `expense-app/src/app/features/organization/budget-management/budget-management.component.ts`
- `expense-app/src/app/features/organization/budget-management/budget-management.component.html`
- `expense-app/src/app/features/organization/budget-management/budget-management.component.scss`
- `expense-app/src/app/features/organization/budget-management/budget-dialog.component.ts`

### Modified Files
- `expense-app/src/app/app.routes.ts` (add budget management route)
- `expense-app/src/app/core/components/sidebar-nav/sidebar-nav.ts` (add Budget nav item for admin/finance)
- `expense-app/src/app/features/expenses/expense-form/expense-form.ts` (budget check integration)
- `expense-app/src/app/features/home/finance-dashboard/finance-dashboard.ts` (budget summary)
- `expense-app/src/app/features/home/admin-dashboard/admin-dashboard.ts` (budget summary)

---

## Implementation Order

1. **Phase 1: Database** (migration + test with SQL) - ~2 hours
2. **Phase 2: Service + Models** (~3 hours)
3. **Phase 3: Budget Management UI** (~4 hours)
4. **Phase 4: Expense Form Integration** (~2 hours)
5. **Phase 5: Dashboard Integration** (~2 hours)

**Total estimated: ~13 hours**

---

## Testing Plan

1. **Unit tests** for BudgetService (CRUD, budget checking)
2. **Component tests** for budget management UI
3. **Integration test**: Create budget → Submit expense → Verify tracking updates
4. **Edge cases**:
   - Budget with no matching expenses
   - Expense matching multiple budgets
   - Budget period rollover
   - Deleted budgets don't affect historical tracking

---

## Questions for Review

1. **Hard vs Soft Enforcement**: Current plan uses soft enforcement (warnings only). Should exceeded budgets block submission?

2. **Budget Rollover**: Should unused budget roll over to next period? (Current: No rollover)

3. **Multiple Budget Matches**: If an expense matches both a category budget and department budget, show both warnings?

4. **Notifications**: Add email notifications when budgets hit warning/exceeded thresholds? (Can add later)
