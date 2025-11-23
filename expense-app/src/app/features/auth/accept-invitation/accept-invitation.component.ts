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
import { NotificationService } from '../../../core/services/notification.service';
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
  protected authService = inject(AuthService);
  private notificationService = inject(NotificationService);

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
   */
  private loadInvitation(): void {
    if (!this.token) return;

    this.invitationService.getInvitationByToken(this.token)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (invitation) => {
          if (!invitation) {
            this.error.set('Invitation not found or expired');
          } else {
            this.invitation.set(invitation);
          }
          this.isLoading.set(false);
        },
        error: (_error) => {
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
        next: (_membership) => {
          this.isLoading.set(false);
          this.notificationService.showSuccess(
            `Successfully joined ${this.invitation()?.organization?.name || 'organization'}!`
          );
          // Force reload to get fresh organization context
          window.location.href = '/home';
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
   */
  goToLogin(): void {
    if (this.token) {
      const returnUrl = `/auth/accept-invitation?token=${this.token}`;
      this.router.navigate(['/auth/login'], {
        queryParams: { returnUrl }
      });
    } else {
      this.router.navigate(['/auth/login']);
    }
  }

  /**
   * Navigate to register
   */
  goToRegister(): void {
    if (this.token) {
      const returnUrl = `/auth/accept-invitation?token=${this.token}`;
      this.router.navigate(['/auth/register'], {
        queryParams: { returnUrl }
      });
    } else {
      this.router.navigate(['/auth/register']);
    }
  }
}
