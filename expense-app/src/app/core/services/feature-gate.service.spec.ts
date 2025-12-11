import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { FeatureGateService, FeatureFlag } from './feature-gate.service';
import { SubscriptionService } from './subscription.service';
import { LoggerService } from './logger.service';
import {
  OrganizationSubscription,
  SubscriptionPlan,
  UsageLimits,
  PlanFeatures,
} from '../models/subscription.model';

describe('FeatureGateService', () => {
  let service: FeatureGateService;
  let mockSubscriptionService: jasmine.SpyObj<SubscriptionService>;
  let mockLoggerService: jasmine.SpyObj<LoggerService>;
  let subscriptionSubject: BehaviorSubject<OrganizationSubscription | null>;
  let usageLimitsSubject: BehaviorSubject<UsageLimits | null>;

  const mockPlanFeatures: PlanFeatures = {
    receipts_per_month: 100,
    stripe_payouts_enabled: true,
    api_access_enabled: true,
    mileage_gps_enabled: true,
    multi_level_approval: true,
    support_level: 'email',
  };

  const mockFreePlanFeatures: PlanFeatures = {
    receipts_per_month: 20,
    stripe_payouts_enabled: true, // All plans have full features now
    api_access_enabled: true,
    mileage_gps_enabled: true,
    multi_level_approval: true,
    support_level: 'community',
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

  const mockUsageLimits: UsageLimits = {
    receipt_limit: 100,
    receipts_used: 50,
    receipts_remaining: 50,
    user_limit: 10,
    users_current: 5,
    at_receipt_limit: false,
    at_user_limit: false,
  };

  beforeEach(() => {
    subscriptionSubject = new BehaviorSubject<OrganizationSubscription | null>(null);
    usageLimitsSubject = new BehaviorSubject<UsageLimits | null>(null);

    mockSubscriptionService = jasmine.createSpyObj(
      'SubscriptionService',
      ['getCurrentPlanName'],
      {
        subscription$: subscriptionSubject.asObservable(),
        usageLimits$: usageLimitsSubject.asObservable(),
      }
    );
    mockSubscriptionService.getCurrentPlanName.and.returnValue('free');

    mockLoggerService = jasmine.createSpyObj('LoggerService', [
      'debug',
      'info',
      'warn',
      'error',
    ]);

    TestBed.configureTestingModule({
      providers: [
        FeatureGateService,
        { provide: SubscriptionService, useValue: mockSubscriptionService },
        { provide: LoggerService, useValue: mockLoggerService },
      ],
    });

    service = TestBed.inject(FeatureGateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Plan Features Observable', () => {
    it('should return free tier features when no subscription', (done) => {
      subscriptionSubject.next(null);

      service.planFeatures$.subscribe((features) => {
        expect(features.receipts_per_month).toBe(10);
        expect(features.support_level).toBe('community');
        done();
      });
    });

    it('should return subscription plan features when subscription exists', (done) => {
      subscriptionSubject.next(mockSubscription);

      service.planFeatures$.subscribe((features) => {
        expect(features.receipts_per_month).toBe(100);
        expect(features.stripe_payouts_enabled).toBe(true);
        done();
      });
    });
  });

  describe('isPaidPlan$', () => {
    it('should return false for free plan', (done) => {
      const freePlan: SubscriptionPlan = { ...mockPlan, name: 'free' };
      const freeSub: OrganizationSubscription = { ...mockSubscription, plan: freePlan };
      subscriptionSubject.next(freeSub);

      service.isPaidPlan$.subscribe((isPaid) => {
        expect(isPaid).toBe(false);
        done();
      });
    });

    it('should return true for starter plan', (done) => {
      subscriptionSubject.next(mockSubscription);

      service.isPaidPlan$.subscribe((isPaid) => {
        expect(isPaid).toBe(true);
        done();
      });
    });

    it('should return false when no subscription', (done) => {
      subscriptionSubject.next(null);

      service.isPaidPlan$.subscribe((isPaid) => {
        expect(isPaid).toBe(false);
        done();
      });
    });
  });

  describe('Feature Checks', () => {
    beforeEach(() => {
      subscriptionSubject.next(mockSubscription);
    });

    it('should allow Stripe payouts when enabled', (done) => {
      service.canUseStripePayouts().subscribe((allowed) => {
        expect(allowed).toBe(true);
        done();
      });
    });

    it('should allow API access when enabled', (done) => {
      service.canUseApiAccess().subscribe((allowed) => {
        expect(allowed).toBe(true);
        done();
      });
    });

    it('should allow mileage GPS when enabled', (done) => {
      service.canUseMileageGps().subscribe((allowed) => {
        expect(allowed).toBe(true);
        done();
      });
    });

    it('should allow multi-level approval when enabled', (done) => {
      service.canUseMultiLevelApproval().subscribe((allowed) => {
        expect(allowed).toBe(true);
        done();
      });
    });
  });

  describe('canUseFeature()', () => {
    beforeEach(() => {
      subscriptionSubject.next(mockSubscription);
    });

    it('should allow stripe_payouts feature', (done) => {
      service.canUseFeature('stripe_payouts').subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });

    it('should allow api_access feature', (done) => {
      service.canUseFeature('api_access').subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });

    it('should allow mileage_gps feature', (done) => {
      service.canUseFeature('mileage_gps').subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });

    it('should deny unlimited_receipts when limit exists', (done) => {
      service.canUseFeature('unlimited_receipts').subscribe((result) => {
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('Unlimited receipts');
        expect(result.upgrade_to).toBe('starter');
        done();
      });
    });

    it('should allow unlimited_receipts when no limit', (done) => {
      const unlimitedPlan = {
        ...mockPlan,
        features: { ...mockPlanFeatures, receipts_per_month: null },
      };
      const unlimitedSub = { ...mockSubscription, plan: unlimitedPlan };
      subscriptionSubject.next(unlimitedSub);

      service.canUseFeature('unlimited_receipts').subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });
  });

  describe('Receipt Limits', () => {
    it('should allow receipt upload when under limit', (done) => {
      subscriptionSubject.next(mockSubscription);
      usageLimitsSubject.next(mockUsageLimits);

      service.canUploadReceipt().subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });

    it('should deny receipt upload when at limit', (done) => {
      subscriptionSubject.next(mockSubscription);
      usageLimitsSubject.next({
        ...mockUsageLimits,
        at_receipt_limit: true,
      });

      service.canUploadReceipt().subscribe((result) => {
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('monthly limit');
        done();
      });
    });

    it('should allow receipt upload when unlimited', (done) => {
      const unlimitedPlan = {
        ...mockPlan,
        features: { ...mockPlanFeatures, receipts_per_month: null },
      };
      const unlimitedSub = { ...mockSubscription, plan: unlimitedPlan };
      subscriptionSubject.next(unlimitedSub);
      usageLimitsSubject.next(null);

      service.canUploadReceipt().subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });

    it('should get receipt limit', (done) => {
      subscriptionSubject.next(mockSubscription);

      service.getReceiptLimit().subscribe((limit) => {
        expect(limit).toBe(100);
        done();
      });
    });

    it('should get remaining receipts', (done) => {
      usageLimitsSubject.next(mockUsageLimits);

      service.getRemainingReceipts().subscribe((remaining) => {
        expect(remaining).toBe(50);
        done();
      });
    });

    it('should get receipt usage info', (done) => {
      usageLimitsSubject.next(mockUsageLimits);

      service.getReceiptUsage().subscribe((usage) => {
        expect(usage.used).toBe(50);
        expect(usage.limit).toBe(100);
        expect(usage.remaining).toBe(50);
        expect(usage.percentage).toBe(50);
        done();
      });
    });
  });

  describe('User Limits', () => {
    it('should allow adding user when under limit', (done) => {
      usageLimitsSubject.next(mockUsageLimits);

      service.canAddUser().subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });

    it('should deny adding user when at limit', (done) => {
      usageLimitsSubject.next({
        ...mockUsageLimits,
        at_user_limit: true,
      });

      service.canAddUser().subscribe((result) => {
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('user limit');
        done();
      });
    });

    it('should allow adding user when unlimited', (done) => {
      usageLimitsSubject.next({
        ...mockUsageLimits,
        user_limit: null,
      });

      service.canAddUser().subscribe((result) => {
        expect(result.allowed).toBe(true);
        done();
      });
    });

    it('should get user limit', (done) => {
      subscriptionSubject.next(mockSubscription);

      service.getUserLimit().subscribe((limit) => {
        expect(limit).toBe(10);
        done();
      });
    });

    it('should get user usage info', (done) => {
      usageLimitsSubject.next(mockUsageLimits);

      service.getUserUsage().subscribe((usage) => {
        expect(usage.current).toBe(5);
        expect(usage.limit).toBe(10);
        expect(usage.remaining).toBe(5);
        expect(usage.percentage).toBe(50);
        done();
      });
    });
  });

  describe('Upgrade Recommendations', () => {
    it('should recommend upgrade when at receipt limit', (done) => {
      subscriptionSubject.next(mockSubscription);
      usageLimitsSubject.next({
        ...mockUsageLimits,
        at_receipt_limit: true,
      });

      service.getUpgradeRecommendation().subscribe((recommendation) => {
        expect(recommendation?.shouldUpgrade).toBe(true);
        expect(recommendation?.reason).toContain('receipt limit');
        done();
      });
    });

    it('should recommend upgrade when at user limit', (done) => {
      subscriptionSubject.next(mockSubscription);
      usageLimitsSubject.next({
        ...mockUsageLimits,
        at_user_limit: true,
      });

      service.getUpgradeRecommendation().subscribe((recommendation) => {
        expect(recommendation?.shouldUpgrade).toBe(true);
        expect(recommendation?.reason).toContain('user limit');
        done();
      });
    });

    it('should recommend upgrade when approaching receipt limit (80%)', (done) => {
      subscriptionSubject.next(mockSubscription);
      usageLimitsSubject.next({
        ...mockUsageLimits,
        receipts_used: 85,
        receipt_limit: 100,
      });

      service.getUpgradeRecommendation().subscribe((recommendation) => {
        expect(recommendation?.shouldUpgrade).toBe(true);
        expect(recommendation?.reason).toContain('approaching');
        done();
      });
    });

    it('should not recommend upgrade for enterprise plan', (done) => {
      const enterprisePlan: SubscriptionPlan = { ...mockPlan, name: 'enterprise' };
      const enterpriseSub: OrganizationSubscription = { ...mockSubscription, plan: enterprisePlan };
      subscriptionSubject.next(enterpriseSub);
      usageLimitsSubject.next(mockUsageLimits);

      service.getUpgradeRecommendation().subscribe((recommendation) => {
        expect(recommendation).toBeNull();
        done();
      });
    });

    it('should return null when no subscription', (done) => {
      subscriptionSubject.next(null);
      usageLimitsSubject.next(null);

      service.getUpgradeRecommendation().subscribe((recommendation) => {
        expect(recommendation).toBeNull();
        done();
      });
    });
  });

  describe('Feature Limit Messages', () => {
    it('should return message for stripe_payouts', () => {
      const message = service.getFeatureLimitMessage('stripe_payouts');
      expect(message).toContain('Stripe ACH payouts');
    });

    it('should return message for api_access', () => {
      const message = service.getFeatureLimitMessage('api_access');
      expect(message).toContain('API access');
    });

    it('should return message for mileage_gps', () => {
      const message = service.getFeatureLimitMessage('mileage_gps');
      expect(message).toContain('GPS mileage tracking');
    });

    it('should return message for unlimited_receipts', () => {
      const message = service.getFeatureLimitMessage('unlimited_receipts');
      expect(message).toContain('Upgrade');
    });

    it('should return message for priority_support', () => {
      const message = service.getFeatureLimitMessage('priority_support');
      expect(message).toContain('Team');
    });
  });

  describe('Edge Cases', () => {
    it('should handle null usage limits gracefully', (done) => {
      subscriptionSubject.next(mockSubscription);
      usageLimitsSubject.next(null);

      service.canUploadReceipt().subscribe((result) => {
        // When no limits data, should allow
        expect(result.allowed).toBe(true);
        done();
      });
    });

    it('should handle missing plan features gracefully', (done) => {
      subscriptionSubject.next(null);

      service.planFeatures$.subscribe((features) => {
        // Should return free tier defaults
        expect(features).toBeTruthy();
        expect(features.receipts_per_month).toBe(10);
        done();
      });
    });
  });
});
