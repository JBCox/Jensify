import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { Subject, takeUntil, filter, take } from 'rxjs';
import { SupabaseService } from '../../../core/services/supabase.service';

/**
 * Auth Callback Component
 * Handles OAuth and email confirmation callbacks from Supabase.
 *
 * When users click confirmation links in emails, Supabase redirects them
 * back to the app with tokens in the URL hash. This component:
 * 1. Lets the Supabase client detect and process the tokens
 * 2. Waits for the session to be established
 * 3. Redirects to the appropriate page
 */
@Component({
  selector: 'app-auth-callback',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatButtonModule
  ],
  template: `
    <div class="auth-callback-container">
      <mat-card class="auth-callback-card">
        @if (error()) {
          <div class="error-state">
            <mat-icon class="error-icon">error_outline</mat-icon>
            <h2>Verification Failed</h2>
            <p>{{ error() }}</p>
            <button mat-raised-button color="primary" (click)="goToLogin()">
              Go to Login
            </button>
          </div>
        } @else {
          <div class="loading-state">
            <mat-spinner diameter="48"></mat-spinner>
            <h2>{{ message() }}</h2>
            <p class="hint">Please wait...</p>
          </div>
        }
      </mat-card>
    </div>
  `,
  styles: [`
    .auth-callback-container {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
      padding: 16px;
    }

    .auth-callback-card {
      max-width: 400px;
      width: 100%;
      padding: 48px 32px;
      text-align: center;
    }

    .loading-state, .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
    }

    .error-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: #f44336;
    }

    h2 {
      margin: 0;
      font-size: 20px;
      font-weight: 600;
      color: #333;
    }

    p {
      margin: 0;
      color: #666;
    }

    .hint {
      font-size: 14px;
    }

    button {
      margin-top: 16px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AuthCallbackComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private supabase = inject(SupabaseService);
  private destroy$ = new Subject<void>();

  /** Timeout ID for fallback redirect */
  private fallbackTimeoutId: ReturnType<typeof setTimeout> | null = null;

  message = signal('Verifying your email...');
  error = signal<string | null>(null);

  ngOnInit(): void {
    this.handleCallback();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Clear any pending timeout
    if (this.fallbackTimeoutId) {
      clearTimeout(this.fallbackTimeoutId);
    }
  }

  private handleCallback(): void {
    // Check if there's a hash fragment with tokens
    const hash = window.location.hash;

    if (hash && (hash.includes('access_token') || hash.includes('error'))) {
      // Check for error in hash
      if (hash.includes('error')) {
        const params = new URLSearchParams(hash.substring(1));
        const errorDesc = params.get('error_description') || 'Verification failed';
        this.error.set(errorDesc.replace(/\+/g, ' '));
        return;
      }

      // Set up fallback timeout (10 seconds) in case session initialization hangs
      this.fallbackTimeoutId = setTimeout(() => {
        // If we're still on this page, something went wrong - try fallback redirect
        // Check URL params first (cross-device), then localStorage (same-device)
        const urlParams = new URLSearchParams(window.location.search);
        const pendingToken = urlParams.get('invitation_token') || localStorage.getItem('pending_invitation_token');
        if (pendingToken) {
          this.router.navigate(['/auth/accept-invitation'], {
            queryParams: { token: pendingToken }
          });
        } else if (this.supabase.isAuthenticated) {
          this.router.navigate(['/home']);
        } else {
          this.error.set('Verification timed out. Please try logging in manually.');
        }
      }, 10000);

      // Wait for Supabase to process the tokens and establish session
      this.message.set('Completing verification...');

      this.supabase.sessionInitialized$
        .pipe(
          filter(initialized => initialized),
          take(1),
          takeUntil(this.destroy$)
        )
        .subscribe(() => {
          // Clear the fallback timeout since we got a response
          if (this.fallbackTimeoutId) {
            clearTimeout(this.fallbackTimeoutId);
            this.fallbackTimeoutId = null;
          }

          // Give a moment for session to be fully established
          setTimeout(() => {
            if (this.supabase.isAuthenticated) {
              this.message.set('Email verified! Redirecting...');
              setTimeout(() => {
                this.redirectAfterAuth();
              }, 1000);
            } else {
              // Session not established, might need to wait longer or there's an issue
              this.waitForSession();
            }
          }, 500);
        });
    } else {
      // No hash fragment - might be a direct visit or different flow
      // Check URL params for invitation token (cross-device flow)
      const urlParams = new URLSearchParams(window.location.search);
      const urlInvitationToken = urlParams.get('invitation_token');

      // Check if already authenticated
      if (this.supabase.isAuthenticated) {
        // Check for pending invitation before redirecting to home
        // URL params take priority (cross-device), then localStorage (same-device)
        const pendingToken = urlInvitationToken || localStorage.getItem('pending_invitation_token');
        if (pendingToken) {
          this.router.navigate(['/auth/accept-invitation'], {
            queryParams: { token: pendingToken }
          });
        } else {
          this.router.navigate(['/home']);
        }
      } else if (urlInvitationToken) {
        // Not authenticated but have invitation token - redirect to login with token preserved
        this.error.set('Please log in to accept your invitation.');
      } else {
        this.error.set('No verification token found. Please check your email link.');
      }
    }
  }

  private waitForSession(): void {
    // Wait for session to be established (max 10 seconds)
    let attempts = 0;
    const maxAttempts = 20;

    const checkSession = setInterval(() => {
      attempts++;

      if (this.supabase.isAuthenticated) {
        clearInterval(checkSession);
        this.message.set('Email verified! Redirecting...');
        setTimeout(() => {
          this.redirectAfterAuth();
        }, 1000);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkSession);
        this.error.set('Verification timed out. Please try logging in.');
      }
    }, 500);
  }

  /**
   * Redirect after successful authentication
   * Checks for pending invitation token and redirects accordingly
   * Priority: user metadata (most reliable) > URL params > localStorage
   */
  private redirectAfterAuth(): void {
    // Check for invitation token in user metadata (stored during registration - most reliable)
    const metadataToken = this.supabase.currentUser?.user_metadata?.['pending_invitation_token'] as string | undefined;

    // Check for invitation token in URL query params (legacy cross-device support)
    const urlParams = new URLSearchParams(window.location.search);
    const urlInvitationToken = urlParams.get('invitation_token');

    // Fall back to localStorage for same-device flow
    const localStorageToken = localStorage.getItem('pending_invitation_token');

    // Priority: metadata (server-side, survives email confirmation) > URL > localStorage
    const pendingInvitationToken = metadataToken || urlInvitationToken || localStorageToken;

    console.log('%c[AUTH CALLBACK] Checking for pending token:', 'background: #2196F3; color: white;', {
      metadataToken: metadataToken,
      urlToken: urlInvitationToken,
      localStorageToken: localStorageToken,
      using: pendingInvitationToken
    });

    if (pendingInvitationToken) {
      // Redirect to accept the invitation
      // Token will be cleared by accept-invitation component after successful acceptance
      this.router.navigate(['/auth/accept-invitation'], {
        queryParams: { token: pendingInvitationToken }
      });
    } else {
      // Normal flow - go to home
      this.router.navigate(['/home']);
    }
  }

  goToLogin(): void {
    this.router.navigate(['/auth/login']);
  }
}
