# Jensify - Modern Expense Management Platform

> A mobile-first expense management platform built for Corvaer Manufacturing, designed to rival Expensify, Ramp, and Brex.

[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)
[![Angular](https://img.shields.io/badge/Angular-20-red)](https://angular.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Latest-green)](https://supabase.com/)

## 🎯 Overview

Jensify is a comprehensive expense management solution for tracking all business expenses (gas, hotels, flights, meals, and more), expanding to include:
- 📸 Smart receipt capture with OCR
- 💰 Multi-level approval workflows
- 💳 Corporate card integration
- 📊 Advanced analytics and budgeting
- 🔄 Accounting system integrations

## 🚀 Current Phase: Phase 0 - Expense Receipt MVP

**Timeline**: 2-3 weeks (Started November 13, 2024)
**Status**: ✅ **98% Complete** (Ready for Staging Deployment)
**Initial Focus**: Gas receipts for traveling employees
**Supports**: All expense categories (gas, hotels, flights, meals, office supplies, etc.)

### MVP Features
- ✅ **User authentication** (email/password) - Complete with full UI
- ✅ **Database schema** with Row Level Security policies
- ✅ **Navigation** with role-based access
- ✅ **Receipt upload** (mobile camera & desktop drag-drop) - Complete
- ✅ **OCR** with Google Vision API - **Complete (November 15, 2024)**
- ✅ **Expense form** with category selection
- ✅ **Finance dashboard**
- ✅ **CSV export** for accounting

### Recently Completed
**November 18, 2024**:
- ✅ **Phase 2: Expense Reports (Expensify-style)** - Group multiple expenses into reports
- ✅ Report creation with name, description, and date range
- ✅ "Add to Report" dialog with existing report selection or new report creation
- ✅ Report list with search and status filters
- ✅ Report detail with expense table and timeline view
- ✅ Batch add expenses to reports from expense list
- ✅ Automatic report total calculation via database triggers
- ✅ Report status workflow (draft → submitted → approved → rejected → paid)
- ✅ 207 total tests, 194 passing (93.7% pass rate)

**November 15, 2024**:
- ✅ **Google Vision OCR Integration** - Real receipt text extraction
- ✅ OCR Service with automatic field parsing (merchant, amount, date, tax)
- ✅ Confidence scoring for extracted data
- ✅ Graceful error handling and fallback
- ✅ Comprehensive setup guide (docs/GOOGLE_VISION_SETUP.md)

**November 14, 2024**:
- ✅ Fixed RLS infinite recursion bug
- ✅ Batch expense submission with parallel processing
- ✅ Enhanced expense list with filters and search
- ✅ Finance dashboard with reimbursement queue

**November 13, 2024**:
- ✅ Login, Register, and Forgot Password components
- ✅ Auth guards for route protection
- ✅ Mobile-responsive navigation bar
- ✅ User profile menu with logout
- ✅ Lazy-loaded routes for optimal performance
- ✅ Receipt upload component (drag-drop, camera, validation, preview)
- ✅ ExpenseService with CRUD operations and file handling
- ✅ Comprehensive test suite (50+ test cases)

## 🛠️ Tech Stack

### Frontend
- **Framework**: Angular 20+ (Standalone Components)
- **Language**: TypeScript (strict mode)
- **UI Library**: Angular Material + TailwindCSS
- **State Management**: RxJS + Services
- **Testing**: Jasmine/Karma + Cypress

## 🎨 Design System

The UI now leans on a small set of CSS design tokens so you can retheme quickly. Edit `expense-app/src/styles.scss` to tweak colors or add new ones.

| Token | Hex | Purpose |
|-------|-----|---------|
| `--jensify-primary` | `#2563EB` | Primary actions, highlights |
| `--jensify-primary-strong` | `#1D4ED8` | Hover/active states |
| `--jensify-accent` / `--jensify-info` | `#0EA5E9` | Secondary accents + info |
| `--jensify-surface-soft` | `#F4F6FB` | Page backgrounds |
| `--jensify-surface-card` | `#FFFFFF` | Cards / panels |
| `--jensify-border-subtle` | `#E4E7EC` | Neutral strokes |
| `--jensify-success` | `#15803D` | Positive messaging |
| `--jensify-danger` | `#B91C1C` | Errors/destructive actions |
| `--jensify-warning` | `#B45309` | Tips/warnings |

Supporting tokens (e.g., `*-soft`, `*-border`, text/icon colors, focus ring) are also defined there so the palette can be swapped with minimal effort.

### Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Storage**: Supabase Storage (receipts, PDFs)
- **Serverless**: Supabase Edge Functions
- **OCR**: Google Vision API

### DevOps
- **Version Control**: Git + GitHub
- **CI/CD**: GitHub Actions
- **Hosting**: Vercel / Netlify
- **Monitoring**: Supabase Dashboard

## 📋 Prerequisites

Before you begin, ensure you have:
- **Node.js**: v18+ ([Download](https://nodejs.org/))
- **npm**: v9+ (comes with Node.js)
- **Angular CLI**: v20+ (install via `npm install -g @angular/cli`)
- **Git**: Latest version
- **Supabase Account**: [Sign up free](https://supabase.com/)
- **Google Cloud Account**: For Vision API ([Get started](https://cloud.google.com/vision))

## 🏁 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/JBCox/Jensify.git
cd Jensify
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com/)
2. Go to Project Settings → API
3. Copy your **Project URL** and **Anon Key**
4. Create a `.env` file in the project root:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

5. Run the database migrations:

```bash
# Install Supabase CLI if you haven't
npm install -g supabase

# Link your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

### 4. Set Up Google Vision API (Required for OCR)

**See [docs/GOOGLE_VISION_SETUP.md](./docs/GOOGLE_VISION_SETUP.md) for detailed instructions.**

Quick setup:
1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Cloud Vision API
3. Create an API key
4. Add the key to `expense-app/src/environments/environment.development.ts`:

```typescript
export const environment = {
  // ... other config
  simulateOcr: false,  // Set to false to use real OCR
  googleVisionApiKey: 'YOUR_API_KEY_HERE'
};
```

**Free Tier**: 1,000 OCR requests/month (resets monthly)

### 5. Run the Development Server

```bash
npm start
```

Navigate to `http://localhost:4200/` in your browser.

## 📁 Project Structure

```
Jensify/
├── src/
│   ├── app/
│   │   ├── core/               # Singleton services, guards, models
│   │   ├── features/           # Feature modules (auth, expenses, finance)
│   │   ├── shared/             # Reusable components, pipes, directives
│   │   ├── app.component.ts
│   │   ├── app.routes.ts
│   │   └── app.config.ts
│   ├── assets/                 # Images, icons, styles
│   ├── environments/           # Environment configuration
│   └── styles.scss             # Global styles
├── supabase/
│   ├── migrations/             # Database migrations
│   └── functions/              # Edge Functions
├── docs/                       # Documentation
│   ├── PRODUCT_VISION.md
│   ├── ARCHITECTURE.md
│   ├── DATA_MODEL.md
│   └── API_DESIGN.md
├── CLAUDE.md                   # AI assistant constitution
├── spec.md                     # Product specification
├── prompt_plan.md              # Implementation roadmap
└── README.md                   # This file
```

## 🧪 Testing

### Run Unit Tests
```bash
npm test
```

### Run Unit Tests with Coverage
```bash
npm run test:coverage
```

### Run E2E Tests
```bash
npm run e2e
```

### Run All Tests
```bash
npm run test:all
```

## 📦 Building for Production

```bash
npm run build
```

The build artifacts will be stored in the `dist/` directory.

## 🚢 Deployment

### Deploy to Vercel

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Deploy:
```bash
vercel --prod
```

### Deploy to Netlify

1. Install Netlify CLI:
```bash
npm install -g netlify-cli
```

2. Deploy:
```bash
netlify deploy --prod
```

## 📖 Documentation

- **[CLAUDE.md](./CLAUDE.md)** - Project constitution and coding standards
- **[spec.md](./spec.md)** - Comprehensive product specification
- **[prompt_plan.md](./prompt_plan.md)** - Detailed implementation roadmap
- **[docs/GOOGLE_VISION_SETUP.md](./docs/GOOGLE_VISION_SETUP.md)** - Google Vision OCR setup guide
- **[DEPLOYMENT_READY.md](./DEPLOYMENT_READY.md)** - Pre-deployment checklist
- **[docs/](./docs/)** - Additional technical documentation

## 🗺️ Roadmap

### ✅ Phase 0: Expense Receipt MVP (Weeks 1-3) - **98% Complete**
- ✅ User authentication (complete)
- ✅ Receipt upload for all expense types (complete)
- ✅ **OCR extraction with Google Vision API (complete)**
- ✅ Expense form with category selection (complete)
- ✅ Finance dashboard (complete)
- ✅ CSV export (complete)
- 🔄 Staging deployment (final step)

**Supported Categories**: Fuel, Meals & Entertainment, Lodging, Airfare, Ground Transportation, Office Supplies, Software/Subscriptions, Miscellaneous

### 🔄 Phase 1: Advanced Workflows (Weeks 4-11)
- Multi-level approval workflows
- Expense reports and batching
- Enhanced policy engine
- Email notifications
- Advanced filtering and search

### 📅 Phase 2: Cards + Reimbursements (Weeks 12-20)
- Corporate card integration
- Receipt matching
- ACH payment processing
- Budgeting system
- Advanced analytics

### 🎯 Phase 3: Extended Features (Weeks 21+)
- Accounting integrations (QuickBooks, Xero)
- Bill pay and invoicing
- Mobile native app
- AI-powered features
- Enterprise features

## 🤝 Contributing

This is a private project for Corvaer Manufacturing. For questions or suggestions, please contact Josh.

### Development Workflow

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes
3. Write/update tests
4. Ensure tests pass: `npm test`
5. Commit with clear message: `git commit -m "feat(scope): description"`
6. Push to branch: `git push origin feature/your-feature`
7. Create a Pull Request

## 🐛 Bug Reports & Feature Requests

Please create an issue in the GitHub repository with:
- Clear description
- Steps to reproduce (for bugs)
- Expected vs. actual behavior
- Screenshots (if applicable)
- Browser/device information

## 📄 License

This project is proprietary software owned by Corvaer Manufacturing.

## 👥 Team

- **Product Owner**: Josh (Corvaer Manufacturing)
- **Development**: Built with Claude Code
- **Company**: Corvaer Manufacturing, Fort Worth, Texas

## 🙏 Acknowledgments

- [Angular Team](https://angular.io/) for the amazing framework
- [Supabase Team](https://supabase.com/) for the excellent backend platform
- [Google Cloud](https://cloud.google.com/) for Vision API
- [Angular Material](https://material.angular.io/) for UI components

## 📞 Support

For technical support or questions:
- **Email**: josh@corvaer.com
- **GitHub Issues**: [Create an issue](https://github.com/JBCox/Jensify/issues)

---

**Built with ❤️ for Corvaer Manufacturing**

*Last Updated: November 27, 2024*
