# Issues Claude Cannot Fix

This document tracks issues that Claude was unable to resolve, so you can reference this list and avoid wasting time asking Claude to fix these in the future.

---

## UI/Styling Issues

### 1. Login Form - Password Field Alignment Issue
**Date**: November 13, 2025
**Component**: `expense-app/src/app/features/auth/login/login.component`
**Problem**: The vertical dividing line between the lock icon and password input field is positioned too far to the right compared to the email field's dividing line. The email field alignment is correct, but the password field does not match.
**What Was Attempted**:
- Removed component-specific styles to let global styles handle alignment
- Modified global styles (`styles.scss`) to set fixed width for prefix icon containers
- Added `::ng-deep` overrides directly in component styles with `!important` flags
- Attempted to standardize padding, width, and icon sizes across both fields

**Status**: UNRESOLVED
**Recommendation**: Hire a frontend developer to fix this issue

---

## Next Steps for User

When encountering similar issues:
1. Check this list first before asking Claude to fix
2. If the issue type is listed here, consider hiring a specialist instead
3. Update this list if Claude fails on new issue types

---

*Last Updated: November 13, 2025*
