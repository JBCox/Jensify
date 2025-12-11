import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

interface ScheduledTask {
  id: string;
  name: string;
  description: string;
  schedule: string;
  last_run: string | null;
  next_run: string;
  status: 'success' | 'failed' | 'running';
  enabled: boolean;
  error_message?: string;
}

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="p-6">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Scheduled Tasks</mat-card-title>
          <mat-card-subtitle>Monitor and manage background jobs</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          @if (loading()) {
            <div class="text-center py-8">
              <mat-icon class="animate-spin text-4xl text-gray-400">refresh</mat-icon>
            </div>
          } @else if (tasks().length > 0) {
            <div class="overflow-x-auto">
              <table mat-table [dataSource]="tasks()" class="w-full">
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Task</th>
                  <td mat-cell *matCellDef="let task">
                    <div>
                      <div class="font-medium">{{ task.name }}</div>
                      <div class="text-sm text-gray-500">{{ task.description }}</div>
                    </div>
                  </td>
                </ng-container>

                <ng-container matColumnDef="schedule">
                  <th mat-header-cell *matHeaderCellDef>Schedule</th>
                  <td mat-cell *matCellDef="let task">
                    <span class="font-mono text-sm">{{ task.schedule }}</span>
                  </td>
                </ng-container>

                <ng-container matColumnDef="lastRun">
                  <th mat-header-cell *matHeaderCellDef>Last Run</th>
                  <td mat-cell *matCellDef="let task">
                    {{ task.last_run ? (task.last_run | date:'short') : 'Never' }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Status</th>
                  <td mat-cell *matCellDef="let task">
                    <mat-chip [class]="getStatusClass(task.status)">
                      {{ task.status | uppercase }}
                    </mat-chip>
                    @if (task.error_message) {
                      <div class="text-xs text-red-600 mt-1">{{ task.error_message }}</div>
                    }
                  </td>
                </ng-container>

                <ng-container matColumnDef="nextRun">
                  <th mat-header-cell *matHeaderCellDef>Next Run</th>
                  <td mat-cell *matCellDef="let task">
                    {{ task.next_run | date:'short' }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="enabled">
                  <th mat-header-cell *matHeaderCellDef>Enabled</th>
                  <td mat-cell *matCellDef="let task">
                    <mat-slide-toggle
                      [checked]="task.enabled"
                      (change)="toggleTask(task)"
                      color="accent"
                    ></mat-slide-toggle>
                  </td>
                </ng-container>

                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Actions</th>
                  <td mat-cell *matCellDef="let task">
                    <button mat-button color="primary" (click)="runTask(task)" [disabled]="task.status === 'running'">
                      <mat-icon>play_arrow</mat-icon>
                      Run Now
                    </button>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            </div>
          } @else {
            <div class="text-center py-8 text-gray-500">
              <mat-icon class="text-6xl mb-2">schedule</mat-icon>
              <p>No scheduled tasks found.</p>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class TaskListComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private superAdminService = inject(SuperAdminService);

  loading = signal(false);
  tasks = signal<ScheduledTask[]>([]);
  displayedColumns = ['name', 'schedule', 'lastRun', 'status', 'nextRun', 'enabled', 'actions'];

  async ngOnInit(): Promise<void> {
    await this.loadTasks();
  }

  async loadTasks(): Promise<void> {
    this.loading.set(true);
    try {
      const serviceTasks = await firstValueFrom(this.superAdminService.getScheduledTasks());
      // Map from service type to component interface
      const tasks: ScheduledTask[] = serviceTasks.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description || '',
        schedule: t.cron_expression,
        last_run: t.last_run_at || null,
        next_run: t.next_run_at || new Date().toISOString(),
        status: (t.last_run_status as 'success' | 'failed' | 'running') || 'success',
        enabled: t.is_enabled,
        error_message: t.last_error
      }));
      this.tasks.set(tasks);
    } catch (error) {
      console.error('Error loading scheduled tasks:', error);
    } finally {
      this.loading.set(false);
    }
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      success: 'bg-green-100 text-green-800',
      failed: 'bg-red-100 text-red-800',
      running: 'bg-blue-100 text-blue-800'
    };
    return classes[status] || '';
  }

  async toggleTask(task: ScheduledTask): Promise<void> {
    try {
      await firstValueFrom(this.superAdminService.toggleTask(task.name, !task.enabled));
      this.snackBar.open(`Task ${task.enabled ? 'disabled' : 'enabled'}`, 'Close', { duration: 2000 });
      await this.loadTasks();
    } catch (error) {
      console.error('Error toggling task:', error);
      this.snackBar.open('Failed to toggle task', 'Close', { duration: 3000 });
    }
  }

  runTask(task: ScheduledTask): void {
    const dialogData: ConfirmDialogData = {
      title: 'Run Task',
      message: `Run "${task.name}" immediately?`,
      confirmText: 'Run Now',
      cancelText: 'Cancel',
      confirmColor: 'primary',
      icon: 'play_arrow',
      iconColor: '#ff5900',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (!confirmed) return;

      try {
        await firstValueFrom(this.superAdminService.runTaskNow(task.name));
        this.snackBar.open('Task started', 'Close', { duration: 2000 });
        await this.loadTasks();
      } catch (error) {
        console.error('Error running task:', error);
        this.snackBar.open('Failed to run task', 'Close', { duration: 3000 });
      }
    });
  }
}
