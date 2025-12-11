import { Component, OnInit, OnDestroy, ChangeDetectionStrategy, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../core/services/auth.service';
import { BrandLogoComponent } from '../../../shared/components/brand-logo/brand-logo';

/**
 * Forgot Password Component
 * Allows users to request a password reset email.
 */
@Component({
  selector: 'app-forgot-password',
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
    MatIconModule,
    BrandLogoComponent
  ],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForgotPasswordComponent implements OnInit, OnDestroy {
  private formBuilder = inject(FormBuilder);
  private authService = inject(AuthService);
  private cdr = inject(ChangeDetectorRef);

  // Cleanup
  private destroy$ = new Subject<void>();

  forgotPasswordForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  ngOnInit(): void {
    this.forgotPasswordForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]]
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
    return this.forgotPasswordForm.controls;
  }

  /**
   * Handle form submission
   */
  onSubmit(): void {
    // Reset messages
    this.errorMessage = '';
    this.successMessage = '';

    // Validate form
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.get('email')?.markAsTouched();
      return;
    }

    this.loading = true;

    const { email } = this.forgotPasswordForm.value;

    this.authService.resetPassword(email)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          if (result.success) {
            this.successMessage = 'Password reset instructions have been sent to your email. Please check your inbox and spam folder.';
            this.forgotPasswordForm.reset();
          } else {
            this.errorMessage = this.getErrorMessage(result.error || 'Unable to process password reset. Please try again.');
          }
          this.loading = false;
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
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
    if (error.includes('Network')) {
      return 'Network error. Please check your connection and try again.';
    }
    if (error.includes('not found') || error.includes('Invalid email')) {
      return 'If an account exists with this email, you will receive password reset instructions.';
    }
    return 'Unable to process password reset. Please try again.';
  }
}
