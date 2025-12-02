import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDividerModule } from '@angular/material/divider';
import { RouterModule } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';
import { NotificationService } from '../../../core/services/notification.service';

interface NotificationPreferences {
  id?: string;
  user_id: string;
  smartscan_enabled: boolean;
  receipt_enabled: boolean;
  approval_enabled: boolean;
  reimbursement_enabled: boolean;
  expense_enabled: boolean;
  report_enabled: boolean;
  budget_enabled: boolean;
  system_enabled: boolean;
  show_toast: boolean;
  play_sound: boolean;
  email_digest: boolean;
}

interface NotificationCategory {
  key: keyof NotificationPreferences;
  label: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-notification-preferences',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatDividerModule,
  ],
  template: `
    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <button mat-icon-button routerLink="/profile" class="back-button">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div>
            <h1 class="jensify-page-title">Notification Preferences</h1>
            <p class="jensify-page-subtitle">Control which notifications you receive</p>
          </div>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else {
        <div class="preferences-grid">
          <!-- Notification Categories -->
          <mat-card class="jensify-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon">notifications</mat-icon>
              <mat-card-title>Notification Categories</mat-card-title>
              <mat-card-subtitle>Choose which types of notifications you want to receive</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              @for (category of categories; track category.key; let last = $last) {
                <div class="preference-row">
                  <div class="preference-info">
                    <mat-icon>{{ category.icon }}</mat-icon>
                    <div class="preference-text">
                      <span class="preference-label">{{ category.label }}</span>
                      <span class="preference-description">{{ category.description }}</span>
                    </div>
                  </div>
                  <mat-slide-toggle
                    [checked]="getPreference(category.key)"
                    (change)="togglePreference(category.key)"
                    [disabled]="saving()"
                    color="primary">
                  </mat-slide-toggle>
                </div>
                @if (!last) {
                  <mat-divider></mat-divider>
                }
              }
            </mat-card-content>
          </mat-card>

          <!-- Delivery Settings -->
          <mat-card class="jensify-card">
            <mat-card-header>
              <mat-icon mat-card-avatar class="card-icon delivery-icon">tune</mat-icon>
              <mat-card-title>Delivery Settings</mat-card-title>
              <mat-card-subtitle>How notifications are displayed</mat-card-subtitle>
            </mat-card-header>
            <mat-card-content>
              <div class="preference-row">
                <div class="preference-info">
                  <mat-icon>web</mat-icon>
                  <div class="preference-text">
                    <span class="preference-label">Toast Notifications</span>
                    <span class="preference-description">Show pop-up notifications in the app</span>
                  </div>
                </div>
                <mat-slide-toggle
                  [checked]="preferences()?.show_toast ?? true"
                  (change)="togglePreference('show_toast')"
                  [disabled]="saving()"
                  color="primary">
                </mat-slide-toggle>
              </div>
              <mat-divider></mat-divider>
              <div class="preference-row">
                <div class="preference-info">
                  <mat-icon>volume_up</mat-icon>
                  <div class="preference-text">
                    <span class="preference-label">Sound Effects</span>
                    <span class="preference-description">Play a sound when notifications arrive</span>
                  </div>
                </div>
                <mat-slide-toggle
                  [checked]="preferences()?.play_sound ?? false"
                  (change)="togglePreference('play_sound')"
                  [disabled]="saving()"
                  color="primary">
                </mat-slide-toggle>
              </div>
              <mat-divider></mat-divider>
              <div class="preference-row">
                <div class="preference-info">
                  <mat-icon>email</mat-icon>
                  <div class="preference-text">
                    <span class="preference-label">Email Digest</span>
                    <span class="preference-description">Receive a daily summary of notifications via email</span>
                  </div>
                </div>
                <mat-slide-toggle
                  [checked]="preferences()?.email_digest ?? false"
                  (change)="togglePreference('email_digest')"
                  [disabled]="saving()"
                  color="primary">
                </mat-slide-toggle>
              </div>
            </mat-card-content>
          </mat-card>

          <!-- Quick Actions -->
          <mat-card class="jensify-card quick-actions-card">
            <mat-card-content>
              <div class="quick-actions">
                <button mat-stroked-button (click)="enableAll()" [disabled]="saving()">
                  <mat-icon>notifications_active</mat-icon>
                  Enable All
                </button>
                <button mat-stroked-button (click)="disableAll()" [disabled]="saving()">
                  <mat-icon>notifications_off</mat-icon>
                  Disable All
                </button>
              </div>
            </mat-card-content>
          </mat-card>
        </div>
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

    .preferences-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
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

    .delivery-icon {
      background: #3b82f6;
    }

    .preference-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--jensify-spacing-md, 1rem) 0;
    }

    .preference-info {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
      flex: 1;
    }

    .preference-info > mat-icon {
      color: var(--jensify-text-muted, #666);
    }

    .preference-text {
      display: flex;
      flex-direction: column;
    }

    .preference-label {
      font-weight: 500;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .preference-description {
      font-size: 0.875rem;
      color: var(--jensify-text-muted, #666);
    }

    .quick-actions-card {
      grid-column: 1 / -1;
    }

    .quick-actions {
      display: flex;
      gap: var(--jensify-spacing-md, 1rem);
      justify-content: center;
    }

    .quick-actions button {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-xs, 0.25rem);
    }

    :host-context(.dark) {
      .preference-label {
        color: #fff;
      }
      .preference-description {
        color: rgba(255, 255, 255, 0.6);
      }
    }

    @media (max-width: 767px) {
      .preferences-grid {
        grid-template-columns: 1fr;
      }

      .quick-actions {
        flex-direction: column;
      }

      .quick-actions button {
        width: 100%;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPreferencesComponent implements OnInit {
  private supabase = inject(SupabaseService);
  private notificationService = inject(NotificationService);

  loading = signal(true);
  saving = signal(false);
  preferences = signal<NotificationPreferences | null>(null);

  categories: NotificationCategory[] = [
    {
      key: 'smartscan_enabled',
      label: 'SmartScan',
      description: 'Receipt scanning and OCR processing updates',
      icon: 'document_scanner',
    },
    {
      key: 'receipt_enabled',
      label: 'Receipts',
      description: 'New receipts uploaded and processed',
      icon: 'receipt',
    },
    {
      key: 'expense_enabled',
      label: 'Expenses',
      description: 'Expense status changes and updates',
      icon: 'receipt_long',
    },
    {
      key: 'approval_enabled',
      label: 'Approvals',
      description: 'Items pending your approval or approval decisions',
      icon: 'task_alt',
    },
    {
      key: 'reimbursement_enabled',
      label: 'Reimbursements',
      description: 'Payment status and reimbursement updates',
      icon: 'payments',
    },
    {
      key: 'report_enabled',
      label: 'Reports',
      description: 'Expense report status changes',
      icon: 'folder_open',
    },
    {
      key: 'budget_enabled',
      label: 'Budgets',
      description: 'Budget alerts and threshold warnings',
      icon: 'account_balance_wallet',
    },
    {
      key: 'system_enabled',
      label: 'System',
      description: 'Important system announcements and updates',
      icon: 'info',
    },
  ];

  ngOnInit(): void {
    this.loadPreferences();
  }

  async loadPreferences(): Promise<void> {
    try {
      const userId = this.supabase.userId;
      if (!userId) {
        this.loading.set(false);
        return;
      }

      const { data, error } = await this.supabase.client
        .from('notification_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows found
        throw error;
      }

      if (data) {
        this.preferences.set(data as NotificationPreferences);
      } else {
        // Create default preferences
        const defaults: NotificationPreferences = {
          user_id: userId,
          smartscan_enabled: true,
          receipt_enabled: true,
          approval_enabled: true,
          reimbursement_enabled: true,
          expense_enabled: true,
          report_enabled: true,
          budget_enabled: true,
          system_enabled: true,
          show_toast: true,
          play_sound: false,
          email_digest: false,
        };
        this.preferences.set(defaults);
        await this.savePreferences(defaults);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      this.notificationService.showError('Failed to load notification preferences');
    } finally {
      this.loading.set(false);
    }
  }

  getPreference(key: keyof NotificationPreferences): boolean {
    const prefs = this.preferences();
    if (!prefs) return true;
    return prefs[key] as boolean;
  }

  async togglePreference(key: keyof NotificationPreferences): Promise<void> {
    const prefs = this.preferences();
    if (!prefs) return;

    const updated = { ...prefs, [key]: !prefs[key] };
    this.preferences.set(updated);
    await this.savePreferences(updated);
  }

  async enableAll(): Promise<void> {
    const prefs = this.preferences();
    if (!prefs) return;

    const updated: NotificationPreferences = {
      ...prefs,
      smartscan_enabled: true,
      receipt_enabled: true,
      approval_enabled: true,
      reimbursement_enabled: true,
      expense_enabled: true,
      report_enabled: true,
      budget_enabled: true,
      system_enabled: true,
    };
    this.preferences.set(updated);
    await this.savePreferences(updated);
    this.notificationService.showSuccess('All notifications enabled');
  }

  async disableAll(): Promise<void> {
    const prefs = this.preferences();
    if (!prefs) return;

    const updated: NotificationPreferences = {
      ...prefs,
      smartscan_enabled: false,
      receipt_enabled: false,
      approval_enabled: false,
      reimbursement_enabled: false,
      expense_enabled: false,
      report_enabled: false,
      budget_enabled: false,
      system_enabled: false,
    };
    this.preferences.set(updated);
    await this.savePreferences(updated);
    this.notificationService.showSuccess('All notifications disabled');
  }

  private async savePreferences(prefs: NotificationPreferences): Promise<void> {
    this.saving.set(true);
    try {
      const userId = this.supabase.userId;
      if (!userId) throw new Error('Not authenticated');

      const { error } = await this.supabase.client
        .from('notification_preferences')
        .upsert(
          { ...prefs, user_id: userId },
          { onConflict: 'user_id' }
        );

      if (error) throw error;
    } catch (error) {
      console.error('Error saving preferences:', error);
      this.notificationService.showError('Failed to save preferences');
    } finally {
      this.saving.set(false);
    }
  }
}
