import { Component, OnInit, OnDestroy, inject, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { PromptDialogComponent, PromptDialogData } from '../../../shared/components/prompt-dialog/prompt-dialog';
import { MileageService } from '../../../core/services/mileage.service';
import { MileageCategory, CreateMileageTripDto, UpdateMileageTripDto, TripCoordinate, TrackingMethod } from '../../../core/models/mileage.model';
import { GeolocationService, GeolocationPosition } from '../../../core/services/geolocation.service';
import { GoogleMapsService } from '../../../core/services/google-maps.service';
import { TripTrackingService } from '../../../core/services/trip-tracking.service';
import { TripGpsTrackingComponent, TrackingResult } from '../trip-gps-tracking/trip-gps-tracking';
import { OrganizationService } from '../../../core/services/organization.service';

/**
 * Trip Form Component
 * Form for creating and editing mileage trips with real-time reimbursement calculation
 */
@Component({
  selector: 'app-trip-form',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatTabsModule,
    MatDialogModule,
    TripGpsTrackingComponent,
  ],
  templateUrl: './trip-form.html',
  styleUrl: './trip-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripForm implements OnInit, OnDestroy {
  form!: FormGroup;
  loading = signal<boolean>(false);
  errorMessage = signal<string>('');
  successMessage = signal<string>('');

  // Calculation display
  currentRate = signal<number>(0);
  totalMiles = signal<number>(0);
  reimbursementAmount = signal<number>(0);

  // GPS features
  calculatingDistance = signal<boolean>(false);
  gpsAvailable = signal<boolean>(false);
  gpsTrackingEnabled = signal<boolean>(true);  // Admin setting for GPS tracking
  gpsTrackingMode = signal<TrackingMethod>('start_stop');  // Admin setting for tracking method
  currentLocation = signal<GeolocationPosition | null>(null);

  // Tracking mode
  trackingMode = signal<'quick' | 'gps'>('gps'); // gps = live tracking (default), quick = point-to-point
  isTracking = signal(false);
  trackedCoordinates: TripCoordinate[] = [];

  // GPS distance lock - when distance is auto-calculated via GPS, lock it from editing
  distanceFromGps = signal(false);
  originalGpsDistance: number | null = null; // Store original GPS distance for fraud tracking
  distanceModificationReason: string | null = null; // Reason for modifying GPS-calculated distance

  // Edit mode
  tripId: string | null = null;
  isEditMode = false;

  // Date constraints
  readonly maxDate = new Date(); // Can't log future trips

  // Category options
  readonly categories: MileageCategory[] = ['business', 'medical', 'charity', 'moving'];

  // Subject for subscription cleanup
  private destroy$ = new Subject<void>();

  private fb = inject(FormBuilder);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private mileageService = inject(MileageService);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private geolocation = inject(GeolocationService);
  private googleMaps = inject(GoogleMapsService);
  private trackingService = inject(TripTrackingService);
  private organizationService = inject(OrganizationService);

  ngOnInit(): void {
    // Initialize form
    this.form = this.fb.group({
      trip_date: [new Date().toISOString().slice(0, 10), [Validators.required]],
      origin_address: ['', [Validators.required, Validators.minLength(3)]],
      destination_address: ['', [Validators.required, Validators.minLength(3)]],
      distance_miles: [null, [Validators.required, Validators.min(0.1)]],
      is_round_trip: [false],
      purpose: [''],  // Optional for quick logging - required before submitting to expense report
      category: ['business' as MileageCategory, [Validators.required]],
      department: [''],
      project_code: [''],
      notes: ['']
    });

    // Check if editing existing trip
    this.tripId = this.route.snapshot.paramMap.get('id');
    if (this.tripId) {
      this.isEditMode = true;
      this.loadTrip(this.tripId);
    } else {
      // For new trip, fetch current rate immediately
      this.updateCalculation();
    }

    // Check GPS availability
    this.gpsAvailable.set(this.geolocation.isAvailable());

    // Check if GPS tracking is enabled by admin
    this.loadGpsTrackingSetting();

    // Watch for changes to recalculate reimbursement
    this.form.valueChanges
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.updateCalculation();
      });

    // Watch for manual distance modifications (fraud prevention)
    this.form.get('distance_miles')?.valueChanges
      .pipe(
        debounceTime(500),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe((newDistance: number) => {
        this.checkDistanceModification(newDistance);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Load existing trip for editing
   */
  private loadTrip(id: string): void {
    this.loading.set(true);

    this.mileageService.getTripById(id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trip) => {
          this.form.patchValue({
            trip_date: trip.trip_date,
            origin_address: trip.origin_address,
            destination_address: trip.destination_address,
            distance_miles: trip.distance_miles,
            is_round_trip: trip.is_round_trip,
            purpose: trip.purpose,
            category: trip.category,
            department: trip.department || '',
            project_code: trip.project_code || '',
            notes: trip.notes || ''
          });
          this.loading.set(false);
          this.updateCalculation();
        },
        error: (err) => {
          this.errorMessage.set(err?.message || 'Failed to load trip');
          this.loading.set(false);
          this.snackBar.open('Failed to load trip', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Update reimbursement calculation in real-time
   */
  private updateCalculation(): void {
    const values = this.form.value;
    const distance = parseFloat(values.distance_miles);
    const isRoundTrip = values.is_round_trip;
    const category = values.category;
    const tripDate = values.trip_date;

    // Only calculate if we have valid distance
    if (!distance || distance <= 0) {
      this.totalMiles.set(0);
      this.reimbursementAmount.set(0);
      this.currentRate.set(0);
      return;
    }

    // Calculate total miles
    const totalMiles = isRoundTrip ? distance * 2 : distance;
    this.totalMiles.set(totalMiles);

    // Fetch IRS rate and calculate reimbursement
    this.mileageService.calculateReimbursement(distance, isRoundTrip, category, tripDate)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (calc) => {
          this.currentRate.set(calc.rate);
          this.reimbursementAmount.set(calc.reimbursementAmount);
        },
        error: () => {
          // If rate fetch fails, just clear the calculation
          this.currentRate.set(0);
          this.reimbursementAmount.set(0);
        }
      });
  }

  /**
   * Submit form (create or update)
   */
  onSubmit(): void {
    this.errorMessage.set('');
    this.successMessage.set('');

    // Mark all fields as touched to show validation errors
    if (this.form.invalid) {
      Object.values(this.form.controls).forEach(c => c.markAsTouched());
      this.snackBar.open('Please fix validation errors', 'Close', { duration: 3000 });
      return;
    }

    this.loading.set(true);

    if (this.isEditMode && this.tripId) {
      this.updateTrip();
    } else {
      this.createTrip();
    }
  }

  /**
   * Create new trip
   */
  private createTrip(): void {
    const trackingMethod = this.distanceFromGps() ? 'start_stop' :
                           (this.trackedCoordinates.length > 0 ? 'full_gps' : 'manual');

    const dto: CreateMileageTripDto = {
      ...this.form.value,
      // Add tracking method
      tracking_method: trackingMethod,
      // Include original GPS distance for fraud tracking (only for GPS-based trips)
      original_gps_distance: this.originalGpsDistance ?? undefined,
      // Include modification reason if distance was changed from GPS value
      distance_modification_reason: this.distanceModificationReason ?? undefined,
      // Remove empty optional fields
      department: this.form.value.department || undefined,
      project_code: this.form.value.project_code || undefined,
      notes: this.form.value.notes || undefined
    };

    this.mileageService.createTrip(dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trip) => {
          // Save GPS coordinates if we have them
          if (this.trackedCoordinates.length > 0 && trip.id) {
            this.trackingService.saveCoordinatesToDatabase(trip.id, this.trackedCoordinates)
              .then(() => {
                this.successMessage.set('Trip created successfully with GPS tracking data.');
                this.snackBar.open('Trip created successfully', 'Close', { duration: 3000 });
                setTimeout(() => this.router.navigate(['/mileage']), 800);
                this.loading.set(false);
              })
              .catch(() => {
                this.snackBar.open('Trip created but failed to save GPS data', 'Close', { duration: 4000 });
                setTimeout(() => this.router.navigate(['/mileage']), 800);
                this.loading.set(false);
              });
          } else {
            this.successMessage.set('Trip created successfully.');
            this.snackBar.open('Trip created successfully', 'Close', { duration: 3000 });
            setTimeout(() => this.router.navigate(['/mileage']), 800);
            this.loading.set(false);
          }
        },
        error: (err) => {
          this.errorMessage.set(err?.message || 'Failed to create trip');
          this.snackBar.open(err?.message || 'Failed to create trip', 'Close', { duration: 4000 });
          this.loading.set(false);
        }
      });
  }

  /**
   * Update existing trip
   */
  private updateTrip(): void {
    const dto: UpdateMileageTripDto = {
      ...this.form.value,
      // Remove empty optional fields
      department: this.form.value.department || undefined,
      project_code: this.form.value.project_code || undefined,
      notes: this.form.value.notes || undefined
    };

    this.mileageService.updateTrip(this.tripId!, dto)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.successMessage.set('Trip updated successfully.');
          this.snackBar.open('Trip updated successfully', 'Close', { duration: 3000 });
          setTimeout(() => this.router.navigate(['/mileage']), 800);
          this.loading.set(false);
        },
        error: (err) => {
          this.errorMessage.set(err?.message || 'Failed to update trip');
          this.snackBar.open(err?.message || 'Failed to update trip', 'Close', { duration: 4000 });
          this.loading.set(false);
        }
      });
  }

  /**
   * Cancel and return to list
   */
  cancel(): void {
    this.router.navigate(['/mileage']);
  }

  /**
   * Check if form field has error
   */
  hasError(field: string, error: string): boolean {
    const control = this.form.get(field);
    return !!(control && control.hasError(error) && control.touched);
  }

  /**
   * Get form field error message
   */
  getErrorMessage(field: string): string {
    const control = this.form.get(field);
    if (!control || !control.touched) return '';

    if (control.hasError('required')) return 'This field is required';
    if (control.hasError('minlength')) {
      const min = control.getError('minlength').requiredLength;
      return `Minimum ${min} characters required`;
    }
    if (control.hasError('min')) {
      const min = control.getError('min').min;
      return `Value must be at least ${min}`;
    }

    return '';
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
   * Capture current GPS location for origin
   */
  captureOriginGPS(): void {
    this.geolocation.getCurrentPosition()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (position) => {
          this.currentLocation.set(position);

          // Reverse geocode to get address
          this.googleMaps.reverseGeocode(position.latitude, position.longitude)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (address) => {
                this.form.patchValue({
                  origin_address: address
                });
                this.snackBar.open('Origin location captured', 'Close', { duration: 2000 });
              },
              error: () => {
                this.snackBar.open('Failed to get address', 'Close', { duration: 3000 });
              }
            });
        },
        error: (error) => {
          this.snackBar.open(error.message, 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Capture current GPS location for destination
   */
  captureDestinationGPS(): void {
    this.geolocation.getCurrentPosition()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (position) => {
          // Reverse geocode to get address
          this.googleMaps.reverseGeocode(position.latitude, position.longitude)
            .pipe(takeUntil(this.destroy$))
            .subscribe({
              next: (address) => {
                this.form.patchValue({
                  destination_address: address
                });
                this.snackBar.open('Destination location captured', 'Close', { duration: 2000 });
              },
              error: () => {
                this.snackBar.open('Failed to get address', 'Close', { duration: 3000 });
              }
            });
        },
        error: (error) => {
          this.snackBar.open(error.message, 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Auto-calculate distance using Google Maps
   */
  autoCalculateDistance(): void {
    const origin = this.form.get('origin_address')?.value;
    const destination = this.form.get('destination_address')?.value;

    if (!origin || !destination) {
      this.snackBar.open('Please enter both addresses', 'Close', { duration: 3000 });
      return;
    }

    this.calculatingDistance.set(true);

    this.googleMaps.calculateRoute(origin, destination)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.form.patchValue({
            distance_miles: Math.round(result.distance * 100) / 100 // Round to 2 decimals
          });
          this.calculatingDistance.set(false);
          this.snackBar.open(
            `Distance: ${result.distance.toFixed(2)} miles (~${Math.round(result.duration)} min drive)`,
            'Close',
            { duration: 4000 }
          );
        },
        error: (err) => {
          this.calculatingDistance.set(false);
          this.snackBar.open(err.message || 'Failed to calculate distance', 'Close', { duration: 4000 });
        }
      });
  }

  /**
   * Handle GPS tracking completion from child component
   */
  onTrackingComplete(result: TrackingResult): void {
    this.isTracking.set(false);
    this.trackedCoordinates = result.coordinates;

    const gpsDistance = Math.round(result.distance * 100) / 100;

    // If distance is 0 (API failed), leave field editable for user to fill in manually
    // If distance > 0 (API succeeded), lock it and store original for fraud tracking
    if (gpsDistance > 0) {
      this.form.patchValue({ distance_miles: gpsDistance });
      this.distanceFromGps.set(true);
      this.originalGpsDistance = gpsDistance;
      this.snackBar.open(`GPS tracking complete: ${gpsDistance} miles`, 'Close', { duration: 3000 });
    } else {
      // Distance API failed - provide helpful guidance
      this.form.patchValue({ distance_miles: null });
      this.distanceFromGps.set(false);
      this.originalGpsDistance = null;

      // Show detailed error message with actionable guidance
      this.snackBar.open(
        'GPS coordinates captured, but distance calculation failed. Please enter the actual driving distance manually (check your odometer or use a mapping app).',
        'Got it',
        { duration: 8000 }
      );

      // Focus the distance field to guide user
      setTimeout(() => {
        const distanceField = document.querySelector('input[formControlName="distance_miles"]') as HTMLInputElement;
        distanceField?.focus();
      }, 500);
    }

    // Handle Start/Stop mode - addresses are already provided
    if (result.originAddress && result.destinationAddress) {
      this.form.patchValue({
        origin_address: result.originAddress,
        destination_address: result.destinationAddress
      });
      return;
    }

    // Handle Full GPS mode - need to reverse geocode coordinates
    if (result.coordinates.length > 0) {
      const firstCoord = result.coordinates[0];
      const lastCoord = result.coordinates[result.coordinates.length - 1];

      // Reverse geocode start and end locations
      this.googleMaps.reverseGeocode(firstCoord.latitude, firstCoord.longitude)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (originAddress) => {
            this.form.patchValue({ origin_address: originAddress });

            // Get destination address
            this.googleMaps.reverseGeocode(lastCoord.latitude, lastCoord.longitude)
              .pipe(takeUntil(this.destroy$))
              .subscribe({
                next: (destAddress) => this.form.patchValue({ destination_address: destAddress })
              });
          }
        });
    }
  }

  /**
   * Handle tracking started from child component
   */
  onTrackingStarted(): void {
    this.isTracking.set(true);
    this.trackingMode.set('gps');
  }

  /**
   * Handle tracking cancelled from child component
   */
  onTrackingCancelled(): void {
    this.isTracking.set(false);
    this.trackedCoordinates = [];
    this.distanceFromGps.set(false);
    this.originalGpsDistance = null;
  }

  /**
   * Check if distance was manually modified from GPS-calculated value
   * Show dialog asking for reason (fraud prevention)
   */
  private checkDistanceModification(newDistance: number): void {
    // Only check if:
    // 1. Distance was originally from GPS
    // 2. User manually changed it
    // 3. Change is significant (> 0.5 miles)
    // 4. We haven't already captured a reason
    if (
      this.originalGpsDistance &&
      this.distanceFromGps() &&
      Math.abs(newDistance - this.originalGpsDistance) > 0.5 &&
      !this.distanceModificationReason
    ) {
      // Unlock the field for editing
      this.distanceFromGps.set(false);

      // Show dialog to capture reason
      const dialogRef = this.dialog.open(PromptDialogComponent, {
        data: {
          title: 'Distance Modified',
          message: `GPS calculated ${this.originalGpsDistance.toFixed(1)} miles, but you changed it to ${newDistance.toFixed(1)} miles. Please provide a reason for this modification:`,
          placeholder: 'e.g., Odometer reading was different, took a detour, GPS route was incorrect',
          required: true,
          confirmText: 'Save Reason',
          confirmColor: 'primary',
          icon: 'warning',
          iconColor: '#ff9800'
        } as PromptDialogData,
        disableClose: true, // Force user to provide reason
        minWidth: '400px'
      });

      dialogRef.afterClosed().subscribe((reason: string | null) => {
        if (reason) {
          this.distanceModificationReason = reason;
          this.snackBar.open('Modification reason recorded', 'Close', { duration: 3000 });
        } else {
          // User cancelled - restore original distance
          this.form.patchValue({ distance_miles: this.originalGpsDistance }, { emitEvent: false });
          this.distanceFromGps.set(true);
          this.snackBar.open('Distance restored to GPS value', 'Close', { duration: 3000 });
        }
      });
    }
  }

  /**
   * Load GPS tracking setting from organization
   */
  private loadGpsTrackingSetting(): void {
    this.organizationService.currentOrganization$
      .pipe(takeUntil(this.destroy$))
      .subscribe((org) => {
        if (org?.settings?.mileage_settings) {
          // Default to true if not set
          const mode = org.settings.mileage_settings.gps_tracking_mode || 'start_stop';
          const enabled = mode !== 'disabled';
          this.gpsTrackingEnabled.set(enabled);
          this.gpsTrackingMode.set(mode as TrackingMethod);
        }
      });
  }

  /**
   * Check if form can auto-calculate distance
   */
  canAutoCalculate(): boolean {
    const origin = this.form.get('origin_address')?.value;
    const destination = this.form.get('destination_address')?.value;
    return !!(origin && destination && origin.length >= 3 && destination.length >= 3);
  }

  /**
   * Switch between tracking modes
   */
  onTrackingModeChange(index: number): void {
    if (this.isTracking()) {
      this.snackBar.open('Stop tracking before switching modes', 'Close', { duration: 3000 });
      return;
    }
    this.trackingMode.set(index === 0 ? 'quick' : 'gps');
  }
}
