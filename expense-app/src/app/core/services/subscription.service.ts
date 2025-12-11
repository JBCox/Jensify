import { Injectable, inject, OnDestroy } from '@angular/core';
import { BehaviorSubject, from, Observable, throwError, of, Subject } from 'rxjs';
import { catchError, map, tap, shareReplay, takeUntil } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { LoggerService } from './logger.service';
import { NotificationService } from './notification.service';
import { OrganizationService } from './organization.service';
import {
  SubscriptionPlan,
  OrganizationSubscription,
  SubscriptionInvoice,
  UsageLimits,
  CheckoutSessionResult,
  BillingCycle,
  PlanFeatures,
} from '../models/subscription.model';

/**
 * Service for managing organization subscriptions and billing
 * Handles plan management, checkout, invoices, and usage tracking
 */
@Injectable({
  providedIn: 'root',
})
export class SubscriptionService implements OnDestroy {
  private supabase = inject(SupabaseService);
  private logger = inject(LoggerService);
  private notificationService = inject(NotificationService);
  private organizationService = inject(OrganizationService);

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  /** Subject for cleanup on destroy */
  private destroy$ = new Subject<void>();

  // ============================================================================
  // OBSERVABLES
  // ============================================================================

  /** Available subscription plans (cached) */
  private plansSubject = new BehaviorSubject<SubscriptionPlan[]>([]);
  public readonly plans$ = this.plansSubject.asObservable();

  /** Current organization's subscription */
  private subscriptionSubject = new BehaviorSubject<OrganizationSubscription | null>(null);
  public readonly subscription$ = this.subscriptionSubject.asObservable();

  /** Current usage limits */
  private usageLimitsSubject = new BehaviorSubject<UsageLimits | null>(null);
  public readonly usageLimits$ = this.usageLimitsSubject.asObservable();

  /** Plans loading state */
  private plansLoadingSubject = new BehaviorSubject<boolean>(false);
  public readonly plansLoading$ = this.plansLoadingSubject.asObservable();

  /** Subscription loading state */
  private subscriptionLoadingSubject = new BehaviorSubject<boolean>(false);
  public readonly subscriptionLoading$ = this.subscriptionLoadingSubject.asObservable();

  /** Whether subscription has been loaded at least once (even if null/not found) */
  private subscriptionLoadedSubject = new BehaviorSubject<boolean>(false);
  public readonly subscriptionLoaded$ = this.subscriptionLoadedSubject.asObservable();

  /** Cache for plans */
  private plansCache$: Observable<SubscriptionPlan[]> | null = null;

