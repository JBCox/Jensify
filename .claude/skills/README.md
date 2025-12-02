# Jensify Custom Skills

This directory contains custom skills for Claude Code to assist with Jensify development and testing.

## Available Skills

### 1. Agentic Testing (`agentic-testing.md`)

**Purpose:** Autonomous browser-based testing for the Jensify expense management application.

**Key Features:**
- Complete test scenarios for all user personas (Employee, Manager, Finance, Admin)
- Role-based access control (RBAC) testing
- CRUD operation validation
- Mobile responsiveness checks
- Screenshot documentation
- Issue tracking templates

**When to Use:**
- Before deploying new features
- Regression testing after major changes
- Validating approval workflows
- Testing across different user roles
- Documenting UI behavior

**Quick Start:**
```bash
# 1. Start dev server
cd C:\Jensify\expense-app
npm start

# 2. Reset database
cd C:\Jensify
supabase db reset

# 3. Invoke skill in Claude Code
/skill agentic-testing
```

**Test Categories Included:**
- Authentication flows (login, logout, registration)
- Role-based access control
- Expense CRUD operations
- Expense reports (create, submit, approve)
- Mileage tracking (manual and GPS)
- Form validation
- Empty states and error handling
- Mobile responsiveness

**Test Personas:**
- `employee@corvaer.com` - Basic user, submit expenses
- `manager@corvaer.com` - Approve team expenses
- `finance@corvaer.com` - Reimbursement queue
- `admin@corvaer.com` - Full system access

All passwords: `TestPass123!`

## Creating New Skills

To create a new skill for Claude Code:

1. Create a new `.md` file in this directory
2. Follow this structure:

```markdown
# Skill Name

## Purpose
[What this skill does in 1-2 sentences]

## When to Use This Skill
[Bullet points of scenarios]

## Prerequisites
[Requirements before using the skill]

## Instructions
[Step-by-step guide]

## Examples
[Complete examples]

## Best Practices
[DO/DON'T guidelines]
```

3. Reference existing skills in this directory for inspiration
4. Update this README when adding new skills

## Resources

- **Project Documentation:** `C:\Jensify\CLAUDE.md`
- **Features Guide:** `C:\Jensify\FEATURES.md`
- **System Architecture:** `C:\Jensify\HOW_JENSIFY_WORKS.md`

---

**Last Updated:** 2025-11-26
