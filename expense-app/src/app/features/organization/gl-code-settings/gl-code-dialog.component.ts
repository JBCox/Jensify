import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CategoryService } from '../../../core/services/category.service';
import { GLCode } from '../../../core/models/gl-code.model';

export interface GLCodeDialogData {
  code?: GLCode;
}

@Component({
  selector: 'app-gl-code-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <h2 mat-dialog-title>
      <mat-icon>account_balance</mat-icon>
      {{ isEdit ? 'Edit GL Code' : 'Add GL Code' }}
    </h2>

    <mat-dialog-content>
      <form [formGroup]="form" class="dialog-form">
        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Code (e.g., TRAVEL, 6100)</mat-label>
          <input matInput formControlName="code">
          <mat-hint>The accounting code identifier</mat-hint>
          @if (form.get('code')?.hasError('required')) {
            <mat-error>Code is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Name (e.g., Travel Expenses)</mat-label>
          <input matInput formControlName="name">
          <mat-hint>Display name for this GL code</mat-hint>
          @if (form.get('name')?.hasError('required')) {
            <mat-error>Name is required</mat-error>
          }
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Description (optional)</mat-label>
          <textarea matInput formControlName="description" rows="2"></textarea>
          <mat-hint>Brief description of what this code covers</mat-hint>
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
      min-width: 400px;
    }

    .dialog-form {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .full-width {
      width: 100%;
    }

    mat-dialog-actions {
      padding: 1rem 1.5rem;
      border-top: 1px solid var(--jensify-border-light, #e5e7eb);
    }
  `]
})
export class GLCodeDialogComponent {
  private dialogRef = inject(MatDialogRef<GLCodeDialogComponent>);
  private data: GLCodeDialogData = inject(MAT_DIALOG_DATA);
  private fb = inject(FormBuilder);
  private categoryService = inject(CategoryService);

  form: FormGroup;
  saving = false;
  isEdit = false;

  constructor() {
    this.isEdit = !!this.data?.code;

    this.form = this.fb.group({
      code: [this.data?.code?.code || '', [Validators.required, Validators.maxLength(50)]],
      name: [this.data?.code?.name || '', [Validators.required, Validators.maxLength(100)]],
      description: [this.data?.code?.description || ''],
    });
  }

  save(): void {
    if (this.form.invalid) return;

    this.saving = true;
    const values = this.form.value;

    const operation = this.isEdit
      ? this.categoryService.updateGLCode(this.data.code!.id, values)
      : this.categoryService.createGLCode(values);

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
