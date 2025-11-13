# Email Registration Testing Guide

This guide provides instructions for testing the email registration and confirmation flow in Jensify.

---

## Overview

Jensify uses **Supabase Authentication** with email confirmation enabled. When users register:

1. User fills out registration form
2. Supabase sends a confirmation email
3. User clicks the confirmation link in the email
4. User's account is activated
5. User can sign in

---

## Prerequisites

Before testing, ensure:

- [ ] Development server is running (`npm start`)
- [ ] Supabase project is accessible (https://bfudcugrarerqvvyfpoz.supabase.co)
- [ ] You have access to the email address you'll use for testing

---

## Email Configuration in Supabase

### Check Current Email Settings

1. Go to https://supabase.com/dashboard/project/bfudcugrarerqvvyfpoz
2. Navigate to **Authentication** > **Providers** > **Email**
3. Verify settings:
   - ✅ **Enable Email provider** should be ON
   - ✅ **Confirm email** should be ON (recommended for production)
   - For testing only: You can disable "Confirm email" temporarily

### Email Templates (Optional Customization)

1. In Supabase Dashboard, go to **Authentication** > **Email Templates**
2. Customize the "Confirm signup" template:
   - Add Jensify branding
   - Customize the message
   - Update the button text

**Default template includes:**
- Confirmation link
- Token expiration time (typically 24 hours)
- Support contact information

---

## Testing Flow

### Step 1: Access Registration Page

1. Open browser and navigate to: http://localhost:4200
2. Click **"Sign up"** link (or go directly to http://localhost:4200/auth/register)

### Step 2: Fill Out Registration Form

Enter the following information:

- **Full Name**: Test User (or your name)
- **Email**: Use a real email address you have access to
  - ⚠️ **Important**: Must be an email you can check
  - 💡 **Tip**: Use Gmail/Outlook for testing
  - 🔄 **Gmail trick**: Use `yourname+test1@gmail.com` for multiple test accounts
- **Password**: Must meet requirements:
  - Minimum 8 characters
  - At least 1 uppercase letter (A-Z)
  - At least 1 lowercase letter (a-z)
  - At least 1 number (0-9) OR special character (!@#$%^&*...)
  - Example: `TestPass123`
- **Confirm Password**: Must match the password field

### Step 3: Submit Registration

1. Click **"Create Account"** button
2. You should be redirected to the **"Check Your Email"** page
3. Verify the page shows:
   - ✅ Large email icon
   - ✅ "Check Your Email" heading
   - ✅ Your email address displayed
   - ✅ Instructions for next steps
   - ✅ Troubleshooting tips
   - ✅ "Resend Confirmation Email" button
   - ✅ "Already confirmed? Sign In" button

### Step 4: Check Your Email

1. Open your email inbox
2. Look for an email from **Supabase** (subject: "Confirm your signup")
   - If not in inbox, check **Spam/Junk** folder
   - Email may take 1-5 minutes to arrive
3. Email should contain:
   - Confirmation link/button
   - Link expires in 24 hours (default)

### Step 5: Confirm Email

1. Click the **"Confirm your email"** button/link in the email
2. You will be redirected to Supabase confirmation page
3. You should see a success message
4. The page may automatically redirect back to Jensify

### Step 6: Sign In

1. Go to http://localhost:4200/auth/login
2. Enter your email and password
3. Click **"Sign In"**
4. You should be redirected to: http://localhost:4200/expenses/upload
5. ✅ **Success!** You are now logged in

---

## Troubleshooting

### Issue: Email Not Received

**Possible Causes:**
1. Email is in spam/junk folder
2. Email address was typed incorrectly
3. Supabase email service is delayed
4. Email confirmation is disabled in Supabase

**Solutions:**
- Check spam/junk folder
- Wait 5-10 minutes for email to arrive
- Click "Resend Confirmation Email" on the confirmation page
- Verify email address is correct
- Check Supabase Dashboard > Authentication > Logs for errors

### Issue: Confirmation Link Expired

**Problem:** Clicked confirmation link after 24 hours

**Solution:**
1. Go to http://localhost:4200/auth/register
2. Try to register again with the same email
3. Supabase will send a new confirmation email
4. Or use the "Resend Confirmation Email" button

### Issue: "Invalid or expired token"

**Possible Causes:**
1. Token already used
2. Token expired (>24 hours old)
3. Token was for a different environment

**Solution:**
1. Request a new confirmation email
2. Or contact system administrator

### Issue: "Email already registered"

**Problem:** Tried to register with an email that's already in the system

**Solution:**
1. If you already confirmed your email, use "Sign In" instead
2. If you forgot your password, use "Forgot password?" link
3. If you never confirmed, check your email for the original confirmation link

### Issue: Cannot Sign In After Confirmation

**Possible Causes:**
1. Email not actually confirmed (check email again)
2. Wrong password
3. Account disabled by administrator

**Solutions:**
- Verify you clicked the confirmation link
- Check Supabase Dashboard > Authentication > Users to see if user is confirmed
- Try password reset if you forgot your password
- Contact system administrator

---

## Testing Without Email Confirmation (Dev Only)

For faster testing during development, you can disable email confirmation:

### Disable Email Confirmation in Supabase

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/bfudcugrarerqvvyfpoz
2. Navigate to **Authentication** > **Providers** > **Email**
3. Toggle OFF: **"Confirm email"**
4. Save changes

**With email confirmation disabled:**
- Users can sign in immediately after registration
- No confirmation email is sent
- Registration redirects directly to login or dashboard

⚠️ **Warning:** Only disable email confirmation for development/testing. Always enable it for production.

### Re-enable Email Confirmation

1. Go to Supabase Dashboard
2. Navigate to **Authentication** > **Providers** > **Email**
3. Toggle ON: **"Confirm email"**
4. Save changes

---

## Verifying Registration in Supabase

### Check User Records

1. Go to Supabase Dashboard
2. Navigate to **Authentication** > **Users**
3. You should see your test user with:
   - Email address
   - Created timestamp
   - Last sign-in timestamp
   - Confirmation status (confirmed/unconfirmed)

### Check Database User Profile

1. In Supabase Dashboard, go to **Table Editor**
2. Select `users` table
3. Find your user record:
   - `id`: UUID (matches auth.users)
   - `email`: Your email address
   - `full_name`: Name you entered
   - `role`: `employee` (default)
   - `created_at`: Registration timestamp
   - `updated_at`: Last update timestamp

---

## Testing Checklist

Use this checklist to verify all functionality:

- [ ] Can access registration page
- [ ] Form validation works (required fields, email format, password strength)
- [ ] Password confirmation validation works
- [ ] Form shows loading state during submission
- [ ] Redirects to email confirmation page after registration
- [ ] Confirmation page shows correct email address
- [ ] Confirmation email is received
- [ ] Confirmation link works
- [ ] Can sign in after confirming email
- [ ] Cannot sign in before confirming email (if confirmation enabled)
- [ ] "Resend confirmation" button works
- [ ] Error messages are user-friendly
- [ ] Mobile responsive design works
- [ ] User record created in Supabase auth
- [ ] User profile created in users table with correct role

---

## Common Test Scenarios

### Test 1: Successful Registration Flow
1. Register with valid data
2. Receive confirmation email
3. Click confirmation link
4. Sign in successfully
5. **Expected**: User logged in, redirected to expenses page

### Test 2: Duplicate Email Registration
1. Register with an email that already exists
2. **Expected**: Error message "This email is already registered"

### Test 3: Invalid Email Format
1. Enter invalid email (e.g., "notanemail")
2. **Expected**: Validation error "Please enter a valid email address"

### Test 4: Weak Password
1. Enter password that doesn't meet requirements (e.g., "pass")
2. **Expected**: Validation error showing password requirements

### Test 5: Password Mismatch
1. Enter different values in password and confirm password fields
2. **Expected**: Error message "Passwords do not match"

### Test 6: Expired Confirmation Token
1. Wait 24+ hours after registration
2. Try to use old confirmation link
3. **Expected**: Error message, option to resend

---

## Production Considerations

When deploying to production:

1. **Keep email confirmation ENABLED**
2. **Customize email templates** with company branding
3. **Use custom domain** for email sender (optional)
4. **Set up SMTP** with company email server (optional)
5. **Monitor email delivery** in Supabase logs
6. **Set up email rate limiting** to prevent abuse
7. **Add email verification** to prevent typos during registration

---

## Email Testing Tools (Optional)

For testing emails without using real email addresses:

1. **Mailtrap** (https://mailtrap.io) - Email testing sandbox
2. **MailHog** - Local email testing server
3. **Gmail + alias** - Use yourname+test1@gmail.com, yourname+test2@gmail.com

---

## Support & Questions

If you encounter issues:

1. Check **Supabase Logs**: Authentication > Logs in dashboard
2. Check **Browser Console**: F12 → Console tab for JavaScript errors
3. Check **Network Tab**: F12 → Network tab for API failures
4. Review **Supabase Documentation**: https://supabase.com/docs/guides/auth
5. Contact project administrator

---

*Last Updated: November 13, 2025*
*Jensify Version: 0.1.0 (Phase 0)*
