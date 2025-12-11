import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatListModule } from '@angular/material/list';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SuperAdminService } from '../../../core/services/super-admin.service';

interface ExportHistory {
  id: string;
  type: string;
  filename: string;
  created_at: string;
  size_bytes: number;
  download_url: string;
}

@Component({
  selector: 'app-data-export',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatListModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="p-6">
      <h1 class="text-2xl font-bold mb-6">Data Export</h1>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <!-- Organizations Export -->
        <mat-card>
          <mat-card-header>
            <mat-icon class="text-4xl text-blue-500 mr-3">business</mat-icon>
            <div>
              <mat-card-title>Organizations Data</mat-card-title>
              <mat-card-subtitle>Export all organization information</mat-card-subtitle>
            </div>
          </mat-card-header>
          <mat-card-content>
            <p class="text-sm text-gray-600 mb-4">
              Includes organization details, billing info, plan data, and settings.
            </p>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="exportOrganizations()" [disabled]="exporting()">
              <mat-icon>download</mat-icon>
              Export Organizations
            </button>
          </mat-card-actions>
        </mat-card>

        <!-- Billing History Export -->
        <mat-card>
          <mat-card-header>
            <mat-icon class="text-4xl text-green-500 mr-3">receipt</mat-icon>
            <div>
              <mat-card-title>Billing History</mat-card-title>
              <mat-card-subtitle>Export billing and payment data</mat-card-subtitle>
            </div>
          </mat-card-header>
          <mat-card-content>
            <form [formGroup]="billingForm" class="space-y-3">
              <mat-form-field class="w-full">
                <mat-label>Start Date</mat-label>
                <input matInput [matDatepicker]="startPicker" formControlName="startDate">
                <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
                <mat-datepicker #startPicker></mat-datepicker>
              </mat-form-field>
              <mat-form-field class="w-full">
                <mat-label>End Date</mat-label>
                <input matInput [matDatepicker]="endPicker" formControlName="endDate">
                <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
                <mat-datepicker #endPicker></mat-datepicker>
              </mat-form-field>
            </form>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="exportBilling()" [disabled]="exporting() || !billingForm.valid">
              <mat-icon>download</mat-icon>
              Export Billing
            </button>
          </mat-card-actions>
        </mat-card>

        <!-- Audit Logs Export -->
        <mat-card>
          <mat-card-header>
            <mat-icon class="text-4xl text-orange-500 mr-3">history</mat-icon>
            <div>
              <mat-card-title>Audit Logs</mat-card-title>
              <mat-card-subtitle>Export system activity logs</mat-card-subtitle>
            </div>
          </mat-card-header>
          <mat-card-content>
            <form [formGroup]="auditForm" class="space-y-3">
              <mat-form-field class="w-full">
                <mat-label>Start Date</mat-label>
                <input matInput [matDatepicker]="auditStartPicker" formControlName="startDate">
                <mat-datepicker-toggle matSuffix [for]="auditStartPicker"></mat-datepicker-toggle>
                <mat-datepicker #auditStartPicker></mat-datepicker>
              </mat-form-field>
              <mat-form-field class="w-full">
                <mat-label>End Date</mat-label>
                <input matInput [matDatepicker]="auditEndPicker" formControlName="endDate">
                <mat-datepicker-toggle matSuffix [for]="auditEndPicker"></mat-datepicker-toggle>
                <mat-datepicker #auditEndPicker></mat-datepicker>
              </mat-form-field>
              <mat-form-field class="w-full">
                <mat-label>Action Type</mat-label>
                <mat-select formControlName="actionType">
                  <mat-option value="">All Actions</mat-option>
                  <mat-option value="billing">Billing</mat-option>
                  <mat-option value="organization">Organization</mat-option>
                  <mat-option value="user">User</mat-option>
                  <mat-option value="impersonation">Impersonation</mat-option>
                </mat-select>
              </mat-form-field>
            </form>
          </mat-card-content>
          <mat-card-actions>
            <button mat-raised-button color="primary" (click)="exportAuditLogs()" [disabled]="exporting() || !auditForm.valid">
              <mat-icon>download</mat-icon>
              Export Audit Logs
            </button>
          </mat-card-actions>
        </mat-card>
      </div>

      @if (exporting()) {
        <mat-progress-bar mode="indeterminate" color="accent"></mat-progress-bar>
      }

      <!-- Recent Exports -->
      <mat-card class="mt-6">
        <mat-card-header>
          <mat-card-title>Recent Exports</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (exportHistory().length > 0) {
            <mat-list>
              @for (export of exportHistory(); track export.id) {
                <mat-list-item>
                  <mat-icon matListItemIcon>description</mat-icon>
                  <div matListItemTitle>{{ export.filename }}</div>
                  <div matListItemLine>
                    {{ export.created_at | date:'medium' }} - {{ formatFileSize(export.size_bytes) }}
                  </div>
                  <button mat-icon-button matListItemMeta (click)="downloadExport(export)">
                    <mat-icon>download</mat-icon>
                  </button>
                </mat-list-item>
              }
            </mat-list>
          } @else {
            <p class="text-center text-gray-500 py-4">No recent exports</p>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class DataExportComponent {
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private superAdminService = inject(SuperAdminService);

  billingForm: FormGroup;
  auditForm: FormGroup;
  exporting = signal(false);
  exportHistory = signal<ExportHistory[]>([]);

  constructor() {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    this.billingForm = this.fb.group({
      startDate: [thirtyDaysAgo, Validators.required],
      endDate: [new Date(), Validators.required]
    });

    this.auditForm = this.fb.group({
      startDate: [thirtyDaysAgo, Validators.required],
      endDate: [new Date(), Validators.required],
      actionType: ['']
    });

    this.loadExportHistory();
  }

  async loadExportHistory(): Promise<void> {
    try {
      const data = await firstValueFrom(this.superAdminService.getExportHistory());

      // Map database response to component interface
      const history: ExportHistory[] = data.map((exp: Record<string, unknown>) => ({
        id: exp['id'] as string,
        type: exp['export_type'] as string,
        filename: `${exp['export_type']}-export.${exp['format'] || 'csv'}`,
        created_at: exp['created_at'] as string,
        size_bytes: exp['file_size_bytes'] as number || 0,
        download_url: exp['file_url'] as string || '',
      }));

      this.exportHistory.set(history);
    } catch (error) {
      console.error('Error loading export history:', error);
    }
  }

  async exportOrganizations(): Promise<void> {
    this.exporting.set(true);
    try {
      const blob = await firstValueFrom(this.superAdminService.exportOrganizationsData());
      this.downloadBlob(blob, `organizations-${Date.now()}.csv`);
      this.snackBar.open('Organizations exported successfully', 'Close', { duration: 3000 });
      await this.loadExportHistory();
    } catch (error) {
      console.error('Error exporting organizations:', error);
      this.snackBar.open('Failed to export organizations', 'Close', { duration: 3000 });
    } finally {
      this.exporting.set(false);
    }
  }

  async exportBilling(): Promise<void> {
    if (!this.billingForm.valid) return;

    this.exporting.set(true);
    try {
      const { startDate, endDate } = this.billingForm.value;
      const start = startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate;
      const end = endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate;
      const blob = await firstValueFrom(this.superAdminService.exportBillingData(start, end));
      this.downloadBlob(blob, `billing-${Date.now()}.csv`);
      this.snackBar.open('Billing data exported successfully', 'Close', { duration: 3000 });
      await this.loadExportHistory();
    } catch (error) {
      console.error('Error exporting billing:', error);
      this.snackBar.open('Failed to export billing data', 'Close', { duration: 3000 });
    } finally {
      this.exporting.set(false);
    }
  }

  async exportAuditLogs(): Promise<void> {
    if (!this.auditForm.valid) return;

    this.exporting.set(true);
    try {
      const { startDate, endDate, actionType } = this.auditForm.value;
      const start = startDate instanceof Date ? startDate.toISOString().split('T')[0] : startDate;
      const end = endDate instanceof Date ? endDate.toISOString().split('T')[0] : endDate;
      const blob = await firstValueFrom(this.superAdminService.exportAuditLogs({
        startDate: start,
        endDate: end,
        action: actionType || undefined
      }));
      this.downloadBlob(blob, `audit-logs-${Date.now()}.csv`);
      this.snackBar.open('Audit logs exported successfully', 'Close', { duration: 3000 });
      await this.loadExportHistory();
    } catch (error) {
      console.error('Error exporting audit logs:', error);
      this.snackBar.open('Failed to export audit logs', 'Close', { duration: 3000 });
    } finally {
      this.exporting.set(false);
    }
  }

  downloadExport(exportItem: ExportHistory): void {
    window.open(exportItem.download_url, '_blank');
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
