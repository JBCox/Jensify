# Jensify - Expense Management Platform

## Project Overview
Full-featured expense management platform starting with gas receipt tracking for Covaer Manufacturing, expanding to compete with Expensify, Ramp, Brex, and similar platforms.

**Company**: Covaer Manufacturing (Fort Worth, Texas)
**Primary User**: Josh (Shipping Manager) and team
**Initial Use Case**: Gas receipt tracking for traveling employees
**Long-term Vision**: Complete expense management platform with corporate cards, approvals, budgeting, and integrations

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

**Phase 0: Gas Receipt MVP** (Target: 2-3 weeks)

### Scope
- Employee authentication (Supabase Auth)
- Gas receipt upload (photo/PDF)
- OCR extraction (Google Vision API)
- Employee verification UI
- Finance dashboard
- CSV export
- Basic policy (max per-gallon, daily limits)
- Manual "reimbursed" toggle

### Success Criteria
- [ ] Employees can upload gas receipts
- [ ] OCR extracts data with 90%+ accuracy
- [ ] Finance can view and export expenses
- [ ] Mobile responsive
- [ ] 70%+ test coverage
- [ ] Deployed to staging

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
