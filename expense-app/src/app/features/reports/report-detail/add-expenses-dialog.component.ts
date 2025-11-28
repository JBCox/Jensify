import { Component, inject, OnInit, signal } from "@angular/core";
import { CommonModule } from "@angular/common";
import {
    MatDialogModule,
    MatDialogRef,
} from "@angular/material/dialog";
import { MatButtonModule } from "@angular/material/button";
import { MatListModule } from "@angular/material/list";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatIconModule } from "@angular/material/icon";
import { FormsModule } from "@angular/forms";
import { ExpenseService } from "../../../core/services/expense.service";
import { Expense } from "../../../core/models/expense.model";
import { ExpenseStatus } from "../../../core/models/enums";

@Component({
    selector: "app-add-expenses-dialog",
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatButtonModule,
        MatListModule,
        MatCheckboxModule,
        MatProgressSpinnerModule,
        MatIconModule,
        FormsModule,
    ],
    templateUrl: "./add-expenses-dialog.component.html",
    styles: [`
    .dialog-container {
      min-width: 400px;
      max-width: 600px;
    }
    .expenses-list {
      max-height: 400px;
      overflow-y: auto;
    }
    .empty-state {
      text-align: center;
      padding: 2rem;
      color: #666;
    }
    .expense-item {
      display: flex;
      justify-content: space-between;
      width: 100%;
    }
    .expense-details {
      display: flex;
      flex-direction: column;
    }
    .expense-meta {
      font-size: 0.85rem;
      color: #666;
    }
  `],
})
export class AddExpensesDialogComponent implements OnInit {
    private expenseService = inject(ExpenseService);
    private dialogRef = inject(MatDialogRef<AddExpensesDialogComponent>);

    expenses = signal<Expense[]>([]);
    loading = signal<boolean>(true);
    selectedExpenses = signal<Set<string>>(new Set());

    ngOnInit(): void {
        this.loadExpenses();
    }

    loadExpenses(): void {
        this.loading.set(true);
        // Get all expenses for the user
        this.expenseService.getMyExpenses({ status: ExpenseStatus.DRAFT })
            .subscribe({
                next: (allExpenses) => {
                    // Filter for expenses that are NOT assigned to a report
                    const available = allExpenses.filter((e) => !e.report_id);
                    this.expenses.set(available);
                    this.loading.set(false);
                },
                error: (err) => {
                    console.error("Failed to load expenses", err);
                    this.loading.set(false);
                },
            });
    }

    toggleSelection(expenseId: string): void {
        const current = new Set(this.selectedExpenses());
        if (current.has(expenseId)) {
            current.delete(expenseId);
        } else {
            current.add(expenseId);
        }
        this.selectedExpenses.set(current);
    }

    isSelected(expenseId: string): boolean {
        return this.selectedExpenses().has(expenseId);
    }

    save(): void {
        this.dialogRef.close(Array.from(this.selectedExpenses()));
    }

    cancel(): void {
        this.dialogRef.close();
    }

    formatCurrency(amount: number): string {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
        }).format(amount);
    }

    formatDate(date: string): string {
        return new Date(date).toLocaleDateString();
    }
}
