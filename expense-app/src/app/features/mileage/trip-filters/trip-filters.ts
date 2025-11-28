import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatSelectModule } from "@angular/material/select";
import { MileageStatus, MileageCategory } from "../../../core/models/mileage.model";

export interface TripFilterState {
  status: MileageStatus | "all";
  searchQuery: string;
  category: MileageCategory | "all";
  dateFrom: Date | null;
  dateTo: Date | null;
}

@Component({
  selector: "app-trip-filters",
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatSelectModule],
  template: `
    <!-- Compact Filter Bar -->
    <div class="filter-bar">
      <!-- Status Chips -->
      <div class="status-chips">
        @for (option of statusOptions; track option.value) {
          <button
            class="status-chip"
            [class.active]="filters.status === option.value"
            (click)="onStatusChange(option.value)">
            {{ option.label }}
          </button>
        }
      </div>

      <!-- Search Input -->
      <div class="search-box">
        <mat-icon>search</mat-icon>
        <input
          type="text"
          placeholder="Search trips..."
          [ngModel]="filters.searchQuery"
          (ngModelChange)="onSearchChange($event)">
      </div>

      <!-- Filter Toggle -->
      <button
        class="filter-toggle"
        [class.active]="showAdvanced"
        (click)="toggleAdvanced.emit()">
        <mat-icon>tune</mat-icon>
        <span>Filters</span>
        @if (activeFilterCount > 0) {
          <span class="filter-badge">{{ activeFilterCount }}</span>
        }
      </button>
    </div>

    <!-- Advanced Filters (Collapsible) -->
    @if (showAdvanced) {
      <div class="advanced-filters">
        <div class="filter-group">
          <label for="category-filter">Category</label>
          <mat-select id="category-filter" [value]="filters.category" (selectionChange)="onCategoryChange($event.value)">
            @for (option of categoryOptions; track option.value) {
              <mat-option [value]="option.value">{{ option.label }}</mat-option>
            }
          </mat-select>
        </div>

        <div class="filter-group">
          <label for="date-from-filter">From</label>
          <input
            id="date-from-filter"
            type="date"
            [ngModel]="filters.dateFrom | date:'yyyy-MM-dd'"
            (ngModelChange)="onDateFromChange($event)">
        </div>

        <div class="filter-group">
          <label for="date-to-filter">To</label>
          <input
            id="date-to-filter"
            type="date"
            [ngModel]="filters.dateTo | date:'yyyy-MM-dd'"
            (ngModelChange)="onDateToChange($event)">
        </div>

        <button class="clear-btn" (click)="clearFilters.emit()">
          <mat-icon>clear</mat-icon>
          Clear
        </button>
      </div>
    }
  `,
  styles: [`
    .filter-bar {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
      padding: var(--jensify-spacing-sm, 0.5rem) var(--jensify-spacing-md, 1rem);
      background: var(--jensify-surface-card, #fff);
      border: 1px solid var(--jensify-border-subtle, #e5e5e5);
      border-radius: var(--jensify-radius-lg, 8px);
      margin-bottom: var(--jensify-spacing-md, 1rem);
      flex-wrap: wrap;

      :host-context(.dark) & {
        background: linear-gradient(145deg, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0.01) 100%);
        border-color: rgba(247, 88, 12, 0.15);
      }
    }

    .status-chips {
      display: flex;
      gap: var(--jensify-spacing-xs, 0.25rem);
      flex-wrap: wrap;

      .status-chip {
        padding: 6px 12px;
        border: 1px solid var(--jensify-border-medium, #ddd);
        border-radius: var(--jensify-radius-full, 9999px);
        background: transparent;
        color: var(--jensify-text-medium, #444);
        font-size: 0.8125rem;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;

        &:hover { border-color: var(--jensify-primary, #ff5900); color: var(--jensify-primary, #ff5900); }
        &.active { background: var(--jensify-primary, #ff5900); border-color: var(--jensify-primary, #ff5900); color: white; }
      }
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-xs, 0.25rem);
      flex: 1;
      min-width: 200px;
      max-width: 300px;
      padding: 6px 12px;
      background: var(--jensify-surface-soft, #f5f5f5);
      border-radius: var(--jensify-radius-md, 6px);
      border: 1px solid transparent;
      transition: all 0.15s ease;

      &:focus-within { border-color: var(--jensify-primary, #ff5900); background: var(--jensify-surface-card, #fff); }
      mat-icon { color: var(--jensify-text-muted, #666); font-size: 18px; width: 18px; height: 18px; }
      input {
        flex: 1; border: none; background: transparent; outline: none;
        font-size: 0.875rem; color: var(--jensify-text-strong, #1a1a1a);
        &::placeholder { color: var(--jensify-text-muted, #999); }
      }
    }

    .filter-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border: 1px solid var(--jensify-border-medium, #ddd);
      border-radius: var(--jensify-radius-md, 6px);
      background: transparent;
      color: var(--jensify-text-medium, #444);
      font-size: 0.8125rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;

      mat-icon { font-size: 18px; width: 18px; height: 18px; }
      .filter-badge {
        display: flex; align-items: center; justify-content: center;
        min-width: 18px; height: 18px; padding: 0 5px;
        background: var(--jensify-primary, #ff5900); color: white;
        font-size: 0.6875rem; font-weight: 700; border-radius: 9px;
      }
      &:hover, &.active { border-color: var(--jensify-primary, #ff5900); color: var(--jensify-primary, #ff5900); }
    }

    .advanced-filters {
      display: flex;
      align-items: flex-end;
      gap: var(--jensify-spacing-md, 1rem);
      padding: var(--jensify-spacing-md, 1rem);
      background: var(--jensify-surface-soft, #fafafa);
      border: 1px solid var(--jensify-border-subtle, #e5e5e5);
      border-radius: var(--jensify-radius-lg, 8px);
      margin-bottom: var(--jensify-spacing-md, 1rem);
      flex-wrap: wrap;

      .filter-group {
        display: flex; flex-direction: column; gap: 4px; min-width: 120px;

        label {
          font-size: 0.75rem; font-weight: 600; color: var(--jensify-text-muted, #666);
          text-transform: uppercase; letter-spacing: 0.03em;
        }

        mat-select, input {
          padding: 8px 12px;
          border: 1px solid var(--jensify-border-medium, #ddd);
          border-radius: var(--jensify-radius-md, 6px);
          background: var(--jensify-surface-card, #fff);
          color: var(--jensify-text-strong, #1a1a1a);
          font-size: 0.875rem;
          outline: none;
          &:focus { border-color: var(--jensify-primary, #ff5900); }
        }
        input[type="date"] { width: 140px; }
      }

      .clear-btn {
        display: flex; align-items: center; gap: 4px; padding: 8px 12px;
        border: none; background: transparent; color: var(--jensify-text-muted, #666);
        font-size: 0.875rem; cursor: pointer; transition: color 0.15s ease;
        mat-icon { font-size: 18px; width: 18px; height: 18px; }
        &:hover { color: var(--jensify-danger, #dc2626); }
      }
    }

    @media (max-width: 767px) {
      .filter-bar {
        flex-direction: column; align-items: stretch;
        .status-chips { order: 1; }
        .search-box { order: 2; max-width: none; }
        .filter-toggle { order: 3; justify-content: center; }
      }
      .advanced-filters {
        flex-direction: column;
        .filter-group { width: 100%; input { width: 100%; } }
      }
    }
  `],
})
export class TripFiltersComponent {
  @Input() filters!: TripFilterState;
  @Input() showAdvanced = false;
  @Input() activeFilterCount = 0;

  @Output() filtersChange = new EventEmitter<Partial<TripFilterState>>();
  @Output() toggleAdvanced = new EventEmitter<void>();
  @Output() clearFilters = new EventEmitter<void>();

  statusOptions: { value: MileageStatus | "all"; label: string }[] = [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "submitted", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "reimbursed", label: "Reimbursed" },
  ];

  categoryOptions: { value: MileageCategory | "all"; label: string }[] = [
    { value: "all", label: "All Categories" },
    { value: "business", label: "Business" },
    { value: "medical", label: "Medical" },
    { value: "charity", label: "Charity" },
    { value: "moving", label: "Moving" },
  ];

  onStatusChange(status: MileageStatus | "all"): void {
    this.filtersChange.emit({ status });
  }

  onSearchChange(searchQuery: string): void {
    this.filtersChange.emit({ searchQuery });
  }

  onCategoryChange(category: MileageCategory | "all"): void {
    this.filtersChange.emit({ category });
  }

  onDateFromChange(dateString: string): void {
    this.filtersChange.emit({ dateFrom: dateString ? new Date(dateString) : null });
  }

  onDateToChange(dateString: string): void {
    this.filtersChange.emit({ dateTo: dateString ? new Date(dateString) : null });
  }
}
