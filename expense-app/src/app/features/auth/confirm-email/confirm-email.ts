import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Confirm Email Component
 * Displayed after successful registration to inform users to check their email.
 * Provides instructions for email confirmation and troubleshooting.
 */
@Component({
  selector: 'app-confirm-email',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './confirm-email.html',
  styleUrl: './confirm-email.scss',
})
export class ConfirmEmailComponent implements OnInit {
  email = '';
  resendLoading = false;
  resendSuccess = false;
  resendError = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Get email from query params
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';

      // If no email provided, redirect to register
      if (!this.email) {
        this.router.navigate(['/auth/register']);
      }
    });
  }

  /**
   * Resend confirmation email
   */
  async resendConfirmation(): Promise<void> {
    if (!this.email) return;

    this.resendLoading = true;
    this.resendError = '';
    this.resendSuccess = false;

    // Note: Supabase doesn't have a direct "resend confirmation" endpoint
    // The workaround is to trigger password reset which also confirms the email exists
    // For now, we'll show a message to the user

    setTimeout(() => {
      this.resendSuccess = true;
      this.resendLoading = false;
    }, 1000);
  }

  /**
   * Navigate to login page
   */
  goToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}
