import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  MatDialogModule,
  MAT_DIALOG_DATA,
  MatDialogRef,
} from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Expense, CreateExpenseItemDto } from '../../../core/models/expense.model';
import { ExpenseCategory } from '../../../core/models/enums';

export interface SplitExpenseDialogData {
  expense: Expense;
}

export interface SplitExpenseDialogResult {
  items: CreateExpenseItemDto[];
}

@Component({
  selector: 'app-split-expense-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatSelectModule,
    MatDividerModule,
    MatTooltipModule,
  ],
  templateUrl: './split-expense-dialog.html',
  styleUrls: ['./split-expense-dialog.scss'],
})
export class SplitExpenseDialog implements OnInit {
  private fb = inject(FormBuilder);
  private dialogRef = inject(MatDialogRef<SplitExpenseDialog>);
  private data = inject<SplitExpenseDialogData>(MAT_DIALOG_DATA);

  expense: Expense;
  splitForm: FormGroup;
  categories = Object.values(ExpenseCategory);

  // Expose Math for template
  Math = Math;

  constructor() {
    this.expense = this.data.expense;
    this.splitForm = this.fb.group({
      items: this.fb.array([]),
    });
  }

  ngOnInit(): void {
    // Initialize with two default items
    this.addItem();
    this.addItem();
  }

  get items(): FormArray {
    return this.splitForm.get('items') as FormArray;
  }

  get itemsTotal(): number {
    return this.items.controls.reduce((sum, item) => {
      const amount = item.get('amount')?.value || 0;
      return sum + Number(amount);
    }, 0);
  }

  get remainingAmount(): number {
    return this.expense.amount - this.itemsTotal;
  }

  get isValidSplit(): boolean {
    const tolerance = 0.01;
    return (
      this.splitForm.valid &&
      this.items.length >= 2 &&
      Math.abs(this.remainingAmount) <= tolerance
    );
  }

  get totalMatchesExpense(): boolean {
    const tolerance = 0.01;
    return Math.abs(this.remainingAmount) <= tolerance;
  }

  addItem(): void {
    const itemGroup = this.fb.group({
      description: ['', [Validators.required, Validators.maxLength(200)]],
      amount: [null, [Validators.required, Validators.min(0.01)]],
      category: [this.expense.category, Validators.required],
    });

    this.items.push(itemGroup);
  }

  removeItem(index: number): void {
    if (this.items.length > 2) {
      this.items.removeAt(index);
    }
  }

  /**
   * Auto-fill the remaining amount into a specific item
   */
  fillRemaining(index: number): void {
    if (this.remainingAmount > 0) {
      const item = this.items.at(index);
      const currentAmount = item.get('amount')?.value || 0;
      item.get('amount')?.setValue(
        Number((currentAmount + this.remainingAmount).toFixed(2))
      );
    }
  }

  /**
   * Distribute the expense amount equally among all items
   */
  distributeEvenly(): void {
    const itemCount = this.items.length;
    if (itemCount === 0) return;

    const evenAmount = Math.floor((this.expense.amount / itemCount) * 100) / 100;
    const remainder = Number(
      (this.expense.amount - evenAmount * itemCount).toFixed(2)
    );

    this.items.controls.forEach((item, index) => {
      // Add remainder to first item to ensure total matches
      const amount = index === 0 ? evenAmount + remainder : evenAmount;
      item.get('amount')?.setValue(amount);
    });
  }

  /**
   * Quick split: 50/50
   */
  splitHalf(): void {
    // Reset to 2 items
    while (this.items.length > 2) {
      this.items.removeAt(this.items.length - 1);
    }
    while (this.items.length < 2) {
      this.addItem();
    }

    const halfAmount = Number((this.expense.amount / 2).toFixed(2));
    const remainder = Number((this.expense.amount - halfAmount * 2).toFixed(2));

    this.items.at(0).get('amount')?.setValue(halfAmount + remainder);
    this.items.at(1).get('amount')?.setValue(halfAmount);
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: this.expense.currency || 'USD',
    }).format(amount);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onSplit(): void {
    if (this.isValidSplit) {
      const items: CreateExpenseItemDto[] = this.items.controls.map((item) => ({
        description: item.get('description')?.value,
        amount: Number(item.get('amount')?.value),
        category: item.get('category')?.value,
      }));

      const result: SplitExpenseDialogResult = { items };
      this.dialogRef.close(result);
    }
  }
}
