import { Component, OnInit, OnDestroy, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { OrganizationService } from '../../../core/services/organization.service';
import { MileageService } from '../../../core/services/mileage.service';
import { MileageSettings, Organization } from '../../../core/models/organization.model';
import { IRSMileageRate } from '../../../core/models/mileage.model';

/**
 * Mileage Settings Component
 * Admin-only component to configure organization mileage reimbursement settings
 */
@Component({
  selector: 'app-mileage-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './mileage-settings.component.html',
  styleUrl: './mileage-settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MileageSettingsComponent implements OnInit, OnDestroy {
  private organizationService = inject(OrganizationService);
  private mileageService = inject(MileageService);
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);

  private destroy$ = new Subject<void>();

  // State
  loading = signal<boolean>(false);
  saving = signal<boolean>(false);
  error = signal<string | null>(null);
  currentIrsRate = signal<number | null>(null);

  // Form
  settingsForm!: FormGroup;

  // Category options
  readonly categoryOptions = [
    { value: 'business', label: 'Business' },
    { value: 'medical', label: 'Medical' },
    { value: 'charity', label: 'Charity' },
    { value: 'moving', label: 'Moving' }
  ];

  ngOnInit(): void {
    this.initForm();
    this.loadSettings();
    this.loadCurrentIrsRate();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.settingsForm = this.fb.group({
      use_custom_rate: [false],
      custom_rate_per_mile: [0, [Validators.min(0), Validators.max(10)]],
      mileage_category: ['business']
    });

    // Enable/disable custom rate field based on toggle
    this.settingsForm.get('use_custom_rate')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((useCustom: boolean) => {
        const customRateControl = this.settingsForm.get('custom_rate_per_mile');
        if (useCustom) {
          customRateControl?.enable();
          customRateControl?.setValidators([Validators.required, Validators.min(0.01), Validators.max(10)]);
        } else {
          customRateControl?.disable();
          customRateControl?.clearValidators();
        }
        customRateControl?.updateValueAndValidity();
      });
  }

  private loadSettings(): void {
    this.loading.set(true);
    this.error.set(null);

    const currentOrg = this.organizationService.currentOrganization$;
    currentOrg.pipe(takeUntil(this.destroy$)).subscribe({
      next: (org: Organization | null) => {
        if (org?.settings?.mileage_settings) {
          const mileageSettings = org.settings.mileage_settings;
          this.settingsForm.patchValue({
            use_custom_rate: mileageSettings.use_custom_rate || false,
            custom_rate_per_mile: mileageSettings.custom_rate_per_mile || 0,
            mileage_category: mileageSettings.mileage_category || 'business'
          });
        }
        this.loading.set(false);
      },
      error: (err: Error) => {
        this.error.set(err.message || 'Failed to load settings');
        this.loading.set(false);
      }
    });
  }

  private loadCurrentIrsRate(): void {
    this.mileageService.getCurrentRate('business')
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (rate: IRSMileageRate) => {
          this.currentIrsRate.set(rate.rate);
        },
        error: () => {
          // Fallback to 2024 rate if lookup fails
          this.currentIrsRate.set(0.67);
        }
      });
  }

  onSave(): void {
    if (this.settingsForm.invalid) {
      return;
    }

    this.saving.set(true);

    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) {
      this.snackBar.open('No organization selected', 'Close', { duration: 3000 });
      this.saving.set(false);
      return;
    }

    const mileageSettings: MileageSettings = {
      use_custom_rate: this.settingsForm.get('use_custom_rate')?.value || false,
      custom_rate_per_mile: parseFloat(this.settingsForm.get('custom_rate_per_mile')?.value) || 0,
      mileage_category: this.settingsForm.get('mileage_category')?.value || 'business'
    };

    // Update organization settings
    this.organizationService.updateOrganization(orgId, {
      settings: {
        mileage_settings: mileageSettings
      }
    })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.snackBar.open('Mileage settings saved successfully', 'Close', { duration: 3000 });
        },
        error: (err: Error) => {
          this.saving.set(false);
          this.snackBar.open(err.message || 'Failed to save settings', 'Close', { duration: 5000 });
        }
      });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    }).format(amount);
  }
}
