import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, from, Observable, of, throwError, Subject } from 'rxjs';
import { catchError, map, tap, takeUntil } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { LoggerService } from './logger.service';
import { NotificationService } from './notification.service';
import { SubscriptionService } from './subscription.service';
import {
  SuperAdmin,
  SuperAdminPermissions,
  SuperAdminOrganizationSummary,
  SuperAdminAnalytics,
  CouponCode,
  SubscriptionAuditLog,
  CreateCouponDto,
  ApplyDiscountDto,
  IssueRefundDto,
  PlatformSetting,
  PlatformAnnouncement,
  CreateAnnouncementDto,
  EmailTemplate,
  UpdateEmailTemplateDto,
  ImpersonationSession,
  StartImpersonationDto,
  PlatformErrorLog,
  ErrorLogParams,
  ErrorStats,
  ScheduledTask,
  ApiKey,
  IntegrationHealth,
  BulkOperationResult,
  ExtendTrialDto,
  DeleteOrganizationDto,
  UpdatePlanDto,
  GenerateInvoiceDto,
  MarkInvoicePaidDto,
  VoidInvoiceDto,
  SubscriptionInvoice,
  SubscriptionPlan,
} from '../models/subscription.model';

/**
 * Service for Super Admin (platform-level) operations
 * Manages all organizations, subscriptions, coupons, and analytics
 *
 * IMPORTANT: Super admins CANNOT access customer expense/receipt data
 * They can only see billing and subscription information
 */
@Injectable({
  providedIn: 'root',
})
export class SuperAdminService implements OnDestroy {
  private supabase = inject(SupabaseService);
  private logger = inject(LoggerService);
  private notificationService = inject(NotificationService);
  private subscriptionService = inject(SubscriptionService);

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /** Subject for cleanup on destroy */
  private destroy$ = new Subject<void>();

  // ============================================================================
  // OBSERVABLES
  // ============================================================================

  /** Whether current user is a super admin */
  private isSuperAdminSubject = new BehaviorSubject<boolean>(false);
  public readonly isSuperAdmin$ = this.isSuperAdminSubject.asObservable();

  /** Synchronous getter for super admin status */
  get isSuperAdmin(): boolean {
    return this.isSuperAdminSubject.getValue();
  }

  /** Super admin permissions */
  private permissionsSubject = new BehaviorSubject<SuperAdminPermissions | null>(null);
  public readonly permissions$ = this.permissionsSubject.asObservable();

  /** Loading state */
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public readonly loading$ = this.loadingSubject.asObservable();

  /** Cached admin status check */
  private adminCheckCache$: Observable<boolean> | null = null;

  /** Promise that resolves when admin check is complete */
  private adminCheckPromise: Promise<boolean> | null = null;

