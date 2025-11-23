import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Login Component
 * Allows users to authenticate with email and password.
 * Supports return URL redirection after successful login.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit, OnDestroy {
  private formBuilder = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private cdr = inject(ChangeDetectorRef);

  // Cleanup
  private destroy$ = new Subject<void>();

  loginForm!: FormGroup;
  loading = false;
  errorMessage = '';
  hidePassword = true;
  returnUrl: string | null = null;

  ngOnInit(): void {
    // Capture return URL if provided, unless it's one of the legacy default routes
    const incomingReturnUrl = this.route.snapshot.queryParams['returnUrl'] || null;
    this.returnUrl = this.authService.shouldUseDefaultRoute(incomingReturnUrl) ? null : incomingReturnUrl;

    // Initialize the login form with validation
    this.loginForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Getter for easy access to form controls in the template
   */
  get f() {
    return this.loginForm.controls;
  }

  /**
   * Handle form submission
   */
  async onSubmit(): Promise<void> {
    // Reset error message
    this.errorMessage = '';

    // Validate form
    if (this.loginForm.invalid) {
      Object.keys(this.loginForm.controls).forEach(key => {
        this.loginForm.controls[key].markAsTouched();
      });
      return;
    }

    this.loading = true;

    const { email, password } = this.loginForm.value;

    this.authService.signIn({ email, password })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (result) => {
          if (result.success) {
            this.authService.suppressNextDefaultRedirect();
            await this.authService.refreshUserProfile();
            const destination =
              this.returnUrl && !this.authService.shouldUseDefaultRoute(this.returnUrl)
                ? this.returnUrl
                : this.authService.getDefaultRoute();
            await this.router.navigateByUrl(destination);
          } else {
            this.errorMessage = this.getErrorMessage(result.error || 'Login failed');
            this.cdr.markForCheck();
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (error) => {
          // Handle authentication errors
          if (error instanceof Error) {
            this.errorMessage = this.getErrorMessage(error.message);
          } else {
            this.errorMessage = 'An unexpected error occurred. Please try again.';
          }
          this.loading = false;
          this.cdr.markForCheck();
        }
      });
  }

  /**
   * Convert Supabase error messages to user-friendly messages
   */
  private getErrorMessage(error: string): string {
    if (error.includes('Invalid login credentials')) {
      return 'Invalid email or password. Please try again.';
    }
    if (error.includes('Email not confirmed')) {
      return 'Please confirm your email address before logging in.';
    }
    if (error.includes('Network')) {
      return 'Network error. Please check your connection and try again.';
    }
    return 'Login failed. Please try again.';
  }

  /**
   * Toggle password visibility
   */
  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }
}
