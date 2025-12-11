import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { PlatformSetting } from '../../../core/models/subscription.model';

/** Map from form field name to platform_settings key */
const SETTING_KEY_MAP: Record<string, string> = {
  maintenance_mode: 'maintenance_mode',
  maintenance_message: 'maintenance_mode',
  signup_enabled: 'signups_enabled',
  default_trial_days: 'trial_settings',
  stripe_payouts_enabled: 'feature_stripe_payouts',
  api_access_enabled: 'feature_api_access',
  mileage_gps_enabled: 'feature_mileage_gps',
  multi_level_approval: 'feature_multi_level_approval',
};

/**
 * System Settings Component
 * Allows super admins to configure platform-level settings
 */
@Component({
  selector: 'app-system-settings',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './system-settings.component.html',
  styles: [`
    .settings-container {
      padding: 24px;
      max-width: 800px;
      margin: 0 auto;
    }

    /* Header */
    .page-header {
      margin-bottom: 32px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-left button {
      color: rgba(255, 255, 255, 0.7);
    }

    .header-left button:hover {
      color: #ff5900;
    }

    .header-left h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.95);
      margin: 0 0 4px;
    }

    .header-left .subtitle {
      font-size: 0.95rem;
      color: rgba(255, 255, 255, 0.6);
      margin: 0;
    }

    .header-actions button mat-icon {
      margin-right: 6px;
    }

    /* Loading */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: rgba(255, 255, 255, 0.7);
    }

    /* Settings Form */
    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    /* Settings Card */
    .settings-card {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%) !important;
      border-radius: 16px !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
      border: 1px solid rgba(255, 255, 255, 0.08);
      overflow: hidden;
    }

    /* Card Header */
    .card-header {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px 24px;
    }

    .header-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .header-icon mat-icon {
      font-size: 26px;
      width: 26px;
      height: 26px;
    }

    /* Maintenance - Amber */
    .header-icon.maintenance {
      background: rgba(255, 152, 0, 0.15);
    }
    .header-icon.maintenance mat-icon {
      color: #ffb74d;
    }

    /* Signup - Green */
    .header-icon.signup {
      background: rgba(76, 175, 80, 0.15);
    }
    .header-icon.signup mat-icon {
      color: #81c784;
    }

    /* Features - Blue */
    .header-icon.features {
      background: rgba(33, 150, 243, 0.15);
    }
    .header-icon.features mat-icon {
      color: #64b5f6;
    }

    .card-header h2 {
      font-size: 1.1rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      margin: 0 0 4px;
    }

    .card-header p {
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.6);
      margin: 0;
    }

    /* Card Content */
    .card-content {
      padding: 24px;
    }

    /* Setting Row */
    .setting-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 24px;
      min-height: 48px;
    }

    .setting-info {
      flex: 1;
    }

    .setting-label {
      display: block;
      font-size: 0.95rem;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.95);
      margin-bottom: 4px;
    }

    .setting-description {
      display: block;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.5);
      line-height: 1.4;
    }

    /* Setting Divider */
    .setting-divider {
      margin: 20px 0 !important;
      border-color: rgba(255, 255, 255, 0.08) !important;
    }

    /* Days Input */
    .days-input {
      width: 100px;
      flex-shrink: 0;
    }

    /* Full Width Form Field */
    .full-width {
      width: 100%;
      margin-top: 16px;
    }

    /* Mat Divider */
    mat-divider {
      border-color: rgba(255, 255, 255, 0.08) !important;
    }

    /* Form Field Text Color Fix */
    ::ng-deep .settings-card .mdc-text-field--filled {
      background-color: rgba(255, 255, 255, 0.08) !important;
    }

    ::ng-deep .settings-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-floating-label {
      color: rgba(255, 255, 255, 0.7) !important;
    }

    ::ng-deep .settings-card .mat-mdc-input-element {
      color: rgba(255, 255, 255, 0.95) !important;
      caret-color: #ff5900 !important;
    }

    ::ng-deep .settings-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-line-ripple::before {
      border-bottom-color: rgba(255, 255, 255, 0.3) !important;
    }

    ::ng-deep .settings-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-line-ripple::after {
      border-bottom-color: #ff5900 !important;
    }

    ::ng-deep .settings-card .mat-mdc-form-field-focus-overlay {
      background-color: rgba(255, 255, 255, 0.05) !important;
    }

    ::ng-deep .settings-card textarea.mat-mdc-input-element {
      color: rgba(255, 255, 255, 0.95) !important;
    }

    /* Slide Toggle Styling */
    ::ng-deep .settings-card .mat-mdc-slide-toggle {
      flex-shrink: 0;
    }

    ::ng-deep .settings-card .mat-mdc-slide-toggle.mat-primary .mdc-switch--selected .mdc-switch__handle::after {
      background: #ff5900 !important;
    }

    ::ng-deep .settings-card .mat-mdc-slide-toggle.mat-primary .mdc-switch--selected .mdc-switch__track {
      background: rgba(255, 89, 0, 0.5) !important;
    }

    /* Responsive */
    @media (max-width: 768px) {
      .settings-container {
        padding: 16px;
      }

      .header-content {
        flex-direction: column;
        align-items: stretch;
      }

      .header-actions {
        display: flex;
      }

      .header-actions button {
        flex: 1;
      }

      .card-header {
        padding: 16px 20px;
      }

      .card-content {
        padding: 20px;
      }

      .setting-row {
        flex-wrap: wrap;
        gap: 12px;
      }

      .days-input {
        width: 100%;
      }
    }

    @media (max-width: 480px) {
      .header-left h1 {
        font-size: 1.25rem;
      }

      .header-left {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }

      .header-icon {
        width: 40px;
        height: 40px;
      }

      .header-icon mat-icon {
        font-size: 22px;
        width: 22px;
        height: 22px;
      }
    }

    /* ========================================
       LIGHT MODE OVERRIDES
       ======================================== */

    :host-context(html:not(.dark)) {
      .header-left button {
        color: #475569;
      }

      .header-left button:hover {
        color: #ff5900;
      }

      .header-left h1 {
        color: #1e293b;
      }

      .header-left .subtitle {
        color: #64748b;
      }

      .loading-container {
        color: #64748b;
      }

      .settings-card {
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%) !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
        border: 1px solid #e2e8f0;
      }

      .card-header h2 {
        color: #1e293b;
      }

      .card-header p {
        color: #64748b;
      }

      .setting-label {
        color: #1e293b;
      }

      .setting-description {
        color: #64748b;
      }

      .setting-divider {
        border-color: #e2e8f0 !important;
      }

      mat-divider {
        border-color: #e2e8f0 !important;
      }
    }

    /* Light mode form fields */
    :host-context(html:not(.dark)) ::ng-deep .settings-card .mdc-text-field--filled {
      background-color: rgba(0, 0, 0, 0.04) !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .settings-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-floating-label {
      color: #64748b !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .settings-card .mat-mdc-input-element {
      color: #1e293b !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .settings-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-line-ripple::before {
      border-bottom-color: #cbd5e1 !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .settings-card textarea.mat-mdc-input-element {
      color: #1e293b !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .settings-card .mat-mdc-form-field-focus-overlay {
      background-color: rgba(0, 0, 0, 0.02) !important;
    }
  `],
})
export class SystemSettingsComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);

  isLoading = signal(true);
  isSaving = signal(false);

  settingsForm = this.fb.group({
    maintenance_mode: [false],
    maintenance_message: ['', Validators.maxLength(500)],
    signup_enabled: [true],
    default_trial_days: [14, [Validators.required, Validators.min(0), Validators.max(365)]],
    stripe_payouts_enabled: [true],
    api_access_enabled: [true],
    mileage_gps_enabled: [true],
    multi_level_approval: [true],
  });

  ngOnInit(): void {
    this.loadSettings();
  }

  private loadSettings(): void {
    this.isLoading.set(true);

    this.superAdminService.getSettings().subscribe({
      next: (settings: PlatformSetting[]) => {
        // Map settings from backend to form
        const settingsMap = new Map<string, PlatformSetting>();
        settings.forEach(s => settingsMap.set(s.key, s));

        // Maintenance mode
        const maintenance = settingsMap.get('maintenance_mode');
        if (maintenance) {
          const val = maintenance.value as { enabled?: boolean; message?: string };
          this.settingsForm.patchValue({
            maintenance_mode: val.enabled ?? false,
            maintenance_message: val.message ?? '',
          });
        }

        // Signups
        const signups = settingsMap.get('signups_enabled');
        if (signups) {
          const val = signups.value as { enabled?: boolean };
          this.settingsForm.patchValue({
            signup_enabled: val.enabled ?? true,
          });
        }

        // Trial settings
        const trial = settingsMap.get('trial_settings');
        if (trial) {
          const val = trial.value as { default_days?: number };
          this.settingsForm.patchValue({
            default_trial_days: val.default_days ?? 14,
          });
        }

        // Feature flags
        const stripePayouts = settingsMap.get('feature_stripe_payouts');
        if (stripePayouts) {
          const val = stripePayouts.value as { enabled?: boolean };
          this.settingsForm.patchValue({ stripe_payouts_enabled: val.enabled ?? true });
        }

        const apiAccess = settingsMap.get('feature_api_access');
        if (apiAccess) {
          const val = apiAccess.value as { enabled?: boolean };
          this.settingsForm.patchValue({ api_access_enabled: val.enabled ?? true });
        }

        const mileageGps = settingsMap.get('feature_mileage_gps');
        if (mileageGps) {
          const val = mileageGps.value as { enabled?: boolean };
          this.settingsForm.patchValue({ mileage_gps_enabled: val.enabled ?? true });
        }

        const multiApproval = settingsMap.get('feature_multi_level_approval');
        if (multiApproval) {
          const val = multiApproval.value as { enabled?: boolean };
          this.settingsForm.patchValue({ multi_level_approval: val.enabled ?? true });
        }

        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load settings:', err);
        this.snackBar.open('Failed to load settings', 'Close', { duration: 3000 });
        this.isLoading.set(false);
      },
    });
  }

  onToggleChange(field: string): void {
    this.saveSetting(field);
  }

  onValueChange(field: string): void {
    if (this.settingsForm.get(field)?.valid) {
      this.saveSetting(field);
    }
  }

  private saveSetting(field: string): void {
    this.isSaving.set(true);

    const formValue = this.settingsForm.value;
    let settingKey = SETTING_KEY_MAP[field];
    let settingValue: Record<string, unknown>;

    // Build the value based on the field being saved
    switch (field) {
      case 'maintenance_mode':
      case 'maintenance_message':
        settingKey = 'maintenance_mode';
        settingValue = {
          enabled: formValue.maintenance_mode,
          message: formValue.maintenance_message || '',
        };
        break;
      case 'signup_enabled':
        settingValue = { enabled: formValue.signup_enabled };
        break;
      case 'default_trial_days':
        settingValue = { default_days: formValue.default_trial_days };
        break;
      case 'stripe_payouts_enabled':
      case 'api_access_enabled':
      case 'mileage_gps_enabled':
      case 'multi_level_approval':
        settingValue = { enabled: formValue[field] };
        break;
      default:
        this.isSaving.set(false);
        return;
    }

    this.superAdminService.updateSetting(settingKey, settingValue).subscribe({
      next: () => {
        this.isSaving.set(false);
        // No need for additional snackbar - SuperAdminService shows one
      },
      error: (err) => {
        console.error('Failed to save setting:', err);
        this.isSaving.set(false);
      },
    });
  }

  saveAll(): void {
    if (this.settingsForm.invalid) {
      this.snackBar.open('Please fix validation errors', 'Close', {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });
      return;
    }

    this.isSaving.set(true);

    const formValue = this.settingsForm.value;

    // Save all settings in sequence
    const settingsToSave = [
      { key: 'maintenance_mode', value: { enabled: formValue.maintenance_mode, message: formValue.maintenance_message } },
      { key: 'signups_enabled', value: { enabled: formValue.signup_enabled } },
      { key: 'trial_settings', value: { default_days: formValue.default_trial_days } },
      { key: 'feature_stripe_payouts', value: { enabled: formValue.stripe_payouts_enabled } },
      { key: 'feature_api_access', value: { enabled: formValue.api_access_enabled } },
      { key: 'feature_mileage_gps', value: { enabled: formValue.mileage_gps_enabled } },
      { key: 'feature_multi_level_approval', value: { enabled: formValue.multi_level_approval } },
    ];

    let completedCount = 0;
    let hasError = false;

    settingsToSave.forEach(({ key, value }) => {
      this.superAdminService.updateSetting(key, value).subscribe({
        next: () => {
          completedCount++;
          if (completedCount === settingsToSave.length) {
            this.isSaving.set(false);
            if (!hasError) {
              this.snackBar.open('All settings saved successfully', 'Close', {
                duration: 2000,
                horizontalPosition: 'end',
                verticalPosition: 'top',
              });
            }
          }
        },
        error: (err) => {
          console.error(`Failed to save ${key}:`, err);
          hasError = true;
          completedCount++;
          if (completedCount === settingsToSave.length) {
            this.isSaving.set(false);
          }
        },
      });
    });
  }
}