  constructor() {
    // Check admin status when user changes
    // Uses takeUntil for proper cleanup to prevent memory leaks
    this.supabase.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe((user) => {
        if (user) {
          this.checkSuperAdminStatus();
        } else {
          this.isSuperAdminSubject.next(false);
          this.permissionsSubject.next(null);
          this.adminCheckPromise = null; // Clear stale promise on logout
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================================
  // AUTHENTICATION & PERMISSIONS
  // ============================================================================

  /**
   * Check if current user is a super admin
   * Returns a promise that resolves when the check is complete
   */
  checkSuperAdminStatus(): Promise<boolean> {
    const userId = this.supabase.userId;

    // Create the promise FIRST - before any async operations
    // This ensures waitForAdminCheck() always has a promise to await
    const promise = new Promise<boolean>((resolve) => {
      if (!userId) {
        this.isSuperAdminSubject.next(false);
        this.permissionsSubject.next(null);
        resolve(false);
        return;
      }

      from(
        this.supabase.client
          .from('super_admins')
          .select('permissions')
          .eq('user_id', userId)
          .eq('is_active', true)
          .maybeSingle() // Avoid 406 when user is not a super admin
      ).pipe(
        map(({ data, error }) => {
          if (error || !data) {
            return { isAdmin: false, permissions: null };
          }
          return {
            isAdmin: true,
            permissions: data.permissions as SuperAdminPermissions,
          };
        }),
        catchError(() => {
          return of({ isAdmin: false, permissions: null });
        })
      ).subscribe(({ isAdmin, permissions }) => {
        this.isSuperAdminSubject.next(isAdmin);
        this.permissionsSubject.next(permissions);
        resolve(isAdmin);
      });
    });

    // Store the promise IMMEDIATELY so waitForAdminCheck() can use it
    this.adminCheckPromise = promise;

    return promise;
  }

  /**
   * Wait for admin status check to complete
   * ALWAYS returns a promise - never falls back to synchronous value
   */
  async waitForAdminCheck(): Promise<boolean> {
    // If a check is in progress, wait for it
    if (this.adminCheckPromise) {
      return this.adminCheckPromise;
    }

    // If no check is in progress and we have no user, return false
    if (!this.supabase.userId) {
      return false;
    }

    // If we have a user but no check has started, trigger one and wait
    return this.checkSuperAdminStatus();
  }

  /**
   * Check if user has a specific permission
   */
  hasPermission(permission: keyof SuperAdminPermissions): boolean {
    const permissions = this.permissionsSubject.getValue();
    return permissions?.[permission] ?? false;
  }

  /**
   * Verify super admin access (throws if not admin)
   */
  private verifySuperAdmin(): void {
    if (!this.isSuperAdminSubject.getValue()) {
      throw new Error('Unauthorized: Super admin access required');
    }
  }

  // ============================================================================
  // ORGANIZATION MANAGEMENT
  // ============================================================================

  /** Maximum organizations per request to prevent excessive data loading */
  private readonly MAX_ORGANIZATIONS_LIMIT = 100;

  /**
   * Get all organizations (super admin view - NO private data)
   * @param params.limit - Max organizations to return (capped at 100)
   * @param params.offset - Pagination offset
   */
  getAllOrganizations(params?: {
    status?: string;
    plan?: string;
    limit?: number;
    offset?: number;
  }): Observable<{
    organizations: SuperAdminOrganizationSummary[];
    total: number;
  }> {
    this.loadingSubject.next(true);

    // Enforce max limit to prevent excessive data loading
    const safeLimit = Math.min(params?.limit || 50, this.MAX_ORGANIZATIONS_LIMIT);

    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_get_all_subscriptions',
          ...params,
          limit: safeLimit,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return {
          organizations: (data.organizations || []) as SuperAdminOrganizationSummary[],
          total: data.total || 0,
        };
      }),
      tap(() => this.loadingSubject.next(false)),
      catchError((error) => {
        this.loadingSubject.next(false);
        return this.handleError(error);
      })
    );
  }

  /**
   * Get organization billing details
   */
  getOrganizationDetails(organizationId: string): Observable<SuperAdminOrganizationSummary> {
    return from(
      this.supabase.client
        .from('super_admin_organization_summary')
        .select('*')
        .eq('organization_id', organizationId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Organization not found');
        return data as SuperAdminOrganizationSummary;
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // SUBSCRIPTION ACTIONS
  // ============================================================================

  /**
   * Apply a discount to an organization
   */
  applyDiscount(dto: ApplyDiscountDto): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_apply_discount',
          ...dto,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess(
          `${dto.discount_percent}% discount applied successfully`
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Issue a refund
   */
  issueRefund(dto: IssueRefundDto): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_issue_refund',
          ...dto,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        const amount = dto.amount_cents
          ? `$${(dto.amount_cents / 100).toFixed(2)}`
          : 'full amount';
        this.notificationService.showSuccess(`Refunded ${amount} successfully`);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Pause an organization's subscription
   */
  pauseSubscription(organizationId: string, reason: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_pause_subscription',
          organization_id: organizationId,
          reason,
          resume: false,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Subscription paused');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Resume a paused subscription
   */
  resumeSubscription(organizationId: string, reason: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_pause_subscription',
          organization_id: organizationId,
          reason,
          resume: true,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Subscription resumed');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Send a payment reminder to an organization with a past due subscription
   */
  sendPaymentReminder(organizationId: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_send_payment_reminder',
          organization_id: organizationId,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Payment reminder sent');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // COUPON MANAGEMENT
  // ============================================================================

  /**
   * Get all coupons
   */
  getAllCoupons(): Observable<CouponCode[]> {
    return from(
      this.supabase.client
        .from('coupon_codes')
        .select('*')
        .order('created_at', { ascending: false })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as CouponCode[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Create a new coupon
   */
  createCoupon(dto: CreateCouponDto): Observable<CouponCode> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_create_coupon',
          ...dto,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data.coupon as CouponCode;
      }),
      tap((coupon) => {
        this.notificationService.showSuccess(`Coupon "${coupon.code}" created`);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Deactivate a coupon
   */
  deactivateCoupon(couponId: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_deactivate_coupon',
          coupon_id: couponId,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Coupon deactivated');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // ANALYTICS
  // ============================================================================

  /**
   * Get super admin analytics dashboard data
   */
  getAnalytics(): Observable<SuperAdminAnalytics> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_get_analytics',
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as SuperAdminAnalytics;
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get audit log entries
   */
  getAuditLog(params?: {
    organizationId?: string;
    action?: string;
    limit?: number;
    offset?: number;
  }): Observable<SubscriptionAuditLog[]> {
    let query = this.supabase.client
      .from('subscription_audit_log')
      .select('*')
      .order('created_at', { ascending: false });

    if (params?.organizationId) {
      query = query.eq('organization_id', params.organizationId);
    }
    if (params?.action) {
      query = query.eq('action', params.action);
    }
    if (params?.limit) {
      query = query.limit(params.limit);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as SubscriptionAuditLog[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // SUPER ADMIN MANAGEMENT
  // ============================================================================

  /**
   * Get all super admins (requires manage_super_admins permission)
   */
  getAllSuperAdmins(): Observable<SuperAdmin[]> {
    if (!this.hasPermission('manage_super_admins')) {
      return throwError(() => new Error('Permission denied'));
    }

    return from(
      this.supabase.client.from('super_admins').select('*').order('created_at')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as SuperAdmin[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Add a new super admin
   */
  addSuperAdmin(
    userId: string,
    displayName: string,
    permissions: Partial<SuperAdminPermissions>
  ): Observable<SuperAdmin> {
    if (!this.hasPermission('manage_super_admins')) {
      return throwError(() => new Error('Permission denied'));
    }

    const defaultPermissions: SuperAdminPermissions = {
      view_organizations: true,
      manage_subscriptions: true,
      issue_refunds: false,
      create_coupons: true,
      view_analytics: true,
      manage_super_admins: false,
      manage_settings: false,
      manage_announcements: false,
      manage_email_templates: false,
      impersonate_users: false,
      view_error_logs: false,
      manage_plans: false,
      manage_api_keys: false,
      export_data: false,
      delete_organizations: false,
      bulk_operations: false,
    };

    return from(
      this.supabase.client
        .from('super_admins')
        .insert({
          user_id: userId,
          display_name: displayName,
          permissions: { ...defaultPermissions, ...permissions },
          created_by: this.supabase.userId,
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as SuperAdmin;
      }),
      tap(() => {
        this.notificationService.showSuccess('Super admin added');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Update super admin permissions
   */
  updateSuperAdminPermissions(
    adminId: string,
    permissions: Partial<SuperAdminPermissions>
  ): Observable<void> {
    if (!this.hasPermission('manage_super_admins')) {
      return throwError(() => new Error('Permission denied'));
    }

    return from(
      this.supabase.client
        .from('super_admins')
        .update({ permissions })
        .eq('id', adminId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Permissions updated');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Deactivate a super admin
   */
  deactivateSuperAdmin(adminId: string): Observable<void> {
    if (!this.hasPermission('manage_super_admins')) {
      return throwError(() => new Error('Permission denied'));
    }

    return from(
      this.supabase.client
        .from('super_admins')
        .update({ is_active: false })
        .eq('id', adminId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Super admin deactivated');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // PLATFORM SETTINGS
  // ============================================================================

  /**
   * Get all platform settings
   */
  getSettings(category?: string): Observable<PlatformSetting[]> {
    let query = this.supabase.client
      .from('platform_settings')
      .select('*')
      .order('key');

    if (category) {
      query = query.eq('category', category);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as PlatformSetting[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Update a platform setting
   */
  updateSetting(key: string, value: Record<string, unknown>): Observable<void> {
    return from(
      this.supabase.client
        .from('platform_settings')
        .update({ value, updated_by: this.supabase.userId, updated_at: new Date().toISOString() })
        .eq('key', key)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Setting updated');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Toggle maintenance mode
   */
  toggleMaintenanceMode(enabled: boolean, message?: string, scheduledEnd?: string): Observable<void> {
    return this.updateSetting('maintenance_mode', {
      enabled,
      message: message || '',
      scheduled_end: scheduledEnd || null,
    });
  }

  /**
   * Toggle signups
   */
  toggleSignups(enabled: boolean, requireInvitation?: boolean): Observable<void> {
    return this.updateSetting('signups_enabled', {
      enabled,
      require_invitation: requireInvitation ?? false,
    });
  }

  // ============================================================================
  // ANNOUNCEMENTS
  // ============================================================================

  /**
   * Get all announcements
   */
  getAnnouncements(params?: { active?: boolean; limit?: number }): Observable<PlatformAnnouncement[]> {
    let query = this.supabase.client
      .from('platform_announcements')
      .select('*')
      .order('created_at', { ascending: false });

    if (params?.active !== undefined) {
      query = query.eq('is_active', params.active);
    }
    if (params?.limit) {
      query = query.limit(params.limit);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as PlatformAnnouncement[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Create a new announcement
   */
  createAnnouncement(dto: CreateAnnouncementDto): Observable<PlatformAnnouncement> {
    return from(
      this.supabase.client
        .from('platform_announcements')
        .insert({
          ...dto,
          created_by: this.supabase.userId,
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as PlatformAnnouncement;
      }),
      tap(() => {
        this.notificationService.showSuccess('Announcement created');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Update an announcement
   */
  updateAnnouncement(id: string, dto: Partial<CreateAnnouncementDto>): Observable<void> {
    return from(
      this.supabase.client
        .from('platform_announcements')
        .update(dto)
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Announcement updated');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Delete an announcement
   */
  deleteAnnouncement(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from('platform_announcements')
        .delete()
        .eq('id', id)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Announcement deleted');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // EMAIL TEMPLATES
  // ============================================================================

  /**
   * Get all email templates
   */
  getEmailTemplates(): Observable<EmailTemplate[]> {
    return from(
      this.supabase.client
        .from('email_templates')
        .select('*')
        .order('name')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as EmailTemplate[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get a specific email template
   */
  getEmailTemplate(name: string): Observable<EmailTemplate> {
    return from(
      this.supabase.client
        .from('email_templates')
        .select('*')
        .eq('name', name)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as EmailTemplate;
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Update an email template
   */
  updateEmailTemplate(name: string, dto: UpdateEmailTemplateDto): Observable<void> {
    return from(
      this.supabase.client
        .from('email_templates')
        .update({
          ...dto,
          updated_by: this.supabase.userId,
          updated_at: new Date().toISOString(),
        })
        .eq('name', name)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Email template updated');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Send a test email using a template
   */
  sendTestEmail(templateName: string, recipientEmail: string, variables: Record<string, string>): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_send_test_email',
          template_name: templateName,
          recipient_email: recipientEmail,
          variables,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Test email sent');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // IMPERSONATION
  // ============================================================================

  /**
   * Search for users by email
   */
  searchUsers(email: string): Observable<Record<string, unknown>[]> {
    return from(
      this.supabase.client
        .from('users')
        .select(`
          id,
          email,
          full_name,
          role,
          organization_id,
          organizations:organization_id (name)
        `)
        .ilike('email', `%${email}%`)
        .limit(20)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []).map((u) => ({
          id: u.id,
          email: u.email,
          full_name: u.full_name,
          role: u.role,
          organization_name: Array.isArray(u.organizations)
            ? ((u.organizations as { name: string }[])[0]?.name || 'No Organization')
            : ((u.organizations as { name: string } | null)?.name || 'No Organization'),
        }));
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Start impersonating a user
   */
  startImpersonation(dto: StartImpersonationDto): Observable<ImpersonationSession> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_start_impersonation',
          ...dto,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data.session as ImpersonationSession;
      }),
      tap(() => {
        this.notificationService.showSuccess('Impersonation session started');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * End impersonation session
   */
  endImpersonation(sessionId: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_end_impersonation',
          session_id: sessionId,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Impersonation session ended');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get impersonation history
   */
  getImpersonationHistory(params?: { limit?: number; offset?: number }): Observable<ImpersonationSession[]> {
    let query = this.supabase.client
      .from('impersonation_sessions')
      .select('*')
      .order('started_at', { ascending: false });

    if (params?.limit) {
      query = query.limit(params.limit);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ImpersonationSession[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // ERROR LOGS
  // ============================================================================

  /**
   * Get error logs with filtering
   */
  getErrorLogs(params?: ErrorLogParams): Observable<PlatformErrorLog[]> {
    let query = this.supabase.client
      .from('platform_error_logs')
      .select('*')
      .order('created_at', { ascending: false });

    if (params?.error_type) {
      query = query.eq('error_type', params.error_type);
    }
    if (params?.severity) {
      query = query.eq('severity', params.severity);
    }
    if (params?.is_resolved !== undefined) {
      query = query.eq('is_resolved', params.is_resolved);
    }
    if (params?.date_from) {
      query = query.gte('created_at', params.date_from);
    }
    if (params?.date_to) {
      query = query.lte('created_at', params.date_to);
    }
    if (params?.limit) {
      query = query.limit(params.limit);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as PlatformErrorLog[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Resolve an error
   */
  resolveError(errorId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('platform_error_logs')
        .update({
          is_resolved: true,
          resolved_by: this.supabase.userId,
          resolved_at: new Date().toISOString(),
        })
        .eq('id', errorId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Error resolved');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get error statistics
   */
  getErrorStats(): Observable<ErrorStats> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_get_error_stats',
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as ErrorStats;
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================

  /**
   * Bulk extend trials for multiple organizations
   */
  bulkExtendTrials(organizationIds: string[], days: number, reason: string): Observable<BulkOperationResult> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_bulk_extend_trials',
          organization_ids: organizationIds,
          days,
          reason,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as BulkOperationResult;
      }),
      tap((result) => {
        this.notificationService.showSuccess(
          `Extended trials for ${result.success_count} organizations`
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Bulk apply discount to multiple organizations
   */
  bulkApplyDiscount(organizationIds: string[], discountPercent: number, reason: string): Observable<BulkOperationResult> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_bulk_apply_discount',
          organization_ids: organizationIds,
          discount_percent: discountPercent,
          reason,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data as BulkOperationResult;
      }),
      tap((result) => {
        this.notificationService.showSuccess(
          `Applied discount to ${result.success_count} organizations`
        );
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // INVOICE OPERATIONS
  // ============================================================================

  /**
   * Get all invoices across all organizations
   */
  getAllInvoices(statusFilter?: string): Observable<SubscriptionInvoice[]> {
    let query = this.supabase.client
      .from('subscription_invoices')
      .select(`
        *,
        organizations:organization_id (
          id,
          name
        )
      `)
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as SubscriptionInvoice[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Generate a manual invoice
   */
  generateInvoice(dto: GenerateInvoiceDto): Observable<SubscriptionInvoice> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_generate_invoice',
          ...dto,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data.invoice as SubscriptionInvoice;
      }),
      tap(() => {
        this.notificationService.showSuccess('Invoice generated');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Resend an invoice email
   */
  resendInvoice(invoiceId: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_resend_invoice',
          invoice_id: invoiceId,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Invoice resent');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Mark an invoice as paid manually
   */
  markInvoicePaid(dto: MarkInvoicePaidDto): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_mark_invoice_paid',
          ...dto,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Invoice marked as paid');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Void an invoice
   */
  voidInvoice(dto: VoidInvoiceDto): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_void_invoice',
          ...dto,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Invoice voided');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // ORGANIZATION OPERATIONS
  // ============================================================================

  /**
   * Delete an organization (destructive)
   */
  deleteOrganization(dto: DeleteOrganizationDto): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_delete_organization',
          ...dto,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Organization deleted');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Extend trial for an organization
   */
  extendTrial(dto: ExtendTrialDto): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_extend_trial',
          ...dto,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess(`Trial extended by ${dto.days} days`);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // API KEY MANAGEMENT
  // ============================================================================

  /**
   * Get all API keys across all organizations
   */
  getAllApiKeys(params?: { limit?: number; offset?: number }): Observable<ApiKey[]> {
    let query = this.supabase.client
      .from('api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (params?.limit) {
      query = query.limit(params.limit);
    }

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ApiKey[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Revoke an API key
   */
  revokeApiKey(keyId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('api_keys')
        .update({ is_active: false })
        .eq('id', keyId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('API key revoked');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // INTEGRATION HEALTH
  // ============================================================================

  /**
   * Get integration health status
   */
  getIntegrationHealth(): Observable<IntegrationHealth[]> {
    return from(
      this.supabase.client
        .from('integration_health')
        .select('*')
        .order('service_name')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as IntegrationHealth[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Run health check for an integration
   */
  runHealthCheck(serviceName: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_run_health_check',
          service_name: serviceName,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Health check completed');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // SCHEDULED TASKS
  // ============================================================================

  /**
   * Get all scheduled tasks
   */
  getScheduledTasks(): Observable<ScheduledTask[]> {
    return from(
      this.supabase.client
        .from('scheduled_tasks')
        .select('*')
        .order('name')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as ScheduledTask[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Toggle a scheduled task
   */
  toggleTask(taskName: string, enabled: boolean): Observable<void> {
    return from(
      this.supabase.client
        .from('scheduled_tasks')
        .update({ is_enabled: enabled })
        .eq('name', taskName)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess(`Task ${enabled ? 'enabled' : 'disabled'}`);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Run a scheduled task immediately
   */
  runTaskNow(taskName: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_run_task_now',
          task_name: taskName,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Task started');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // PLAN MANAGEMENT
  // ============================================================================

  /**
   * Get all subscription plans
   */
  getAllPlans(): Observable<SubscriptionPlan[]> {
    return from(
      this.supabase.client
        .from('subscription_plans')
        .select('*')
        .order('display_order')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as SubscriptionPlan[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Update a subscription plan
   * Also invalidates the subscription plans cache so pricing pages show fresh data
   */
  updatePlan(dto: UpdatePlanDto): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_update_plan',
          ...dto,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        // Invalidate the plans cache so pricing pages fetch fresh data
        this.subscriptionService.invalidatePlansCache();
        this.notificationService.showSuccess('Plan updated');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Toggle a plan feature
   * Also invalidates the subscription plans cache so pricing pages show fresh data
   */
  togglePlanFeature(planId: string, featureKey: string, enabled: boolean): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_toggle_plan_feature',
          plan_id: planId,
          feature_key: featureKey,
          enabled,
        },
      })
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        // Invalidate the plans cache so pricing pages fetch fresh data
        this.subscriptionService.invalidatePlansCache();
        this.notificationService.showSuccess('Plan feature updated');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // DATA EXPORT
  // ============================================================================

  /**
   * Get export history
   */
  getExportHistory(): Observable<Record<string, unknown>[]> {
    return from(
      this.supabase.client
        .from('data_export_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return data || [];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Export organizations data as CSV
   */
  exportOrganizationsData(): Observable<Blob> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_export_organizations',
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return new Blob([data.csv], { type: 'text/csv' });
      }),
      tap(() => {
        this.notificationService.showSuccess('Export ready');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Export billing data as CSV
   */
  exportBillingData(startDate?: string, endDate?: string): Observable<Blob> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_export_billing',
          start_date: startDate,
          end_date: endDate,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return new Blob([data.csv], { type: 'text/csv' });
      }),
      tap(() => {
        this.notificationService.showSuccess('Export ready');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Export audit logs as CSV
   */
  exportAuditLogs(params?: { startDate?: string; endDate?: string; action?: string }): Observable<Blob> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'admin_export_audit_logs',
          ...params,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return new Blob([data.csv], { type: 'text/csv' });
      }),
      tap(() => {
        this.notificationService.showSuccess('Export ready');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  private handleError(error: Error): Observable<never> {
    this.logger.error('Super admin service error', error);
    const message = error.message || 'An error occurred';
    this.notificationService.showError(message);
    return throwError(() => error);
  }
}
