import { inject } from '@angular/core';
import { Router, CanActivateFn } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { filter, map, switchMap, take } from 'rxjs/operators';
import { FeatureGateService, FeatureFlag } from '../services/feature-gate.service';
import { SubscriptionService } from '../services/subscription.service';
import { UpgradePromptComponent, UpgradePromptData } from '../../shared/components/upgrade-prompt/upgrade-prompt.component';

/**
 * Feature metadata for upgrade prompts
 */
const FEATURE_METADATA: Record<
  FeatureFlag,
  { title: string; description: string; icon: string; benefits: string[] }
> = {
  stripe_payouts: {
    title: 'Direct ACH Payouts',
    description:
      'Reimburse employees directly to their bank accounts via Stripe ACH transfer.',
    icon: 'account_balance',
    benefits: [
      'Fast 2-day ACH transfers',
      'Automatic payout scheduling',
      'Real-time payout status tracking',
      'Bank account verification built-in',
    ],
  },
  api_access: {
    title: 'API Access',
    description:
      'Integrate Expensed with your existing systems via our REST API.',
    icon: 'api',
    benefits: [
      'Full REST API access',
      'Webhook notifications',
      'Bulk data export',
      'Custom integrations',
    ],
  },
  mileage_gps: {
    title: 'GPS Mileage Tracking',
    description:
      'Automatically track and calculate mileage for IRS-compliant reimbursement.',
    icon: 'gps_fixed',
    benefits: [
      'One-tap GPS location capture',
      'Google Maps route visualization',
      'Automatic distance calculation',
      'IRS-compliant mileage rates',
    ],
  },
  multi_level_approval: {
    title: 'Multi-Level Approvals',
    description:
      'Create custom approval workflows with multiple approval steps.',
    icon: 'verified',
    benefits: [
      'Sequential approval chains',
      'Role-based routing',
      'Amount thresholds',
      'Automatic escalation',
    ],
  },
  unlimited_receipts: {
    title: 'Unlimited Receipts',
    description: 'Upload and process unlimited receipts with SmartScan OCR.',
    icon: 'photo_camera',
    benefits: [
      'Unlimited receipt uploads',
      'SmartScan OCR extraction',
      'Multi-receipt expenses',
      'Cloud storage included',
    ],
  },
  priority_support: {
    title: 'Priority Support',
    description: 'Get faster response times and dedicated support.',
    icon: 'support_agent',
    benefits: [
      '4-hour response time',
      'Direct email support',
      'Priority bug fixes',
      'Dedicated account manager (Business+)',
    ],
  },
};

/**
 * Generic paid feature guard factory
 *
 * Usage in routes:
 * {
 *   path: 'mileage/new',
 *   canActivate: [paidFeatureGuard('mileage_gps')],
 *   loadComponent: () => import('./trip-form'),
 * }
 */
export function paidFeatureGuard(feature: FeatureFlag): CanActivateFn {
  return () => {
    const featureGateService = inject(FeatureGateService);
    const subscriptionService = inject(SubscriptionService);
    const router = inject(Router);
    const dialog = inject(MatDialog);

    // Wait for subscription to be loaded before checking feature access
    return subscriptionService.subscriptionLoaded$.pipe(
      filter((loaded) => loaded),
      take(1),
      switchMap(() => featureGateService.canUseFeature(feature)),
      map((result) => {
        if (result.allowed) {
          return true;
        }

        // Show upgrade dialog
        const metadata = FEATURE_METADATA[feature];
        const dialogData: UpgradePromptData = {
          feature: metadata.title,
          description: metadata.description,
          icon: metadata.icon,
          requiredPlan: result.upgrade_to as 'starter' | 'team' | 'business',
          benefits: metadata.benefits,
        };

        dialog.open(UpgradePromptComponent, {
          data: dialogData,
          maxWidth: '440px',
          panelClass: 'upgrade-dialog',
        });

        // Navigate back or to home
        return router.parseUrl('/home');
      })
    );
  };
}

