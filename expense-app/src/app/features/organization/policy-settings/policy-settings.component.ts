import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule, Sort } from '@angular/material/sort';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatMenuModule } from '@angular/material/menu';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatDividerModule } from '@angular/material/divider';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { PolicyService } from '../../../core/services/policy.service';
import {
  ExpensePolicy,
  PolicyPreset,
  PolicyScopeType,
  CreatePolicyDto
} from '../../../core/models/policy.model';
import { ExpenseCategory } from '../../../core/models/enums';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-policy-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatMenuModule,
    MatExpansionModule,
    MatDividerModule,
    EmptyState
  ],
  templateUrl: './policy-settings.component.html',
  styleUrl: './policy-settings.component.scss'
})
export class PolicySettingsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  private fb = inject(FormBuilder);
  private policyService = inject(PolicyService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  // State
  policies = signal<ExpensePolicy[]>([]);
  presets = signal<PolicyPreset[]>([]);
  loading = signal<boolean>(true);
  saving = signal<boolean>(false);
  editingPolicy = signal<ExpensePolicy | null>(null);
  showForm = signal<boolean>(false);

  // Stats
  policyStats = signal<{ total: number; active: number; byScope: Record<string, number> } | null>(null);

  // Form
  policyForm!: FormGroup;

  // Options
  readonly scopeTypes: { value: PolicyScopeType; label: string; icon: string }[] = [
    { value: 'organization', label: 'Organization-wide', icon: 'business' },
    { value: 'department', label: 'Department', icon: 'group_work' },
    { value: 'role', label: 'Role', icon: 'badge' },
    { value: 'user', label: 'User', icon: 'person' },
    { value: 'category', label: 'Category', icon: 'category' }
  ];

  readonly categories = Object.values(ExpenseCategory);

  readonly roleOptions = ['employee', 'manager', 'finance', 'admin'];

  // Table columns
  displayedColumns = ['name', 'scope', 'limits', 'status', 'priority', 'actions'];

  // Computed
  activePolicies = computed(() => this.policies().filter(p => p.is_active));
  inactivePolicies = computed(() => this.policies().filter(p => !p.is_active));

  ngOnInit(): void {
    this.initForm();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.policyForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(100)]],
      description: [''],
      scope_type: ['organization', Validators.required],
      scope_value: [''],
      category: [''],
      max_amount: [null, [Validators.min(0)]],
      max_daily_total: [null, [Validators.min(0)]],
      max_monthly_total: [null, [Validators.min(0)]],
      max_receipt_age_days: [90, [Validators.min(1), Validators.max(365)]],
      require_receipt: [true],
      require_description: [false],
      allow_weekends: [true],
      auto_approve_under: [null, [Validators.min(0)]],
      require_approval_over: [null, [Validators.min(0)]],
      priority: [0, [Validators.min(0), Validators.max(1000)]],
      is_active: [true]
    });
  }

  private loadData(): void {
    this.loading.set(true);

    // Load policies
    this.policyService.getPolicies()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (policies) => {
          this.policies.set(policies);
          this.loading.set(false);
        },
        error: (err) => {
          this.snackBar.open(err?.message || 'Failed to load policies', 'Close', { duration: 4000 });
          this.loading.set(false);
        }
      });

    // Load presets
    this.policyService.getPresets()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (presets) => this.presets.set(presets),
        error: () => {} // Silent fail for presets
      });

    // Load stats
    this.policyService.getPolicyStats()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => this.policyStats.set(stats),
        error: () => {} // Silent fail for stats
      });
  }

  openCreateForm(): void {
    this.editingPolicy.set(null);
    this.policyForm.reset({
      scope_type: 'organization',
      max_receipt_age_days: 90,
      require_receipt: true,
      require_description: false,
      allow_weekends: true,
      priority: 0,
      is_active: true
    });
    this.showForm.set(true);
  }

  openEditForm(policy: ExpensePolicy): void {
    this.editingPolicy.set(policy);
    this.policyForm.patchValue({
      name: policy.name,
      description: policy.description || '',
      scope_type: policy.scope_type,
      scope_value: policy.scope_value || '',
      category: policy.category || '',
      max_amount: policy.max_amount,
      max_daily_total: policy.max_daily_total,
      max_monthly_total: policy.max_monthly_total,
      max_receipt_age_days: policy.max_receipt_age_days,
      require_receipt: policy.require_receipt,
      require_description: policy.require_description,
      allow_weekends: policy.allow_weekends,
      auto_approve_under: policy.auto_approve_under,
      require_approval_over: policy.require_approval_over,
      priority: policy.priority,
      is_active: policy.is_active
    });
    this.showForm.set(true);
  }

  cancelForm(): void {
    this.showForm.set(false);
    this.editingPolicy.set(null);
    this.policyForm.reset();
  }

  savePolicy(): void {
    if (this.policyForm.invalid) {
      this.policyForm.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    const formValue = this.policyForm.value;

    // Clean up empty values
    const policyData: CreatePolicyDto = {
      name: formValue.name,
      description: formValue.description || undefined,
      scope_type: formValue.scope_type,
      scope_value: formValue.scope_value || undefined,
      category: formValue.category || undefined,
      max_amount: formValue.max_amount || undefined,
      max_daily_total: formValue.max_daily_total || undefined,
      max_monthly_total: formValue.max_monthly_total || undefined,
      max_receipt_age_days: formValue.max_receipt_age_days,
      require_receipt: formValue.require_receipt,
      require_description: formValue.require_description,
      allow_weekends: formValue.allow_weekends,
      auto_approve_under: formValue.auto_approve_under || undefined,
      require_approval_over: formValue.require_approval_over || undefined,
      priority: formValue.priority,
      is_active: formValue.is_active
    };

    const editing = this.editingPolicy();
    const operation = editing
      ? this.policyService.updatePolicy({ id: editing.id, ...policyData })
      : this.policyService.createPolicy(policyData);

    operation.pipe(takeUntil(this.destroy$)).subscribe({
      next: () => {
        this.snackBar.open(
          editing ? 'Policy updated successfully' : 'Policy created successfully',
          'Close',
          { duration: 3000 }
        );
        this.cancelForm();
        this.loadData();
      },
      error: (err) => {
        this.snackBar.open(err?.message || 'Failed to save policy', 'Close', { duration: 4000 });
        this.saving.set(false);
      }
    });
  }

  deletePolicy(policy: ExpensePolicy): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Policy',
        message: `Delete "${policy.name}"? This cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmColor: 'warn',
        icon: 'delete',
        iconColor: '#f44336'
      } as ConfirmDialogData
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.policyService.deletePolicy(policy.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.snackBar.open('Policy deleted', 'Close', { duration: 3000 });
              this.loadData();
            },
            error: (err) => {
              this.snackBar.open(err?.message || 'Failed to delete policy', 'Close', { duration: 4000 });
            }
          });
      }
    });
  }

  togglePolicy(policy: ExpensePolicy): void {
    this.policyService.togglePolicyActive(policy.id, !policy.is_active)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open(
            policy.is_active ? 'Policy deactivated' : 'Policy activated',
            'Close',
            { duration: 3000 }
          );
          this.loadData();
        },
        error: (err) => {
          this.snackBar.open(err?.message || 'Failed to update policy', 'Close', { duration: 4000 });
        }
      });
  }

  duplicatePolicy(policy: ExpensePolicy): void {
    this.openEditForm(policy);
    this.editingPolicy.set(null); // Clear editing so it creates new
    this.policyForm.patchValue({ name: `${policy.name} (Copy)` });
  }

  applyPreset(preset: PolicyPreset): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Apply Preset',
        message: `Apply "${preset.name}" preset? This will create new policies based on the template.`,
        confirmText: 'Apply',
        cancelText: 'Cancel',
        confirmColor: 'primary',
        icon: 'playlist_add',
        iconColor: '#FF5900'
      } as ConfirmDialogData
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.saving.set(true);
        this.policyService.applyPreset(preset.name)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (result) => {
              this.snackBar.open(
                `Preset applied: ${result.policies_created} policies created`,
                'Close',
                { duration: 4000 }
              );
              this.loadData();
              this.saving.set(false);
            },
            error: (err) => {
              this.snackBar.open(err?.message || 'Failed to apply preset', 'Close', { duration: 4000 });
              this.saving.set(false);
            }
          });
      }
    });
  }

  getScopeIcon(scopeType: PolicyScopeType): string {
    return this.scopeTypes.find(s => s.value === scopeType)?.icon || 'policy';
  }

  getScopeLabel(scopeType: PolicyScopeType): string {
    return this.scopeTypes.find(s => s.value === scopeType)?.label || scopeType;
  }

  getScopeDisplay(policy: ExpensePolicy): string {
    if (policy.scope_value) {
      return `${this.getScopeLabel(policy.scope_type)}: ${policy.scope_value}`;
    }
    return this.getScopeLabel(policy.scope_type);
  }

  getLimitsDisplay(policy: ExpensePolicy): string {
    const parts: string[] = [];
    if (policy.max_amount) parts.push(`$${policy.max_amount}/txn`);
    if (policy.max_daily_total) parts.push(`$${policy.max_daily_total}/day`);
    if (policy.max_monthly_total) parts.push(`$${policy.max_monthly_total}/mo`);
    return parts.length > 0 ? parts.join(', ') : 'No limits';
  }

  formatCurrency(amount?: number): string {
    if (amount === undefined || amount === null) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  sortPolicies(sort: Sort): void {
    const data = [...this.policies()];
    if (!sort.active || sort.direction === '') {
      return;
    }

    data.sort((a, b) => {
      const isAsc = sort.direction === 'asc';
      switch (sort.active) {
        case 'name':
          return this.compare(a.name, b.name, isAsc);
        case 'priority':
          return this.compare(a.priority, b.priority, isAsc);
        default:
          return 0;
      }
    });

    this.policies.set(data);
  }

  private compare(a: string | number, b: string | number, isAsc: boolean): number {
    return (a < b ? -1 : 1) * (isAsc ? 1 : -1);
  }
}
