import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";
import { MatTableModule } from "@angular/material/table";
import { MatTooltipModule } from "@angular/material/tooltip";
import { Expense } from "../../../core/models/expense.model";
import { ExpenseStatus } from "../../../core/models/enums";
import { StatusBadge } from "../../../shared/components/status-badge/status-badge";

@Component({
  selector: "app-report-expenses-table",
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTableModule,
    MatTooltipModule,
    StatusBadge,
  ],
  template: `
    <mat-card class="jensify-card expenses-card">
      <div class="card-header">
        <div class="header-title">
          <mat-icon>receipt</mat-icon>
          <h3>Expenses ({{ expenses.length }})</h3>
        </div>
      </div>

      @if (expenses.length === 0) {
        <div class="empty-expenses">
          <mat-icon>receipt_long</mat-icon>
          <p>No expenses in this report</p>
          @if (canEdit) {
            <button mat-raised-button color="primary" class="jensify-button" (click)="addExpenses.emit()">
              <mat-icon>add</mat-icon>
              Add Expenses
            </button>
          }
        </div>
      } @else {
        <!-- Mobile Card View -->
        <div class="mobile-expense-cards">
          @for (expense of expenses; track expense.id) {
            <div class="mobile-expense-card" (click)="viewExpense.emit(expense)">
              <div class="expense-card-header">
                <div class="expense-merchant">{{ expense.merchant }}</div>
                <span class="expense-amount">{{ formatCurrency(expense.amount) }}</span>
              </div>
              <div class="expense-card-details">
                <div class="expense-detail">
                  <span class="detail-label">Category</span>
                  <span class="detail-value">{{ expense.category }}</span>
                </div>
                <div class="expense-detail">
                  <span class="detail-label">Date</span>
                  <span class="detail-value">{{ formatDate(expense.expense_date) }}</span>
                </div>
              </div>
              <div class="expense-card-footer">
                <app-status-badge [status]="getBadgeStatus(expense.status)" size="small"></app-status-badge>
                @if (canEdit) {
                  <button mat-icon-button color="warn" (click)="removeExpense.emit(expense); $event.stopPropagation()" matTooltip="Remove from report">
                    <mat-icon>remove_circle</mat-icon>
                  </button>
                }
              </div>
            </div>
          }
        </div>

        <!-- Desktop Table View -->
        <div class="expenses-table-container">
          <table mat-table [dataSource]="expenses" class="expenses-table">
            <ng-container matColumnDef="merchant">
              <th mat-header-cell *matHeaderCellDef>Merchant</th>
              <td mat-cell *matCellDef="let expense">{{ expense.merchant }}</td>
            </ng-container>

            <ng-container matColumnDef="category">
              <th mat-header-cell *matHeaderCellDef>Category</th>
              <td mat-cell *matCellDef="let expense">{{ expense.category }}</td>
            </ng-container>

            <ng-container matColumnDef="date">
              <th mat-header-cell *matHeaderCellDef>Date</th>
              <td mat-cell *matCellDef="let expense">{{ formatDate(expense.expense_date) }}</td>
            </ng-container>

            <ng-container matColumnDef="amount">
              <th mat-header-cell *matHeaderCellDef>Amount</th>
              <td mat-cell *matCellDef="let expense">
                <span class="expense-amount">{{ formatCurrency(expense.amount) }}</span>
              </td>
            </ng-container>

            <ng-container matColumnDef="status">
              <th mat-header-cell *matHeaderCellDef>Status</th>
              <td mat-cell *matCellDef="let expense">
                <app-status-badge [status]="getBadgeStatus(expense.status)" size="small"></app-status-badge>
              </td>
            </ng-container>

            <ng-container matColumnDef="actions">
              <th mat-header-cell *matHeaderCellDef>Actions</th>
              <td mat-cell *matCellDef="let expense">
                <div class="action-buttons">
                  <button mat-icon-button (click)="viewExpense.emit(expense)" matTooltip="View expense">
                    <mat-icon>visibility</mat-icon>
                  </button>
                  @if (canEdit) {
                    <button mat-icon-button color="warn" (click)="removeExpense.emit(expense)" matTooltip="Remove from report">
                      <mat-icon>remove_circle</mat-icon>
                    </button>
                  }
                </div>
              </td>
            </ng-container>

            <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: displayedColumns" class="expense-row"></tr>
          </table>
        </div>
      }
    </mat-card>
  `,
  styles: [`
    .expenses-card {
      grid-column: 1 / -1;
    }

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-title h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
    }

    .header-title mat-icon {
      color: var(--jensify-primary, #FF5900);
    }

    .empty-expenses {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 24px;
      color: rgba(0, 0, 0, 0.54);
    }

    .empty-expenses mat-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 16px;
    }

    .empty-expenses p {
      margin-bottom: 16px;
    }

    /* Mobile card view - hidden on desktop */
    .mobile-expense-cards {
      display: none;
    }

    @media (max-width: 767px) {
      .mobile-expense-cards {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .expenses-table-container {
        display: none;
      }
    }

    .mobile-expense-card {
      background: var(--jensify-surface-subtle, #f5f5f5);
      border-radius: 12px;
      padding: 16px;
      cursor: pointer;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .mobile-expense-card:active {
      transform: scale(0.98);
    }

    .expense-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .expense-merchant {
      font-weight: 600;
      font-size: 1rem;
      color: var(--jensify-text-strong, #1a1a1a);
    }

    .expense-card-details {
      display: flex;
      gap: 24px;
      margin-bottom: 12px;
    }

    .expense-detail {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .detail-label {
      font-size: 0.75rem;
      color: var(--jensify-text-muted, #666);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .detail-value {
      font-size: 0.875rem;
      color: var(--jensify-text-body, #333);
    }

    .expense-card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-top: 12px;
      border-top: 1px solid var(--jensify-border-subtle, #e0e0e0);
    }

    .expenses-table-container {
      overflow-x: auto;
    }

    .expenses-table {
      width: 100%;
    }

    .expense-amount {
      font-weight: 500;
      color: var(--jensify-primary, #FF5900);
    }

    .action-buttons {
      display: flex;
      gap: 4px;
    }

    .expense-row:hover {
      background-color: rgba(0, 0, 0, 0.02);
    }
  `],
})
export class ReportExpensesTableComponent {
  @Input() expenses: Expense[] = [];
  @Input() canEdit = false;

  @Output() addExpenses = new EventEmitter<void>();
  @Output() viewExpense = new EventEmitter<Expense>();
  @Output() removeExpense = new EventEmitter<Expense>();

  displayedColumns = ["merchant", "category", "date", "amount", "status", "actions"];

  formatDate(dateString?: string | null): string {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  }

  getBadgeStatus(status: ExpenseStatus): "draft" | "pending" | "approved" | "rejected" | "reimbursed" {
    switch (status) {
      case ExpenseStatus.DRAFT: return "draft";
      case ExpenseStatus.SUBMITTED: return "pending";
      case ExpenseStatus.APPROVED: return "approved";
      case ExpenseStatus.REJECTED: return "rejected";
      case ExpenseStatus.REIMBURSED: return "reimbursed";
      default: return "draft";
    }
  }
}
