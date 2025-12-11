import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { LoggerService } from '../../../core/services/logger.service';

interface ErrorLog {
  id: string;
  severity: 'critical' | 'error' | 'warning';
  type: string;
  message: string;
  user_email?: string;
  organization_name?: string;
  stack_trace?: string;
  context?: Record<string, unknown>;
  created_at: string;
  resolved: boolean;
  resolved_at?: string;
}

@Component({
  selector: 'app-error-log-list',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatExpansionModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="p-6">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Error Logs</mat-card-title>
          <mat-card-subtitle>System errors and exceptions</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <!-- Stats -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-red-50 p-4 rounded-lg">
              <div class="text-sm text-red-600 mb-1">Critical</div>
              <div class="text-2xl font-bold text-red-900">{{ stats().critical }}</div>
            </div>
            <div class="bg-orange-50 p-4 rounded-lg">
              <div class="text-sm text-orange-600 mb-1">Unresolved</div>
              <div class="text-2xl font-bold text-orange-900">{{ stats().unresolved }}</div>
            </div>
            <div class="bg-blue-50 p-4 rounded-lg">
              <div class="text-sm text-blue-600 mb-1">Total (24h)</div>
              <div class="text-2xl font-bold text-blue-900">{{ stats().total24h }}</div>
            </div>
          </div>

          <!-- Filters -->
          <form [formGroup]="filterForm" class="mb-6">
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <mat-form-field>
                <mat-label>Severity</mat-label>
                <mat-select formControlName="severity">
                  <mat-option value="">All</mat-option>
                  <mat-option value="critical">Critical</mat-option>
                  <mat-option value="error">Error</mat-option>
                  <mat-option value="warning">Warning</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Type</mat-label>
                <mat-select formControlName="type">
                  <mat-option value="">All</mat-option>
                  <mat-option value="database">Database</mat-option>
                  <mat-option value="api">API</mat-option>
                  <mat-option value="auth">Authentication</mat-option>
                  <mat-option value="payment">Payment</mat-option>
                </mat-select>
              </mat-form-field>
              <mat-form-field>
                <mat-label>Status</mat-label>
                <mat-select formControlName="resolved">
                  <mat-option value="">All</mat-option>
                  <mat-option value="false">Unresolved</mat-option>
                  <mat-option value="true">Resolved</mat-option>
                </mat-select>
              </mat-form-field>
              <div class="flex gap-2">
                <button mat-raised-button color="primary" (click)="applyFilter()">
                  <mat-icon>filter_list</mat-icon>
                  Apply
                </button>
                <button mat-button (click)="resetFilter()">Reset</button>
              </div>
            </div>
          </form>

          <!-- Error List -->
          @if (loading()) {
            <div class="text-center py-8">
              <mat-icon class="animate-spin text-4xl text-gray-400">refresh</mat-icon>
            </div>
          } @else if (errors().length > 0) {
            <mat-accordion>
              @for (error of errors(); track error.id) {
                <mat-expansion-panel>
                  <mat-expansion-panel-header>
                    <mat-panel-title>
                      <mat-chip [class]="getSeverityClass(error.severity)" class="mr-2">
                        {{ error.severity | uppercase }}
                      </mat-chip>
                      <span class="font-medium">{{ error.type }}</span>
                    </mat-panel-title>
                    <mat-panel-description>
                      <span class="truncate">{{ error.message }}</span>
                      <span class="text-xs text-gray-500 ml-2">{{ error.created_at | date:'short' }}</span>
                    </mat-panel-description>
                  </mat-expansion-panel-header>

                  <div class="space-y-4">
                    <div>
                      <h4 class="font-medium mb-2">Error Details</h4>
                      <p class="text-sm">{{ error.message }}</p>
                    </div>

                    @if (error.user_email || error.organization_name) {
                      <div>
                        <h4 class="font-medium mb-2">Context</h4>
                        <div class="text-sm space-y-1">
                          @if (error.user_email) {
                            <p>User: {{ error.user_email }}</p>
                          }
                          @if (error.organization_name) {
                            <p>Organization: {{ error.organization_name }}</p>
                          }
                        </div>
                      </div>
                    }

                    @if (error.stack_trace) {
                      <div>
                        <h4 class="font-medium mb-2">Stack Trace</h4>
                        <pre class="bg-gray-100 p-3 rounded text-xs overflow-x-auto">{{ error.stack_trace }}</pre>
                      </div>
                    }

                    <div class="flex gap-2">
                      @if (!error.resolved) {
                        <button mat-raised-button color="accent" (click)="resolveError(error)">
                          <mat-icon>check</mat-icon>
                          Mark as Resolved
                        </button>
                      } @else {
                        <mat-chip class="bg-green-100 text-green-800">
                          Resolved {{ error.resolved_at | date:'short' }}
                        </mat-chip>
                      }
                    </div>
                  </div>
                </mat-expansion-panel>
              }
            </mat-accordion>
          } @else {
            <div class="text-center py-8 text-gray-500">
              <mat-icon class="text-6xl mb-2">check_circle</mat-icon>
              <p>No errors found.</p>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class ErrorLogListComponent implements OnInit {
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private superAdminService = inject(SuperAdminService);
  private readonly logger = inject(LoggerService);

  filterForm: FormGroup;
  loading = signal(false);
  errors = signal<ErrorLog[]>([]);
  stats = signal({ critical: 0, unresolved: 0, total24h: 0 });

  constructor() {
    this.filterForm = this.fb.group({
      severity: [''],
      type: [''],
      resolved: ['']
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadErrors();
  }

  async loadErrors(): Promise<void> {
    this.loading.set(true);
    try {
      const logs = await firstValueFrom(this.superAdminService.getErrorLogs());
      // Map and filter based on form values
      const errors: ErrorLog[] = logs.map(log => ({
        id: log.id,
        severity: (log.severity as 'critical' | 'error' | 'warning') || 'error',
        type: log.error_type || 'unknown',
        message: log.message,
        user_email: log.user_id || undefined,
        organization_name: log.organization_id || undefined,
        stack_trace: log.stack_trace || undefined,
        created_at: log.created_at,
        resolved: log.is_resolved || false,
        resolved_at: log.resolved_at || undefined,
        resolved_by: log.resolved_by || undefined
      }));
      this.errors.set(errors);
      // Calculate stats
      const critical = errors.filter(e => e.severity === 'critical').length;
      const unresolved = errors.filter(e => !e.resolved).length;
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const total24h = errors.filter(e => new Date(e.created_at) >= yesterday).length;
      this.stats.set({ critical, unresolved, total24h });
    } catch (error) {
      this.logger.error('Error loading error logs', error as Error, 'ErrorLogListComponent.loadErrors');
    } finally {
      this.loading.set(false);
    }
  }

  async applyFilter(): Promise<void> {
    await this.loadErrors();
  }

  async resetFilter(): Promise<void> {
    this.filterForm.reset();
    await this.loadErrors();
  }

  getSeverityClass(severity: string): string {
    const classes: Record<string, string> = {
      critical: 'bg-red-100 text-red-800',
      error: 'bg-orange-100 text-orange-800',
      warning: 'bg-yellow-100 text-yellow-800'
    };
    return classes[severity] || '';
  }

  async resolveError(error: ErrorLog): Promise<void> {
    try {
      await this.superAdminService.resolveError(error.id);
      this.snackBar.open('Error marked as resolved', 'Close', { duration: 3000 });
      await this.loadErrors();
    } catch (err) {
      this.logger.error('Error resolving error log', err as Error, 'ErrorLogListComponent.resolveError');
      this.snackBar.open('Failed to resolve error', 'Close', { duration: 3000 });
    }
  }
}
