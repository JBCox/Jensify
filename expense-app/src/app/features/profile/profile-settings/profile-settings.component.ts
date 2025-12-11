import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ThemeService } from '../../../core/services/theme.service';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatSlideToggleModule,
  ],
  template: `
    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <h1 class="jensify-page-title">Profile Settings</h1>
          <p class="jensify-page-subtitle">Manage your personal information and preferences</p>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else {
        <div class="profile-grid">
          <!-- Profile Information Card -->
          <mat-card class="jensify-card profile-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">person</mat-icon>
              <mat-card-title>Personal Information</mat-card-title>
              <mat-card-subtitle>Update your name and contact details</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <form [formGroup]="profileForm" (ngSubmit)="saveProfile()">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Full Name</mat-label>
                  <input matInput formControlName="full_name" placeholder="Enter your full name">
                  <mat-icon matPrefix>badge</mat-icon>
                  @if (profileForm.get('full_name')?.hasError('required')) {
                    <mat-error>Full name is required</mat-error>
                  }
                </mat-form-field>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Email Address</mat-label>
                  <input matInput formControlName="email" readonly>
                  <mat-icon matPrefix>email</mat-icon>
                  <mat-hint>Email cannot be changed</mat-hint>
                </mat-form-field>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Department</mat-label>
                  <input matInput formControlName="department">
                  <mat-icon matPrefix>business</mat-icon>
                  <mat-hint>e.g., Engineering, Sales</mat-hint>
                </mat-form-field>

                <div class="form-actions">
                  <button mat-flat-button color="primary" type="submit"
                          [disabled]="!profileForm.dirty || profileForm.invalid || saving()">
                    @if (saving()) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                      <ng-container><mat-icon>save</mat-icon> Save Changes</ng-container>
                    }
                  </button>
                </div>
              </form>
            </mat-card-content>
          </mat-card>

          <!-- Appearance Settings Card -->
          <mat-card class="jensify-card appearance-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">palette</mat-icon>
              <mat-card-title>Appearance</mat-card-title>
              <mat-card-subtitle>Customize how Expensed looks</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="setting-row">
                <div class="setting-info">
                  <mat-icon>dark_mode</mat-icon>
                  <div class="setting-text">
                    <span class="setting-label">Dark Mode</span>
                    <span class="setting-description">Switch between light and dark themes</span>
                  </div>
                </div>
                <mat-slide-toggle
                  [checked]="isDarkMode()"
                  (change)="toggleDarkMode()"
                  color="primary">
                </mat-slide-toggle>
              </div>
            </mat-card-content>
          </mat-card>

          <!-- Quick Links Card -->
          <mat-card class="jensify-card quick-links-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">link</mat-icon>
              <mat-card-title>Quick Links</mat-card-title>
              <mat-card-subtitle>Access other profile settings</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="quick-links">
                <a routerLink="/profile/notifications" class="quick-link">
                  <mat-icon>notifications</mat-icon>
                  <div class="link-text">
                    <span class="link-title">Notification Preferences</span>
                    <span class="link-description">Control which notifications you receive</span>
                  </div>
                  <mat-icon class="chevron">chevron_right</mat-icon>
                </a>
                <mat-divider></mat-divider>
                <a routerLink="/profile/bank-accounts" class="quick-link">
                  <mat-icon>account_balance</mat-icon>
                  <div class="link-text">
                    <span class="link-title">Bank Accounts</span>
                    <span class="link-description">Manage your bank accounts for reimbursements</span>
                  </div>
                  <mat-icon class="chevron">chevron_right</mat-icon>
                </a>
                <mat-divider></mat-divider>
                <a routerLink="/auth/reset-password" class="quick-link">
                  <mat-icon>lock</mat-icon>
                  <div class="link-text">
                    <span class="link-title">Change Password</span>
                    <span class="link-description">Update your account password</span>
                  </div>
                  <mat-icon class="chevron">chevron_right</mat-icon>
                </a>
              </div>
            </mat-card-content>
          </mat-card>
        </div>
      }
    </div>
  `,
  styles: [`
    .loading-container {
      display: flex;
      justify-content: center;
      padding: var(--jensify-spacing-xl, 2rem);
    }

    .profile-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: var(--jensify-spacing-lg, 1.5rem);
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

    .full-width {
      width: 100%;
      margin-bottom: var(--jensify-spacing-sm, 0.5rem);
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      padding-top: var(--jensify-spacing-md, 1rem);
    }

    .form-actions button {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-xs, 0.25rem);
    }

    .setting-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--jensify-spacing-md, 1rem) 0;
    }

    .setting-info {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
    }

    .setting-info mat-icon {
      color: var(--jensify-text-muted, #666);
    }

    .setting-text {
      display: flex;
      flex-direction: column;
    }

    .setting-label {
      font-weight: 500;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .setting-description {
      font-size: 0.875rem;
      color: var(--jensify-text-muted, #666);
    }

    .quick-links {
      display: flex;
      flex-direction: column;
    }

    .quick-link {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
      padding: var(--jensify-spacing-md, 1rem) 0;
      text-decoration: none;
      color: inherit;
      cursor: pointer;
      transition: background-color 0.2s ease;
      margin: 0 calc(-1 * var(--jensify-spacing-md, 1rem));
      padding-left: var(--jensify-spacing-md, 1rem);
      padding-right: var(--jensify-spacing-md, 1rem);
      border-radius: var(--jensify-radius-sm, 4px);

      &:hover {
        background-color: var(--jensify-bg-hover, rgba(0, 0, 0, 0.04));
      }
    }

    .quick-link mat-icon:first-child {
      color: var(--jensify-primary, #ff5900);
    }

    .link-text {
      display: flex;
      flex-direction: column;
      flex: 1;
    }

    .link-title {
      font-weight: 500;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .link-description {
      font-size: 0.875rem;
      color: var(--jensify-text-muted, #666);
    }

    .chevron {
      color: var(--jensify-text-muted, #999);
    }

    :host-context(.dark) {
      .setting-label,
      .link-title {
        color: #fff;
      }
      .setting-description,
      .link-description {
        color: rgba(255, 255, 255, 0.6);
      }
      .quick-link:hover {
        background-color: rgba(255, 255, 255, 0.05);
      }
    }

    @media (max-width: 767px) {
      .profile-grid {
        grid-template-columns: 1fr;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileSettingsComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private notificationService = inject(NotificationService);
  private themeService = inject(ThemeService);
  private fb = inject(FormBuilder);

  loading = signal(true);
  saving = signal(false);
  isDarkMode = signal(false);

  profileForm: FormGroup = this.fb.group({
    full_name: ['', Validators.required],
    email: [''],
    department: [''],
  });

  ngOnInit(): void {
    this.loadProfile();
    this.isDarkMode.set(this.themeService.theme() === 'dark');
  }

  async loadProfile(): Promise<void> {
    try {
      const userId = this.supabase.userId;
      if (!userId) {
        this.loading.set(false);
        return;
      }

      const { data, error } = await this.supabase.client
        .from('users')
        .select('id, email, full_name, department')
        .eq('id', userId)
        .single();

      if (error) throw error;

      if (data) {
        this.profileForm.patchValue({
          full_name: data.full_name || '',
          email: data.email || '',
          department: data.department || '',
        });
        this.profileForm.markAsPristine();
      }
    } catch {
      this.notificationService.showError('Failed to load profile');
    } finally {
      this.loading.set(false);
    }
  }

  async saveProfile(): Promise<void> {
    if (this.profileForm.invalid || !this.profileForm.dirty) return;

    this.saving.set(true);
    try {
      const userId = this.supabase.userId;
      if (!userId) throw new Error('Not authenticated');

      const { error } = await this.supabase.client
        .from('users')
        .update({
          full_name: this.profileForm.value.full_name,
          department: this.profileForm.value.department || null,
        })
        .eq('id', userId);

      if (error) throw error;

      this.notificationService.showSuccess('Profile updated successfully');
      this.profileForm.markAsPristine();
    } catch {
      this.notificationService.showError('Failed to save profile');
    } finally {
      this.saving.set(false);
    }
  }

  toggleDarkMode(): void {
    this.themeService.toggleTheme();
    this.isDarkMode.set(this.themeService.theme() === 'dark');
  }
}
