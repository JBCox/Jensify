import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, from, throwError, firstValueFrom } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  PlaidItem,
  LinkedAccount,
  ImportedTransaction,
  TransactionRule,
  ImportStats,
  CreateTransactionRuleDto,
  UpdateTransactionRuleDto,
  ConvertTransactionDto,
  PlaidLinkToken,
  ImportedTransactionStatus
} from '../models/plaid.model';

/**
 * Service for Plaid integration and transaction import
 * Handles account linking, transaction sync, and expense conversion
 */
@Injectable({
  providedIn: 'root'
})
export class PlaidService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  // Reactive state
  private _plaidItems = signal<PlaidItem[]>([]);
  private _linkedAccounts = signal<LinkedAccount[]>([]);
  private _transactions = signal<ImportedTransaction[]>([]);
  private _rules = signal<TransactionRule[]>([]);

  plaidItems = this._plaidItems.asReadonly();
  linkedAccounts = this._linkedAccounts.asReadonly();
  transactions = this._transactions.asReadonly();
  rules = this._rules.asReadonly();

  // Computed: active accounts
  activeAccounts = computed(() =>
    this._linkedAccounts().filter(a => a.is_enabled)
  );

  // Computed: new transactions count
  newTransactionCount = computed(() =>
    this._transactions().filter(t => t.status === 'new').length
  );

  // Computed: total pending amount
  pendingAmount = computed(() =>
    this._transactions()
      .filter(t => t.status === 'new')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)
  );

  // =============================================================================
  // PLAID LINK
  // =============================================================================

  /**
   * Create a Plaid Link token
   * This calls the Supabase Edge Function that communicates with Plaid
   */
  createLinkToken(): Observable<PlaidLinkToken> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client.functions.invoke('plaid-link', {
        body: { action: 'create_link_token', user_id: userId }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as PlaidLinkToken;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Exchange public token for access token after Link success
   */
  exchangePublicToken(publicToken: string, metadata: Record<string, unknown>): Observable<PlaidItem> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId || !organizationId) {
      return throwError(() => new Error('User not authenticated or no organization selected'));
    }

    return from(
      this.supabase.client.functions.invoke('plaid-link', {
        body: {
          action: 'exchange_token',
          public_token: publicToken,
          user_id: userId,
          organization_id: organizationId,
          metadata
        }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Plaid account linked', 'PlaidService');
        return data as PlaidItem;
      }),
      switchMap(result => this.getPlaidItems().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // PLAID ITEMS
  // =============================================================================

  /**
   * Get all Plaid items for the user
   */
  getPlaidItems(): Observable<PlaidItem[]> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('plaid_items')
        .select(`
          *,
          accounts:linked_accounts(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as PlaidItem[];
      }),
      tap(items => this._plaidItems.set(items)),
      catchError(this.handleError)
    );
  }

  /**
   * Remove a Plaid item (disconnect account)
   */
  removePlaidItem(itemId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('plaid_items')
        .delete()
        .eq('id', itemId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Plaid item removed', 'PlaidService', { itemId });
      }),
      switchMap(result => this.getPlaidItems().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // LINKED ACCOUNTS
  // =============================================================================

  /**
   * Get all linked accounts for the user
   */
  getLinkedAccounts(): Observable<LinkedAccount[]> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('linked_accounts')
        .select('*')
        .eq('user_id', userId)
        .order('account_name', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as LinkedAccount[];
      }),
      tap(accounts => this._linkedAccounts.set(accounts)),
      catchError(this.handleError)
    );
  }

  /**
   * Update linked account settings
   */
  updateLinkedAccount(accountId: string, updates: Partial<LinkedAccount>): Observable<LinkedAccount> {
    return from(
      this.supabase.client
        .from('linked_accounts')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', accountId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as LinkedAccount;
      }),
      switchMap(result => this.getLinkedAccounts().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  /**
   * Toggle account enabled status
   */
  toggleAccountEnabled(accountId: string, enabled: boolean): Observable<LinkedAccount> {
    return this.updateLinkedAccount(accountId, { is_enabled: enabled });
  }

  // =============================================================================
  // TRANSACTIONS
  // =============================================================================

  /**
   * Sync transactions from Plaid
   */
  syncTransactions(itemId?: string): Observable<{ added: number; modified: number; removed: number }> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client.functions.invoke('plaid-sync', {
        body: {
          action: 'sync_transactions',
          user_id: userId,
          item_id: itemId
        }
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Transactions synced', 'PlaidService', data);
        return data as { added: number; modified: number; removed: number };
      }),
      switchMap(result => this.getTransactions().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  /**
   * Get imported transactions
   */
  getTransactions(filters?: {
    status?: ImportedTransactionStatus;
    accountId?: string;
    startDate?: string;
    endDate?: string;
  }): Observable<ImportedTransaction[]> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    let query = this.supabase.client
      .from('imported_transactions')
      .select(`
        *,
        linked_account:linked_account_id(*)
      `)
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false });

    if (filters?.status) {
      query = query.eq('status', filters.status);
    }
    if (filters?.accountId) {
      query = query.eq('linked_account_id', filters.accountId);
    }
    if (filters?.startDate) {
      query = query.gte('transaction_date', filters.startDate);
    }
    if (filters?.endDate) {
      query = query.lte('transaction_date', filters.endDate);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ImportedTransaction[];
      }),
      tap(transactions => this._transactions.set(transactions)),
      catchError(this.handleError)
    );
  }

  /**
   * Match transaction to existing expense
   */
  matchTransaction(transactionId: string): Observable<string | null> {
    return from(
      this.supabase.client.rpc('match_transaction_to_expense', {
        p_transaction_id: transactionId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as string | null;
      }),
      switchMap(result => this.getTransactions().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  /**
   * Convert transaction to expense
   */
  convertTransaction(dto: ConvertTransactionDto): Observable<string> {
    return from(
      this.supabase.client.rpc('convert_transaction_to_expense', {
        p_transaction_id: dto.transaction_id,
        p_category: dto.category || null,
        p_notes: dto.notes || null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Transaction converted to expense', 'PlaidService', { transactionId: dto.transaction_id });
        return data as string;
      }),
      switchMap(result => this.getTransactions().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  /**
   * Ignore a transaction
   */
  ignoreTransaction(transactionId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('imported_transactions')
        .update({ status: 'ignored', processed_at: new Date().toISOString() })
        .eq('id', transactionId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      switchMap(result => this.getTransactions().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  /**
   * Batch convert multiple transactions
   */
  batchConvertTransactions(transactionIds: string[], category?: string): Observable<string[]> {
    const conversions = transactionIds.map(id =>
      this.convertTransaction({ transaction_id: id, category })
    );

    return from(Promise.all(conversions.map(o => firstValueFrom(o)))).pipe(
      map(results => results.filter((r): r is string => r !== undefined)),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // TRANSACTION RULES
  // =============================================================================

  /**
   * Get transaction rules
   */
  getTransactionRules(): Observable<TransactionRule[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('transaction_rules')
        .select('*')
        .eq('organization_id', organizationId)
        .order('priority', { ascending: true })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as TransactionRule[];
      }),
      tap(rules => this._rules.set(rules)),
      catchError(this.handleError)
    );
  }

  /**
   * Create a transaction rule
   */
  createTransactionRule(rule: CreateTransactionRuleDto): Observable<TransactionRule> {
    const organizationId = this.organizationService.currentOrganizationId;
    const userId = this.supabase.userId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('transaction_rules')
        .insert({
          ...rule,
          organization_id: organizationId,
          created_by: userId
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Transaction rule created', 'PlaidService', { name: rule.name });
        return data as TransactionRule;
      }),
      switchMap(result => this.getTransactionRules().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  /**
   * Update a transaction rule
   */
  updateTransactionRule(rule: UpdateTransactionRuleDto): Observable<TransactionRule> {
    const { id, ...updates } = rule;

    return from(
      this.supabase.client
        .from('transaction_rules')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as TransactionRule;
      }),
      switchMap(result => this.getTransactionRules().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  /**
   * Delete a transaction rule
   */
  deleteTransactionRule(ruleId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('transaction_rules')
        .delete()
        .eq('id', ruleId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      switchMap(result => this.getTransactionRules().pipe(map(() => result))),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // STATISTICS
  // =============================================================================

  /**
   * Get import statistics
   */
  getImportStats(startDate?: string, endDate?: string): Observable<ImportStats> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client.rpc('get_import_stats', {
        p_organization_id: organizationId,
        p_start_date: startDate || null,
        p_end_date: endDate || null
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data?.[0] || {
          total_transactions: 0,
          new_count: 0,
          matched_count: 0,
          converted_count: 0,
          ignored_count: 0,
          total_amount: 0,
          converted_amount: 0
        }) as ImportStats;
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // INITIALIZATION
  // =============================================================================

  /**
   * Initialize service
   */
  initialize(): void {
    this.getPlaidItems().subscribe({
      error: (err) => this.logger.warn('Failed to load Plaid items', 'PlaidService', err)
    });
    this.getLinkedAccounts().subscribe({
      error: (err) => this.logger.warn('Failed to load linked accounts', 'PlaidService', err)
    });
    this.getTransactionRules().subscribe({
      error: (err) => this.logger.warn('Failed to load transaction rules', 'PlaidService', err)
    });
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('PlaidService error', error, 'PlaidService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