/**
 * Pre-defined guards for common features
 */
export const stripePayoutsGuard: CanActivateFn = paidFeatureGuard('stripe_payouts');
export const apiAccessGuard: CanActivateFn = paidFeatureGuard('api_access');
export const mileageGpsGuard: CanActivateFn = paidFeatureGuard('mileage_gps');
export const multiLevelApprovalGuard: CanActivateFn = paidFeatureGuard('multi_level_approval');

/**
 * Guard that checks if user is on a paid plan (any paid tier)
 * Use for features that require any paid subscription
 */
export const paidPlanGuard: CanActivateFn = () => {
  const featureGateService = inject(FeatureGateService);
  const subscriptionService = inject(SubscriptionService);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  // Wait for subscription to be loaded before checking plan
  return subscriptionService.subscriptionLoaded$.pipe(
    filter((loaded) => loaded),
    take(1),
    switchMap(() => featureGateService.isPaidPlan$),
    map((isPaid) => {
      if (isPaid) {
        return true;
      }

      // Show generic upgrade dialog
      const dialogData: UpgradePromptData = {
        feature: 'Premium Features',
        description:
          'Upgrade to unlock unlimited receipts, GPS mileage tracking, direct payouts, and more.',
        icon: 'star',
        benefits: [
          'Unlimited receipt uploads with OCR',
          'GPS mileage tracking with Google Maps',
          'Direct ACH payouts via Stripe',
          'Multi-level approval workflows',
          'Priority email support',
        ],
      };

      dialog.open(UpgradePromptComponent, {
        data: dialogData,
        maxWidth: '440px',
        panelClass: 'upgrade-dialog',
      });

      return router.parseUrl('/home');
    })
  );
};

/**
 * Guard that checks receipt upload limit
 * Use before allowing new receipt uploads
 */
export const canUploadReceiptGuard: CanActivateFn = () => {
  const featureGateService = inject(FeatureGateService);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  return featureGateService.canUploadReceipt().pipe(
    take(1),
    map((result) => {
      if (result.allowed) {
        return true;
      }

      // Show upgrade dialog for receipt limit
      const dialogData: UpgradePromptData = {
        feature: 'Receipt Limit Reached',
        description:
          result.reason || 'You\'ve reached your monthly receipt limit.',
        icon: 'photo_camera',
        requiredPlan: 'starter',
        benefits: [
          'Unlimited receipt uploads',
          'SmartScan OCR for every receipt',
          'Multi-receipt expenses',
          'All receipt data stored in cloud',
        ],
      };

      dialog.open(UpgradePromptComponent, {
        data: dialogData,
        maxWidth: '440px',
        panelClass: 'upgrade-dialog',
      });

      return router.parseUrl('/receipts');
    })
  );
};

/**
 * Guard that checks user limit
 * Use before allowing new user invitations
 */
export const canAddUserGuard: CanActivateFn = () => {
  const featureGateService = inject(FeatureGateService);
  const router = inject(Router);
  const dialog = inject(MatDialog);

  return featureGateService.canAddUser().pipe(
    take(1),
    map((result) => {
      if (result.allowed) {
        return true;
      }

      // Show upgrade dialog for user limit
      const dialogData: UpgradePromptData = {
        feature: 'User Limit Reached',
        description: result.reason || 'You\'ve reached the user limit for your plan.',
        icon: 'group',
        requiredPlan: result.upgrade_to as 'starter' | 'team' | 'business',
        benefits: [
          'Add more team members',
          'Role-based access control',
          'Multi-level approvals',
          'Team analytics',
        ],
      };

      dialog.open(UpgradePromptComponent, {
        data: dialogData,
        maxWidth: '440px',
        panelClass: 'upgrade-dialog',
      });

      return router.parseUrl('/organization/users');
    })
  );
};
