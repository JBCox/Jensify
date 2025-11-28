import { Component, OnInit, ChangeDetectionStrategy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatChipsModule } from '@angular/material/chips';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BudgetService } from '../../../core/services/budget.service';
import { BudgetWithTracking, BudgetType, BudgetFilters } from '../../../core/models/budget.model';
import { BudgetDialogComponent, BudgetDialogData, BudgetDialogResult } from './budget-dialog.component';
import { ConfirmDialogComponent } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { EmptyState } from '../../../shared/components/empty-state/empty-state';

@Component({
  selector: 'app-budget-management',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatMenuModule,
    MatSelectModule,
    MatFormFieldModule,
    MatChipsModule,
    MatDialogModule,
    MatTooltipModule,
    EmptyState
  ],
  templateUrl: './budget-management.component.html',
  styleUrl: './budget-management.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BudgetManagementComponent implements OnInit {
  private budgetService = inject(BudgetService);
  private dialog = inject(MatDialog);

  // State
  budgets = signal<BudgetWithTracking[]>([]);
  loading = signal(true);
  selectedType = signal<BudgetType | 'all'>('all');

  // Computed
  filteredBudgets = computed(() => {
    const type = this.selectedType();
    const all = this.budgets();
    if (type === 'all') return all;
    return all.filter(b => b.budget_type === type);
  });

  summary = computed(() => {
    const all = this.budgets();
    return {
      total: all.length,
      under: all.filter(b => b.status === 'under').length,
      warning: all.filter(b => b.status === 'warning').length,
      exceeded: all.filter(b => b.status === 'exceeded').length
    };
  });

  budgetTypes: { value: BudgetType | 'all'; label: string }[] = [
    { value: 'all', label: 'All Budgets' },
    { value: 'organization', label: 'Organization-wide' },
    { value: 'department', label: 'Department' },
    { value: 'category', label: 'Category' },
    { value: 'user', label: 'Individual' }
  ];

  ngOnInit(): void {
    this.loadBudgets();
  }

  loadBudgets(): void {
    this.loading.set(true);
    this.budgetService.getBudgets({ include_inactive: false }).subscribe({
      next: (budgets) => {
        this.budgets.set(budgets);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }

  openCreateDialog(): void {
    const dialogRef = this.dialog.open(BudgetDialogComponent, {
      width: '500px',
      data: { mode: 'create' } as BudgetDialogData
    });

    dialogRef.afterClosed().subscribe((result: BudgetDialogResult | undefined) => {
      if (result?.saved) {
        this.loadBudgets();
      }
    });
  }

  openEditDialog(budget: BudgetWithTracking): void {
    const dialogRef = this.dialog.open(BudgetDialogComponent, {
      width: '500px',
      data: { mode: 'edit', budget } as BudgetDialogData
    });

    dialogRef.afterClosed().subscribe((result: BudgetDialogResult | undefined) => {
      if (result?.saved) {
        this.loadBudgets();
      }
    });
  }

  deleteBudget(budget: BudgetWithTracking): void {
    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      width: '400px',
      data: {
        title: 'Delete Budget',
        message: `Are you sure you want to delete "${budget.name}"? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
        confirmColor: 'warn'
      }
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (confirmed) {
        this.budgetService.deleteBudget(budget.id).subscribe({
          next: () => this.loadBudgets()
        });
      }
    });
  }

  getProgressColor(budget: BudgetWithTracking): string {
    if (budget.status === 'exceeded') return 'warn';
    if (budget.status === 'warning') return 'accent';
    return 'primary';
  }

  getStatusIcon(budget: BudgetWithTracking): string {
    if (budget.status === 'exceeded') return 'error';
    if (budget.status === 'warning') return 'warning';
    return 'check_circle';
  }

  getStatusClass(budget: BudgetWithTracking): string {
    return `status-${budget.status}`;
  }

  getBudgetTypeIcon(type: BudgetType): string {
    const icons: Record<BudgetType, string> = {
      organization: 'business',
      department: 'groups',
      category: 'category',
      user: 'person'
    };
    return icons[type] || 'account_balance_wallet';
  }

  formatCurrency(amount: number): string {
    return this.budgetService.formatCurrency(amount);
  }

  formatPeriod(budget: BudgetWithTracking): string {
    return this.budgetService.getBudgetPeriodLabel(budget.period);
  }

  formatScope(budget: BudgetWithTracking): string {
    switch (budget.budget_type) {
      case 'department':
        return budget.department || 'All Departments';
      case 'category':
        return budget.category || 'All Categories';
      case 'user':
        return 'Individual Budget';
      default:
        return 'Organization-wide';
    }
  }

  trackByBudgetId(_index: number, budget: BudgetWithTracking): string {
    return budget.id;
  }
}
