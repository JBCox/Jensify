import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { CategoryService } from '../../../core/services/category.service';
import { GLCode, CustomExpenseCategory } from '../../../core/models/gl-code.model';

export interface CategoryDialogData {
  category?: CustomExpenseCategory;
  glCodes: GLCode[];
}

// Common Material icons for expense categories
const CATEGORY_ICONS = [
  { icon: 'receipt', label: 'Receipt' },
  { icon: 'local_gas_station', label: 'Gas Station' },
  { icon: 'directions_car', label: 'Car' },
  { icon: 'local_parking', label: 'Parking' },
  { icon: 'flight', label: 'Flight' },
  { icon: 'hotel', label: 'Hotel' },
  { icon: 'train', label: 'Train' },
  { icon: 'local_taxi', label: 'Taxi' },
  { icon: 'restaurant', label: 'Restaurant' },
  { icon: 'groups', label: 'Groups/Meeting' },
  { icon: 'celebration', label: 'Celebration' },
  { icon: 'inventory_2', label: 'Supplies' },
  { icon: 'apps', label: 'Apps/Software' },
  { icon: 'speed', label: 'Mileage' },
  { icon: 'toll', label: 'Toll' },
  { icon: 'car_rental', label: 'Car Rental' },
  { icon: 'more_horiz', label: 'Other' },
];

/**
 * Get predefined colors with dynamic primary color from CSS variables
 */
function getCategoryColors(): string[] {
  const primaryColor = getComputedStyle(document.documentElement).getPropertyValue('--jensify-primary').trim() || '#ff5900';
  return [
    primaryColor, // Dynamic Jensify primary color
    '#3b82f6', // Blue
    '#22c55e', // Green
    '#f59e0b', // Amber
    '#8b5cf6', // Purple
    '#ec4899', // Pink
    '#06b6d4', // Cyan
    '#84cc16', // Lime
    '#6366f1', // Indigo
    '#ef4444', // Red
  ];
}