  constructor() {
    // Load plans on initialization
    this.loadPlans();

    // Reload subscription when organization changes
    // Uses takeUntil for proper cleanup to prevent memory leaks
    this.organizationService.currentOrganization$
      .pipe(takeUntil(this.destroy$))
      .subscribe((org) => {
        if (org) {
          this.loadSubscription(org.id);
        } else {
          this.subscriptionSubject.next(null);
          this.usageLimitsSubject.next(null);
          this.subscriptionLoadedSubject.next(true); // Mark as loaded even when no org
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================================
  // PLAN MANAGEMENT
  // ============================================================================

  /**
   * Load available subscription plans
   */
  loadPlans(): void {
    if (this.plansCache$) {
      this.plansCache$.subscribe();
      return;
    }

    this.plansLoadingSubject.next(true);

    this.plansCache$ = from(
      this.supabase.client
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .eq('is_public', true)
        .order('display_order')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as SubscriptionPlan[];
      }),
      tap((plans) => {
        this.plansSubject.next(plans);
        this.plansLoadingSubject.next(false);
      }),
      shareReplay(1),
      catchError((error) => {
        this.logger.error('Failed to load plans', error);
        this.plansLoadingSubject.next(false);
        return of([]);
      })
    );

    this.plansCache$.subscribe();
  }

  /**
   * Get all available plans
   * @param forceRefresh - If true, bypasses cache and fetches fresh data
   */
  getPlans(forceRefresh = false): Observable<SubscriptionPlan[]> {
    if (!forceRefresh && this.plansSubject.getValue().length > 0) {
      return of(this.plansSubject.getValue());
    }

    return from(
      this.supabase.client
        .from('subscription_plans')
        .select('*')
        .eq('is_active', true)
        .eq('is_public', true)
        .order('display_order')
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as SubscriptionPlan[];
      }),
      tap((plans) => this.plansSubject.next(plans)),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Invalidate the plans cache
   * Call this after admin updates to ensure fresh data is fetched
   */
  invalidatePlansCache(): void {
    this.plansSubject.next([]);
    this.plansCache$ = null;
  }

  /**
   * Refresh plans from the database
   * Clears cache and fetches fresh data
   */
  refreshPlans(): Observable<SubscriptionPlan[]> {
    this.invalidatePlansCache();
    return this.getPlans(true);
  }

  /**
   * Get a specific plan by ID
   */
  getPlanById(planId: string): Observable<SubscriptionPlan> {
    return from(
      this.supabase.client
        .from('subscription_plans')
        .select('*')
        .eq('id', planId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Plan not found');
        return data as SubscriptionPlan;
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get plan by name (free, starter, etc.)
   */
  getPlanByName(name: string): Observable<SubscriptionPlan> {
    return from(
      this.supabase.client
        .from('subscription_plans')
        .select('*')
        .eq('name', name)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Plan not found');
        return data as SubscriptionPlan;
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // SUBSCRIPTION MANAGEMENT
  // ============================================================================

  /**
   * Load current organization's subscription
   */
  loadSubscription(organizationId: string): void {
    this.subscriptionLoadingSubject.next(true);

    from(
      this.supabase.client
        .from('organization_subscriptions')
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq('organization_id', organizationId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
        return data as OrganizationSubscription | null;
      }),
      tap((subscription) => {
        this.subscriptionSubject.next(subscription);
        if (subscription) {
          this.updateUsageLimits(subscription);
        }
        this.subscriptionLoadingSubject.next(false);
        this.subscriptionLoadedSubject.next(true);
      }),
      catchError((error) => {
        this.logger.error('Failed to load subscription', error);
        this.subscriptionLoadingSubject.next(false);
        this.subscriptionLoadedSubject.next(true);
        return of(null);
      })
    ).subscribe();
  }

  /**
   * Get current subscription
   */
  getSubscription(organizationId: string): Observable<OrganizationSubscription | null> {
    return from(
      this.supabase.client
        .from('organization_subscriptions')
        .select(`
          *,
          plan:subscription_plans(*)
        `)
        .eq('organization_id', organizationId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error && error.code !== 'PGRST116') throw error;
        return data as OrganizationSubscription | null;
      }),
      tap((subscription) => {
        this.subscriptionSubject.next(subscription);
        if (subscription) {
          this.updateUsageLimits(subscription);
        }
        this.subscriptionLoadingSubject.next(false);
        this.subscriptionLoadedSubject.next(true);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Create Stripe checkout session for subscription
   */
  createCheckoutSession(
    organizationId: string,
    planId: string,
    billingCycle: BillingCycle = 'monthly'
  ): Observable<CheckoutSessionResult> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'create_checkout_session',
          organization_id: organizationId,
          plan_id: planId,
          billing_cycle: billingCycle,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('No checkout session returned');
        return data as CheckoutSessionResult;
      }),
      tap((result) => {
        this.logger.info('Checkout session created', 'SubscriptionService', { sessionId: result.session_id });
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Open Stripe customer portal for self-service billing management
   */
  openCustomerPortal(organizationId: string): Observable<{ url: string }> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'create_customer_portal',
          organization_id: organizationId,
        },
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data?.url) throw new Error('No portal URL returned');
        return { url: data.url };
      }),
      tap((result) => {
        // Open portal in new tab
        window.open(result.url, '_blank');
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Cancel subscription at period end
   */
  cancelSubscription(organizationId: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'cancel_subscription',
          organization_id: organizationId,
        },
      })
    ).pipe(
      map(({ data: _data, error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess(
          'Subscription will be canceled at the end of the billing period'
        );
        this.loadSubscription(organizationId);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Resume a canceled subscription
   */
  resumeSubscription(organizationId: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'resume_subscription',
          organization_id: organizationId,
        },
      })
    ).pipe(
      map(({ data: _data, error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Subscription resumed successfully');
        this.loadSubscription(organizationId);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Change subscription plan (upgrade/downgrade)
   */
  changePlan(organizationId: string, newPlanId: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'change_plan',
          organization_id: organizationId,
          new_plan_id: newPlanId,
        },
      })
    ).pipe(
      map(({ data: _data, error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Plan changed successfully');
        this.loadSubscription(organizationId);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Apply a coupon code
   */
  applyCoupon(organizationId: string, couponCode: string): Observable<void> {
    return from(
      this.supabase.client.functions.invoke('stripe-billing', {
        body: {
          action: 'apply_coupon',
          organization_id: organizationId,
          coupon_code: couponCode,
        },
      })
    ).pipe(
      map(({ data: _data, error }) => {
        if (error) throw error;
        return;
      }),
      tap(() => {
        this.notificationService.showSuccess('Coupon applied successfully');
        this.loadSubscription(organizationId);
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // INVOICES
  // ============================================================================

  /**
   * Get invoice history for organization
   */
  getInvoices(organizationId: string, limit = 10): Observable<SubscriptionInvoice[]> {
    return from(
      this.supabase.client
        .from('subscription_invoices')
        .select('*')
        .eq('organization_id', organizationId)
        .order('invoice_date', { ascending: false })
        .limit(limit)
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as SubscriptionInvoice[];
      }),
      catchError(this.handleError.bind(this))
    );
  }

  /**
   * Get a specific invoice
   */
  getInvoiceById(invoiceId: string): Observable<SubscriptionInvoice> {
    return from(
      this.supabase.client
        .from('subscription_invoices')
        .select('*')
        .eq('id', invoiceId)
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Invoice not found');
        return data as SubscriptionInvoice;
      }),
      catchError(this.handleError.bind(this))
    );
  }

  // ============================================================================
  // USAGE TRACKING
  // ============================================================================

  /**
   * Update usage limits based on subscription
   */
  private updateUsageLimits(subscription: OrganizationSubscription): void {
    const plan = subscription.plan;
    if (!plan) return;

    const features = plan.features as PlanFeatures;
    const receiptLimit = features.receipts_per_month;
    const userLimit = plan.max_users;

    const limits: UsageLimits = {
      receipt_limit: receiptLimit,
      receipts_used: subscription.current_month_receipts,
      receipts_remaining: receiptLimit !== null
        ? Math.max(0, receiptLimit - subscription.current_month_receipts)
        : null,
      user_limit: userLimit,
      users_current: subscription.current_user_count,
      at_user_limit: userLimit !== null && subscription.current_user_count >= userLimit,
      at_receipt_limit: receiptLimit !== null &&
        subscription.current_month_receipts >= receiptLimit,
    };

    this.usageLimitsSubject.next(limits);
  }

  /**
   * Get current usage limits
   */
  getUsageLimits(): UsageLimits | null {
    return this.usageLimitsSubject.getValue();
  }

  /**
   * Check if user can upload more receipts
   */
  canUploadReceipt(): Observable<{ allowed: boolean; remaining?: number; limit?: number }> {
    const limits = this.usageLimitsSubject.getValue();

    if (!limits) {
      // No subscription data, assume free tier defaults
      return of({ allowed: true });
    }

    if (limits.receipt_limit === null) {
      // Unlimited
      return of({ allowed: true });
    }

    return of({
      allowed: !limits.at_receipt_limit,
      remaining: limits.receipts_remaining ?? 0,
      limit: limits.receipt_limit,
    });
  }

  /**
   * Check if organization can add more users
   */
  canAddUser(): Observable<{ allowed: boolean; remaining?: number; limit?: number }> {
    const limits = this.usageLimitsSubject.getValue();

    if (!limits) {
      return of({ allowed: true });
    }

    if (limits.user_limit === null) {
      return of({ allowed: true });
    }

    return of({
      allowed: !limits.at_user_limit,
      remaining: limits.user_limit - limits.users_current,
      limit: limits.user_limit,
    });
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  /**
   * Get the current plan name
   */
  getCurrentPlanName(): string {
    const subscription = this.subscriptionSubject.getValue();
    return subscription?.plan?.name || 'free';
  }

  /**
   * Check if organization is on a paid plan
   */
  isPaidPlan(): boolean {
    const planName = this.getCurrentPlanName();
    return planName !== 'free';
  }

  /**
   * Get price display string
   */
  formatPrice(cents: number, cycle: BillingCycle = 'monthly'): string {
    const dollars = cents / 100;
    const suffix = cycle === 'annual' ? '/year' : '/month';
    return `$${dollars.toFixed(2)}${suffix}`;
  }

  /**
   * Calculate annual savings percentage
   */
  getAnnualSavings(plan: SubscriptionPlan): number {
    if (plan.monthly_price_cents === 0) return 0;
    const monthlyTotal = plan.monthly_price_cents * 12;
    const annualTotal = plan.annual_price_cents;
    return Math.round(((monthlyTotal - annualTotal) / monthlyTotal) * 100);
  }

  /**
   * Error handler
   */
  private handleError(error: Error): Observable<never> {
    this.logger.error('Subscription service error', error);
    const message = error.message || 'An error occurred';
    this.notificationService.showError(message);
    return throwError(() => error);
  }
}
