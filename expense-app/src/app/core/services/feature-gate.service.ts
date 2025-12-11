import { Injectable, inject } from '@angular/core';
import { Observable, combineLatest } from 'rxjs';
import { map, distinctUntilChanged, shareReplay } from 'rxjs/operators';
import { SubscriptionService } from './subscription.service';
import { LoggerService } from './logger.service';
import { PlanFeatures, FeatureAccessResult } from '../models/subscription.model';

/**
 * Feature flags that can be checked
 */
export type FeatureFlag =
  | 'stripe_payouts'
  | 'api_access'
  | 'mileage_gps'
  | 'multi_level_approval'
  | 'unlimited_receipts'
  | 'priority_support';

/**
 * Service for checking feature access based on subscription tier
 * Enforces Free tier limits and feature restrictions
 */
@Injectable({
  providedIn: 'root',
})
export class FeatureGateService {
  private subscriptionService = inject(SubscriptionService);
  private logger = inject(LoggerService);

  /**
   * Current plan features (observable)
   */
  readonly planFeatures$ = this.subscriptionService.subscription$.pipe(
    map((sub) => {
      if (!sub?.plan) {
        // Default to free tier features
        return this.getFreeTierFeatures();
      }
      return sub.plan.features as PlanFeatures;
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  /**
   * Whether user is on a paid plan
   */
  readonly isPaidPlan$ = this.subscriptionService.subscription$.pipe(
    map((sub) => {
      const planName = sub?.plan?.name || 'free';
      return planName !== 'free';
    }),
    distinctUntilChanged(),
    shareReplay(1)
  );

  /**
   * Get default free tier features
   * Must match database seed values in 20251207000000_subscription_system.sql
   */
  private getFreeTierFeatures(): PlanFeatures {
    return {
      receipts_per_month: 10,
      stripe_payouts_enabled: false,
      api_access_enabled: false,
      mileage_gps_enabled: false,
      multi_level_approval: false,
      support_level: 'community',
    };
  }

  // ============================================================================
  // FEATURE CHECKS
  // ============================================================================

  /**
   * Check if a feature is enabled for current plan
   */
  canUseFeature(feature: FeatureFlag): Observable<FeatureAccessResult> {
    return this.planFeatures$.pipe(
      map((features) => this.checkFeatureAccess(feature, features))
    );
  }

  /**
   * Check if Stripe payouts are enabled
   */
  canUseStripePayouts(): Observable<boolean> {
    return this.planFeatures$.pipe(
      map((features) => features.stripe_payouts_enabled)
    );
  }

  /**
   * Check if API access is enabled
   */
  canUseApiAccess(): Observable<boolean> {
    return this.planFeatures$.pipe(
      map((features) => features.api_access_enabled)
    );
  }

  /**
   * Check if GPS mileage tracking is enabled
   */
  canUseMileageGps(): Observable<boolean> {
    return this.planFeatures$.pipe(
      map((features) => features.mileage_gps_enabled)
    );
  }

  /**
   * Check if multi-level approvals are enabled
   */
  canUseMultiLevelApproval(): Observable<boolean> {
    return this.planFeatures$.pipe(
      map((features) => features.multi_level_approval)
    );
  }

  /**
   * Check if user can upload a receipt (under limit)
   */
  canUploadReceipt(): Observable<FeatureAccessResult> {
    return combineLatest([
      this.planFeatures$,
      this.subscriptionService.usageLimits$,
    ]).pipe(
      map(([features, limits]) => {
        // Unlimited receipts
        if (features.receipts_per_month === null) {
          return { allowed: true };
        }

        // Check limit
        if (!limits) {
          return { allowed: true }; // No limits data, allow
        }

        if (limits.at_receipt_limit) {
          return {
            allowed: false,
            reason: `You've reached your monthly limit of ${limits.receipt_limit} receipts.`,
            upgrade_to: 'starter',
          };
        }

        return {
          allowed: true,
        };
      })
    );
  }

  /**
   * Check if organization can add more users
   */
  canAddUser(): Observable<FeatureAccessResult> {
    return this.subscriptionService.usageLimits$.pipe(
      map((limits) => {
        if (!limits) {
          return { allowed: true };
        }

        if (limits.user_limit === null) {
          return { allowed: true };
        }

        if (limits.at_user_limit) {
          return {
            allowed: false,
            reason: `You've reached the user limit (${limits.user_limit}) for your plan.`,
            upgrade_to: this.getNextTier(),
          };
        }

        return { allowed: true };
      })
    );
  }

  // ============================================================================
  // RECEIPT LIMITS
  // ============================================================================

  /**
   * Get receipt limit for current plan (null = unlimited)
   */
  getReceiptLimit(): Observable<number | null> {
    return this.planFeatures$.pipe(
      map((features) => features.receipts_per_month)
    );
  }

  /**
   * Get remaining receipts for this month
   */
  getRemainingReceipts(): Observable<number | null> {
    return this.subscriptionService.usageLimits$.pipe(
      map((limits) => limits?.receipts_remaining ?? null)
    );
  }

  /**
   * Get receipt usage info
   */
  getReceiptUsage(): Observable<{
    used: number;
    limit: number | null;
    remaining: number | null;
    percentage: number;
  }> {
    return this.subscriptionService.usageLimits$.pipe(
      map((limits) => {
        if (!limits) {
          return { used: 0, limit: null, remaining: null, percentage: 0 };
        }

        const percentage =
          limits.receipt_limit !== null
            ? Math.round((limits.receipts_used / limits.receipt_limit) * 100)
            : 0;

        return {
          used: limits.receipts_used,
          limit: limits.receipt_limit,
          remaining: limits.receipts_remaining,
          percentage,
        };
      })
    );
  }

  // ============================================================================
  // USER LIMITS
  // ============================================================================

  /**
   * Get user limit for current plan (null = unlimited)
   */
  getUserLimit(): Observable<number | null> {
    return this.subscriptionService.subscription$.pipe(
      map((sub) => sub?.plan?.max_users ?? 3) // Default to free tier limit
    );
  }

  /**
   * Get user usage info
   */
  getUserUsage(): Observable<{
    current: number;
    limit: number | null;
    remaining: number | null;
    percentage: number;
  }> {
    return this.subscriptionService.usageLimits$.pipe(
      map((limits) => {
        if (!limits) {
          return { current: 0, limit: 3, remaining: 3, percentage: 0 };
        }

        const percentage =
          limits.user_limit !== null
            ? Math.round((limits.users_current / limits.user_limit) * 100)
            : 0;

        return {
          current: limits.users_current,
          limit: limits.user_limit,
          remaining:
            limits.user_limit !== null
              ? limits.user_limit - limits.users_current
              : null,
          percentage,
        };
      })
    );
  }

  // ============================================================================
  // UPGRADE RECOMMENDATIONS
  // ============================================================================

  /**
   * Get upgrade recommendation based on current usage
   */
  getUpgradeRecommendation(): Observable<{
    shouldUpgrade: boolean;
    reason?: string;
    recommendedPlan?: string;
  } | null> {
    return combineLatest([
      this.subscriptionService.subscription$,
      this.subscriptionService.usageLimits$,
    ]).pipe(
      map(([subscription, limits]) => {
        if (!subscription || !limits) {
          return null;
        }

        const planName = subscription.plan?.name || 'free';

        // Already on highest tier
        if (planName === 'enterprise') {
          return null;
        }

        // Check if at receipt limit
        if (limits.at_receipt_limit) {
          return {
            shouldUpgrade: true,
            reason: 'You\'ve hit your monthly receipt limit',
            recommendedPlan: this.getNextTier(),
          };
        }

        // Check if at user limit
        if (limits.at_user_limit) {
          return {
            shouldUpgrade: true,
            reason: 'You\'ve reached your user limit',
            recommendedPlan: this.getNextTier(),
          };
        }

        // Check if approaching receipt limit (80%)
        if (
          limits.receipt_limit !== null &&
          limits.receipts_used / limits.receipt_limit > 0.8
        ) {
          return {
            shouldUpgrade: true,
            reason: 'You\'re approaching your receipt limit',
            recommendedPlan: this.getNextTier(),
          };
        }

        return null;
      })
    );
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  /**
   * Check feature access based on feature flag and plan features
   */
  private checkFeatureAccess(
    feature: FeatureFlag,
    features: PlanFeatures
  ): FeatureAccessResult {
    switch (feature) {
      case 'stripe_payouts':
        return features.stripe_payouts_enabled
          ? { allowed: true }
          : {
              allowed: false,
              reason: 'Stripe payouts are only available on paid plans',
              upgrade_to: 'starter',
            };

      case 'api_access':
        return features.api_access_enabled
          ? { allowed: true }
          : {
              allowed: false,
              reason: 'API access is only available on paid plans',
              upgrade_to: 'starter',
            };

      case 'mileage_gps':
        return features.mileage_gps_enabled
          ? { allowed: true }
          : {
              allowed: false,
              reason: 'GPS mileage tracking is only available on paid plans',
              upgrade_to: 'starter',
            };

      case 'multi_level_approval':
        return features.multi_level_approval
          ? { allowed: true }
          : {
              allowed: false,
              reason: 'Multi-level approvals are only available on paid plans',
              upgrade_to: 'starter',
            };

      case 'unlimited_receipts':
        return features.receipts_per_month === null
          ? { allowed: true }
          : {
              allowed: false,
              reason: 'Unlimited receipts are only available on paid plans',
              upgrade_to: 'starter',
            };

      case 'priority_support':
        return features.support_level === 'priority' ||
          features.support_level === 'dedicated'
          ? { allowed: true }
          : {
              allowed: false,
              reason: 'Priority support is available on Team plan and above',
              upgrade_to: 'team',
            };

      default:
        return { allowed: true };
    }
  }

  /**
   * Get the next tier up from current plan
   */
  private getNextTier(): string {
    const currentPlan = this.subscriptionService.getCurrentPlanName();

    const tierOrder = ['free', 'starter', 'team', 'business', 'enterprise'];
    const currentIndex = tierOrder.indexOf(currentPlan);

    if (currentIndex === -1 || currentIndex >= tierOrder.length - 1) {
      return 'enterprise';
    }

    return tierOrder[currentIndex + 1];
  }

  /**
   * Get a human-readable message for a feature limit
   * Must match database seed values in 20251207000000_subscription_system.sql
   */
  getFeatureLimitMessage(feature: FeatureFlag): string {
    const messages: Record<FeatureFlag, string> = {
      stripe_payouts:
        'Stripe ACH payouts are included in all plans.',
      api_access: 'API access is included in all plans.',
      mileage_gps:
        'GPS mileage tracking is included in all plans.',
      multi_level_approval:
        'Multi-level approval workflows are included in all plans.',
      unlimited_receipts:
        'Upgrade to any paid plan for unlimited receipt uploads.',
      priority_support:
        'Upgrade to Team or higher for priority email support.',
    };

    return messages[feature];
  }
}
