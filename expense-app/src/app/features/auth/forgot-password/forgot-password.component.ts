import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

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
    MatIconModule
  ],
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.scss']
})
export class ForgotPasswordComponent implements OnInit {
  forgotPasswordForm!: FormGroup;
  loading = false;
  errorMessage = '';
  successMessage = '';

  constructor(
    private formBuilder: FormBuilder,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.forgotPasswordForm = this.formBuilder.group({
      email: ['', [Validators.required, Validators.email]]
    });
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
  async onSubmit(): Promise<void> {
    // Reset messages
    this.errorMessage = '';
    this.successMessage = '';

    // Validate form
    if (this.forgotPasswordForm.invalid) {
      this.forgotPasswordForm.get('email')?.markAsTouched();
      return;
    }

    this.loading = true;

    try {
      const { email } = this.forgotPasswordForm.value;
      await this.authService.resetPassword(email);

      // Show success message
      this.successMessage = 'Password reset instructions have been sent to your email. Please check your inbox and spam folder.';

      // Reset form
      this.forgotPasswordForm.reset();

    } catch (error: unknown) {
      // Handle errors
      if (error instanceof Error) {
        this.errorMessage = this.getErrorMessage(error.message);
      } else {
        this.errorMessage = 'An unexpected error occurred. Please try again.';
      }
      console.error('Password reset error:', error);
    } finally {
      this.loading = false;
    }
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
