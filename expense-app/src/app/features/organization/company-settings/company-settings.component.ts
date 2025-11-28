import { Component, ChangeDetectionStrategy, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { OrganizationService } from '../../../core/services/organization.service';

@Component({
  selector: 'app-company-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <h1 class="jensify-page-title">Company Settings</h1>
          <p class="jensify-page-subtitle">Update your organization's name and branding</p>
        </div>
      </div>

      <mat-card class="jensify-card settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-icon">business</mat-icon>
          <mat-card-title>Organization Details</mat-card-title>
          <mat-card-subtitle>Basic information about your company</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form [formGroup]="settingsForm" (ngSubmit)="saveSettings()" class="settings-form">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Company Name</mat-label>
              <input matInput formControlName="name" placeholder="Enter company name">
              <mat-icon matSuffix>business</mat-icon>
              @if (settingsForm.get('name')?.hasError('required')) {
                <mat-error>Company name is required</mat-error>
              }
            </mat-form-field>

            <div class="logo-section">
              <label class="logo-label">Company Logo</label>
              <div class="logo-upload-area" (click)="logoInput.click()">
                @if (logoPreview()) {
                  <img [src]="logoPreview()" alt="Company logo" class="logo-preview">
                } @else {
                  <div class="logo-placeholder">
                    <mat-icon>add_photo_alternate</mat-icon>
                    <span>Click to upload logo</span>
                    <span class="logo-hint">PNG, JPG up to 2MB</span>
                  </div>
                }
                <input
                  #logoInput
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  (change)="onLogoSelected($event)"
                  hidden
                >
              </div>
              @if (logoPreview()) {
                <button mat-button color="warn" type="button" (click)="removeLogo()">
                  <mat-icon>delete</mat-icon>
                  Remove Logo
                </button>
              }
            </div>

            <div class="form-actions">
              <button
                mat-raised-button
                color="primary"
                type="submit"
                [disabled]="saving() || !settingsForm.valid || !settingsForm.dirty"
              >
                @if (saving()) {
                  <mat-spinner diameter="20"></mat-spinner>
                } @else {
                  <mat-icon>save</mat-icon>
                  Save Changes
                }
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    .settings-card {
      max-width: 600px;
    }

    .card-icon {
      background: var(--jensify-primary, #ff5900);
      color: white;
      width: 40px !important;
      height: 40px !important;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .settings-form {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      padding-top: 1rem;
    }

    .full-width {
      width: 100%;
    }

    .logo-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .logo-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--jensify-text-secondary, #666);
    }

    .logo-upload-area {
      border: 2px dashed var(--jensify-border-medium, #ddd);
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: var(--jensify-bg-subtle, #fafafa);

      &:hover {
        border-color: var(--jensify-primary, #ff5900);
        background: rgba(255, 89, 0, 0.05);
      }
    }

    .logo-placeholder {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      color: var(--jensify-text-muted, #999);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: var(--jensify-primary, #ff5900);
      }

      .logo-hint {
        font-size: 0.75rem;
      }
    }

    .logo-preview {
      max-width: 200px;
      max-height: 100px;
      object-fit: contain;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      padding-top: 1rem;

      button {
        min-width: 150px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
      }

      mat-spinner {
        margin: 0;
      }
    }

    :host-context(.dark) {
      .logo-upload-area {
        background: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.2);

        &:hover {
          background: rgba(255, 89, 0, 0.1);
        }
      }

      .logo-placeholder {
        color: rgba(255, 255, 255, 0.6);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CompanySettingsComponent implements OnInit {
  private fb = inject(FormBuilder);
  private organizationService = inject(OrganizationService);
  private snackBar = inject(MatSnackBar);

  saving = signal(false);
  logoPreview = signal<string | null>(null);
  private logoFile: File | null = null;

  settingsForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  ngOnInit(): void {
    // Load current organization data
    this.organizationService.currentOrganization$.subscribe(org => {
      if (org) {
        this.settingsForm.patchValue({ name: org.name });
        // Logo URL support will be added when storage is configured
        this.settingsForm.markAsPristine();
      }
    });
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];

      // Validate file size (max 2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.snackBar.open('Logo must be less than 2MB', 'Close', { duration: 3000 });
        return;
      }

      // Validate file type
      if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
        this.snackBar.open('Logo must be PNG or JPG format', 'Close', { duration: 3000 });
        return;
      }

      this.logoFile = file;

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        this.logoPreview.set(e.target?.result as string);
        this.settingsForm.markAsDirty();
      };
      reader.readAsDataURL(file);
    }
  }

  removeLogo(): void {
    this.logoFile = null;
    this.logoPreview.set(null);
    this.settingsForm.markAsDirty();
  }

  async saveSettings(): Promise<void> {
    if (!this.settingsForm.valid) return;

    this.saving.set(true);

    try {
      const currentOrg = await this.organizationService.currentOrganization$.toPromise();
      if (!currentOrg) {
        throw new Error('No organization selected');
      }

      // Update organization name
      const { name } = this.settingsForm.value;
      await this.organizationService.updateOrganization(currentOrg.id, { name }).toPromise();

      // TODO: Handle logo upload when storage is configured
      // if (this.logoFile) {
      //   await this.organizationService.uploadLogo(currentOrg.id, this.logoFile);
      // }

      this.snackBar.open('Company settings saved successfully', 'Close', { duration: 3000 });
      this.settingsForm.markAsPristine();
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.snackBar.open('Failed to save settings', 'Close', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }
}
