import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { environment } from '../../../environments/environment';
import {
  PayoutSettings,
  PayoutMethod,
  StripeAccountStatusResponse,
  CreateConnectAccountResponse,
  EmployeeBankAccount,
  CreateBankAccountResponse,
  Payout,
  CreatePayoutResponse,
  PendingPayoutSummary,
  PayoutExportData
} from '../models/payout.model';

/**
 * Payout Service
 *
 * Manages organization payout settings, Stripe Connect integration,
 * employee bank accounts, and payout processing.
 *
 * SECURITY:
 * - All Stripe operations go through server-side Edge Function
 * - Bank account data is tokenized (we never see raw account numbers)
 * - Stripe secret key is stored as environment secret, never exposed
 *
 * @example
 * ```typescript
 * // Connect Stripe account (admin only)
 * this.payoutService.connectStripeAccount(orgId).subscribe(result => {
 *   window.location.href = result.onboarding_url;
 * });
 *
 * // Add bank account (employee)
 * this.payoutService.addBankAccount(orgId, stripeToken).subscribe();
 *
 * // Process payout (finance)
 * this.payoutService.createPayout(orgId, userId, amountCents, expenseIds).subscribe();
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class PayoutService {
  private readonly edgeFunctionUrl = `${environment.supabase.url}/functions/v1/stripe-connect`;

  /** Current payout settings for the organization */
  private payoutSettingsSubject = new BehaviorSubject<PayoutSettings | null>(null);
  public payoutSettings$ = this.payoutSettingsSubject.asObservable();

  /** Current user's bank accounts */
  private bankAccountsSubject = new BehaviorSubject<EmployeeBankAccount[]>([]);
  public bankAccounts$ = this.bankAccountsSubject.asObservable();

  constructor(private supabase: SupabaseService) {}

  // ============================================================================
  // STRIPE CONNECT (Admin Operations)
  // ============================================================================

  /**
   * Get current Stripe account status for organization
   */
  getStripeAccountStatus(organizationId: string): Observable<StripeAccountStatusResponse> {
    return from(this.callEdgeFunction<StripeAccountStatusResponse>('get_account_status', { organization_id: organizationId })).pipe(
      tap(result => {
        if (result) {
          this.payoutSettingsSubject.next({
            payout_method: result.payout_method || 'manual',
            stripe_account_id: result.connected ? 'connected' : null,
            stripe_account_status: result.status || 'not_connected',
            stripe_connected_at: null,
            stripe_account_details: {
              business_name: result.business_name,
              charges_enabled: result.charges_enabled,
              payouts_enabled: result.payouts_enabled
            }
          });
        }
      }),
      catchError(error => {
        console.error('Failed to get Stripe account status:', error);
        return of({ connected: false, payout_method: 'manual' as PayoutMethod });
      })
    );
  }

  /**
   * Create and connect a new Stripe account for the organization
   * Returns URL to redirect admin to Stripe onboarding
   */
  connectStripeAccount(
    organizationId: string,
    returnUrl?: string,
    refreshUrl?: string
  ): Observable<CreateConnectAccountResponse> {
    const baseUrl = window.location.origin;
    return from(this.callEdgeFunction<CreateConnectAccountResponse>('create_connect_account', {
      organization_id: organizationId,
      return_url: returnUrl || `${baseUrl}/organization/settings/payouts?stripe=success`,
      refresh_url: refreshUrl || `${baseUrl}/organization/settings/payouts?stripe=refresh`
    }));
  }

  /**
   * Create a new account link for continuing Stripe onboarding
   */
  createAccountLink(
    organizationId: string,
    returnUrl?: string,
    refreshUrl?: string
  ): Observable<{ success: boolean; onboarding_url?: string; error?: string }> {
    const baseUrl = window.location.origin;
    return from(this.callEdgeFunction<{ success: boolean; onboarding_url?: string; error?: string }>('create_account_link', {
      organization_id: organizationId,
      return_url: returnUrl || `${baseUrl}/organization/settings/payouts?stripe=success`,
      refresh_url: refreshUrl || `${baseUrl}/organization/settings/payouts?stripe=refresh`
    }));
  }

  /**
   * Disconnect Stripe account from organization
   */
  disconnectStripeAccount(organizationId: string): Observable<{ success: boolean; error?: string }> {
    return from(this.callEdgeFunction<{ success: boolean; error?: string }>('disconnect_account', {
      organization_id: organizationId
    })).pipe(
      tap(() => {
        // Reset local state
        this.payoutSettingsSubject.next({
          payout_method: 'manual',
          stripe_account_id: null,
          stripe_account_status: 'not_connected',
          stripe_connected_at: null,
          stripe_account_details: {}
        });
      })
    );
  }

  /**
   * Update organization payout method (manual or stripe)
   */
  updatePayoutMethod(organizationId: string, method: PayoutMethod): Observable<{ success: boolean }> {
    return from(this.callEdgeFunction<{ success: boolean }>('update_payout_method', {
      organization_id: organizationId,
      payout_method: method
    })).pipe(
      tap(() => {
        const current = this.payoutSettingsSubject.value;
        if (current) {
          this.payoutSettingsSubject.next({ ...current, payout_method: method });
        }
      })
    );
  }

  // ============================================================================
  // EMPLOYEE BANK ACCOUNTS
  // ============================================================================

  /**
   * Get current user's bank accounts
   */
  getMyBankAccounts(organizationId: string): Observable<EmployeeBankAccount[]> {
    return from(
      this.supabase.client
        .from('employee_bank_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.bankAccountsSubject.next(data || []);
        return data || [];
      }),
      catchError(error => {
        console.error('Failed to fetch bank accounts:', error);
        return of([]);
      })
    );
  }

  /**
   * Add a new bank account using Stripe token
   *
   * The token is generated client-side using Stripe.js Elements.
   * We never handle raw bank account/routing numbers.
   *
   * @param organizationId - Organization ID
   * @param bankAccountToken - Token from Stripe.js (btok_xxx)
   */
  addBankAccount(
    organizationId: string,
    bankAccountToken: string
  ): Observable<CreateBankAccountResponse> {
    return from(this.callEdgeFunction<CreateBankAccountResponse>('create_bank_account', {
      organization_id: organizationId,
      bank_account_token: bankAccountToken
    })).pipe(
      tap(result => {
        if (result.success) {
          // Refresh bank accounts list
          this.getMyBankAccounts(organizationId).subscribe();
        }
      })
    );
  }

  /**
   * Verify bank account with micro-deposit amounts
   *
   * After adding a bank account, Stripe sends two small deposits.
   * User enters these amounts to verify ownership.
   *
   * @param bankAccountId - Our database bank account ID
   * @param amounts - Two micro-deposit amounts in cents [32, 45]
   */
  verifyBankAccount(
    bankAccountId: string,
    amounts: [number, number]
  ): Observable<{ success: boolean; verified?: boolean; error?: string }> {
    return from(this.callEdgeFunction<{ success: boolean; verified?: boolean; error?: string }>('verify_bank_account', {
      bank_account_id: bankAccountId,
      amounts
    }));
  }

  /**
   * Set a bank account as default for payouts
   */
  setDefaultBankAccount(bankAccountId: string, organizationId: string): Observable<void> {
    return from(
      this.supabase.client.rpc('set_default_bank_account', {
        p_bank_account_id: bankAccountId
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        // Refresh bank accounts
        this.getMyBankAccounts(organizationId).subscribe();
      })
    );
  }

  /**
   * Delete a bank account
   */
  deleteBankAccount(bankAccountId: string, organizationId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('employee_bank_accounts')
        .delete()
        .eq('id', bankAccountId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        // Refresh bank accounts
        this.getMyBankAccounts(organizationId).subscribe();
      })
    );
  }

  // ============================================================================
  // PAYOUTS (Finance Operations)
  // ============================================================================

  /**
   * Get pending payouts summary for all employees in organization
   */
  getPendingPayoutsSummary(organizationId: string): Observable<PendingPayoutSummary[]> {
    return from(
      this.supabase.client.rpc('get_pending_payouts_summary', {
        p_organization_id: organizationId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          console.error('Failed to get pending payouts:', error);
          return [];
        }
        return data || [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Get all approved expenses ready for payout (grouped by user)
   */
  getApprovedExpensesForPayout(organizationId: string): Observable<PendingPayoutSummary[]> {
    return from(
      this.supabase.client
        .from('expenses')
        .select(`
          id,
          user_id,
          amount,
          users!expenses_user_id_fkey(full_name, email)
        `)
        .eq('organization_id', organizationId)
        .eq('status', 'approved')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;

        // Group by user
        const userMap = new Map<string, PendingPayoutSummary>();

        (data || []).forEach((expense) => {
          const users = expense.users as { full_name: string; email: string }[] | { full_name: string; email: string };
          const user = Array.isArray(users) ? users[0] : users;
          const existing = userMap.get(expense.user_id);
          if (existing) {
            existing.total_amount_cents += Math.round(expense.amount * 100);
            existing.expense_count += 1;
            existing.expense_ids.push(expense.id);
          } else {
            userMap.set(expense.user_id, {
              user_id: expense.user_id,
              user_name: user?.full_name || 'Unknown',
              user_email: user?.email || '',
              total_amount_cents: Math.round(expense.amount * 100),
              expense_count: 1,
              expense_ids: [expense.id],
              has_bank_account: false,
              bank_account_verified: false
            });
          }
        });

        return Array.from(userMap.values());
      }),
      catchError(error => {
        console.error('Failed to get approved expenses:', error);
        return of([]);
      })
    );
  }

  /**
   * Create a payout via Stripe
   */
  createPayout(
    organizationId: string,
    employeeUserId: string,
    amountCents: number,
    expenseIds: string[]
  ): Observable<CreatePayoutResponse> {
    return from(this.callEdgeFunction<CreatePayoutResponse>('create_payout', {
      organization_id: organizationId,
      employee_user_id: employeeUserId,
      amount_cents: amountCents,
      expense_ids: expenseIds
    }));
  }

  /**
   * Create a manual payout record (for CSV export workflow)
   */
  createManualPayout(
    organizationId: string,
    employeeUserId: string,
    amountCents: number,
    expenseIds: string[],
    reference?: string,
    notes?: string
  ): Observable<Payout> {
    return from(
      this.supabase.client
        .from('payouts')
        .insert({
          organization_id: organizationId,
          user_id: employeeUserId,
          amount_cents: amountCents,
          payout_method: 'manual',
          status: 'pending',
          expense_ids: expenseIds,
          manual_reference: reference,
          manual_notes: notes,
          initiated_by: this.supabase.userId
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data;
      })
    );
  }

  /**
   * Mark a manual payout as paid
   */
  markPayoutAsPaid(payoutId: string, reference?: string): Observable<void> {
    return from(
      this.supabase.client
        .from('payouts')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          manual_reference: reference
        })
        .eq('id', payoutId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      })
    );
  }

  /**
   * Get payout status
   */
  getPayoutStatus(payoutId: string): Observable<Payout | null> {
    return from(this.callEdgeFunction<Payout>('get_payout_status', { payout_id: payoutId })).pipe(
      map(data => data as Payout | null),
      catchError(error => {
        console.error('Failed to get payout status:', error);
        return of(null);
      })
    );
  }

  /**
   * Get payout history for organization
   */
  getPayoutHistory(organizationId: string, limit = 50): Observable<Payout[]> {
    return from(
      this.supabase.client
        .from('payouts')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError(() => of([]))
    );
  }

  /**
   * Get my payout history (for employees)
   */
  getMyPayoutHistory(limit = 20): Observable<Payout[]> {
    const userId = this.supabase.userId;
    if (!userId) return of([]);

    return from(
      this.supabase.client
        .from('payouts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError(() => of([]))
    );
  }

  // ============================================================================
  // CSV EXPORT (Manual Payout Workflow)
  // ============================================================================

  /**
   * Generate CSV export data for approved expenses
   */
  generatePayoutExportData(pendingPayouts: PendingPayoutSummary[]): PayoutExportData[] {
    return pendingPayouts.map(p => ({
      employee_name: p.user_name,
      employee_email: p.user_email,
      amount: p.total_amount_cents / 100,
      expense_count: p.expense_count,
      expense_ids: p.expense_ids.join(', '),
      date_range: new Date().toLocaleDateString()
    }));
  }

  /**
   * Export payouts to CSV file
   */
  exportPayoutsToCSV(data: PayoutExportData[]): void {
    const headers = ['Employee Name', 'Email', 'Amount ($)', 'Expense Count', 'Expense IDs', 'Export Date'];
    const rows = data.map(d => [
      d.employee_name,
      d.employee_email,
      d.amount.toFixed(2),
      d.expense_count.toString(),
      d.expense_ids,
      d.date_range
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `payouts_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Call the stripe-connect Edge Function
   */
  private async callEdgeFunction<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
    const session = this.supabase.currentSession;
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(this.edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': environment.supabase.anonKey
      },
      body: JSON.stringify({ action, ...params })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || error.message || 'Request failed');
    }

    return response.json();
  }
}
