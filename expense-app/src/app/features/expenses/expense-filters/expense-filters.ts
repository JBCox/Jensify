import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatSelectModule } from "@angular/material/select";
import { ExpenseCategory, ExpenseStatus } from "../../../core/models/enums";

export interface ExpenseFilterState {
  status: ExpenseStatus | "all";
  searchQuery: string;
  category: string | "all";
  dateFrom: Date | null;
  dateTo: Date | null;
  minAmount: number | null;
  maxAmount: number | null;
}

@Component({
  selector: "app-expense-filters",
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
          placeholder="Search merchants..."
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

        <div class="filter-group">
          <label for="min-amount-filter">Min $</label>
          <input
            id="min-amount-filter"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            [ngModel]="filters.minAmount"
            (ngModelChange)="onMinAmountChange($event)">
        </div>

        <div class="filter-group">
          <label for="max-amount-filter">Max $</label>
          <input
            id="max-amount-filter"
            type="number"
            min="0"
            step="0.01"
            placeholder="0.00"
            [ngModel]="filters.maxAmount"
            (ngModelChange)="onMaxAmountChange($event)">
        </div>

        <button class="clear-btn" (click)="clearFilters.emit()">
          <mat-icon>clear</mat-icon>
          Clear
        </button>
      </div>
    }
  `,
  styleUrl: "./expense-filters.scss",
})
export class ExpenseFiltersComponent {
  @Input() filters!: ExpenseFilterState;
  @Input() showAdvanced = false;
  @Input() activeFilterCount = 0;

  @Output() filtersChange = new EventEmitter<Partial<ExpenseFilterState>>();
  @Output() toggleAdvanced = new EventEmitter<void>();
  @Output() clearFilters = new EventEmitter<void>();

  statusOptions = [
    { value: "all" as const, label: "All" },
    { value: ExpenseStatus.DRAFT, label: "Draft" },
    { value: ExpenseStatus.SUBMITTED, label: "Pending" },
    { value: ExpenseStatus.APPROVED, label: "Approved" },
    { value: ExpenseStatus.REJECTED, label: "Rejected" },
    { value: ExpenseStatus.REIMBURSED, label: "Reimbursed" },
  ];

  categoryOptions = [
    { value: "all", label: "All Categories" },
    { value: ExpenseCategory.FUEL, label: ExpenseCategory.FUEL },
    { value: ExpenseCategory.INDIVIDUAL_MEALS, label: ExpenseCategory.INDIVIDUAL_MEALS },
    { value: ExpenseCategory.BUSINESS_MEALS, label: ExpenseCategory.BUSINESS_MEALS },
    { value: ExpenseCategory.LODGING, label: ExpenseCategory.LODGING },
    { value: ExpenseCategory.AIRFARE, label: ExpenseCategory.AIRFARE },
    { value: ExpenseCategory.GROUND_TRANSPORTATION, label: ExpenseCategory.GROUND_TRANSPORTATION },
    { value: ExpenseCategory.OFFICE_SUPPLIES, label: ExpenseCategory.OFFICE_SUPPLIES },
    { value: ExpenseCategory.SOFTWARE, label: ExpenseCategory.SOFTWARE },
    { value: ExpenseCategory.MISCELLANEOUS, label: ExpenseCategory.MISCELLANEOUS },
  ];

  onStatusChange(status: ExpenseStatus | "all"): void {
    this.filtersChange.emit({ status });
  }

  onSearchChange(searchQuery: string): void {
    this.filtersChange.emit({ searchQuery });
  }

  onCategoryChange(category: string | "all"): void {
    this.filtersChange.emit({ category });
  }

  onDateFromChange(dateString: string): void {
    this.filtersChange.emit({ dateFrom: dateString ? new Date(dateString) : null });
  }

  onDateToChange(dateString: string): void {
    this.filtersChange.emit({ dateTo: dateString ? new Date(dateString) : null });
  }

  onMinAmountChange(minAmount: number | null): void {
    this.filtersChange.emit({ minAmount });
  }

  onMaxAmountChange(maxAmount: number | null): void {
    this.filtersChange.emit({ maxAmount });
  }
}
