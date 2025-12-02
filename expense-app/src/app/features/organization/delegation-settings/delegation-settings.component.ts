import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { RouterModule } from '@angular/router';
import { DelegationService } from '../../../core/services/delegation.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import {
  ExpenseDelegation,
  DelegationScope,
  DELEGATION_SCOPE_DESCRIPTIONS,
  DELEGATION_SCOPE_ICONS
} from '../../../core/models/delegation.model';

interface OrgMember {
  id: string;
  user_id: string;
  user: { id: string; full_name: string; email: string };
}

@Component({
  selector: 'app-delegation-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatChipsModule,
    MatDialogModule,
    MatTooltipModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  template: `
    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <button mat-icon-button routerLink="/admin" class="back-button">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h1 class="jensify-page-title">Approval Delegation</h1>
            <p class="jensify-page-subtitle">Allow users to submit expenses on behalf of others</p>
          </div>
        </div>
        <button mat-flat-button color="primary" (click)="showCreateForm = true" [disabled]="showCreateForm">
          <mat-icon>add</mat-icon>
          New Delegation
        </button>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else {
        <!-- Create Delegation Form -->
        @if (showCreateForm) {
          <mat-card class="jensify-card form-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">person_add</mat-icon>
              <mat-card-title>Create New Delegation</mat-card-title>
              <mat-card-subtitle>Allow one user to submit expenses on behalf of another</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <form [formGroup]="delegationForm" (ngSubmit)="createDelegation()">
                <div class="form-row">
                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>Delegator (Expense Owner)</mat-label>
                    <mat-select formControlName="delegator_id" required>
                      @for (member of members(); track member.user_id) {
                        <mat-option [value]="member.user_id">
                          {{ member.user.full_name }} ({{ member.user.email }})
                        </mat-option>
                      }
                    </mat-select>
                    <mat-hint>Who will the expenses belong to?</mat-hint>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>Delegate (Assistant)</mat-label>
                    <mat-select formControlName="delegate_id" required>
                      @for (member of members(); track member.user_id) {
                        <mat-option [value]="member.user_id">
                          {{ member.user.full_name }} ({{ member.user.email }})
                        </mat-option>
                      }
                    </mat-select>
                    <mat-hint>Who can submit on their behalf?</mat-hint>
                  </mat-form-field>
                </div>

                <div class="form-row">
                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>Permission Scope</mat-label>
                    <mat-select formControlName="scope" required>
                      @for (scope of scopes; track scope) {
                        <mat-option [value]="scope">
                          <mat-icon>{{ scopeIcons[scope] }}</mat-icon>
                          {{ scopeDescriptions[scope] }}
                        </mat-option>
                      }
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="form-field">
                    <mat-label>Valid Until (Optional)</mat-label>
                    <input matInput [matDatepicker]="picker" formControlName="valid_until">
                    <mat-datepicker-toggle matIconSuffix [for]="picker"></mat-datepicker-toggle>
                    <mat-datepicker #picker></mat-datepicker>
                    <mat-hint>Leave empty for no expiration</mat-hint>
                  </mat-form-field>
                </div>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Notes (Optional)</mat-label>
                  <textarea matInput formControlName="notes" rows="2" placeholder="Reason for delegation..."></textarea>
                </mat-form-field>

                <div class="form-actions">
                  <button mat-stroked-button type="button" (click)="cancelCreate()">Cancel</button>
                  <button mat-flat-button color="primary" type="submit"
                          [disabled]="delegationForm.invalid || saving()">
                    @if (saving()) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                      <ng-container><mat-icon>save</mat-icon> Create Delegation</ng-container>
                    }
                  </button>
                </div>
              </form>
            </mat-card-content>
          </mat-card>
        }

        <!-- Delegations List -->
        <mat-card class="jensify-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="card-icon">swap_horiz</mat-icon>
            <mat-card-title>Active Delegations</mat-card-title>
            <mat-card-subtitle>{{ delegations().length }} delegation(s) configured</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            @if (delegations().length === 0) {
              <div class="empty-state">
                <mat-icon>group</mat-icon>
                <h3>No Delegations</h3>
                <p>Create a delegation to allow one user to submit expenses on behalf of another.</p>
              </div>
            } @else {
              <div class="delegations-list">
                @for (delegation of delegations(); track delegation.id) {
                  <div class="delegation-item" [class.inactive]="!delegation.is_active">
                    <div class="delegation-info">
                      <div class="delegation-users">
                        <div class="user-badge delegator">
                          <mat-icon>person</mat-icon>
                          <div class="user-details">
                            <span class="user-name">{{ delegation.delegator?.full_name }}</span>
                            <span class="user-role">Expense Owner</span>
                          </div>
                        </div>
                        <mat-icon class="arrow-icon">arrow_forward</mat-icon>
                        <div class="user-badge delegate">
                          <mat-icon>person_outline</mat-icon>
                          <div class="user-details">
                            <span class="user-name">{{ delegation.delegate?.full_name }}</span>
                            <span class="user-role">Can Submit For</span>
                          </div>
                        </div>
                      </div>
                      <div class="delegation-meta">
                        <mat-chip-set>
                          <mat-chip [highlighted]="delegation.is_active" [color]="delegation.is_active ? 'primary' : 'warn'">
                            <mat-icon matChipAvatar>{{ scopeIcons[delegation.scope] }}</mat-icon>
                            {{ delegation.scope | titlecase }}
                          </mat-chip>
                          @if (delegation.valid_until) {
                            <mat-chip>
                              <mat-icon matChipAvatar>event</mat-icon>
                              Expires {{ delegation.valid_until | date:'shortDate' }}
                            </mat-chip>
                          }
                          @if (!delegation.is_active) {
                            <mat-chip color="warn">Revoked</mat-chip>
                          }
                        </mat-chip-set>
                        @if (delegation.notes) {
                          <span class="notes">{{ delegation.notes }}</span>
                        }
                      </div>
                    </div>
                    <div class="delegation-actions">
                      @if (delegation.is_active) {
                        <button mat-icon-button color="warn" (click)="revokeDelegation(delegation)"
                                matTooltip="Revoke Delegation">
                          <mat-icon>block</mat-icon>
                        </button>
                      }
                      <button mat-icon-button color="warn" (click)="deleteDelegation(delegation)"
                              matTooltip="Delete Permanently">
                        <mat-icon>delete</mat-icon>
                      </button>
                    </div>
                  </div>
                }
              </div>
            }
          </mat-card-content>
        </mat-card>

        <!-- How It Works -->
        <mat-card class="jensify-card info-card">
          <mat-card-header>
            <mat-icon mat-card-avatar class="card-icon info-icon">info</mat-icon>
            <mat-card-title>How Delegation Works</mat-card-title>
          </mat-card-header>
          <mat-card-content>
            <div class="info-grid">
              <div class="info-item">
                <mat-icon>person_add</mat-icon>
                <h4>Create Delegation</h4>
                <p>An admin creates a delegation between a delegator (expense owner) and a delegate (assistant).</p>
              </div>
              <div class="info-item">
                <mat-icon>edit_note</mat-icon>
                <h4>Submit Expenses</h4>
                <p>The delegate can create and submit expenses on behalf of the delegator based on their scope.</p>
              </div>
              <div class="info-item">
                <mat-icon>visibility</mat-icon>
                <h4>Full Tracking</h4>
                <p>All proxy submissions are tracked. The expense shows who submitted it and who it's for.</p>
              </div>
              <div class="info-item">
                <mat-icon>schedule</mat-icon>
                <h4>Optional Expiration</h4>
                <p>Set an expiration date for temporary delegations, like vacation coverage.</p>
              </div>
            </div>
          </mat-card-content>
        </mat-card>
      }
    </div>
  `,
  styles: [`
    .jensify-header-content {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
    }

    .back-button {
      margin-left: calc(-1 * var(--jensify-spacing-sm, 0.5rem));
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: var(--jensify-spacing-xl, 2rem);
    }

    .form-card {
      margin-bottom: var(--jensify-spacing-lg, 1.5rem);
    }

    .card-icon {
      background: var(--jensify-primary, #ff5900);
      color: white;
      border-radius: var(--jensify-radius-md, 8px);
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
    }

    .info-icon {
      background: #3b82f6;
    }

    .form-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--jensify-spacing-md, 1rem);
      margin-bottom: var(--jensify-spacing-md, 1rem);
    }

    .form-field {
      width: 100%;
    }

    .full-width {
      width: 100%;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--jensify-spacing-sm, 0.5rem);
      padding-top: var(--jensify-spacing-md, 1rem);
    }

    .form-actions button {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-xs, 0.25rem);
    }

    .empty-state {
      text-align: center;
      padding: var(--jensify-spacing-xl, 2rem);
      color: var(--jensify-text-muted, #666);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        opacity: 0.5;
      }

      h3 {
        margin: var(--jensify-spacing-md, 1rem) 0 var(--jensify-spacing-xs, 0.25rem);
      }

      p {
        margin: 0;
      }
    }

    .delegations-list {
      display: flex;
      flex-direction: column;
      gap: var(--jensify-spacing-md, 1rem);
    }

    .delegation-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: var(--jensify-spacing-md, 1rem);
      background: var(--jensify-bg-subtle, #f8f9fa);
      border-radius: var(--jensify-radius-md, 8px);
      border: 1px solid var(--jensify-border-color, #e0e0e0);

      &.inactive {
        opacity: 0.6;
        background: var(--jensify-bg-muted, #f0f0f0);
      }
    }

    .delegation-info {
      flex: 1;
    }

    .delegation-users {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
      margin-bottom: var(--jensify-spacing-sm, 0.5rem);
    }

    .user-badge {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-sm, 0.5rem);
      padding: var(--jensify-spacing-sm, 0.5rem);
      background: white;
      border-radius: var(--jensify-radius-sm, 4px);
      border: 1px solid var(--jensify-border-color, #e0e0e0);

      mat-icon {
        color: var(--jensify-primary, #ff5900);
      }
    }

    .user-details {
      display: flex;
      flex-direction: column;
    }

    .user-name {
      font-weight: 500;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .user-role {
      font-size: 0.75rem;
      color: var(--jensify-text-muted, #666);
    }

    .arrow-icon {
      color: var(--jensify-text-muted, #999);
    }

    .delegation-meta {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
      flex-wrap: wrap;
    }

    .notes {
      font-size: 0.875rem;
      color: var(--jensify-text-muted, #666);
      font-style: italic;
    }

    .delegation-actions {
      display: flex;
      gap: var(--jensify-spacing-xs, 0.25rem);
    }

    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--jensify-spacing-lg, 1.5rem);
    }

    .info-item {
      text-align: center;

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
        color: var(--jensify-primary, #ff5900);
      }

      h4 {
        margin: var(--jensify-spacing-sm, 0.5rem) 0;
        color: var(--jensify-text-strong, #1a1a1a);
      }

      p {
        margin: 0;
        font-size: 0.875rem;
        color: var(--jensify-text-muted, #666);
      }
    }

    :host-context(.dark) {
      .delegation-item {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .user-badge {
        background: rgba(255, 255, 255, 0.1);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .user-name, .info-item h4 {
        color: #fff;
      }
    }

    @media (max-width: 767px) {
      .delegation-users {
        flex-direction: column;
        align-items: flex-start;
      }

      .arrow-icon {
        transform: rotate(90deg);
        align-self: center;
      }

      .delegation-item {
        flex-direction: column;
        align-items: flex-start;
        gap: var(--jensify-spacing-md, 1rem);
      }

      .delegation-actions {
        align-self: flex-end;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DelegationSettingsComponent implements OnInit {
  private delegationService = inject(DelegationService);
  private organizationService = inject(OrganizationService);
  private notificationService = inject(NotificationService);
  private supabase = inject(SupabaseService);
  private fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  delegations = signal<ExpenseDelegation[]>([]);
  members = signal<OrgMember[]>([]);
  showCreateForm = false;

  scopes: DelegationScope[] = ['all', 'create', 'submit', 'view'];
  scopeDescriptions = DELEGATION_SCOPE_DESCRIPTIONS;
  scopeIcons = DELEGATION_SCOPE_ICONS;

  delegationForm: FormGroup = this.fb.group({
    delegator_id: ['', Validators.required],
    delegate_id: ['', Validators.required],
    scope: ['all', Validators.required],
    valid_until: [null],
    notes: [''],
  });

  ngOnInit(): void {
    this.loadData();
  }

  async loadData(): Promise<void> {
    try {
      // Load delegations
      this.delegationService.getAllDelegations().subscribe({
        next: (delegations) => this.delegations.set(delegations),
        error: (err) => console.error('Error loading delegations:', err),
      });

      // Load organization members
      const orgId = this.organizationService.currentOrganizationId;
      if (orgId) {
        const { data, error } = await this.supabase.client
          .from('organization_members')
          .select(`
            id,
            user_id,
            user:users!user_id(id, full_name, email)
          `)
          .eq('organization_id', orgId)
          .eq('is_active', true);

        if (!error && data) {
          // Map the data to flatten the user array to a single object
          const members = data.map((m: { id: string; user_id: string; user: { id: string; full_name: string; email: string; }[] }) => ({
            id: m.id,
            user_id: m.user_id,
            user: Array.isArray(m.user) ? m.user[0] : m.user
          })) as OrgMember[];
          this.members.set(members);
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      this.notificationService.showError('Failed to load delegation data');
    } finally {
      this.loading.set(false);
    }
  }

  createDelegation(): void {
    if (this.delegationForm.invalid) return;

    const formValue = this.delegationForm.value;

    if (formValue.delegator_id === formValue.delegate_id) {
      this.notificationService.showError('Delegator and delegate must be different users');
      return;
    }

    this.saving.set(true);

    this.delegationService.createDelegation({
      delegator_id: formValue.delegator_id,
      delegate_id: formValue.delegate_id,
      scope: formValue.scope,
      valid_until: formValue.valid_until?.toISOString().split('T')[0] || null,
      notes: formValue.notes || undefined,
    }).subscribe({
      next: () => {
        this.notificationService.showSuccess('Delegation created successfully');
        this.showCreateForm = false;
        this.delegationForm.reset({ scope: 'all' });
        this.loadData();
      },
      error: (err) => {
        console.error('Error creating delegation:', err);
        this.notificationService.showError('Failed to create delegation');
      },
      complete: () => this.saving.set(false),
    });
  }

  cancelCreate(): void {
    this.showCreateForm = false;
    this.delegationForm.reset({ scope: 'all' });
  }

  revokeDelegation(delegation: ExpenseDelegation): void {
    if (!confirm('Are you sure you want to revoke this delegation?')) return;

    this.delegationService.revokeDelegation(delegation.id).subscribe({
      next: () => {
        this.notificationService.showSuccess('Delegation revoked');
        this.loadData();
      },
      error: (err) => {
        console.error('Error revoking delegation:', err);
        this.notificationService.showError('Failed to revoke delegation');
      },
    });
  }

  deleteDelegation(delegation: ExpenseDelegation): void {
    if (!confirm('Are you sure you want to permanently delete this delegation?')) return;

    this.delegationService.deleteDelegation(delegation.id).subscribe({
      next: () => {
        this.notificationService.showSuccess('Delegation deleted');
        this.loadData();
      },
      error: (err) => {
        console.error('Error deleting delegation:', err);
        this.notificationService.showError('Failed to delete delegation');
      },
    });
  }
}
