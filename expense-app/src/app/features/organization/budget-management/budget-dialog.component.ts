import { Component, Inject, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSliderModule } from '@angular/material/slider';
import { MatIconModule } from '@angular/material/icon';
import { BudgetService } from '../../../core/services/budget.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { Budget, BudgetType, BudgetPeriod, BudgetWithTracking, CreateBudgetDto, UpdateBudgetDto } from '../../../core/models/budget.model';
import { ExpenseCategory } from '../../../core/models/enums';

export interface BudgetDialogData {
  mode: 'create' | 'edit';
  budget?: BudgetWithTracking;
}

export interface BudgetDialogResult {
  saved: boolean;
  budget?: Budget;
}

@Component({
  selector: 'app-budget-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSliderModule,
    MatIconModule
  ],
  template: `
    <h2 mat-dialog-title>{{ isEditMode ? 'Edit Budget' : 'Create Budget' }}</h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="budget-form">
        <!-- Name -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Budget Name</mat-label>
          <input matInput formControlName="name" placeholder="e.g., Q4 Travel Budget">
          @if (form.get('name')?.hasError('required') && form.get('name')?.touched) {
            <mat-error>Name is required</mat-error>
          }
        </mat-form-field>

        <!-- Budget Type -->
        <mat-form-field appearance="outline" class="full-width" [class.disabled]="isEditMode">
          <mat-label>Budget Type</mat-label>
          <mat-select formControlName="budget_type">
            @for (type of budgetTypes; track type.value) {
              <mat-option [value]="type.value">
                <mat-icon>{{ type.icon }}</mat-icon>
                {{ type.label }}
              </mat-option>
            }
          </mat-select>
          <mat-hint>{{ getTypeHint() }}</mat-hint>
        </mat-form-field>

        <!-- Department (shown for department type) -->
        @if (form.get('budget_type')?.value === 'department') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Department</mat-label>
            <mat-select formControlName="department">
              @for (dept of departments(); track dept) {
                <mat-option [value]="dept">{{ dept }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <!-- Category (shown for category type) -->
        @if (form.get('budget_type')?.value === 'category') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Category</mat-label>
            <mat-select formControlName="category">
              @for (cat of categories; track cat) {
                <mat-option [value]="cat">{{ cat }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }

        <!-- Amount -->
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Budget Amount</mat-label>
          <span matTextPrefix>$ &nbsp;</span>
          <input matInput type="number" formControlName="amount" placeholder="0.00" min="1" step="100">
          @if (form.get('amount')?.hasError('required') && form.get('amount')?.touched) {
            <mat-error>Amount is required</mat-error>
          }
          @if (form.get('amount')?.hasError('min')) {
            <mat-error>Amount must be greater than $0</mat-error>
          }
        </mat-form-field>

        <!-- Period -->
        <mat-form-field appearance="outline" class="full-width" [class.disabled]="isEditMode">
          <mat-label>Budget Period</mat-label>
          <mat-select formControlName="period">
            @for (period of periods; track period.value) {
              <mat-option [value]="period.value">{{ period.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <!-- Start Date -->
        <mat-form-field appearance="outline" class="full-width" [class.disabled]="isEditMode">
          <mat-label>Start Date</mat-label>
          <input matInput [matDatepicker]="startPicker" formControlName="start_date">
          <mat-datepicker-toggle matIconSuffix [for]="startPicker"></mat-datepicker-toggle>
          <mat-datepicker #startPicker></mat-datepicker>
        </mat-form-field>

        <!-- End Date (for custom period) -->
        @if (form.get('period')?.value === 'custom') {
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>End Date</mat-label>
            <input matInput [matDatepicker]="endPicker" formControlName="end_date">
            <mat-datepicker-toggle matIconSuffix [for]="endPicker"></mat-datepicker-toggle>
            <mat-datepicker #endPicker></mat-datepicker>
          </mat-form-field>
        }

        <!-- Alert Threshold -->
        <div class="slider-field">
          <label>Alert Threshold: {{ form.get('alert_threshold_percent')?.value }}%</label>
          <mat-slider min="50" max="100" step="5" discrete>
            <input matSliderThumb formControlName="alert_threshold_percent">
          </mat-slider>
          <mat-hint>You'll be warned when spending reaches this percentage</mat-hint>
        </div>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" (click)="onSave()" [disabled]="form.invalid || saving()">
        @if (saving()) {
          Saving...
        } @else {
          {{ isEditMode ? 'Update' : 'Create' }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    .budget-form {
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 400px;
      padding-top: 8px;
    }

    .full-width {
      width: 100%;
    }

    .disabled {
      opacity: 0.6;
      pointer-events: none;
    }

    .slider-field {
      padding: 8px 0 16px;

      label {
        display: block;
        font-size: 14px;
        color: var(--text-secondary);
        margin-bottom: 8px;
      }

      mat-slider {
        width: 100%;
      }

      mat-hint {
        font-size: 12px;
        color: var(--text-hint);
      }
    }

    mat-form-field mat-icon {
      margin-right: 8px;
      font-size: 20px;
      vertical-align: middle;
    }

    @media (max-width: 600px) {
      .budget-form {
        min-width: unset;
      }
    }
  `]
})
export class BudgetDialogComponent implements OnInit {
  private fb = inject(FormBuilder);
  private budgetService = inject(BudgetService);
  private organizationService = inject(OrganizationService);
  private dialogRef = inject(MatDialogRef<BudgetDialogComponent>);

