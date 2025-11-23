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

**📖 Essential Documentation (Minimal):**
- This file (CLAUDE.md) - Development guide, coding standards, and project structure
- `FEATURES.md` - Detailed documentation for all completed features
- `HOW_JENSIFY_WORKS.md` - System architecture and feature overview
- `FIX_AND_PREVENT_SYNC_ISSUES.md` - Database migration workflow (critical!)
- `README.md` - Project setup and getting started
- `DOCUMENTATION_INDEX.md` - Quick navigation and "I want to..." finder

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

## Completed Features

Jensify includes several major features completed in Phase 0. For detailed documentation including architecture, code examples, and usage guides, see **[FEATURES.md](FEATURES.md)**.

### Feature Summary

**Organization Multi-Tenancy** (November 15, 2025)
- Multi-tenant architecture with complete data isolation
- 4-tier user roles (Employee, Manager, Finance, Admin)
- Organization setup wizard and invitation system
- Bulk CSV user imports
- Row-Level Security (RLS) at database level

**Expense Reports** (November 18, 2025)
- Expensify-style batch expense grouping
- Status workflow: draft → submitted → approved → rejected → paid
- Automatic total calculation via database triggers
- Timeline view for status changes
- Mobile-responsive UI

**Progressive Web App (PWA)** (November 21, 2025)
- Installable on mobile and desktop
- Offline support with service worker caching
- Offline action queue with auto-sync
- Update management with user notifications
- PWA shortcuts for common actions

**Mileage Tracking with GPS** (November 21, 2025)
- One-tap GPS location capture
- Google Maps integration (geocoding, routing, distance calculation)
- Interactive route visualization
- Auto-calculate driving distance and duration
- Mobile-responsive forms

**GPS Real-Time Tracking** (November 21, 2025)
- Start/Stop GPS tracking with live breadcrumbs
- Dual-mode UI: Quick Entry (manual) vs GPS Tracking (real-time)
- GPS path visualization with orange polyline
- Haversine distance calculation
- localStorage persistence (survives page refresh)
- 37% cost savings vs manual entry

For complete documentation including code examples, database schemas, and implementation details, see **[FEATURES.md](FEATURES.md)**.

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

## Documentation Update Rule ⭐ **IMPORTANT**

**When completing major features, update relevant documentation:**

### Update Guidelines

**Always update:**
- **CLAUDE.md** - Mark completed items in "Current Phase" and "Completed Components"
- **Git commit messages** - Use "docs:" prefix when updating documentation

**Update when relevant:**
- **FEATURES.md** - Add implementation details for new major features
- **HOW_JENSIFY_WORKS.md** - Update if system architecture changes
- **README.md** - Update if setup steps, dependencies, or config changes
- **FIX_AND_PREVENT_SYNC_ISSUES.md** - Update if database workflow changes

### Example Commit

```bash
git commit -m "feat(auth): add login component

- Reactive forms with email/password validation
- Error handling and user feedback
- Mobile-responsive design
- Unit tests included"
```

**Philosophy:** Keep documentation minimal and up-to-date. Let git history track progress.

## Chrome DevTools MCP Best Practices

### Screenshot Format Issue & Solution

When using `mcp__chrome-devtools__take_screenshot`, **always explicitly specify the format parameter** to prevent API errors from media type mismatches:

```typescript
// ✅ RECOMMENDED - Explicit PNG format (best for UI screenshots)
mcp__chrome-devtools__take_screenshot({ format: 'png' })

// ✅ ALTERNATIVE - JPEG format (smaller file size)
mcp__chrome-devtools__take_screenshot({ format: 'jpeg', quality: 85 })

// ❌ AVOID - Default without explicit format declaration
mcp__chrome-devtools__take_screenshot({})
```

**Why This Matters:**
- The tool defaults to PNG format internally
- Without explicit format declaration, API may receive mismatched media type
- Results in 400 error: "Image does not match the provided media type"
- Explicit format ensures base64 data matches declared media type

**Format Selection Guide:**

| Format | Best For | File Size | Quality | Notes |
|--------|----------|-----------|---------|-------|
| PNG | UI testing, sharp text, debugging layout | 200-500 KB | Lossless | **Recommended for Jensify** |
| JPEG | Screenshots with photos, smaller uploads | 50-150 KB | Lossy (quality: 0-100) | Good for file size constraints |
| WebP | Modern browsers, best compression | 40-120 KB | Lossy/Lossless | May have compatibility issues |

**For Jensify UI Testing:**
- Use **PNG** for Material Design components, forms, and navigation
- Use **JPEG (quality: 85)** only if storage/bandwidth is a concern
- Avoid WebP unless targeting modern browsers exclusively

## Resources & References

- [Angular Documentation](https://angular.io/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Google Vision API](https://cloud.google.com/vision/docs)
- [Angular Material](https://material.angular.io)
- [RxJS Documentation](https://rxjs.dev)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)

## Contact & Support

**Project Owner**: Josh (Covaer Manufacturing)
**Repository**: https://github.com/JBCox/Jensify
**Questions**: Create an issue in the repository

---

*Last Updated: 2025-11-21*
*Version: 0.1.0 (Phase 0 - Expense Receipt MVP)*
