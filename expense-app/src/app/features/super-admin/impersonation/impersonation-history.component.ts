import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SuperAdminService } from '../../../core/services/super-admin.service';

interface ImpersonationLog {
  id: string;
  admin_name: string;
  admin_email: string;
  target_user_name: string;
  target_user_email: string;
  organization_name: string;
  reason: string;
  started_at: string;
  ended_at?: string | null;
  duration_minutes?: number | null;
}

@Component({
  selector: 'app-impersonation-history',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
  ],
  template: `
    <div class="p-6">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Impersonation History</mat-card-title>
          <mat-card-subtitle>Audit log of all impersonation sessions</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <!-- Filters -->
          <form [formGroup]="filterForm" class="mb-6">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <mat-form-field>
                <mat-label>Admin Email</mat-label>
                <input matInput formControlName="adminEmail" placeholder="Filter by admin">
                <mat-icon matPrefix>person</mat-icon>
              </mat-form-field>

              <mat-form-field>
                <mat-label>Start Date</mat-label>
                <input matInput [matDatepicker]="startPicker" formControlName="startDate">
                <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
                <mat-datepicker #startPicker></mat-datepicker>
              </mat-form-field>

              <mat-form-field>
                <mat-label>End Date</mat-label>
                <input matInput [matDatepicker]="endPicker" formControlName="endDate">
                <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
                <mat-datepicker #endPicker></mat-datepicker>
              </mat-form-field>
            </div>

            <div class="flex gap-2">
              <button mat-raised-button color="primary" (click)="applyFilters()">
                <mat-icon>filter_list</mat-icon>
                Apply Filters
              </button>
              <button mat-button (click)="resetFilters()">
                <mat-icon>clear</mat-icon>
                Reset
              </button>
            </div>
          </form>

          <!-- Stats Cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div class="bg-blue-50 p-4 rounded-lg">
              <div class="text-sm text-blue-600 mb-1">Total Sessions</div>
              <div class="text-2xl font-bold text-blue-900">{{ stats().total }}</div>
            </div>
            <div class="bg-green-50 p-4 rounded-lg">
              <div class="text-sm text-green-600 mb-1">This Month</div>
              <div class="text-2xl font-bold text-green-900">{{ stats().thisMonth }}</div>
            </div>
            <div class="bg-orange-50 p-4 rounded-lg">
              <div class="text-sm text-orange-600 mb-1">Active Now</div>
              <div class="text-2xl font-bold text-orange-900">{{ stats().active }}</div>
            </div>
          </div>

          <!-- History Table -->
          @if (loading()) {
            <div class="text-center py-8">
              <mat-icon class="animate-spin text-4xl text-gray-400">refresh</mat-icon>
              <p class="text-gray-500 mt-2">Loading history...</p>
            </div>
          } @else if (history().length > 0) {
            <div class="overflow-x-auto">
              <table mat-table [dataSource]="history()" class="w-full">
                <!-- Admin Column -->
                <ng-container matColumnDef="admin">
                  <th mat-header-cell *matHeaderCellDef>Admin</th>
                  <td mat-cell *matCellDef="let log">
                    <div>
                      <div class="font-medium">{{ log.admin_name }}</div>
                      <div class="text-sm text-gray-500">{{ log.admin_email }}</div>
                    </div>
                  </td>
                </ng-container>

                <!-- Target User Column -->
                <ng-container matColumnDef="target">
                  <th mat-header-cell *matHeaderCellDef>Target User</th>
                  <td mat-cell *matCellDef="let log">
                    <div>
                      <div class="font-medium">{{ log.target_user_name }}</div>
                      <div class="text-sm text-gray-500">{{ log.target_user_email }}</div>
                    </div>
                  </td>
                </ng-container>

                <!-- Organization Column -->
                <ng-container matColumnDef="organization">
                  <th mat-header-cell *matHeaderCellDef>Organization</th>
                  <td mat-cell *matCellDef="let log">{{ log.organization_name }}</td>
                </ng-container>

                <!-- Reason Column -->
                <ng-container matColumnDef="reason">
                  <th mat-header-cell *matHeaderCellDef>Reason</th>
                  <td mat-cell *matCellDef="let log">
                    <span [matTooltip]="log.reason" class="truncate max-w-xs block">
                      {{ log.reason }}
                    </span>
                  </td>
                </ng-container>

                <!-- Duration Column -->
                <ng-container matColumnDef="duration">
                  <th mat-header-cell *matHeaderCellDef>Duration</th>
                  <td mat-cell *matCellDef="let log">
                    @if (log.ended_at) {
                      <span>{{ log.duration_minutes }} min</span>
                    } @else {
                      <mat-chip color="accent">Active</mat-chip>
                    }
                  </td>
                </ng-container>

                <!-- Date Column -->
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>Started</th>
                  <td mat-cell *matCellDef="let log">
                    {{ log.started_at | date:'short' }}
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            </div>
          } @else {
            <div class="text-center py-8 text-gray-500">
              <mat-icon class="text-6xl mb-2">history</mat-icon>
              <p>No impersonation history found.</p>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class ImpersonationHistoryComponent implements OnInit {
  private fb = inject(FormBuilder);
  private superAdminService = inject(SuperAdminService);

  filterForm: FormGroup;
  loading = signal(false);
  history = signal<ImpersonationLog[]>([]);
  stats = signal({ total: 0, thisMonth: 0, active: 0 });
  displayedColumns = ['admin', 'target', 'organization', 'reason', 'duration', 'date'];

  constructor() {
    this.filterForm = this.fb.group({
      adminEmail: [''],
      startDate: [null],
      endDate: [null]
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadHistory();
  }

  async loadHistory(): Promise<void> {
    this.loading.set(true);
    try {
      const sessions = await firstValueFrom(this.superAdminService.getImpersonationHistory());
      // Map to component's interface
      const logs: ImpersonationLog[] = sessions.map(s => ({
        id: s.id,
        admin_name: s.admin_name || s.super_admin_id,
        admin_email: s.super_admin_id,
        target_user_name: s.target_user_email || s.target_user_id,
        target_user_email: s.target_user_email || s.target_user_id,
        organization_name: s.target_org_name || s.target_org_id || 'Unknown',
        reason: s.reason,
        started_at: s.started_at,
        ended_at: s.ended_at || undefined,
        duration_minutes: s.ended_at
          ? Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000)
          : undefined
      }));
      this.history.set(logs);
      // Calculate stats
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const thisMonth = logs.filter(l => new Date(l.started_at) >= monthStart).length;
      const active = logs.filter(l => !l.ended_at).length;
      this.stats.set({ total: logs.length, thisMonth, active });
    } catch (error) {
      console.error('Error loading impersonation history:', error);
    } finally {
      this.loading.set(false);
    }
  }

  async applyFilters(): Promise<void> {
    await this.loadHistory();
  }

  async resetFilters(): Promise<void> {
    this.filterForm.reset();
    await this.loadHistory();
  }
}
