import { Component, ChangeDetectionStrategy, ChangeDetectorRef, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { OrganizationService } from '../../../core/services/organization.service';
import { ThemeService } from '../../../core/services/theme.service';
import { ColorPickerComponent } from '../../../shared/components/color-picker/color-picker';

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
    ColorPickerComponent,
  ],
  template: `
    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <h1 class="jensify-page-title">Organization Branding</h1>
          <p class="jensify-page-subtitle">Customize your organization's name, logo, and brand color</p>
        </div>
      </div>

      <mat-card class="jensify-card settings-card">
        <mat-card-header>
          <mat-icon mat-card-avatar class="card-icon">palette</mat-icon>
          <mat-card-title>Brand Settings</mat-card-title>
          <mat-card-subtitle>Logo, colors, and company identity</mat-card-subtitle>
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
              <label class="logo-label" for="logo-upload-input">Company Logo</label>
              <div
                class="logo-upload-area"
                [class.dragging]="isDragging()"
                (click)="logoInput.click()"
                (dragover)="onDragOver($event)"
                (dragleave)="onDragLeave($event)"
                (drop)="onDrop($event)"
                role="button"
                tabindex="0"
                (keyup.enter)="logoInput.click()">
                @if (logoPreview()) {
                  <img [src]="logoPreview()" alt="Company logo" class="logo-preview">
                } @else {
                  <div class="logo-placeholder">
                    <mat-icon>{{ isDragging() ? 'file_download' : 'add_photo_alternate' }}</mat-icon>
                    <span>{{ isDragging() ? 'Drop image here' : 'Drag & drop or click to upload' }}</span>
                    <span class="logo-hint">PNG, JPG, SVG up to 2MB</span>
                  </div>
                }
                <input
                  #logoInput
                  id="logo-upload-input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
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

            <!-- Brand Color Section -->
            <div class="color-section">
              <app-color-picker
                label="Brand Color"
                [value]="selectedColor()"
                (colorChange)="onColorChange($event)"
              ></app-color-picker>
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
                  <ng-container>
                    <mat-icon>save</mat-icon>
                    Save Changes
                  </ng-container>
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
      border: 2px dashed color-mix(in srgb, var(--jensify-primary) 40%, var(--jensify-border-medium));
      border-radius: 8px;
      padding: 2rem;
      text-align: center;
      cursor: pointer;
      transition: all 0.2s ease;
      background: var(--jensify-bg-subtle, #fafafa);

      &:hover {
        border-color: var(--jensify-primary, #ff5900);
        background: color-mix(in srgb, var(--jensify-primary) 5%, transparent);
      }

      &.dragging {
        border-color: var(--jensify-primary, #ff5900);
        border-style: solid;
        background: color-mix(in srgb, var(--jensify-primary) 10%, transparent);
        transform: scale(1.02);
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
        border-color: color-mix(in srgb, var(--jensify-primary) 40%, transparent);

        &:hover {
          background: color-mix(in srgb, var(--jensify-primary) 10%, transparent);
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
  private cdr = inject(ChangeDetectorRef);
  private themeService = inject(ThemeService);

  saving = signal(false);
  logoPreview = signal<string | null>(null);
  isDragging = signal(false);
  selectedColor = signal<string>('#F7580C');
  private logoFile: File | null = null;
  private removeExistingLogo = false; // Track if user wants to remove existing logo
  private initialLoadComplete = false; // Prevent resetting logoFile on org updates

  settingsForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
  });

  ngOnInit(): void {
    // Load current organization data
    this.organizationService.currentOrganization$.subscribe(org => {
      console.log('[CompanySettings] ngOnInit subscription fired, org:', org?.name);
      console.log('[CompanySettings] initialLoadComplete:', this.initialLoadComplete);
      console.log('[CompanySettings] logoFile before check:', this.logoFile);
      if (org) {
        // Only update form/state on initial load or after explicit save
        // Don't reset logoFile if user has selected a new file
        if (!this.initialLoadComplete) {
          console.log('[CompanySettings] RESETTING STATE - initialLoadComplete was false');
          this.settingsForm.patchValue({ name: org.name });
          // Load existing logo if present
          if (org.logo_url) {
            this.logoPreview.set(org.logo_url);
          } else {
            this.logoPreview.set(null);
          }
          // Load existing brand color if present
          if (org.primary_color) {
            this.selectedColor.set(org.primary_color);
          } else {
            this.selectedColor.set('#F7580C'); // Default orange
          }
          this.settingsForm.markAsPristine();
          this.removeExistingLogo = false;
          this.logoFile = null;
          this.initialLoadComplete = true;
        } else {
          console.log('[CompanySettings] NOT resetting - initialLoadComplete was true');
        }
      }
    });
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.processFile(input.files[0]);
    }
  }

  removeLogo(): void {
    this.logoFile = null;
    this.logoPreview.set(null);
    this.removeExistingLogo = true; // Mark for deletion on save
    this.settingsForm.markAsDirty();
  }

  onColorChange(color: string): void {
    this.selectedColor.set(color);
    this.settingsForm.markAsDirty();
    // Live preview the color change
    this.themeService.applyBrandColor(color);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFile(files[0]);
    }
  }

  private processFile(file: File): void {
    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      this.snackBar.open('Logo must be less than 2MB', 'Close', { duration: 3000 });
      return;
    }

    // Validate file type
    if (!['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'].includes(file.type)) {
      this.snackBar.open('Logo must be PNG, JPG, or SVG format', 'Close', { duration: 3000 });
      return;
    }

    this.logoFile = file;
    this.removeExistingLogo = false; // Reset since we're uploading a new file

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      this.logoPreview.set(e.target?.result as string);
      this.settingsForm.markAsDirty();
      this.cdr.markForCheck(); // Trigger change detection for OnPush
    };
    reader.readAsDataURL(file);
  }

  async saveSettings(): Promise<void> {
    if (!this.settingsForm.valid) return;

    // CRITICAL: Capture file reference immediately before any async operations
    // This prevents race conditions where ngOnInit subscription could reset logoFile
    const fileToUpload = this.logoFile;
    const shouldRemoveLogo = this.removeExistingLogo;

    console.log('[CompanySettings] saveSettings called');
    console.log('[CompanySettings] fileToUpload captured:', fileToUpload?.name);

    this.saving.set(true);

    try {
      const currentOrg = await firstValueFrom(this.organizationService.currentOrganization$);
      if (!currentOrg) {
        throw new Error('No organization selected');
      }

      const { name } = this.settingsForm.value;
      let logoUrl: string | undefined = currentOrg.logo_url || undefined;

      // Handle logo upload if a new file was selected
      console.log('[CompanySettings] Checking fileToUpload:', fileToUpload?.name);
      if (fileToUpload) {
        console.log('[CompanySettings] Uploading logo...');
        logoUrl = await firstValueFrom(
          this.organizationService.uploadLogo(currentOrg.id, fileToUpload)
        );
        console.log('[CompanySettings] Upload complete, logoUrl:', logoUrl);
      } else {
        console.log('[CompanySettings] No file to upload');
      }

      // Handle logo removal
      if (shouldRemoveLogo && !fileToUpload) {
        await firstValueFrom(this.organizationService.deleteLogo(currentOrg.id));
        logoUrl = undefined;
      }

      // Update organization with name, logo_url, and primary_color
      await firstValueFrom(
        this.organizationService.updateOrganization(currentOrg.id, {
          name,
          logo_url: logoUrl,
          primary_color: this.selectedColor(),
        })
      );

      this.snackBar.open('Company settings saved successfully', 'Close', { duration: 3000 });
      this.settingsForm.markAsPristine();
      this.logoFile = null;
      this.removeExistingLogo = false;
      // Allow subscription to update with new logo_url from server
      this.initialLoadComplete = false;
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.snackBar.open('Failed to save settings', 'Close', { duration: 3000 });
    } finally {
      this.saving.set(false);
    }
  }
}
