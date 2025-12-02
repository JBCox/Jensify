import { Component, EventEmitter, Input, OnDestroy, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { Subject, interval, takeUntil } from 'rxjs';
import { TripTrackingService } from '../../../core/services/trip-tracking.service';
import { TripCoordinate } from '../../../core/models/mileage.model';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

export interface TrackingResult {
  coordinates: TripCoordinate[];
  distance: number;
  duration: number;
}

@Component({
  selector: 'app-trip-gps-tracking',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatSnackBarModule],
  template: `
    <div class="jensify-tab-content">
      <p class="jensify-text-muted">Live GPS tracking for accurate mileage calculation</p>

      <!-- GPS Tracking Interface -->
      @if (!isTracking()) {
        <div class="jensify-tracking-start">
          <button
            mat-raised-button
            color="primary"
            type="button"
            (click)="startTracking()"
            [disabled]="!gpsAvailable"
            class="jensify-button-lg">
            <mat-icon>play_arrow</mat-icon>
            Start Tracking
          </button>
          @if (!gpsAvailable) {
            <p class="jensify-message-warning">GPS not available on this device</p>
          }
        </div>
      } @else {
        <div class="jensify-tracking-active">
          <div class="jensify-tracking-header">
            <mat-icon color="accent">gps_fixed</mat-icon>
            <h3>Tracking in Progress...</h3>
          </div>
          <div class="jensify-tracking-stats">
            <div class="jensify-stat">
              <mat-icon>straighten</mat-icon>
              <div class="jensify-stat-content">
                <span class="jensify-stat-label">Distance</span>
                <span class="jensify-stat-value">{{ trackingDistance().toFixed(2) }} mi</span>
              </div>
            </div>
            <div class="jensify-stat">
              <mat-icon>timer</mat-icon>
              <div class="jensify-stat-content">
                <span class="jensify-stat-label">Duration</span>
                <span class="jensify-stat-value">{{ formatDuration(trackingDuration()) }}</span>
              </div>
            </div>
          </div>
          <div class="jensify-tracking-actions">
            <button
              mat-raised-button
              color="primary"
              type="button"
              (click)="stopTracking()"
              class="jensify-button">
              <mat-icon>stop</mat-icon>
              Stop Tracking
            </button>
            <button
              mat-stroked-button
              type="button"
              (click)="cancelTracking()"
              class="jensify-button">
              <mat-icon>close</mat-icon>
              Cancel
            </button>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .jensify-tab-content {
      padding: 16px 0;
    }

    .jensify-text-muted {
      color: var(--jensify-text-muted, #666);
      margin-bottom: 16px;
    }

    .jensify-tracking-start {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px;
    }

    .jensify-button-lg {
      padding: 12px 32px;
      font-size: 1rem;
    }

    .jensify-message-warning {
      color: #f57c00;
      font-size: 0.875rem;
    }

    .jensify-tracking-active {
      background: var(--jensify-primary-soft, color-mix(in srgb, var(--jensify-primary) 8%, transparent));
      border-radius: 8px;
      padding: 20px;
    }

    .jensify-tracking-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 16px;

      h3 {
        margin: 0;
        font-size: 1.1rem;
        font-weight: 600;
      }

      mat-icon {
        animation: pulse 1.5s infinite;
      }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .jensify-tracking-stats {
      display: flex;
      gap: 24px;
      margin-bottom: 20px;
    }

    .jensify-stat {
      display: flex;
      align-items: center;
      gap: 8px;

      mat-icon {
        color: var(--jensify-primary, #ff5900);
      }
    }

    .jensify-stat-content {
      display: flex;
      flex-direction: column;
    }

    .jensify-stat-label {
      font-size: 0.75rem;
      color: var(--jensify-text-muted, #666);
      text-transform: uppercase;
    }

    .jensify-stat-value {
      font-size: 1.25rem;
      font-weight: 600;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .jensify-tracking-actions {
      display: flex;
      gap: 12px;
    }
  `],
})
export class TripGpsTrackingComponent implements OnDestroy {
  @Input() gpsAvailable = false;
  @Output() trackingComplete = new EventEmitter<TrackingResult>();
  @Output() trackingStarted = new EventEmitter<void>();
  @Output() trackingCancelled = new EventEmitter<void>();

  isTracking = signal(false);
  trackingDistance = signal(0);
  trackingDuration = signal(0);

  private destroy$ = new Subject<void>();
  private trackingService = inject(TripTrackingService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  startTracking(): void {
    this.trackingService.startTracking().subscribe({
      next: () => {
        this.isTracking.set(true);
        this.trackingStarted.emit();
        this.snackBar.open('GPS tracking started', 'Close', { duration: 2000 });

        // Subscribe to tracking updates
        interval(1000)
          .pipe(takeUntil(this.destroy$))
          .subscribe(() => {
            if (this.trackingService.isTracking()) {
              this.trackingDistance.set(this.trackingService.distance());
              this.trackingDuration.set(this.trackingService.duration());
            }
          });
      },
      error: (err) => {
        this.snackBar.open(err.message, 'Close', { duration: 4000 });
      }
    });
  }

  stopTracking(): void {
    const trackingState = this.trackingService.stopTracking();
    this.isTracking.set(false);

    if (trackingState.coordinates.length > 0) {
      this.trackingComplete.emit({
        coordinates: trackingState.coordinates,
        distance: trackingState.distance,
        duration: trackingState.duration
      });
      this.snackBar.open(
        `Trip tracked: ${trackingState.distance.toFixed(2)} miles in ${this.formatDuration(trackingState.duration)}`,
        'Close',
        { duration: 5000 }
      );
    } else {
      this.snackBar.open('No GPS data recorded', 'Close', { duration: 3000 });
    }

    this.resetTrackingState();
  }

  cancelTracking(): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Cancel Tracking',
        message: 'Cancel tracking? All GPS data will be lost.',
        confirmText: 'Cancel Tracking',
        cancelText: 'Keep Tracking',
        confirmColor: 'warn',
        icon: 'warning',
        iconColor: '#ff9800',
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.trackingService.stopTracking();
        this.isTracking.set(false);
        this.resetTrackingState();
        this.trackingCancelled.emit();
        this.snackBar.open('Tracking cancelled', 'Close', { duration: 2000 });
      }
    });
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  }

  private resetTrackingState(): void {
    this.trackingDistance.set(0);
    this.trackingDuration.set(0);
  }
}
