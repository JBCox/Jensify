import { Component, OnInit, OnDestroy, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatDividerModule } from '@angular/material/divider';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { OrganizationService } from '../../../core/services/organization.service';
import { InvitationService } from '../../../core/services/invitation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Invitation } from '../../../core/models';

/**
 * Organization Setup Wizard Component
 * Shown to users who don't have an organization yet
 * Allows them to create one or view/accept pending invitations
 */
@Component({
  selector: 'app-organization-setup',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatDividerModule
  ],
  templateUrl: './organization-setup.component.html',
  styleUrls: ['./organization-setup.component.scss']
,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrganizationSetupComponent implements OnInit, OnDestroy {
  private fb = inject(FormBuilder);
  private organizationService = inject(OrganizationService);
  private invitationService = inject(InvitationService);
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  // Cleanup
  private destroy$ = new Subject<void>();

  createOrgForm: FormGroup;
  isLoading = signal(false);
  pendingInvitations = signal<Invitation[]>([]);
  showCreateForm = signal(false);

  constructor() {
    this.createOrgForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      domain: ['', [Validators.pattern(/^[a-z0-9-]+\.[a-z]{2,}$/i)]]
    });
  }

  ngOnInit(): void {
    this.loadPendingInvitations();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load pending invitations for current user
   */
  private loadPendingInvitations(): void {
    // Note: We'll need to implement a special RLS policy that allows users
    // to see invitations sent to their email even without an organization
    this.invitationService.getOrganizationInvitations('pending')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (invitations) => {
          this.pendingInvitations.set(invitations);
        },
        error: (error) => {
          console.error('Error loading invitations:', error);
          // It's okay if this fails - user might just not have invitations
        }
      });
  }

  /**
   * Toggle create organization form
   */
  toggleCreateForm(): void {
    this.showCreateForm.update(v => !v);
  }

  /**
   * Create new organization
   */
  createOrganization(): void {
    if (this.createOrgForm.invalid) {
      this.createOrgForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);

    const formValue = this.createOrgForm.value;
    this.organizationService.createOrganization({
      name: formValue.name,
      domain: formValue.domain || undefined
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (organization) => {
          this.notificationService.showSuccess(
            `Organization "${organization.name}" created successfully!`
          );
          // Load the full organization context (including membership with admin role)
          this.organizationService.getUserOrganizationContext()
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (context) => {
                this.isLoading.set(false);
                if (context && context.current_organization && context.current_membership) {
                  // Set the current organization with the admin membership
                  this.organizationService.setCurrentOrganization(
                    context.current_organization,
                    context.current_membership
                  );
                  // Now navigate to home with full context loaded
                  this.router.navigate(['/home']);
                } else {
                  this.notificationService.showError(
                    'Organization created but failed to load context. Please refresh the page.'
                  );
                }
              },
              error: (error) => {
                this.isLoading.set(false);
                this.notificationService.showError(
                  'Organization created but failed to load context: ' + (error.message || 'Unknown error')
                );
                // Navigate anyway, user can refresh
                this.router.navigate(['/home']);
              }
            });
        },
        error: (error) => {
          this.isLoading.set(false);
          this.notificationService.showError(
            error.message || 'Failed to create organization'
          );
        }
      });
  }

  /**
   * Accept an invitation
   */
  acceptInvitation(invitation: Invitation): void {
    if (!invitation.token) {
      this.notificationService.showError('Invalid invitation');
      return;
    }

    this.isLoading.set(true);

    this.invitationService.acceptInvitation({
      token: invitation.token
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.notificationService.showSuccess(
            `Successfully joined ${invitation.organization?.name || 'organization'}!`
          );
          // Reload organization context and redirect
          window.location.href = '/home'; // Force reload to get fresh context
        },
        error: (error) => {
          this.isLoading.set(false);
          this.notificationService.showError(
            error.message || 'Failed to accept invitation'
          );
        }
      });
  }

  /**
   * Get field error message
   */
  getFieldError(fieldName: string): string {
    const field = this.createOrgForm.get(fieldName);
    if (!field || !field.errors || !field.touched) {
      return '';
    }

    if (field.errors['required']) {
      return 'This field is required';
    }
    if (field.errors['minlength']) {
      return `Minimum ${field.errors['minlength'].requiredLength} characters required`;
    }
    if (field.errors['maxlength']) {
      return `Maximum ${field.errors['maxlength'].requiredLength} characters allowed`;
    }
    if (field.errors['pattern'] && fieldName === 'domain') {
      return 'Please enter a valid domain (e.g., company.com)';
    }

    return 'Invalid value';
  }
}
