import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { SubscriptionService } from './subscription.service';
import { SupabaseService } from './supabase.service';
import { LoggerService } from './logger.service';
import { NotificationService } from './notification.service';
import { OrganizationService } from './organization.service';
import {
  SubscriptionPlan,
  OrganizationSubscription,
  PlanFeatures,
} from '../models/subscription.model';
import { Organization } from '../models/organization.model';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let mockSupabaseService: jasmine.SpyObj<SupabaseService>;
  let mockLoggerService: jasmine.SpyObj<LoggerService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockOrganizationService: jasmine.SpyObj<OrganizationService>;
  let currentOrganizationSubject: BehaviorSubject<Organization | null>;

  const mockPlanFeatures: PlanFeatures = {
    receipts_per_month: 100,
    stripe_payouts_enabled: true,
    api_access_enabled: true,
    mileage_gps_enabled: true,
    multi_level_approval: true,
    support_level: 'email',
  };

  const mockPlan: SubscriptionPlan = {
    id: 'plan-123',
    name: 'starter',
    display_name: 'Starter',
    description: 'For small teams',
    monthly_price_cents: 999,
    annual_price_cents: 9990,
    min_users: 1,
    max_users: 10,
    features: mockPlanFeatures,
    is_active: true,
    is_public: true,
    display_order: 1,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const mockSubscription: OrganizationSubscription = {
    id: 'sub-123',
    organization_id: 'org-123',
    plan_id: 'plan-123',
    plan: mockPlan,
    status: 'active',
    billing_cycle: 'monthly',
    current_period_start: '2024-01-01T00:00:00Z',
    current_period_end: '2024-02-01T00:00:00Z',
    current_month_receipts: 50,
    current_user_count: 5,
    cancel_at_period_end: false,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const mockOrganization: Organization = {
    id: 'org-123',
    name: 'Test Organization',
    settings: {} as any,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    currentOrganizationSubject = new BehaviorSubject<Organization | null>(null);

    mockSupabaseService = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from'),
        functions: {
          invoke: jasmine.createSpy('invoke'),
        },
      },
    });

    mockLoggerService = jasmine.createSpyObj('LoggerService', [
      'debug',
      'info',
      'warn',
      'error',
    ]);

    mockNotificationService = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError',
      'showWarning',
    ]);

    mockOrganizationService = jasmine.createSpyObj(
      'OrganizationService',
      [],
      {
        currentOrganization$: currentOrganizationSubject.asObservable(),
      }
    );

    TestBed.configureTestingModule({
      providers: [
        SubscriptionService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: OrganizationService, useValue: mockOrganizationService },
      ],
    });

    // Setup default mock responses for plans
    const plansResponse = { data: [mockPlan], error: null };
    const orderSpy = jasmine.createSpy('order').and.returnValue(Promise.resolve(plansResponse));
    const isPublicEqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
    const isActiveEqSpy = jasmine.createSpy('eq').and.returnValue({ eq: isPublicEqSpy });
    const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: isActiveEqSpy });
    (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

    service = TestBed.inject(SubscriptionService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Plan Management', () => {
    it('should load plans on initialization', (done) => {
      service.plans$.subscribe((plans) => {
        if (plans.length > 0) {
          expect(plans[0].name).toBe('starter');
          done();
        }
      });
    });

    it('should return cached plans when available', (done) => {
      // First call loads plans
      service.getPlans().subscribe(() => {
        // Reset spy to track new calls
        (mockSupabaseService.client.from as jasmine.Spy).calls.reset();

        // Second call should use cache
        service.getPlans().subscribe((plans) => {
          expect(plans.length).toBe(1);
          expect(mockSupabaseService.client.from).not.toHaveBeenCalled();
          done();
        });
      });
    });

    it('should force refresh plans when requested', (done) => {
      const plansResponse = { data: [mockPlan], error: null };
      const orderSpy = jasmine.createSpy('order').and.returnValue(Promise.resolve(plansResponse));
      const isPublicEqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const isActiveEqSpy = jasmine.createSpy('eq').and.returnValue({ eq: isPublicEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: isActiveEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getPlans(true).subscribe((plans) => {
        expect(plans.length).toBe(1);
        expect(mockSupabaseService.client.from).toHaveBeenCalledWith('subscription_plans');
        done();
      });
    });

    it('should invalidate plans cache', () => {
      // First verify that invalidation resets the plans cache
      service.invalidatePlansCache();

      // After invalidation, the plansCache$ should be null and plansSubject should be empty
      expect(service['plansCache$']).toBeNull();
      expect(service['plansSubject'].getValue().length).toBe(0);
    });

    it('should get plan by ID', (done) => {
      const singleResponse = { data: mockPlan, error: null };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve(singleResponse));
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getPlanById('plan-123').subscribe((plan) => {
        expect(plan.id).toBe('plan-123');
        expect(plan.name).toBe('starter');
        done();
      });
    });

    it('should handle plan not found error', (done) => {
      const singleResponse = { data: null, error: null };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve(singleResponse));
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getPlanById('invalid-id').subscribe({
        error: (err) => {
          expect(err.message).toBe('Plan not found');
          done();
        },
      });
    });
  });

  describe('Subscription Management', () => {
    it('should load subscription when organization changes', (done) => {
      const subscriptionResponse = { data: mockSubscription, error: null };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve(subscriptionResponse));
      const orgEqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentOrganizationSubject.next(mockOrganization);

      setTimeout(() => {
        service.subscription$.subscribe((subscription) => {
          if (subscription) {
            expect(subscription.id).toBe('sub-123');
            expect(subscription.status).toBe('active');
            done();
          }
        });
      }, 100);
    });

    it('should clear subscription when organization is cleared', (done) => {
      currentOrganizationSubject.next(null);

      setTimeout(() => {
        service.subscription$.subscribe((subscription) => {
          expect(subscription).toBeNull();
          done();
        });
      }, 100);
    });

    it('should create checkout session', (done) => {
      const checkoutResponse = {
        data: { session_id: 'cs_123', url: 'https://checkout.stripe.com/123' },
        error: null,
      };
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve(checkoutResponse)
      );

      service.createCheckoutSession('org-123', 'plan-123', 'monthly').subscribe((result) => {
        expect(result.session_id).toBe('cs_123');
        expect(result.url).toBe('https://checkout.stripe.com/123');
        expect(mockSupabaseService.client.functions.invoke).toHaveBeenCalledWith(
          'stripe-billing',
          {
            body: {
              action: 'create_checkout_session',
              organization_id: 'org-123',
              plan_id: 'plan-123',
              billing_cycle: 'monthly',
            },
          }
        );
        done();
      });
    });

    it('should cancel subscription', (done) => {
      const cancelResponse = { data: {}, error: null };
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve(cancelResponse)
      );

      // Setup for loadSubscription call after cancel
      const subscriptionResponse = { data: { ...mockSubscription, cancel_at_period_end: true }, error: null };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve(subscriptionResponse));
      const orgEqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.cancelSubscription('org-123').subscribe(() => {
        expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
          'Subscription will be canceled at the end of the billing period'
        );
        done();
      });
    });

    it('should resume subscription', (done) => {
      const resumeResponse = { data: {}, error: null };
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve(resumeResponse)
      );

      // Setup for loadSubscription call after resume
      const subscriptionResponse = { data: mockSubscription, error: null };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve(subscriptionResponse));
      const orgEqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.resumeSubscription('org-123').subscribe(() => {
        expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
          'Subscription resumed successfully'
        );
        done();
      });
    });

    it('should change plan', (done) => {
      const changePlanResponse = { data: {}, error: null };
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve(changePlanResponse)
      );

      // Setup for loadSubscription call after change
      const subscriptionResponse = { data: mockSubscription, error: null };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve(subscriptionResponse));
      const orgEqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.changePlan('org-123', 'new-plan-123').subscribe(() => {
        expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
          'Plan changed successfully'
        );
        done();
      });
    });

    it('should apply coupon', (done) => {
      const couponResponse = { data: {}, error: null };
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve(couponResponse)
      );

      // Setup for loadSubscription call after coupon
      const subscriptionResponse = { data: mockSubscription, error: null };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve(subscriptionResponse));
      const orgEqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.applyCoupon('org-123', 'WELCOME20').subscribe(() => {
        expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
          'Coupon applied successfully'
        );
        done();
      });
    });
  });

  describe('Usage Limits', () => {
    beforeEach((done) => {
      const subscriptionResponse = { data: mockSubscription, error: null };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve(subscriptionResponse));
      const orgEqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentOrganizationSubject.next(mockOrganization);
      setTimeout(done, 100);
    });

    it('should calculate usage limits correctly', (done) => {
      service.usageLimits$.subscribe((limits) => {
        if (limits) {
          expect(limits.receipt_limit).toBe(100);
          expect(limits.receipts_used).toBe(50);
          expect(limits.receipts_remaining).toBe(50);
          expect(limits.user_limit).toBe(10);
          expect(limits.users_current).toBe(5);
          expect(limits.at_receipt_limit).toBe(false);
          expect(limits.at_user_limit).toBe(false);
          done();
        }
      });
    });

    it('should return usage limits synchronously', () => {
      const limits = service.getUsageLimits();
      expect(limits).toBeTruthy();
      expect(limits?.receipt_limit).toBe(100);
    });

    it('should check if user can upload receipt', (done) => {
      service.canUploadReceipt().subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });

    it('should check if organization can add user', (done) => {
      service.canAddUser().subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });
  });

  describe('Helper Methods', () => {
    it('should get current plan name', () => {
      expect(service.getCurrentPlanName()).toBe('free'); // No subscription loaded
    });

    it('should check if on paid plan', () => {
      expect(service.isPaidPlan()).toBe(false); // Free tier
    });

    it('should format price correctly', () => {
      expect(service.formatPrice(999, 'monthly')).toBe('$9.99/month');
      expect(service.formatPrice(9990, 'annual')).toBe('$99.90/year');
    });

    it('should calculate annual savings', () => {
      const savings = service.getAnnualSavings(mockPlan);
      expect(savings).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Invoice Management', () => {
    it('should get invoices for organization', (done) => {
      const mockInvoices = [
        {
          id: 'inv-123',
          organization_id: 'org-123',
          amount_cents: 999,
          status: 'paid',
        },
      ];
      const limitSpy = jasmine.createSpy('limit').and.returnValue(Promise.resolve({ data: mockInvoices, error: null }));
      const orderSpy = jasmine.createSpy('order').and.returnValue({ limit: limitSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getInvoices('org-123').subscribe((invoices) => {
        expect(invoices.length).toBe(1);
        expect(invoices[0].id).toBe('inv-123');
        done();
      });
    });

    it('should get invoice by ID', (done) => {
      const mockInvoice = {
        id: 'inv-123',
        organization_id: 'org-123',
        amount_cents: 999,
        status: 'paid',
      };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: mockInvoice, error: null }));
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getInvoiceById('inv-123').subscribe((invoice) => {
        expect(invoice.id).toBe('inv-123');
        done();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle Supabase errors gracefully', (done) => {
      const errorResponse = { data: null, error: { message: 'Database error' } };
      const singleSpy = jasmine.createSpy('single').and.returnValue(Promise.resolve(errorResponse));
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getPlanById('plan-123').subscribe({
        error: (err) => {
          expect(err.message).toBe('Database error');
          expect(mockLoggerService.error).toHaveBeenCalled();
          expect(mockNotificationService.showError).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should handle Edge Function errors', (done) => {
      const errorResponse = { data: null, error: { message: 'Stripe API error' } };
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve(errorResponse)
      );

      service.createCheckoutSession('org-123', 'plan-123').subscribe({
        error: (err) => {
          expect(err.message).toBe('Stripe API error');
          done();
        },
      });
    });
  });

  describe('Cleanup', () => {
    it('should clean up subscriptions on destroy', () => {
      const destroySpy = spyOn(service['destroy$'], 'next');
      const completeSpy = spyOn(service['destroy$'], 'complete');

      service.ngOnDestroy();

      expect(destroySpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });
});
