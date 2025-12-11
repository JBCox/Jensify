import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';
import { SuperAdminService } from './super-admin.service';
import { SupabaseService } from './supabase.service';
import { LoggerService } from './logger.service';
import { NotificationService } from './notification.service';
import { SubscriptionService } from './subscription.service';
import { SuperAdminPermissions } from '../models/subscription.model';

describe('SuperAdminService', () => {
  let service: SuperAdminService;
  let mockSupabaseService: jasmine.SpyObj<SupabaseService>;
  let mockLoggerService: jasmine.SpyObj<LoggerService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockSubscriptionService: jasmine.SpyObj<SubscriptionService>;
  let currentUserSubject: BehaviorSubject<any>;

  const mockPermissions: SuperAdminPermissions = {
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

  const mockSuperAdminData = {
    permissions: mockPermissions,
  };

  const mockUser = {
    id: 'user-123',
    email: 'admin@example.com',
  };

  beforeEach(() => {
    currentUserSubject = new BehaviorSubject<any>(null);

    mockSupabaseService = jasmine.createSpyObj('SupabaseService', [], {
      currentUser$: currentUserSubject.asObservable(),
      userId: 'user-123',
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

    mockSubscriptionService = jasmine.createSpyObj('SubscriptionService', [
      'invalidatePlansCache',
    ]);

    TestBed.configureTestingModule({
      providers: [
        SuperAdminService,
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: LoggerService, useValue: mockLoggerService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: SubscriptionService, useValue: mockSubscriptionService },
      ],
    });

    service = TestBed.inject(SuperAdminService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('Super Admin Status Check', () => {
    it('should check super admin status when user logs in', (done) => {
      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: mockSuperAdminData, error: null })
      );
      const isActiveEqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const userIdEqSpy = jasmine.createSpy('eq').and.returnValue({ eq: isActiveEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: userIdEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentUserSubject.next(mockUser);

      setTimeout(() => {
        expect(service.isSuperAdmin).toBe(true);
        done();
      }, 100);
    });

    it('should set super admin to false when user is not admin', (done) => {
      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );
      const isActiveEqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const userIdEqSpy = jasmine.createSpy('eq').and.returnValue({ eq: isActiveEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: userIdEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentUserSubject.next(mockUser);

      setTimeout(() => {
        expect(service.isSuperAdmin).toBe(false);
        done();
      }, 100);
    });

    it('should clear admin status when user logs out', (done) => {
      // First set as admin
      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: mockSuperAdminData, error: null })
      );
      const isActiveEqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const userIdEqSpy = jasmine.createSpy('eq').and.returnValue({ eq: isActiveEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: userIdEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentUserSubject.next(mockUser);

      setTimeout(() => {
        expect(service.isSuperAdmin).toBe(true);

        // Now log out
        currentUserSubject.next(null);

        setTimeout(() => {
          expect(service.isSuperAdmin).toBe(false);
          done();
        }, 100);
      }, 100);
    });
  });

  describe('waitForAdminCheck()', () => {
    it('should wait for admin check to complete', async () => {
      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: mockSuperAdminData, error: null })
      );
      const isActiveEqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const userIdEqSpy = jasmine.createSpy('eq').and.returnValue({ eq: isActiveEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: userIdEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentUserSubject.next(mockUser);

      const result = await service.waitForAdminCheck();
      expect(result).toBe(true);
    });

    it('should return false when no user', async () => {
      Object.defineProperty(mockSupabaseService, 'userId', {
        get: () => null,
        configurable: true,
      });

      const result = await service.waitForAdminCheck();
      expect(result).toBe(false);
    });
  });

  describe('Permission Checks', () => {
    beforeEach((done) => {
      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: mockSuperAdminData, error: null })
      );
      const isActiveEqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const userIdEqSpy = jasmine.createSpy('eq').and.returnValue({ eq: isActiveEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: userIdEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentUserSubject.next(mockUser);
      setTimeout(done, 100);
    });

    it('should return true for granted permissions', () => {
      expect(service.hasPermission('view_organizations')).toBe(true);
      expect(service.hasPermission('manage_subscriptions')).toBe(true);
      expect(service.hasPermission('create_coupons')).toBe(true);
    });

    it('should return false for denied permissions', () => {
      expect(service.hasPermission('issue_refunds')).toBe(false);
      expect(service.hasPermission('manage_super_admins')).toBe(false);
    });
  });

  describe('Organization Management', () => {
    it('should get all organizations', (done) => {
      const mockOrgs = {
        organizations: [
          { organization_id: 'org-1', name: 'Org 1', plan: 'starter' },
          { organization_id: 'org-2', name: 'Org 2', plan: 'team' },
        ],
        total: 2,
      };

      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: mockOrgs, error: null })
      );

      service.getAllOrganizations().subscribe((result) => {
        expect(result.organizations.length).toBe(2);
        expect(result.total).toBe(2);
        done();
      });
    });

    it('should get organization details', (done) => {
      const mockOrgDetails = {
        organization_id: 'org-123',
        organization_name: 'Test Org',
        plan_name: 'starter',
        current_user_count: 5,
        current_month_receipts: 10,
        active_member_count: 5,
        org_created_at: '2024-01-01T00:00:00Z',
      };

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockOrgDetails, error: null })
      );
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getOrganizationDetails('org-123').subscribe((org) => {
        expect(org.organization_name).toBe('Test Org');
        done();
      });
    });
  });

  describe('Subscription Actions', () => {
    it('should apply discount', (done) => {
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: {}, error: null })
      );

      service
        .applyDiscount({
          organization_id: 'org-123',
          discount_percent: 20,
          reason: 'Test discount',
        })
        .subscribe(() => {
          expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
            '20% discount applied successfully'
          );
          done();
        });
    });

    it('should issue refund', (done) => {
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: {}, error: null })
      );

      service
        .issueRefund({
          organization_id: 'org-123',
          invoice_id: 'inv-123',
          reason: 'Customer request',
        })
        .subscribe(() => {
          expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
            'Refunded full amount successfully'
          );
          done();
        });
    });

    it('should pause subscription', (done) => {
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: {}, error: null })
      );

      service.pauseSubscription('org-123', 'Customer request').subscribe(() => {
        expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
          'Subscription paused'
        );
        done();
      });
    });

    it('should resume subscription', (done) => {
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: {}, error: null })
      );

      service.resumeSubscription('org-123', 'Customer request').subscribe(() => {
        expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
          'Subscription resumed'
        );
        done();
      });
    });
  });

  describe('Coupon Management', () => {
    it('should get all coupons', (done) => {
      const mockCoupons = [
        { id: 'coupon-1', code: 'WELCOME20', discount_value: 20 },
        { id: 'coupon-2', code: 'STARTUP50', discount_value: 50 },
      ];

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockCoupons, error: null })
      );
      const selectSpy = jasmine.createSpy('select').and.returnValue({ order: orderSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getAllCoupons().subscribe((coupons) => {
        expect(coupons.length).toBe(2);
        expect(coupons[0].code).toBe('WELCOME20');
        done();
      });
    });

    it('should create coupon', (done) => {
      const newCoupon = {
        id: 'coupon-new',
        code: 'NEWCODE',
        discount_type: 'percent' as const,
        discount_value: 25,
      };

      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: { coupon: newCoupon }, error: null })
      );

      service
        .createCoupon({
          code: 'NEWCODE',
          discount_type: 'percent',
          discount_value: 25,
        })
        .subscribe((coupon) => {
          expect(coupon.code).toBe('NEWCODE');
          expect(mockNotificationService.showSuccess).toHaveBeenCalled();
          done();
        });
    });

    it('should deactivate coupon', (done) => {
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: {}, error: null })
      );

      service.deactivateCoupon('coupon-123').subscribe(() => {
        expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
          'Coupon deactivated'
        );
        done();
      });
    });
  });

  describe('Analytics', () => {
    it('should get analytics', (done) => {
      const mockAnalytics = {
        total_organizations: 100,
        paying_organizations: 80,
        total_users: 500,
        mrr: {
          total_mrr_cents: 50000,
          total_arr_cents: 600000,
          paying_customer_count: 80,
          free_customer_count: 20,
          average_revenue_per_customer_cents: 625,
        },
        plan_distribution: [],
        recent_activity: [],
        top_coupons: [],
      };

      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: mockAnalytics, error: null })
      );

      service.getAnalytics().subscribe((analytics) => {
        expect(analytics.total_organizations).toBe(100);
        expect(analytics.mrr.total_mrr_cents).toBe(50000);
        done();
      });
    });

    it('should get audit log', (done) => {
      const mockAuditLogs = [
        {
          id: 'log-1',
          action: 'subscription_created',
          organization_id: 'org-123',
        },
      ];

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockAuditLogs, error: null })
      );
      const selectSpy = jasmine.createSpy('select').and.returnValue({ order: orderSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getAuditLog().subscribe((logs) => {
        expect(logs.length).toBe(1);
        expect(logs[0].action).toBe('subscription_created');
        done();
      });
    });
  });

  describe('Super Admin Management', () => {
    beforeEach((done) => {
      // Setup with manage_super_admins permission
      const adminPermissions = { ...mockPermissions, manage_super_admins: true };
      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: { permissions: adminPermissions }, error: null })
      );
      const isActiveEqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const userIdEqSpy = jasmine.createSpy('eq').and.returnValue({ eq: isActiveEqSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: userIdEqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      currentUserSubject.next(mockUser);
      setTimeout(done, 100);
    });

    it('should get all super admins', (done) => {
      const mockAdmins = [
        { id: 'admin-1', display_name: 'Admin 1' },
        { id: 'admin-2', display_name: 'Admin 2' },
      ];

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockAdmins, error: null })
      );
      const selectSpy = jasmine.createSpy('select').and.returnValue({ order: orderSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getAllSuperAdmins().subscribe((admins) => {
        expect(admins.length).toBe(2);
        done();
      });
    });

    it('should add super admin', (done) => {
      const newAdmin = {
        id: 'new-admin',
        user_id: 'user-456',
        display_name: 'New Admin',
        permissions: mockPermissions,
      };

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: newAdmin, error: null })
      );
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ insert: insertSpy });

      service
        .addSuperAdmin('user-456', 'New Admin', { view_organizations: true })
        .subscribe((admin) => {
          expect(admin.display_name).toBe('New Admin');
          expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
            'Super admin added'
          );
          done();
        });
    });

    it('should deactivate super admin', (done) => {
      const eqSpy = jasmine.createSpy('eq').and.returnValue(
        Promise.resolve({ error: null })
      );
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ update: updateSpy });

      service.deactivateSuperAdmin('admin-123').subscribe(() => {
        expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
          'Super admin deactivated'
        );
        done();
      });
    });
  });

  describe('Plan Management', () => {
    it('should get all plans', (done) => {
      const mockPlans = [
        { id: 'plan-1', name: 'starter' },
        { id: 'plan-2', name: 'team' },
      ];

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockPlans, error: null })
      );
      const selectSpy = jasmine.createSpy('select').and.returnValue({ order: orderSpy });
      (mockSupabaseService.client.from as jasmine.Spy).and.returnValue({ select: selectSpy });

      service.getAllPlans().subscribe((plans) => {
        expect(plans.length).toBe(2);
        done();
      });
    });

    it('should update plan and invalidate cache', (done) => {
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: {}, error: null })
      );

      service
        .updatePlan({
          plan_id: 'plan-123',
          monthly_price_cents: 1999,
        })
        .subscribe(() => {
          expect(mockSubscriptionService.invalidatePlansCache).toHaveBeenCalled();
          expect(mockNotificationService.showSuccess).toHaveBeenCalledWith(
            'Plan updated'
          );
          done();
        });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors', (done) => {
      (mockSupabaseService.client.functions.invoke as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: null, error: { message: 'API Error' } })
      );

      service.getAnalytics().subscribe({
        error: (err) => {
          expect(err.message).toBe('API Error');
          expect(mockLoggerService.error).toHaveBeenCalled();
          expect(mockNotificationService.showError).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should deny permission-gated operations', (done) => {
      // User doesn't have manage_super_admins permission
      service.getAllSuperAdmins().subscribe({
        error: (err) => {
          expect(err.message).toBe('Permission denied');
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
