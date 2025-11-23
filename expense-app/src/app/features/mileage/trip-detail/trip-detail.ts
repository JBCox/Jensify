import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MileageService } from '../../../core/services/mileage.service';
import { MileageTrip, MileageStatus, TripCoordinate } from '../../../core/models/mileage.model';
import { StatusBadge, ExpenseStatus as BadgeStatus } from '../../../shared/components/status-badge/status-badge';
import { TripMap, TripMapData } from '../../../shared/components/trip-map/trip-map';

/**
 * Trip Detail Component
 * Displays detailed information about a single mileage trip
 */
@Component({
  selector: 'app-trip-detail',
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    StatusBadge,
    TripMap
  ],
  templateUrl: './trip-detail.html',
  styleUrl: './trip-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mileageService = inject(MileageService);
  private snackBar = inject(MatSnackBar);

  private destroy$ = new Subject<void>();

  // State signals
  trip = signal<MileageTrip | null>(null);
  coordinates = signal<TripCoordinate[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);
  deleting = signal<boolean>(false);

  // Map data (computed from trip)
  mapData = computed((): TripMapData | undefined => {
    const tripValue = this.trip();
    if (!tripValue || !tripValue.origin_lat || !tripValue.origin_lng || !tripValue.destination_lat || !tripValue.destination_lng) {
      return undefined;
    }
    return {
      origin: {
        lat: tripValue.origin_lat,
        lng: tripValue.origin_lng,
        address: tripValue.origin_address
      },
      destination: {
        lat: tripValue.destination_lat,
        lng: tripValue.destination_lng,
        address: tripValue.destination_address
      },
      coordinates: this.coordinates() // Include GPS coordinates if available
    };
  });

  ngOnInit(): void {
    const tripId = this.route.snapshot.paramMap.get('id');
    if (tripId) {
      this.loadTrip(tripId);
    } else {
      this.error.set('No trip ID provided');
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load trip details
   */
  loadTrip(id: string): void {
    this.loading.set(true);
    this.error.set(null);

    this.mileageService.getTripById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trip) => {
          this.trip.set(trip);

          // If trip was GPS tracked, load coordinates
          if (trip.tracking_method === 'gps_tracked') {
            this.loadTripCoordinates(id);
          } else {
            this.loading.set(false);
          }
        },
        error: (err: Error) => {
          this.error.set(err.message || 'Failed to load trip');
          this.loading.set(false);
        }
      });
  }

  /**
   * Load GPS coordinates for a trip
   */
  private loadTripCoordinates(tripId: string): void {
    this.mileageService.getTripCoordinates(tripId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (coords) => {
          this.coordinates.set(coords);
          this.loading.set(false);
        },
        error: (err: Error) => {
          console.error('Failed to load GPS coordinates:', err);
          // Still show trip even if coordinates fail to load
          this.loading.set(false);
        }
      });
  }

  /**
   * Navigate back to trip list
   */
  goBack(): void {
    this.router.navigate(['/mileage']);
  }

  /**
   * Navigate to edit trip
   */
  goToEdit(): void {
    const trip = this.trip();
    if (trip) {
      this.router.navigate(['/mileage', trip.id, 'edit']);
    }
  }

  /**
   * Delete trip
   */
  deleteTrip(): void {
    const trip = this.trip();
    if (!trip) return;

    const confirmMessage = `Delete trip from ${trip.origin_address} to ${trip.destination_address}?`;
    if (!confirm(confirmMessage)) {
      return;
    }

    this.deleting.set(true);

    this.mileageService.deleteTrip(trip.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.snackBar.open('Trip deleted successfully.', 'Close', { duration: 3000 });
          this.router.navigate(['/mileage']);
        },
        error: (err) => {
          this.deleting.set(false);
          this.snackBar.open(err?.message || 'Failed to delete trip.', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Format currency
   */
  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  /**
   * Format date
   */
  formatDate(dateString: string | undefined): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Format date and time
   */
  formatDateTime(dateString: string | undefined): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * Map trip status to badge status
   */
  getStatusBadge(status: MileageStatus): BadgeStatus {
    const statusMap: Record<MileageStatus, BadgeStatus> = {
      'draft': 'draft',
      'submitted': 'pending',
      'approved': 'approved',
      'rejected': 'rejected',
      'reimbursed': 'reimbursed'
    };
    return statusMap[status];
  }

  /**
   * Get category label
   */
  getCategoryLabel(category: string): string {
    const labels: Record<string, string> = {
      'business': 'Business',
      'medical': 'Medical',
      'charity': 'Charity',
      'moving': 'Moving'
    };
    return labels[category] || category;
  }

  /**
   * Check if trip can be edited
   */
  canEdit(): boolean {
    const trip = this.trip();
    return trip?.status === 'draft';
  }

  /**
   * Check if trip can be deleted
   */
  canDelete(): boolean {
    const trip = this.trip();
    return trip?.status === 'draft';
  }
}
