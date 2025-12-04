import { Component, OnInit, OnDestroy, signal, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { Subject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { MileageService } from '../../../core/services/mileage.service';
import { SanitizationService } from '../../../core/services/sanitization.service';
import { KeyboardShortcutsService } from '../../../core/services/keyboard-shortcuts.service';
import { MileageTrip, MileageStatus, MileageCategory } from '../../../core/models/mileage.model';
import { MatSnackBar } from '@angular/material/snack-bar';
import { StatusBadge, ExpenseStatus as BadgeStatus } from '../../../shared/components/status-badge/status-badge';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';
import { LoadingSkeleton } from '../../../shared/components/loading-skeleton/loading-skeleton';
import { PullToRefresh } from '../../../shared/components/pull-to-refresh/pull-to-refresh';
import { Router } from '@angular/router';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { TripFiltersComponent, TripFilterState } from '../trip-filters/trip-filters';
import { MileageStatsWidgetComponent } from '../../../shared/components/mileage-stats-widget/mileage-stats-widget';

/**
 * Trip List Component
 * Displays all mileage trips for the current user with filtering, search, and summary
 */
@Component({
  selector: 'app-trip-list',
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatCheckboxModule,
    MatTooltipModule,
    ScrollingModule,
    StatusBadge,
    EmptyState,
    LoadingSkeleton,
    TripFiltersComponent,
    PullToRefresh,
    MileageStatsWidgetComponent,
  ],
  templateUrl: './trip-list.html',
  styleUrl: './trip-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripList implements OnInit, OnDestroy {
  private mileageService = inject(MileageService);
  private sanitizationService = inject(SanitizationService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private keyboardShortcuts = inject(KeyboardShortcutsService);
  private dialog = inject(MatDialog);

  // Cleanup
  private destroy$ = new Subject<void>();

  // State signals
  trips = signal<MileageTrip[]>([]);
  loading = signal<boolean>(false);
  error = signal<string | null>(null);

  // Selection state for batch operations
  selectedTripIds = signal<Set<string>>(new Set());
  submittingBatch = signal<boolean>(false);

  // Filter signals
  selectedStatus = signal<MileageStatus | 'all'>('all');
  searchQuery = signal<string>('');
  selectedCategory = signal<MileageCategory | 'all'>('all');
  dateFrom = signal<Date | null>(null);
  dateTo = signal<Date | null>(null);

  // Computed filtered trips
  filteredTrips = computed(() => {
    let result = this.trips();

    // Filter by status
    const status = this.selectedStatus();
    if (status !== 'all') {
      result = result.filter(t => t.status === status);
    }

    // Filter by search query (addresses, purpose)
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      result = result.filter(t =>
        t.origin_address.toLowerCase().includes(query) ||
        t.destination_address.toLowerCase().includes(query) ||
        t.purpose?.toLowerCase().includes(query) ||
        t.notes?.toLowerCase().includes(query)
      );
    }

    // Filter by category
    const category = this.selectedCategory();
    if (category !== 'all') {
      result = result.filter(t => t.category === category);
    }

    // Filter by date range
    const from = this.dateFrom();
    if (from) {
      result = result.filter(t => new Date(t.trip_date) >= from);
    }

    const to = this.dateTo();
    if (to) {
      result = result.filter(t => new Date(t.trip_date) <= to);
    }

    return result;
  });

  // Computed summary metrics
  totalCount = computed(() => this.filteredTrips().length);
  totalMiles = computed(() =>
    this.filteredTrips().reduce((sum, t) => sum + t.total_miles, 0)
  );
  totalReimbursement = computed(() =>
    this.filteredTrips().reduce((sum, t) => sum + t.reimbursement_amount, 0)
  );

  // Computed selection metrics
  draftTrips = computed(() =>
    this.filteredTrips().filter(t => t.status === 'draft')
  );
  selectedCount = computed(() => this.selectedTripIds().size);
  allDraftsSelected = computed(() => {
    const drafts = this.draftTrips();
    if (drafts.length === 0) return false;
    return drafts.every(t => this.selectedTripIds().has(t.id));
  });

  // UI state
  showAdvancedFilters = false;

  // Computed active filter count
  activeFilterCount = computed(() => {
    let count = 0;
    if (this.selectedCategory() !== 'all') count++;
    if (this.dateFrom()) count++;
    if (this.dateTo()) count++;
    return count;
  });

  // Computed filter state for child component
  filterState = computed((): TripFilterState => ({
    status: this.selectedStatus(),
    searchQuery: this.searchQuery(),
    category: this.selectedCategory(),
    dateFrom: this.dateFrom(),
    dateTo: this.dateTo(),
  }));

  ngOnInit(): void {
    this.loadTrips();
    this.registerKeyboardShortcuts();
  }

  ngOnDestroy(): void {
    // Unregister shortcuts
    this.keyboardShortcuts.unregisterShortcut('trip-list-new');
    this.keyboardShortcuts.unregisterShortcut('trip-list-export');
    this.keyboardShortcuts.unregisterShortcut('trip-list-refresh');
    this.keyboardShortcuts.unregisterShortcut('trip-list-submit');

    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Register keyboard shortcuts for this component
   */
  private registerKeyboardShortcuts(): void {
    // N - Create new trip
    this.keyboardShortcuts.registerShortcut({
      id: 'trip-list-new',
      key: 'n',
      description: 'Create new mileage trip',
      callback: () => this.addNewTrip(),
      preventDefault: true
    });

    // E - Export to CSV
    this.keyboardShortcuts.registerShortcut({
      id: 'trip-list-export',
      key: 'e',
      description: 'Export trips to CSV',
      callback: () => this.exportToCSV(),
      preventDefault: true
    });

    // R - Refresh list
    this.keyboardShortcuts.registerShortcut({
      id: 'trip-list-refresh',
      key: 'r',
      description: 'Refresh trip list',
      callback: () => this.loadTrips(),
      preventDefault: true
    });

    // Ctrl+Enter - Submit selected trips
    this.keyboardShortcuts.registerShortcut({
      id: 'trip-list-submit',
      key: 'Enter',
      ctrl: true,
      description: 'Submit selected trips',
      callback: () => {
        if (this.selectedCount() > 0) {
          this.submitSelected();
        }
      },
      preventDefault: true
    });
  }

  /**
   * Load trips from service
   */
  loadTrips(): void {
    this.loading.set(true);
    this.error.set(null);

    this.mileageService.getMyTrips()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (trips) => {
          this.trips.set(trips);
          this.loading.set(false);
        },
        error: (err: Error) => {
          this.error.set(err.message || 'Failed to load trips');
          this.loading.set(false);
        }
      });
  }

  /**
   * Handle filter changes from child component
   */
  onFiltersChange(changes: Partial<TripFilterState>): void {
    if (changes.status !== undefined) this.selectedStatus.set(changes.status);
    if (changes.searchQuery !== undefined) this.searchQuery.set(changes.searchQuery);
    if (changes.category !== undefined) this.selectedCategory.set(changes.category);
    if (changes.dateFrom !== undefined) this.dateFrom.set(changes.dateFrom);
    if (changes.dateTo !== undefined) this.dateTo.set(changes.dateTo);
  }

  /**
   * Toggle advanced filters visibility
   */
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  /**
   * Clear all filters
   */
  clearFilters(): void {
    this.selectedStatus.set('all');
    this.searchQuery.set('');
    this.selectedCategory.set('all');
    this.dateFrom.set(null);
    this.dateTo.set(null);
    this.showAdvancedFilters = false;
  }

  /**
   * Export to CSV
   */
  exportToCSV(): void {
    const rows = this.filteredTrips();
    if (rows.length === 0) {
      this.snackBar.open('No trips to export.', 'Close', { duration: 3000 });
      return;
    }

    // Calculate summary statistics
    const totalMiles = rows.reduce((sum, trip) => sum + trip.total_miles, 0);
    const totalReimbursement = rows.reduce((sum, trip) => sum + trip.reimbursement_amount, 0);

    // Generate summary section
    const summaryRows = [
      ['Mileage Trip Export'],
      ['Generated:', new Date().toLocaleString()],
      ['Total Trips:', rows.length.toString()],
      ['Total Miles:', totalMiles.toFixed(2)],
      ['Total Reimbursement:', `$${totalReimbursement.toFixed(2)}`],
      this.filterState().dateFrom || this.filterState().dateTo
        ? ['Date Range:', `${this.filterState().dateFrom?.toISOString().split('T')[0] || 'Start'} to ${this.filterState().dateTo?.toISOString().split('T')[0] || 'End'}`]
        : null,
      [''], // Empty row separator
    ].filter(row => row !== null).map(row => row!.join(','));

    // Enhanced headers with more detail
    const headers = [
      'Trip ID',
      'Trip Date',
      'Origin',
      'Destination',
      'Purpose',
      'Category',
      'Distance (mi)',
      'Round Trip',
      'Total Miles',
      'IRS Rate',
      'Reimbursement',
      'Status',
      'Tracking Method',
      'GPS Distance',
      'Distance Modified',
      'Modification Reason',
      'Department',
      'Project Code',
      'Notes',
      'Created At',
      'Submitted At',
      'Approved At',
      'Reimbursed At'
    ];

    const csvRows = rows.map(trip => {
      return [
        trip.id,
        trip.trip_date,
        trip.origin_address,
        trip.destination_address,
        trip.purpose || '(No purpose)',
        trip.category,
        trip.distance_miles.toString(),
        trip.is_round_trip ? 'Yes' : 'No',
        trip.total_miles.toString(),
        `$${trip.irs_rate.toFixed(3)}`,
        `$${trip.reimbursement_amount.toFixed(2)}`,
        trip.status,
        trip.tracking_method || 'manual',
        trip.original_gps_distance ? trip.original_gps_distance.toFixed(2) : '',
        trip.distance_manually_modified ? 'Yes' : 'No',
        trip.distance_modification_reason || '',
        trip.department || '',
        trip.project_code || '',
        trip.notes || '',
        trip.created_at ? new Date(trip.created_at).toLocaleString() : '',
        trip.submitted_at ? new Date(trip.submitted_at).toLocaleString() : '',
        trip.approved_at ? new Date(trip.approved_at).toLocaleString() : '',
        trip.reimbursed_at ? new Date(trip.reimbursed_at).toLocaleString() : ''
      ].map(value => this.sanitizationService.sanitizeCsvValue(value ?? '')).join(',');
    });

    const csvContent = [...summaryRows, headers.join(','), ...csvRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    // Better filename with date range if applicable
    const dateRange = this.filterState().dateFrom && this.filterState().dateTo
      ? `${this.filterState().dateFrom?.toISOString().split('T')[0]}_to_${this.filterState().dateTo?.toISOString().split('T')[0]}`
      : new Date().toISOString().split('T')[0];
    const filename = `mileage-trips-${dateRange}.csv`;

    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    this.snackBar.open(
      `Exported ${rows.length} trip${rows.length > 1 ? 's' : ''} (${totalMiles.toFixed(1)} miles, ${this.formatCurrency(totalReimbursement)}) to CSV.`,
      'Close',
      { duration: 5000 }
    );
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
  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
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
   * Navigate to trip details
   */
  goToDetails(trip: MileageTrip): void {
    this.router.navigate(['/mileage', trip.id]);
  }

  /**
   * Navigate to edit trip
   */
  goToEdit(trip: MileageTrip): void {
    this.router.navigate(['/mileage', trip.id, 'edit']);
  }

  /**
   * Navigate to add new trip
   */
  addNewTrip(): void {
    this.router.navigate(['/mileage/new']);
  }

  /**
   * Delete trip
   */
  deleteTrip(trip: MileageTrip): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: {
        title: 'Delete Trip',
        message: `Delete trip from ${trip.origin_address} to ${trip.destination_address}? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmColor: 'warn',
        icon: 'delete',
        iconColor: '#f44336',
      } as ConfirmDialogData,
    });

    dialogRef.afterClosed().subscribe((confirmed) => {
      if (confirmed) {
        this.mileageService.deleteTrip(trip.id)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: () => {
              this.snackBar.open('Trip deleted successfully.', 'Close', { duration: 3000 });
              this.loadTrips();
            },
            error: (err) => {
              this.snackBar.open(err?.message || 'Failed to delete trip.', 'Close', { duration: 4000 });
            }
          });
      }
    });
  }

  /**
   * Check if trip is selected
   */
  isSelected(tripId: string): boolean {
    return this.selectedTripIds().has(tripId);
  }

  /**
   * Toggle trip selection
   */
  toggleSelection(trip: MileageTrip): void {
    const selected = new Set(this.selectedTripIds());
    if (selected.has(trip.id)) {
      selected.delete(trip.id);
    } else {
      // Only allow selecting draft trips
      if (trip.status === 'draft') {
        selected.add(trip.id);
      }
    }
    this.selectedTripIds.set(selected);
  }

  /**
   * Toggle select all draft trips
   */
  toggleSelectAll(): void {
    const drafts = this.draftTrips();
    if (this.allDraftsSelected()) {
      // Deselect all
      this.selectedTripIds.set(new Set());
    } else {
      // Select all drafts
      const selected = new Set(drafts.map(t => t.id));
      this.selectedTripIds.set(selected);
    }
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selectedTripIds.set(new Set());
  }

  /**
   * TrackBy function for virtual scrolling performance
   */
  trackByTripId(_index: number, trip: MileageTrip): string {
    return trip.id;
  }

  /**
   * Submit selected trips for approval (batch operation)
   */
  submitSelected(): void {
    const selectedIds = Array.from(this.selectedTripIds());
    if (selectedIds.length === 0) {
      this.snackBar.open('No trips selected.', 'Close', { duration: 3000 });
      return;
    }

    this.submittingBatch.set(true);

    // Create array of submit observables
    const submitObs = selectedIds.map(id => this.mileageService.submitTrip(id));

    // Execute all submits in parallel
    forkJoin(submitObs)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.submittingBatch.set(false);
          this.clearSelection();
          this.snackBar.open(
            `Successfully submitted ${selectedIds.length} trip${selectedIds.length > 1 ? 's' : ''} for approval.`,
            'Close',
            { duration: 4000 }
          );
          // Reload trips to reflect new status
          this.loadTrips();
        },
        error: (err) => {
          this.submittingBatch.set(false);
          this.snackBar.open(
            err?.message || 'Failed to submit trips. Please try again.',
            'Close',
            { duration: 4000 }
          );
        }
      });
  }

  /**
   * Convert trip to expense for reporting
   */
  convertToExpense(trip: MileageTrip): void {
    this.mileageService.convertTripToExpense(trip.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (expenseId) => {
          const snackRef = this.snackBar.open('Trip converted to expense', 'View Expense', {
            duration: 5000
          });
          snackRef.onAction().subscribe(() => {
            this.router.navigate(['/expenses', expenseId]);
          });
          // Reload trips to show linked expense indicator
          this.loadTrips();
        },
        error: (err: Error) => {
          this.snackBar.open(err.message || 'Failed to convert trip', 'Close', { duration: 5000 });
        }
      });
  }

  /**
   * Check if trip can be converted to expense (not already linked)
   */
  canConvertToExpense(trip: MileageTrip): boolean {
    return !trip.expense_id;
  }

  /**
   * Navigate to linked expense
   */
  viewLinkedExpense(trip: MileageTrip): void {
    if (trip.expense_id) {
      this.router.navigate(['/expenses', trip.expense_id]);
    }
  }
}