  form!: FormGroup;
  saving = signal(false);
  departments = signal<string[]>([]);

  isEditMode: boolean;

  budgetTypes: { value: BudgetType; label: string; icon: string }[] = [
    { value: 'organization', label: 'Organization-wide', icon: 'business' },
    { value: 'department', label: 'Department', icon: 'groups' },
    { value: 'category', label: 'Category', icon: 'category' },
    { value: 'user', label: 'Individual', icon: 'person' }
  ];

  periods: { value: BudgetPeriod; label: string }[] = [
    { value: 'monthly', label: 'Monthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'yearly', label: 'Yearly' },
    { value: 'custom', label: 'Custom Period' }
  ];

  categories = Object.values(ExpenseCategory);

  constructor(@Inject(MAT_DIALOG_DATA) public data: BudgetDialogData) {
    this.isEditMode = data.mode === 'edit';
  }

  ngOnInit(): void {
    this.initForm();
    this.loadDepartments();
  }

  private initForm(): void {
    const budget = this.data.budget;
    const today = new Date().toISOString().slice(0, 10);

    this.form = this.fb.group({
      name: [budget?.name || '', [Validators.required, Validators.minLength(2)]],
      budget_type: [{ value: budget?.budget_type || 'organization', disabled: this.isEditMode }],
      department: [budget?.department || ''],
      category: [budget?.category || ''],
      amount: [budget?.amount || null, [Validators.required, Validators.min(1)]],
      period: [{ value: budget?.period || 'monthly', disabled: this.isEditMode }],
      start_date: [{ value: budget?.start_date || today, disabled: this.isEditMode }],
      end_date: [budget?.end_date || ''],
      alert_threshold_percent: [budget?.alert_threshold_percent || 80]
    });
  }

  private loadDepartments(): void {
    const orgId = this.organizationService.currentOrganizationId;
    if (!orgId) {
      this.departments.set(['Engineering', 'Sales', 'Marketing', 'Operations', 'Finance']);
      return;
    }
    this.organizationService.getOrganizationMembers(orgId).subscribe({
      next: (members) => {
        const depts = [...new Set(members.map(m => m.department).filter(Boolean))] as string[];
        this.departments.set(depts.length > 0 ? depts : ['Engineering', 'Sales', 'Marketing', 'Operations', 'Finance']);
      },
      error: () => {
        this.departments.set(['Engineering', 'Sales', 'Marketing', 'Operations', 'Finance']);
      }
    });
  }

  getTypeHint(): string {
    const type = this.form.get('budget_type')?.value;
    const hints: Record<string, string> = {
      organization: 'Applies to all expenses in the organization',
      department: 'Applies to expenses from a specific department',
      category: 'Applies to a specific expense category',
      user: 'Applies to a specific individual'
    };
    return hints[type] || '';
  }

  onSave(): void {
    if (this.form.invalid) return;

    this.saving.set(true);
    const formValue = this.form.getRawValue();

    if (this.isEditMode && this.data.budget) {
      const dto: UpdateBudgetDto = {
        name: formValue.name,
        amount: formValue.amount,
        alert_threshold_percent: formValue.alert_threshold_percent,
        end_date: formValue.end_date || undefined
      };

      this.budgetService.updateBudget(this.data.budget.id, dto).subscribe({
        next: (budget) => {
          this.saving.set(false);
          this.dialogRef.close({ saved: true, budget } as BudgetDialogResult);
        },
        error: () => {
          this.saving.set(false);
        }
      });
    } else {
      const dto: CreateBudgetDto = {
        name: formValue.name,
        budget_type: formValue.budget_type,
        department: formValue.budget_type === 'department' ? formValue.department : undefined,
        category: formValue.budget_type === 'category' ? formValue.category : undefined,
        amount: formValue.amount,
        period: formValue.period,
        start_date: formValue.start_date,
        end_date: formValue.period === 'custom' ? formValue.end_date : undefined,
        alert_threshold_percent: formValue.alert_threshold_percent
      };

      this.budgetService.createBudget(dto).subscribe({
        next: (budget) => {
          this.saving.set(false);
          this.dialogRef.close({ saved: true, budget } as BudgetDialogResult);
        },
        error: () => {
          this.saving.set(false);
        }
      });
    }
  }

  onCancel(): void {
    this.dialogRef.close({ saved: false } as BudgetDialogResult);
  }
}
