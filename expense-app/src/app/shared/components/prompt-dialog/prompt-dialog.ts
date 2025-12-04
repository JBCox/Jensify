import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';

/**
 * Data interface for the prompt dialog
 */
export interface PromptDialogData {
  title: string;
  message: string;
  placeholder?: string;
  initialValue?: string;
  required?: boolean;
  maxLength?: number;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'accent' | 'warn';
  icon?: string;
  iconColor?: string;
}

/**
 * Reusable prompt dialog component for text input using Angular Material.
 *
 * Usage:
 * ```typescript
 * const dialogRef = this.dialog.open(PromptDialogComponent, {
 *   data: {
 *     title: 'Reason for Change',
 *     message: 'Please provide a reason for modifying the distance:',
 *     placeholder: 'e.g., Odometer reading was different',
 *     required: true,
 *     confirmText: 'Save',
 *     confirmColor: 'primary'
 *   }
 * });
 *
 * dialogRef.afterClosed().subscribe(result => {
 *   if (result) {
 *     console.log('User entered:', result);
 *   }
 * });
 * ```
 */
@Component({
  selector: 'app-prompt-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule
  ],
  template: `
    <div class="prompt-dialog">
      <h2 mat-dialog-title class="dialog-title">
        @if (data.icon) {
          <mat-icon [style.color]="data.iconColor || 'inherit'" class="title-icon">{{ data.icon }}</mat-icon>
        }
        {{ data.title }}
      </h2>

      <mat-dialog-content class="dialog-content">
        <p class="dialog-message">{{ data.message }}</p>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>{{ data.placeholder || 'Enter text' }}</mat-label>
          <textarea
            matInput
            [formControl]="inputControl"
            [placeholder]="data.placeholder || ''"
            [maxlength]="data.maxLength || 500"
            rows="3"
            cdkFocusInitial>
          </textarea>
          @if (data.maxLength) {
            <mat-hint align="end">{{ inputControl.value?.length || 0 }} / {{ data.maxLength }}</mat-hint>
          }
          @if (inputControl.hasError('required')) {
            <mat-error>This field is required</mat-error>
          }
        </mat-form-field>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button
          mat-button
          [mat-dialog-close]="null"
          class="cancel-button">
          {{ data.cancelText || 'Cancel' }}
        </button>
        <button
          mat-flat-button
          [color]="data.confirmColor || 'primary'"
          [mat-dialog-close]="inputControl.value"
          [disabled]="!inputControl.valid"
          class="confirm-button">
          {{ data.confirmText || 'Confirm' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .prompt-dialog {
      min-width: 320px;
      max-width: 480px;
    }

    .dialog-title {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      padding: 16px 24px;
      font-size: 1.25rem;
      font-weight: 500;
    }

    .title-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .dialog-content {
      padding: 0 24px 16px;
    }

    .dialog-message {
      margin: 0 0 16px 0;
      color: var(--text-secondary, rgba(0, 0, 0, 0.7));
      font-size: 0.95rem;
      line-height: 1.5;
    }

    .full-width {
      width: 100%;
    }

    .dialog-actions {
      padding: 8px 16px 16px;
      gap: 8px;
    }

    .cancel-button {
      color: var(--text-secondary, rgba(0, 0, 0, 0.6));
    }

    .confirm-button {
      min-width: 80px;
    }

    /* Dark mode support */
    :host-context(.dark-mode) {
      .dialog-message {
        color: rgba(255, 255, 255, 0.7);
      }

      .cancel-button {
        color: rgba(255, 255, 255, 0.7);
      }
    }
  `]
})
export class PromptDialogComponent {
  readonly dialogRef = inject(MatDialogRef<PromptDialogComponent>);
  readonly data = inject<PromptDialogData>(MAT_DIALOG_DATA);

  readonly inputControl = new FormControl(
    this.data.initialValue || '',
    this.data.required ? [Validators.required] : []
  );
}
