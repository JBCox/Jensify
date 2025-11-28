import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

/**
 * Data interface for the confirmation dialog
 */
export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmColor?: 'primary' | 'accent' | 'warn';
  icon?: string;
  iconColor?: string;
}

/**
 * Reusable confirmation dialog component using Angular Material.
 *
 * Replaces native browser confirm() dialogs which are inaccessible
 * to browser automation tools (MCP, Puppeteer, etc.).
 *
 * Usage:
 * ```typescript
 * const dialogRef = this.dialog.open(ConfirmDialogComponent, {
 *   data: {
 *     title: 'Confirm Action',
 *     message: 'Are you sure you want to proceed?',
 *     confirmText: 'Yes',
 *     cancelText: 'No',
 *     confirmColor: 'warn'
 *   }
 * });
 *
 * dialogRef.afterClosed().subscribe(result => {
 *   if (result) {
 *     // User confirmed
 *   }
 * });
 * ```
 */
@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="confirm-dialog">
      <h2 mat-dialog-title class="dialog-title">
        @if (data.icon) {
          <mat-icon [style.color]="data.iconColor || 'inherit'" class="title-icon">{{ data.icon }}</mat-icon>
        }
        {{ data.title }}
      </h2>

      <mat-dialog-content class="dialog-content">
        <p>{{ data.message }}</p>
      </mat-dialog-content>

      <mat-dialog-actions align="end" class="dialog-actions">
        <button
          mat-button
          [mat-dialog-close]="false"
          class="cancel-button">
          {{ data.cancelText || 'Cancel' }}
        </button>
        <button
          mat-flat-button
          [color]="data.confirmColor || 'primary'"
          [mat-dialog-close]="true"
          class="confirm-button"
          cdkFocusInitial>
          {{ data.confirmText || 'Confirm' }}
        </button>
      </mat-dialog-actions>
    </div>
  `,
  styles: [`
    .confirm-dialog {
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

      p {
        margin: 0;
        color: var(--text-secondary, rgba(0, 0, 0, 0.7));
        font-size: 0.95rem;
        line-height: 1.5;
      }
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
      .dialog-content p {
        color: rgba(255, 255, 255, 0.7);
      }

      .cancel-button {
        color: rgba(255, 255, 255, 0.7);
      }
    }
  `]
})
export class ConfirmDialogComponent {
  readonly dialogRef = inject(MatDialogRef<ConfirmDialogComponent>);
  readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
}
