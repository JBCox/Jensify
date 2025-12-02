import { TestBed } from '@angular/core/testing';
import { PayoutService } from './payout.service';
import { SupabaseService } from './supabase.service';
import {
  PayoutSettings,
  StripeAccountStatusResponse,
  EmployeeBankAccount,
  Payout,
  PendingPayoutSummary,
  PayoutExportData
} from '../models/payout.model';

describe('PayoutService', () => {
  let service: PayoutService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let fetchSpy: jasmine.Spy;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';
  const mockBankAccountId = 'bank-account-1';
  const mockPayoutId = 'payout-1';

  const mockSession = {
    access_token: 'test-access-token',
    refresh_token: 'test-refresh-token',
    user: { id: mockUserId }
  };

  const mockBankAccount: EmployeeBankAccount = {
    id: mockBankAccountId,
    user_id: mockUserId,
    organization_id: mockOrgId,
    stripe_bank_account_id: 'ba_xxx123',
    stripe_customer_id: 'cus_xxx123',
    bank_name: 'Chase',
    account_holder_name: 'John Doe',
    last_four: '1234',
    account_type: 'checking',
    is_default: true,
    is_verified: true,
    verification_status: 'verified',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    verified_at: '2024-01-01T11:00:00Z'
  };

  const mockPayout: Payout = {
    id: mockPayoutId,
    organization_id: mockOrgId,
    user_id: mockUserId,
    bank_account_id: mockBankAccountId,
    amount_cents: 10000,
    currency: 'usd',
    stripe_payout_id: 'po_xxx123',
    stripe_transfer_id: 'tr_xxx123',
    status: 'paid',
    failure_reason: null,
    failure_code: null,
    expense_ids: ['exp-1', 'exp-2'],
    report_ids: [],
    payout_method: 'stripe_ach',
    batch_id: null,
    created_at: '2024-01-01T10:00:00Z',
    initiated_at: '2024-01-01T10:05:00Z',
    estimated_arrival: '2024-01-03T10:00:00Z',
    paid_at: '2024-01-02T10:00:00Z',
    failed_at: null,
    initiated_by: mockUserId,
    manual_reference: null,
    manual_notes: null
  };

  const mockPendingSummary: PendingPayoutSummary = {
    user_id: mockUserId,
    user_name: 'John Doe',
    user_email: 'john@example.com',
    total_amount_cents: 15000,
    expense_count: 3,
    expense_ids: ['exp-1', 'exp-2', 'exp-3'],
    has_bank_account: true,
    bank_account_verified: true
  };

  beforeEach(() => {
    // Create SupabaseService spy
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from'),
        rpc: jasmine.createSpy('rpc')
      },
      userId: mockUserId,
      currentSession: mockSession
    });

    // Mock global fetch
    fetchSpy = spyOn(window, 'fetch');

    TestBed.configureTestingModule({
      providers: [
        PayoutService,
        { provide: SupabaseService, useValue: supabaseSpy }
      ]
    });

    service = TestBed.inject(PayoutService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should have initial null payout settings', (done) => {
    service.payoutSettings$.subscribe(settings => {
      expect(settings).toBeNull();
      done();
    });
  });

  it('should have initial empty bank accounts', (done) => {
    service.bankAccounts$.subscribe(accounts => {
      expect(accounts).toEqual([]);
      done();
    });
  });

  // =============================================================================
  // STRIPE CONNECT TESTS
  // =============================================================================

  describe('getStripeAccountStatus', () => {
    it('should get Stripe account status and update settings', (done) => {
      const mockResponse: StripeAccountStatusResponse = {
        connected: true,
        status: 'active',
        payout_method: 'stripe',
        charges_enabled: true,
        payouts_enabled: true,
        business_name: 'Acme Corp'
      };

      fetchSpy.and.returnValue(Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response));

      service.getStripeAccountStatus(mockOrgId).subscribe({
        next: (result) => {
          expect(result.connected).toBe(true);
          expect(result.status).toBe('active');

          // Check that settings were updated
          service.payoutSettings$.subscribe(settings => {
            expect(settings?.stripe_account_status).toBe('active');
            expect(settings?.stripe_account_details?.business_name).toBe('Acme Corp');
            done();
          });
        },
        error: done.fail
      });
    });

    it('should return not connected on error', (done) => {
      fetchSpy.and.returnValue(Promise.reject(new Error('Network error')));

      service.getStripeAccountStatus(mockOrgId).subscribe({
        next: (result) => {
          expect(result.connected).toBe(false);
          expect(result.payout_method).toBe('manual');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('connectStripeAccount', () => {
    it('should create Stripe Connect account and return onboarding URL', (done) => {
      const mockResponse = {
        success: true,
        account_id: 'acct_xxx123',
        onboarding_url: 'https://connect.stripe.com/setup/xxx'
      };

      fetchSpy.and.returnValue(Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response));

      service.connectStripeAccount(mockOrgId).subscribe({
        next: (result) => {
          expect(result.success).toBe(true);
          expect(result.onboarding_url).toBeTruthy();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('disconnectStripeAccount', () => {
    it('should disconnect and reset settings', (done) => {
      fetchSpy.and.returnValue(Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true })
      } as Response));

      service.disconnectStripeAccount(mockOrgId).subscribe({
        next: () => {
          service.payoutSettings$.subscribe(settings => {
            expect(settings?.payout_method).toBe('manual');
            expect(settings?.stripe_account_status).toBe('not_connected');
            done();
          });
        },
        error: done.fail
      });
    });
  });

  describe('updatePayoutMethod', () => {
    it('should update payout method', (done) => {
      // First set initial settings
      fetchSpy.and.returnValues(
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            connected: true,
            status: 'active',
            payout_method: 'stripe'
          })
        } as Response),
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true })
        } as Response)
      );

      // Get initial status first
      service.getStripeAccountStatus(mockOrgId).subscribe(() => {
        // Then update method
        service.updatePayoutMethod(mockOrgId, 'manual').subscribe({
          next: (result) => {
            expect(result.success).toBe(true);
            service.payoutSettings$.subscribe(settings => {
              expect(settings?.payout_method).toBe('manual');
              done();
            });
          },
          error: done.fail
        });
      });
    });
  });

  // =============================================================================
  // BANK ACCOUNTS TESTS
  // =============================================================================

  describe('getMyBankAccounts', () => {
    it('should return user bank accounts', (done) => {
      const mockResponse = { data: [mockBankAccount], error: null };
      const orderSpy2 = jasmine.createSpy('order2').and.resolveTo(mockResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ order: orderSpy2 });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getMyBankAccounts(mockOrgId).subscribe({
        next: (accounts) => {
          expect(accounts).toEqual([mockBankAccount]);
          service.bankAccounts$.subscribe(cached => {
            expect(cached).toEqual([mockBankAccount]);
            done();
          });
        },
        error: done.fail
      });
    });

    it('should return empty array on error', (done) => {
      const mockResponse = { data: null, error: { message: 'Failed' } };
      const orderSpy2 = jasmine.createSpy('order2').and.resolveTo(mockResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ order: orderSpy2 });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getMyBankAccounts(mockOrgId).subscribe({
        next: (accounts) => {
          expect(accounts).toEqual([]);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('addBankAccount', () => {
    it('should add bank account via Edge Function', (done) => {
      const mockResponse = {
        success: true,
        bank_account: {
          id: 'new-bank-id',
          bank_name: 'Chase',
          last_four: '5678',
          is_default: false,
          verification_status: 'pending'
        }
      };

      // Mock for edge function call
      fetchSpy.and.returnValue(Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response));

      // Mock for refresh
      const mockRefreshResponse = { data: [mockBankAccount], error: null };
      const orderSpy2 = jasmine.createSpy('order2').and.resolveTo(mockRefreshResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ order: orderSpy2 });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.addBankAccount(mockOrgId, 'btok_xxx123').subscribe({
        next: (result) => {
          expect(result.success).toBe(true);
          expect(result.bank_account?.id).toBe('new-bank-id');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('verifyBankAccount', () => {
    it('should verify bank account with micro-deposits', (done) => {
      const mockResponse = { success: true, verified: true };

      fetchSpy.and.returnValue(Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response));

      service.verifyBankAccount(mockBankAccountId, [32, 45]).subscribe({
        next: (result) => {
          expect(result.success).toBe(true);
          expect(result.verified).toBe(true);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('setDefaultBankAccount', () => {
    it('should set bank account as default', (done) => {
      const mockRpcResponse = { error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockRpcResponse);

      // Mock for refresh
      const mockRefreshResponse = { data: [mockBankAccount], error: null };
      const orderSpy2 = jasmine.createSpy('order2').and.resolveTo(mockRefreshResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ order: orderSpy2 });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.setDefaultBankAccount(mockBankAccountId, mockOrgId).subscribe({
        next: () => {
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('set_default_bank_account', {
            p_bank_account_id: mockBankAccountId
          });
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteBankAccount', () => {
    it('should delete bank account', (done) => {
      const mockResponse = { error: null };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });

      // Mock for refresh
      const mockRefreshResponse = { data: [], error: null };
      const orderSpy2 = jasmine.createSpy('order2').and.resolveTo(mockRefreshResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ order: orderSpy2 });
      const refreshEqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: refreshEqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'employee_bank_accounts') {
          return { delete: deleteSpy, select: selectSpy };
        }
        return {};
      }) as any;

      service.deleteBankAccount(mockBankAccountId, mockOrgId).subscribe({
        next: () => {
          expect(deleteSpy).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // PAYOUTS TESTS
  // =============================================================================

  describe('getPendingPayoutsSummary', () => {
    it('should return pending payout summaries', (done) => {
      const mockResponse = { data: [mockPendingSummary], error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getPendingPayoutsSummary(mockOrgId).subscribe({
        next: (summaries) => {
          expect(summaries).toEqual([mockPendingSummary]);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_pending_payouts_summary', {
            p_organization_id: mockOrgId
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return empty array on error', (done) => {
      const mockResponse = { data: null, error: { message: 'Failed' } };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getPendingPayoutsSummary(mockOrgId).subscribe({
        next: (summaries) => {
          expect(summaries).toEqual([]);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getApprovedExpensesForPayout', () => {
    it('should return grouped expenses by user', (done) => {
      const mockExpenses = [
        { id: 'exp-1', user_id: mockUserId, amount: 100, users: { full_name: 'John Doe', email: 'john@test.com' } },
        { id: 'exp-2', user_id: mockUserId, amount: 50, users: { full_name: 'John Doe', email: 'john@test.com' } }
      ];
      const mockResponse = { data: mockExpenses, error: null };
      const eqStatusSpy = jasmine.createSpy('eqStatus').and.resolveTo(mockResponse);
      const eqOrgSpy = jasmine.createSpy('eqOrg').and.returnValue({ eq: eqStatusSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqOrgSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getApprovedExpensesForPayout(mockOrgId).subscribe({
        next: (summaries) => {
          expect(summaries.length).toBe(1);
          expect(summaries[0].user_id).toBe(mockUserId);
          expect(summaries[0].total_amount_cents).toBe(15000); // (100 + 50) * 100
          expect(summaries[0].expense_count).toBe(2);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('createPayout', () => {
    it('should create a payout via Edge Function', (done) => {
      const mockResponse = {
        success: true,
        payout: {
          id: 'new-payout-id',
          amount_cents: 10000,
          status: 'pending',
          stripe_payout_id: 'po_xxx'
        }
      };

      fetchSpy.and.returnValue(Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      } as Response));

      service.createPayout(mockOrgId, mockUserId, 10000, ['exp-1', 'exp-2']).subscribe({
        next: (result) => {
          expect(result.success).toBe(true);
          expect(result.payout?.id).toBe('new-payout-id');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('createManualPayout', () => {
    it('should create a manual payout record', (done) => {
      const mockResponse = { data: mockPayout, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as any;

      service.createManualPayout(mockOrgId, mockUserId, 10000, ['exp-1'], 'REF-123', 'Test payout').subscribe({
        next: (payout) => {
          expect(payout).toEqual(mockPayout);
          expect(insertSpy).toHaveBeenCalledWith(jasmine.objectContaining({
            organization_id: mockOrgId,
            user_id: mockUserId,
            amount_cents: 10000,
            payout_method: 'manual',
            manual_reference: 'REF-123',
            manual_notes: 'Test payout'
          }));
          done();
        },
        error: done.fail
      });
    });
  });

  describe('markPayoutAsPaid', () => {
    it('should mark payout as paid', (done) => {
      const mockResponse = { error: null };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.markPayoutAsPaid(mockPayoutId, 'CHECK-456').subscribe({
        next: () => {
          expect(updateSpy).toHaveBeenCalledWith(jasmine.objectContaining({
            status: 'paid',
            manual_reference: 'CHECK-456'
          }));
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getPayoutStatus', () => {
    it('should return payout status from Edge Function', (done) => {
      fetchSpy.and.returnValue(Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockPayout)
      } as Response));

      service.getPayoutStatus(mockPayoutId).subscribe({
        next: (payout) => {
          expect(payout).toEqual(mockPayout);
          done();
        },
        error: done.fail
      });
    });

    it('should return null on error', (done) => {
      fetchSpy.and.returnValue(Promise.reject(new Error('Not found')));

      service.getPayoutStatus(mockPayoutId).subscribe({
        next: (payout) => {
          expect(payout).toBeNull();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getPayoutHistory', () => {
    it('should return payout history for organization', (done) => {
      const mockResponse = { data: [mockPayout], error: null };
      const limitSpy = jasmine.createSpy('limit').and.resolveTo(mockResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ limit: limitSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPayoutHistory(mockOrgId).subscribe({
        next: (payouts) => {
          expect(payouts).toEqual([mockPayout]);
          expect(limitSpy).toHaveBeenCalledWith(50);
          done();
        },
        error: done.fail
      });
    });

    it('should return empty array on error', (done) => {
      const mockResponse = { data: null, error: { message: 'Failed' } };
      const limitSpy = jasmine.createSpy('limit').and.resolveTo(mockResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ limit: limitSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPayoutHistory(mockOrgId).subscribe({
        next: (payouts) => {
          expect(payouts).toEqual([]);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getMyPayoutHistory', () => {
    it('should return user payout history', (done) => {
      const mockResponse = { data: [mockPayout], error: null };
      const limitSpy = jasmine.createSpy('limit').and.resolveTo(mockResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ limit: limitSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getMyPayoutHistory().subscribe({
        next: (payouts) => {
          expect(payouts).toEqual([mockPayout]);
          expect(eqSpy).toHaveBeenCalledWith('user_id', mockUserId);
          done();
        },
        error: done.fail
      });
    });

    it('should return empty array when not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.getMyPayoutHistory().subscribe({
        next: (payouts) => {
          expect(payouts).toEqual([]);
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // CSV EXPORT TESTS
  // =============================================================================

  describe('generatePayoutExportData', () => {
    it('should generate export data from pending summaries', () => {
      const summaries: PendingPayoutSummary[] = [mockPendingSummary];

      const result = service.generatePayoutExportData(summaries);

      expect(result.length).toBe(1);
      expect(result[0].employee_name).toBe('John Doe');
      expect(result[0].employee_email).toBe('john@example.com');
      expect(result[0].amount).toBe(150); // 15000 cents / 100
      expect(result[0].expense_count).toBe(3);
      expect(result[0].expense_ids).toBe('exp-1, exp-2, exp-3');
    });
  });

  describe('exportPayoutsToCSV', () => {
    it('should create and download CSV file', () => {
      const data: PayoutExportData[] = [{
        employee_name: 'John Doe',
        employee_email: 'john@example.com',
        amount: 150,
        expense_count: 3,
        expense_ids: 'exp-1, exp-2, exp-3',
        date_range: '2024-01-01'
      }];

      // Mock document methods
      const mockLink = {
        setAttribute: jasmine.createSpy('setAttribute'),
        click: jasmine.createSpy('click'),
        style: { visibility: '' }
      };
      spyOn(document, 'createElement').and.returnValue(mockLink as any);
      spyOn(document.body, 'appendChild');
      spyOn(document.body, 'removeChild');
      spyOn(URL, 'createObjectURL').and.returnValue('blob:url');
      spyOn(URL, 'revokeObjectURL');

      service.exportPayoutsToCSV(data);

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.setAttribute).toHaveBeenCalledWith('href', 'blob:url');
      expect(mockLink.click).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:url');
    });
  });

  // =============================================================================
  // EDGE FUNCTION ERROR HANDLING
  // =============================================================================

  describe('Edge Function error handling', () => {
    it('should throw error when not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'currentSession', {
        get: () => null,
        configurable: true
      });

      service.connectStripeAccount(mockOrgId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('Not authenticated');
          done();
        }
      });
    });

    it('should handle non-ok response', (done) => {
      fetchSpy.and.returnValue(Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'Stripe error' })
      } as Response));

      service.connectStripeAccount(mockOrgId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('Stripe error');
          done();
        }
      });
    });
  });
});