@Component({
  selector: 'app-category-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>category</mat-icon>
      {{ isEdit ? 'Edit Category' : 'Add Category' }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <div class="form-row">
          <mat-form-field appearance="outline" class="flex-grow">
            <mat-label>Category Name</mat-label>
            <input matInput formControlName="name" placeholder="e.g., Business Meals">
            @if (form.get('name')?.hasError('required')) {
              <mat-error>Name is required</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline" class="gl-code-field">
            <mat-label>GL Code</mat-label>
            <mat-select formControlName="gl_code_id">
              <mat-option [value]="null">-- None --</mat-option>
              @for (code of data.glCodes; track code.id) {
                <mat-option [value]="code.id">
                  <span class="gl-option">
                    <strong>{{ code.code }}</strong>
                    <span>{{ code.name }}</span>
                  </span>
                </mat-option>
              }
            </mat-select>
            <mat-hint>Which GL code this maps to</mat-hint>
          </mat-form-field>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description (help text for employees)</mat-label>
          <textarea matInput formControlName="description" rows="2"
                    placeholder="Brief description or guidance for this category"></textarea>
        </mat-form-field>

        <div class="visual-section">
          <label class="section-label">Icon</label>
          <div class="icon-grid">
            @for (item of categoryIcons; track item.icon) {
              <button type="button" class="icon-btn"
                      [class.selected]="form.get('icon')?.value === item.icon"
                      (click)="selectIcon(item.icon)"
                      [matTooltip]="item.label">
                <mat-icon>{{ item.icon }}</mat-icon>
              </button>
            }
          </div>
        </div>

        <div class="visual-section">
          <label class="section-label">Color</label>
          <div class="color-grid">
            @for (color of categoryColors; track color) {
              <button type="button" class="color-btn"
                      [class.selected]="form.get('color')?.value === color"
                      [style.background]="color"
                      (click)="selectColor(color)">
                @if (form.get('color')?.value === color) {
                  <mat-icon>check</mat-icon>
                }
              </button>
            }
          </div>
        </div>

        <div class="preview-section">
          <label class="section-label">Preview</label>
          <div class="category-preview">
            <div class="preview-icon" [style.background]="form.get('color')?.value || categoryColors[0]">
              <mat-icon>{{ form.get('icon')?.value || 'receipt' }}</mat-icon>
            </div>
            <span class="preview-name">{{ form.get('name')?.value || 'Category Name' }}</span>
          </div>
        </div>

        <div class="toggles-section">
          <mat-slide-toggle formControlName="requires_description">
            Require description
            <span class="toggle-hint">(e.g., for business meals that need attendee info)</span>
          </mat-slide-toggle>

          <mat-slide-toggle formControlName="requires_receipt">
            Require receipt
          </mat-slide-toggle>
        </div>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Max Amount (optional)</mat-label>
          <input matInput type="number" formControlName="max_amount" placeholder="No limit">
          <span matTextPrefix>$&nbsp;</span>
          <mat-hint>Per-expense limit for this category (leave empty for no limit)</mat-hint>
        </mat-form-field>
      </form>
    </mat-dialog-content>

    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="save()" [disabled]="saving || form.invalid">
        @if (saving) {
          <mat-spinner diameter="20"></mat-spinner>
        } @else {
          {{ isEdit ? 'Update' : 'Create' }}
        }
      </button>
    </mat-dialog-actions>
  `,
  styles: [`
    h2[mat-dialog-title] {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin: 0;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid var(--jensify-border-light, #e5e7eb);

      mat-icon {
        color: var(--jensify-primary, #ff5900);
      }
    }

    mat-dialog-content {
      padding: 1.5rem !important;
      min-width: 500px;
      max-height: 70vh;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .form-row {
      display: flex;
      gap: 1rem;

      .flex-grow {
        flex: 1;
      }

      .gl-code-field {
        width: 200px;
      }
    }

    .full-width {
      width: 100%;
    }

    .gl-option {
      display: flex;
      gap: 0.5rem;
      align-items: center;

      strong {
        font-family: monospace;
        background: var(--jensify-primary, #ff5900);
        color: white;
        padding: 0 4px;
        border-radius: 3px;
        font-size: 0.75rem;
      }
    }

    .visual-section {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .section-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--jensify-text-secondary, #4b5563);
    }

    .icon-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .icon-btn {
      width: 40px;
      height: 40px;
      border: 2px solid var(--jensify-border-light, #e5e7eb);
      border-radius: 8px;
      background: var(--jensify-bg-subtle, #f9fafb);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;

      mat-icon {
        color: var(--jensify-text-secondary, #4b5563);
      }

      &:hover {
        border-color: var(--jensify-primary, #ff5900);
      }

      &.selected {
        border-color: var(--jensify-primary, #ff5900);
        background: color-mix(in srgb, var(--jensify-primary) 10%, transparent);

        mat-icon {
          color: var(--jensify-primary, #ff5900);
        }
      }
    }

    .color-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .color-btn {
      width: 32px;
      height: 32px;
      border: 2px solid transparent;
      border-radius: 50%;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;

      mat-icon {
        color: white;
        font-size: 16px;
        width: 16px;
        height: 16px;
      }

      &:hover {
        transform: scale(1.1);
      }

      &.selected {
        border-color: var(--jensify-text-strong, #1a1a1a);
        box-shadow: 0 0 0 2px white, 0 0 0 4px currentColor;
      }
    }

    .preview-section {
      padding: 1rem;
      background: var(--jensify-bg-subtle, #f9fafb);
      border-radius: 8px;
    }

    .category-preview {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 0.5rem;
    }

    .preview-icon {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;

      mat-icon {
        color: white;
      }
    }

    .preview-name {
      font-weight: 600;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .toggles-section {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem;
      background: var(--jensify-bg-subtle, #f9fafb);
      border-radius: 8px;

      .toggle-hint {
        font-size: 0.75rem;
        color: var(--jensify-text-muted, #666);
        margin-left: 0.25rem;
      }
    }

    mat-dialog-actions {
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--jensify-border-light, #e5e7eb);
    }

    @media (max-width: 600px) {
      mat-dialog-content {
        min-width: auto;
      }

      .form-row {
        flex-direction: column;

        .gl-code-field {
          width: 100%;
        }
      }
    }
  `]
})
export class CategoryDialogComponent {
  private dialogRef = inject(MatDialogRef<CategoryDialogComponent>);
  data: CategoryDialogData = inject(MAT_DIALOG_DATA);
  private fb = inject(FormBuilder);
  private categoryService = inject(CategoryService);

  form: FormGroup;
  saving = false;
  isEdit = false;

  categoryIcons = CATEGORY_ICONS;
  categoryColors: string[];

  constructor() {
    this.isEdit = !!this.data?.category;
    const cat = this.data?.category;

    // Get dynamic colors
    this.categoryColors = getCategoryColors();
    const defaultColor = this.categoryColors[0];

    this.form = this.fb.group({
      name: [cat?.name || '', [Validators.required, Validators.maxLength(100)]],
      description: [cat?.description || ''],
      gl_code_id: [cat?.gl_code_id || null],
      icon: [cat?.icon || 'receipt'],
      color: [cat?.color || defaultColor],
      requires_description: [cat?.requires_description || false],
      requires_receipt: [cat?.requires_receipt ?? true],
      max_amount: [cat?.max_amount || null],
    });
  }

  selectIcon(icon: string): void {
    this.form.patchValue({ icon });
  }

  selectColor(color: string): void {
    this.form.patchValue({ color });
  }

  save(): void {
    if (this.form.invalid) return;

    this.saving = true;
    const values = this.form.value;

    // Clean up max_amount
    if (values.max_amount === '' || values.max_amount === 0) {
      values.max_amount = null;
    }

    const operation = this.isEdit
      ? this.categoryService.updateCategory(this.data.category!.id, values)
      : this.categoryService.createCategory(values);

    operation.subscribe({
      next: () => {
        this.dialogRef.close(true);
      },
      error: () => {
        this.saving = false;
      }
    });
  }
}
