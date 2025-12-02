import { Injectable, inject, signal, computed } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  EmailInboxConfig,
  UserEmailAlias,
  InboundEmail,
  EmailAttachment,
  EmailProcessingStats,
  UpdateInboxConfigDto,
  AddEmailAliasDto,
  EmailSubmissionInfo,
  EMAIL_SUBMISSION_INSTRUCTIONS
} from '../models/email-expense.model';

/**
 * Service for email-based expense creation
 * Handles inbox configuration, email aliases, and inbound email tracking
 */
@Injectable({
  providedIn: 'root'
})
export class EmailExpenseService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);

  // Reactive state
  private _inboxConfig = signal<EmailInboxConfig | null>(null);
  private _emailAliases = signal<UserEmailAlias[]>([]);
  private _recentEmails = signal<InboundEmail[]>([]);

  inboxConfig = this._inboxConfig.asReadonly();
  emailAliases = this._emailAliases.asReadonly();
  recentEmails = this._recentEmails.asReadonly();

  // Computed: is email submission enabled
  isEmailSubmissionEnabled = computed(() => {
    const config = this._inboxConfig();
    return config?.is_enabled ?? false;
  });

  // =============================================================================
  // INBOX CONFIGURATION
  // =============================================================================

  /**
   * Get inbox configuration for the organization
   */
  getInboxConfig(): Observable<EmailInboxConfig | null> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('email_inbox_config')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as EmailInboxConfig | null;
      }),
      tap(config => this._inboxConfig.set(config)),
      catchError(this.handleError)
    );
  }

  /**
   * Create inbox configuration
   */
  createInboxConfig(inboxAddress: string): Observable<EmailInboxConfig> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('email_inbox_config')
        .insert({
          organization_id: organizationId,
          inbox_address: inboxAddress
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Email inbox created', 'EmailExpenseService', { inboxAddress });
        return data as EmailInboxConfig;
      }),
      tap(config => this._inboxConfig.set(config)),
      catchError(this.handleError)
    );
  }

  /**
   * Update inbox configuration
   */
  updateInboxConfig(updates: UpdateInboxConfigDto): Observable<EmailInboxConfig> {
    const config = this._inboxConfig();

    if (!config) {
      return throwError(() => new Error('No inbox configuration found'));
    }

    return from(
      this.supabase.client
        .from('email_inbox_config')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', config.id)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Email inbox config updated', 'EmailExpenseService');
        return data as EmailInboxConfig;
      }),
      tap(config => this._inboxConfig.set(config)),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // USER EMAIL ALIASES
  // =============================================================================

  /**
   * Get user's email aliases
   */
  getEmailAliases(): Observable<UserEmailAlias[]> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('user_email_aliases')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as UserEmailAlias[];
      }),
      tap(aliases => this._emailAliases.set(aliases)),
      catchError(this.handleError)
    );
  }

  /**
   * Add a new email alias
   */
  addEmailAlias(alias: AddEmailAliasDto): Observable<UserEmailAlias> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId || !organizationId) {
      return throwError(() => new Error('User not authenticated or no organization selected'));
    }

    // Generate verification token
    const verificationToken = crypto.randomUUID();

    return from(
      this.supabase.client
        .from('user_email_aliases')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          email: alias.email,
          verification_token: verificationToken
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Email alias added', 'EmailExpenseService', { email: alias.email });
        return data as UserEmailAlias;
      }),
      tap(() => this.getEmailAliases().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Verify an email alias
   */
  verifyEmailAlias(aliasId: string, token: string): Observable<UserEmailAlias> {
    return from(
      this.supabase.client
        .from('user_email_aliases')
        .update({
          is_verified: true,
          verified_at: new Date().toISOString(),
          verification_token: null
        })
        .eq('id', aliasId)
        .eq('verification_token', token)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        this.logger.info('Email alias verified', 'EmailExpenseService', { aliasId });
        return data as UserEmailAlias;
      }),
      tap(() => this.getEmailAliases().subscribe()),
      catchError(this.handleError)
    );
  }

  /**
   * Remove an email alias
   */
  removeEmailAlias(aliasId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('user_email_aliases')
        .delete()
        .eq('id', aliasId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        this.logger.info('Email alias removed', 'EmailExpenseService', { aliasId });
      }),
      tap(() => this.getEmailAliases().subscribe()),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // INBOUND EMAILS
  // =============================================================================

  /**
   * Get recent inbound emails for the user
   */
  getRecentEmails(limit = 20): Observable<InboundEmail[]> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client
        .from('inbound_emails')
        .select(`
          *,
          attachments:email_attachments(*)
        `)
        .eq('matched_user_id', userId)
        .order('received_at', { ascending: false })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as InboundEmail[];
      }),
      tap(emails => this._recentEmails.set(emails)),
      catchError(this.handleError)
    );
  }

  /**
   * Get all inbound emails for the organization (admin)
   */
  getAllEmails(limit = 50): Observable<InboundEmail[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('inbound_emails')
        .select(`
          *,
          attachments:email_attachments(*)
        `)
        .eq('organization_id', organizationId)
        .order('received_at', { ascending: false })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as InboundEmail[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get a single inbound email by ID
   */
  getEmail(emailId: string): Observable<InboundEmail> {
    return from(
      this.supabase.client
        .from('inbound_emails')
        .select(`
          *,
          attachments:email_attachments(*)
        `)
        .eq('id', emailId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as InboundEmail;
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // STATISTICS
  // =============================================================================

  /**
   * Get email processing statistics
   */
  getProcessingStats(): Observable<EmailProcessingStats | null> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('email_processing_stats')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as EmailProcessingStats | null;
      }),
      catchError(this.handleError)
    );
  }

  // =============================================================================
  // SUBMISSION INFO
  // =============================================================================

  /**
   * Get user's email submission info
   */
  getSubmissionInfo(): Observable<EmailSubmissionInfo> {
    const userId = this.supabase.userId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client.rpc('get_user_submission_email', {
        p_user_id: userId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return {
          submission_email: data as string || '',
          is_enabled: !!data,
          instructions: EMAIL_SUBMISSION_INSTRUCTIONS
        };
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
    this.getInboxConfig().subscribe({
      error: (err) => this.logger.warn('Failed to load inbox config', 'EmailExpenseService', err)
    });
    this.getEmailAliases().subscribe({
      error: (err) => this.logger.warn('Failed to load email aliases', 'EmailExpenseService', err)
    });
  }

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('EmailExpenseService error', error, 'EmailExpenseService');
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return throwError(() => new Error(errorMessage));
  };
}
