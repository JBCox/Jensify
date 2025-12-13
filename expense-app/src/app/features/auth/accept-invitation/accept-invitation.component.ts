import { Component, OnInit, OnDestroy, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { InvitationService } from '../../../core/services/invitation.service';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Invitation } from '../../../core/models';

/**
 * Accept Invitation Component
 * Allows users to accept organization invitations via token link
 */
@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './accept-invitation.component.html',
  styleUrls: ['./accept-invitation.component.scss']
,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AcceptInvitationComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private invitationService = inject(InvitationService);
  private supabaseService = inject(SupabaseService);
  protected authService = inject(AuthService);

  // Cleanup
  private destroy$ = new Subject<void>();

  invitation = signal<Invitation | null>(null);
  isLoading = signal(true);
  error = signal<string | null>(null);
  token: string | null = null;

  ngOnInit(): void {
    // Get token from query params
    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.token = params['token'];
        if (!this.token) {
          this.error.set('Invalid invitation link');
          this.isLoading.set(false);
          return;
        }

        this.loadInvitation();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load invitation details
   * Clears the pending_invitation_token from localStorage after successful load
   * to prevent redirect loops while preserving the token if load fails.
   */
  private loadInvitation(): void {
    if (!this.token) return;

    this.invitationService.getInvitationByToken(this.token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (invitation) => {
          if (!invitation) {
            this.error.set('Invitation not found or expired');
            // Clear the token since invitation is invalid
            localStorage.removeItem('pending_invitation_token');
          } else {
            this.invitation.set(invitation);
            // Successfully loaded - clear the pending token to prevent redirect loops
            localStorage.removeItem('pending_invitation_token');
          }
          this.isLoading.set(false);
        },
        error: (_error) => {
          // DON'T remove token on error - user might retry or navigate elsewhere
          this.error.set('Failed to load invitation');
          this.isLoading.set(false);
        }
      });
  }

  /**
   * Accept invitation
   */
  acceptInvitation(): void {
    if (!this.token) return;

    // Check if user is authenticated
    if (!this.authService.isAuthenticated) {
      // Redirect to login with return URL
      const returnUrl = `/auth/accept-invitation?token=${this.token}`;
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl }
      });
      return;
    }

    this.isLoading.set(true);

    this.invitationService.acceptInvitation({
      token: this.token
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: async (membership) => {
          // Note: Success notification is shown by InvitationService

          // CRITICAL: Set organization context before navigating
          // This ensures auth guard sees the user has an organization
          if (membership?.organization_id) {
            localStorage.setItem('current_organization_id', membership.organization_id);
          }

          // Clear pending invitation token from user metadata (used for cross-device flow)
          await this.supabaseService.clearPendingInvitationToken();

          // Refresh user profile to load the new organization context
          // This updates the OrganizationService's BehaviorSubjects with the full org data
          await this.authService.refreshUserProfile();

          this.isLoading.set(false);

          // Navigate to home - auth guard will now see org context
          this.router.navigate(['/home']);
        },
        error: (error) => {
          this.isLoading.set(false);
          this.error.set(error.message || 'Failed to accept invitation');
        }
      });
  }

  /**
   * Decline invitation
   */
  declineInvitation(): void {
    this.router.navigate(['/']);
  }

  /**
   * Navigate to login
   * Stores the invitation token in localStorage so it persists through the login flow
   */
  goToLogin(): void {
    if (this.token) {
      // Store invitation token to persist through login flow
      localStorage.setItem('pending_invitation_token', this.token);
      console.log('%c[INVITATION FLOW] Token stored:', 'background: #4CAF50; color: white;', this.token);
      this.router.navigate(['/auth/login']);
    } else {
      this.router.navigate(['/auth/login']);
    }
  }

  /**
   * Navigate to register
   * Passes invitation token in URL so it works across devices
   */
  goToRegister(): void {
    if (this.token) {
      // Pass token in URL - works across devices (unlike localStorage)
      // Also store in localStorage as backup for same-device flow
      localStorage.setItem('pending_invitation_token', this.token);
      console.log('%c[INVITATION FLOW] Token passed to register:', 'background: #4CAF50; color: white;', this.token);
      this.router.navigate(['/auth/register'], {
        queryParams: { invitation_token: this.token }
      });
    } else {
      this.router.navigate(['/auth/register']);
    }
  }
}
