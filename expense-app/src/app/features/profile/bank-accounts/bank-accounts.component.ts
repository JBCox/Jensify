import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialogModule, MatDialog } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

import { PayoutService } from '../../../core/services/payout.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { EmployeeBankAccount } from '../../../core/models/payout.model';
import { BankAccountFormComponent } from '../../../shared/components/bank-account-form/bank-account-form.component';

/**
 * Bank Accounts Management Component
 *
 * Allows employees to:
 * - View their linked bank accounts
 * - Add new bank accounts (via Stripe tokenization)
 * - Verify accounts via micro-deposits
 * - Set default account for payouts
 * - Delete accounts
 */
@Component({
  selector: 'app-bank-accounts',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatChipsModule,
    MatMenuModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    BankAccountFormComponent,
  ],
  templateUrl: './bank-accounts.component.html',
  styleUrls: ['./bank-accounts.component.scss']
})
export class BankAccountsComponent implements OnInit {
  private readonly payoutService = inject(PayoutService);
  private readonly orgService = inject(OrganizationService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);

  /** Loading state */
  isLoading = signal(true);

  /** Bank accounts list */
  bankAccounts = signal<EmployeeBankAccount[]>([]);

  /** Show add form */
  showAddForm = signal(false);

  /** Account being verified */
  verifyingAccountId = signal<string | null>(null);

  /** Verification amounts */
  verifyAmount1 = signal('');
  verifyAmount2 = signal('');

  /** Current organization ID */
  private organizationId: string | null = null;

  /** Check if organization has Stripe enabled */
  stripeEnabled = computed(() => {
    const settings = this.payoutService.payoutSettings$;
    return true; // Will be computed from settings
  });

  ngOnInit(): void {
    this.loadBankAccounts();
  }

  private loadBankAccounts(): void {
    this.organizationId = this.orgService.currentOrganizationId;
    if (!this.organizationId) {
      this.isLoading.set(false);
      return;
    }

    this.isLoading.set(true);
    this.payoutService.getMyBankAccounts(this.organizationId).subscribe({
      next: (accounts) => {
        this.bankAccounts.set(accounts);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('Failed to load bank accounts:', err);
        this.isLoading.set(false);
        this.snackBar.open('Failed to load bank accounts', 'Dismiss', { duration: 5000 });
      }
    });
  }

  /**
   * Handle token created from bank account form
   */
  onTokenCreated(token: string): void {
    if (!this.organizationId) return;

    this.payoutService.addBankAccount(this.organizationId, token).subscribe({
      next: (response) => {
        if (response.success) {
          this.snackBar.open('Bank account added successfully', 'Dismiss', { duration: 3000 });
          this.showAddForm.set(false);
          this.loadBankAccounts();
        } else {
          this.snackBar.open(response.error || 'Failed to add bank account', 'Dismiss', { duration: 5000 });
        }
      },
      error: (err) => {
        console.error('Failed to add bank account:', err);
        this.snackBar.open('Failed to add bank account', 'Dismiss', { duration: 5000 });
      }
    });
  }

  /**
   * Handle form error
   */
  onFormError(error: string): void {
    this.snackBar.open(error, 'Dismiss', { duration: 5000 });
  }

  /**
   * Handle form cancel
   */
  onFormCancel(): void {
    this.showAddForm.set(false);
  }

  /**
   * Set account as default
   */
  setAsDefault(account: EmployeeBankAccount): void {
    if (!this.organizationId) return;

    this.payoutService.setDefaultBankAccount(account.id, this.organizationId).subscribe({
      next: () => {
        this.snackBar.open('Default account updated', 'Dismiss', { duration: 3000 });
        this.loadBankAccounts();
      },
      error: (err) => {
        console.error('Failed to set default account:', err);
        this.snackBar.open('Failed to update default account', 'Dismiss', { duration: 5000 });
      }
    });
  }

  /**
   * Start account verification
   */
  startVerification(account: EmployeeBankAccount): void {
    this.verifyingAccountId.set(account.id);
    this.verifyAmount1.set('');
    this.verifyAmount2.set('');
  }

  /**
   * Cancel verification
   */
  cancelVerification(): void {
    this.verifyingAccountId.set(null);
    this.verifyAmount1.set('');
    this.verifyAmount2.set('');
  }

  /**
   * Submit verification amounts
   */
  submitVerification(account: EmployeeBankAccount): void {
    const amount1 = parseInt(this.verifyAmount1(), 10);
    const amount2 = parseInt(this.verifyAmount2(), 10);

    if (isNaN(amount1) || isNaN(amount2) || amount1 < 1 || amount2 < 1) {
      this.snackBar.open('Please enter valid amounts (in cents)', 'Dismiss', { duration: 3000 });
      return;
    }

    this.payoutService.verifyBankAccount(account.id, [amount1, amount2]).subscribe({
      next: (response) => {
        if (response.success && response.verified) {
          this.snackBar.open('Bank account verified successfully', 'Dismiss', { duration: 3000 });
          this.verifyingAccountId.set(null);
          this.loadBankAccounts();
        } else {
          this.snackBar.open(response.error || 'Verification failed. Please check the amounts.', 'Dismiss', { duration: 5000 });
        }
      },
      error: (err) => {
        console.error('Verification failed:', err);
        this.snackBar.open('Verification failed', 'Dismiss', { duration: 5000 });
      }
    });
  }

  /**
   * Delete bank account
   */
  deleteAccount(account: EmployeeBankAccount): void {
    if (!this.organizationId) return;

    if (!confirm(`Are you sure you want to remove the bank account ending in ${account.last_four}?`)) {
      return;
    }

    this.payoutService.deleteBankAccount(account.id, this.organizationId).subscribe({
      next: () => {
        this.snackBar.open('Bank account removed', 'Dismiss', { duration: 3000 });
        this.loadBankAccounts();
      },
      error: (err) => {
        console.error('Failed to delete account:', err);
        this.snackBar.open('Failed to remove bank account', 'Dismiss', { duration: 5000 });
      }
    });
  }

  /**
   * Get status chip color
   */
  getStatusColor(status: string): string {
    switch (status) {
      case 'verified': return 'primary';
      case 'pending': return 'warn';
      case 'failed': return 'warn';
      default: return '';
    }
  }

  /**
   * Get status display text
   */
  getStatusText(status: string): string {
    switch (status) {
      case 'verified': return 'Verified';
      case 'pending': return 'Pending Verification';
      case 'failed': return 'Verification Failed';
      case 'expired': return 'Expired';
      default: return status;
    }
  }

  /**
   * Update verification amount
   */
  updateVerifyAmount(field: 1 | 2, value: string): void {
    if (field === 1) {
      this.verifyAmount1.set(value);
    } else {
      this.verifyAmount2.set(value);
    }
  }
}
