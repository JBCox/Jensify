# Jensify - Modern Expense Management Platform

> A mobile-first expense management platform built for Covaer Manufacturing, designed to rival Expensify, Ramp, and Brex.

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

**Timeline**: 2-3 weeks (Started November 13, 2025)
**Status**: 🛠️ In Development (80% Complete)
**Initial Focus**: Gas receipts for traveling employees
**Supports**: All expense categories (gas, hotels, flights, meals, office supplies, etc.)

### MVP Features
- ✅ **User authentication** (email/password) - Complete with full UI
- ✅ **Database schema** with Row Level Security policies
- ✅ **Navigation** with role-based access
- ✅ **Receipt upload** (mobile camera & desktop drag-drop) - Complete
- 🔄 **OCR** with Google Vision API - Next Up
- 🔄 **Expense form** with category selection
- 🔄 **Finance dashboard**
- 🔄 **CSV export** for accounting

### Recently Completed (November 13, 2025)
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

### 4. Set Up Google Vision API

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/)
2. Enable the Vision API
3. Create a service account and download the JSON key
4. Add the credentials to your Supabase Edge Function environment

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
- **[docs/](./docs/)** - Additional technical documentation

## 🗺️ Roadmap

### 🛠️ Phase 0: Expense Receipt MVP (Weeks 1-3) - 80% Complete
- ✅ User authentication (complete)
- ✅ Receipt upload for all expense types (complete)
- 🔄 OCR extraction (in progress)
- 🔄 Expense form with category selection
- 🔄 Finance dashboard
- 🔄 CSV export

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

This is a private project for Covaer Manufacturing. For questions or suggestions, please contact Josh.

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

This project is proprietary software owned by Covaer Manufacturing.

## 👥 Team

- **Product Owner**: Josh (Covaer Manufacturing)
- **Development**: Built with Claude Code
- **Company**: Covaer Manufacturing, Fort Worth, Texas

## 🙏 Acknowledgments

- [Angular Team](https://angular.io/) for the amazing framework
- [Supabase Team](https://supabase.com/) for the excellent backend platform
- [Google Cloud](https://cloud.google.com/) for Vision API
- [Angular Material](https://material.angular.io/) for UI components

## 📞 Support

For technical support or questions:
- **Email**: josh@covaer.com
- **GitHub Issues**: [Create an issue](https://github.com/JBCox/Jensify/issues)

---

**Built with ❤️ for Covaer Manufacturing**

*Last Updated: November 13, 2025*
