import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

interface Invoice {
  id: string;
  invoice_number: string;
  organization_id: string;
  organization_name: string;
  amount: number;
  status: 'paid' | 'open' | 'overdue' | 'void';
  created_at: string;
  due_date: string;
  paid_at: string | null;
}

@Component({
  selector: 'app-invoice-management',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatTableModule,
    MatFormFieldModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatMenuModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  template: `
    <div class="p-6">
      <mat-card>
        <mat-card-header class="flex justify-between items-center">
          <div>
            <mat-card-title>Invoice Management</mat-card-title>
            <mat-card-subtitle>View and manage invoices across all organizations</mat-card-subtitle>
          </div>
          <button mat-raised-button color="accent" (click)="openCreateInvoiceDialog()">
            <mat-icon>add</mat-icon>
            Create Manual Invoice
          </button>
        </mat-card-header>

        <mat-card-content>
          <!-- Stats Cards -->
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-green-50 p-4 rounded-lg">
              <div class="text-sm text-green-600 mb-1">Paid</div>
              <div class="text-2xl font-bold text-green-900">{{ stats().paid }}</div>
              <div class="text-xs text-green-600">\${{ stats().paidAmount | number:'1.2-2' }}</div>
            </div>
            <div class="bg-blue-50 p-4 rounded-lg">
              <div class="text-sm text-blue-600 mb-1">Open</div>
              <div class="text-2xl font-bold text-blue-900">{{ stats().open }}</div>
              <div class="text-xs text-blue-600">\${{ stats().openAmount | number:'1.2-2' }}</div>
            </div>
            <div class="bg-orange-50 p-4 rounded-lg">
              <div class="text-sm text-orange-600 mb-1">Overdue</div>
              <div class="text-2xl font-bold text-orange-900">{{ stats().overdue }}</div>
              <div class="text-xs text-orange-600">\${{ stats().overdueAmount | number:'1.2-2' }}</div>
            </div>
            <div class="bg-gray-50 p-4 rounded-lg">
              <div class="text-sm text-gray-600 mb-1">Void</div>
              <div class="text-2xl font-bold text-gray-900">{{ stats().void }}</div>
            </div>
          </div>

          <!-- Filters -->
          <form [formGroup]="filterForm" class="mb-6">
            <div class="flex gap-4">
              <mat-form-field class="flex-1">
                <mat-label>Status</mat-label>
                <mat-select formControlName="status">
                  <mat-option value="">All</mat-option>
                  <mat-option value="paid">Paid</mat-option>
                  <mat-option value="open">Open</mat-option>
                  <mat-option value="overdue">Overdue</mat-option>
                  <mat-option value="void">Void</mat-option>
                </mat-select>
              </mat-form-field>
              <button mat-raised-button color="primary" (click)="applyFilter()">
                <mat-icon>filter_list</mat-icon>
                Apply
              </button>
              <button mat-button (click)="resetFilter()">
                <mat-icon>clear</mat-icon>
                Reset
              </button>
            </div>
          </form>

          <!-- Invoices Table -->
          @if (loading()) {
            <div class="text-center py-8">
              <mat-icon class="animate-spin text-4xl text-gray-400">refresh</mat-icon>
              <p class="text-gray-500 mt-2">Loading invoices...</p>
            </div>
          } @else if (invoices().length > 0) {
            <div class="overflow-x-auto">
              <table mat-table [dataSource]="invoices()" class="w-full">
                <!-- Invoice Number Column -->
                <ng-container matColumnDef="number">
                  <th mat-header-cell *matHeaderCellDef>Invoice #</th>
                  <td mat-cell *matCellDef="let invoice">
                    <span class="font-mono">{{ invoice.invoice_number }}</span>
                  </td>
                </ng-container>

                <!-- Organization Column -->
                <ng-container matColumnDef="organization">
                  <th mat-header-cell *matHeaderCellDef>Organization</th>
                  <td mat-cell *matCellDef="let invoice">{{ invoice.organization_name }}</td>
                </ng-container>

                <!-- Amount Column -->
                <ng-container matColumnDef="amount">
                  <th mat-header-cell *matHeaderCellDef>Amount</th>
                  <td mat-cell *matCellDef="let invoice">
                    <span class="font-medium">\${{ invoice.amount | number:'1.2-2' }}</span>
                  </td>
                </ng-container>

                <!-- Status Column -->
                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Status</th>
                  <td mat-cell *matCellDef="let invoice">
                    <mat-chip [class]="getStatusClass(invoice.status)">
                      {{ invoice.status | uppercase }}
                    </mat-chip>
                  </td>
                </ng-container>

                <!-- Date Column -->
                <ng-container matColumnDef="date">
                  <th mat-header-cell *matHeaderCellDef>Created</th>
                  <td mat-cell *matCellDef="let invoice">
                    {{ invoice.created_at | date:'short' }}
                  </td>
                </ng-container>

                <!-- Due Date Column -->
                <ng-container matColumnDef="dueDate">
                  <th mat-header-cell *matHeaderCellDef>Due Date</th>
                  <td mat-cell *matCellDef="let invoice">
                    {{ invoice.due_date | date:'short' }}
                  </td>
                </ng-container>

                <!-- Actions Column -->
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Actions</th>
                  <td mat-cell *matCellDef="let invoice">
                    <button mat-icon-button [matMenuTriggerFor]="menu">
                      <mat-icon>more_vert</mat-icon>
                    </button>
                    <mat-menu #menu="matMenu">
                      <button mat-menu-item (click)="resendInvoice(invoice)">
                        <mat-icon>send</mat-icon>
                        <span>Resend</span>
                      </button>
                      @if (invoice.status === 'open' || invoice.status === 'overdue') {
                        <button mat-menu-item (click)="markAsPaid(invoice)">
                          <mat-icon>check_circle</mat-icon>
                          <span>Mark as Paid</span>
                        </button>
                      }
                      @if (invoice.status !== 'void') {
                        <button mat-menu-item (click)="voidInvoice(invoice)">
                          <mat-icon>cancel</mat-icon>
                          <span>Void Invoice</span>
                        </button>
                      }
                      <button mat-menu-item (click)="viewDetails(invoice)">
                        <mat-icon>visibility</mat-icon>
                        <span>View Details</span>
                      </button>
                    </mat-menu>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            </div>
          } @else {
            <div class="text-center py-8 text-gray-500">
              <mat-icon class="text-6xl mb-2">receipt_long</mat-icon>
              <p>No invoices found.</p>
            </div>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class InvoiceManagementComponent implements OnInit {
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private superAdminService = inject(SuperAdminService);

  filterForm: FormGroup;
  loading = signal(false);
  invoices = signal<Invoice[]>([]);
  stats = signal({
    paid: 0,
    open: 0,
    overdue: 0,
    void: 0,
    paidAmount: 0,
    openAmount: 0,
    overdueAmount: 0
  });
  displayedColumns = ['number', 'organization', 'amount', 'status', 'date', 'dueDate', 'actions'];

  constructor() {
    this.filterForm = this.fb.group({
      status: ['']
    });
  }

  async ngOnInit(): Promise<void> {
    await this.loadInvoices();
  }

  async loadInvoices(): Promise<void> {
    this.loading.set(true);
    try {
      const statusFilter = this.filterForm.get('status')?.value || '';
      const data = await firstValueFrom(this.superAdminService.getAllInvoices(statusFilter));

      // Map service response to component interface
      const invoices: Invoice[] = data.map((inv) => {
        const org = (inv as unknown as { organizations?: { name: string } }).organizations;
        const status = inv.status;
        const dueDate = inv.due_date || '';
        const now = new Date();
        const isOverdue = status === 'open' && dueDate && new Date(dueDate) < now;

        return {
          id: inv.id,
          invoice_number: inv.stripe_invoice_id || `INV-${inv.id.substring(0, 8)}`,
          organization_id: inv.organization_id,
          organization_name: org?.name || 'Unknown',
          amount: (inv.amount_cents || 0) / 100,
          status: isOverdue ? 'overdue' : (status as Invoice['status']),
          created_at: inv.created_at || '',
          due_date: dueDate,
          paid_at: inv.paid_at || null,
        };
      });

      this.invoices.set(invoices);

      // Calculate stats
      const stats = invoices.reduce((acc, inv) => {
        acc[inv.status]++;
        if (inv.status === 'paid') acc.paidAmount += inv.amount;
        else if (inv.status === 'open') acc.openAmount += inv.amount;
        else if (inv.status === 'overdue') acc.overdueAmount += inv.amount;
        return acc;
      }, { paid: 0, open: 0, overdue: 0, void: 0, paidAmount: 0, openAmount: 0, overdueAmount: 0 });

      this.stats.set(stats);
    } catch (error) {
      console.error('Error loading invoices:', error);
      this.snackBar.open('Failed to load invoices', 'Close', { duration: 3000 });
    } finally {
      this.loading.set(false);
    }
  }

  async applyFilter(): Promise<void> {
    await this.loadInvoices();
  }

  async resetFilter(): Promise<void> {
    this.filterForm.reset({ status: '' });
    await this.loadInvoices();
  }

  getStatusClass(status: string): string {
    const classes: Record<string, string> = {
      paid: 'bg-green-100 text-green-800',
      open: 'bg-blue-100 text-blue-800',
      overdue: 'bg-orange-100 text-orange-800',
      void: 'bg-gray-100 text-gray-800'
    };
    return classes[status] || '';
  }

  async resendInvoice(invoice: Invoice): Promise<void> {
    try {
      await firstValueFrom(this.superAdminService.resendInvoice(invoice.id));
      this.snackBar.open('Invoice resent successfully', 'Close', { duration: 3000 });
    } catch (error) {
      console.error('Error resending invoice:', error);
      this.snackBar.open('Failed to resend invoice', 'Close', { duration: 3000 });
    }
  }

  markAsPaid(invoice: Invoice): void {
    const dialogData: ConfirmDialogData = {
      title: 'Mark as Paid',
      message: `Mark invoice ${invoice.invoice_number} as paid?`,
      confirmText: 'Mark Paid',
      cancelText: 'Cancel',
      confirmColor: 'primary',
      icon: 'check_circle',
      iconColor: '#4caf50',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (!confirmed) return;

      try {
        await firstValueFrom(this.superAdminService.markInvoicePaid({
          invoice_id: invoice.id,
          payment_method: 'manual',
          notes: 'Marked as paid by admin'
        }));
        this.snackBar.open('Invoice marked as paid', 'Close', { duration: 3000 });
        await this.loadInvoices();
      } catch (error) {
        console.error('Error marking invoice as paid:', error);
        this.snackBar.open('Failed to mark invoice as paid', 'Close', { duration: 3000 });
      }
    });
  }

  voidInvoice(invoice: Invoice): void {
    const dialogData: ConfirmDialogData = {
      title: 'Void Invoice',
      message: `Void invoice ${invoice.invoice_number}? This action cannot be undone.`,
      confirmText: 'Void Invoice',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'cancel',
      iconColor: '#f44336',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (!confirmed) return;

      try {
        await firstValueFrom(this.superAdminService.voidInvoice({
          invoice_id: invoice.id,
          reason: 'Voided by admin'
        }));
        this.snackBar.open('Invoice voided successfully', 'Close', { duration: 3000 });
        await this.loadInvoices();
      } catch (error) {
        console.error('Error voiding invoice:', error);
        this.snackBar.open('Failed to void invoice', 'Close', { duration: 3000 });
      }
    });
  }

  async openCreateInvoiceDialog(): Promise<void> {
    // TODO: Implement create invoice dialog
    this.snackBar.open('Create invoice feature coming soon', 'Close', { duration: 3000 });
  }

  viewDetails(_invoice: Invoice): void {
    // TODO: Implement view details
    this.snackBar.open('View details feature coming soon', 'Close', { duration: 3000 });
  }
}
