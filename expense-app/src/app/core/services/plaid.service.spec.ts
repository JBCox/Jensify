import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PlaidService } from './plaid.service';
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
  PlaidLinkToken
} from '../models/plaid.model';

describe('PlaidService', () => {
  let service: PlaidService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';
  const mockItemId = 'item-1';
  const mockAccountId = 'account-1';
  const mockTransactionId = 'transaction-1';
  const mockRuleId = 'rule-1';

  const mockPlaidItem: PlaidItem = {
    id: mockItemId,
    organization_id: mockOrgId,
    user_id: mockUserId,
    plaid_item_id: 'plaid-item-123',
    plaid_access_token: 'encrypted-token',
    institution_id: 'ins_123',
    institution_name: 'Test Bank',
    status: 'active',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockLinkedAccount: LinkedAccount = {
    id: mockAccountId,
    plaid_item_id: mockItemId,
    organization_id: mockOrgId,
    user_id: mockUserId,
    plaid_account_id: 'plaid-account-123',
    account_name: 'Checking Account',
    account_mask: '1234',
    account_type: 'depository',
    is_enabled: true,
    auto_create_expense: false,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockTransaction: ImportedTransaction = {
    id: mockTransactionId,
    linked_account_id: mockAccountId,
    organization_id: mockOrgId,
    user_id: mockUserId,
    plaid_transaction_id: 'plaid-txn-123',
    transaction_name: 'Test Transaction',
    merchant_name: 'Test Merchant',
    amount: 100.00,
    transaction_date: '2024-01-15',
    is_pending: false,
    status: 'new',
    needs_review: false,
    imported_at: '2024-01-15T10:00:00Z'
  };

  const mockRule: TransactionRule = {
    id: mockRuleId,
    organization_id: mockOrgId,
    name: 'Test Rule',
    match_merchant_contains: ['test'],
    auto_create_expense: true,
    mark_as_ignored: false,
    priority: 1,
    is_active: true,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from'),
        rpc: jasmine.createSpy('rpc'),
        functions: {
          invoke: jasmine.createSpy('invoke')
        }
      },
      userId: mockUserId
    });

    const organizationSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrgId
    });

    const loggerSpy = jasmine.createSpyObj('LoggerService', [
      'info',
      'warn',
      'error'
    ]);

    TestBed.configureTestingModule({
      providers: [
        PlaidService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(PlaidService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with empty state', () => {
    expect(service.plaidItems()).toEqual([]);
    expect(service.linkedAccounts()).toEqual([]);
    expect(service.transactions()).toEqual([]);
    expect(service.rules()).toEqual([]);
  });

  describe('computed signals', () => {
    it('should compute activeAccounts', () => {
      const accounts: LinkedAccount[] = [
        { ...mockLinkedAccount, is_enabled: true },
        { ...mockLinkedAccount, id: 'account-2', is_enabled: false }
      ];

      // Access internal signals for testing
      (service as unknown as { _linkedAccounts: { set: (v: LinkedAccount[]) => void } })._linkedAccounts.set(accounts);

      expect(service.activeAccounts().length).toBe(1);
    });

    it('should compute newTransactionCount', () => {
      const transactions: ImportedTransaction[] = [
        { ...mockTransaction, status: 'new' },
        { ...mockTransaction, id: 'txn-2', status: 'converted' },
        { ...mockTransaction, id: 'txn-3', status: 'new' }
      ];

      (service as unknown as { _transactions: { set: (v: ImportedTransaction[]) => void } })._transactions.set(transactions);

      expect(service.newTransactionCount()).toBe(2);
    });

    it('should compute pendingAmount', () => {
      const transactions: ImportedTransaction[] = [
        { ...mockTransaction, status: 'new', amount: 50 },
        { ...mockTransaction, id: 'txn-2', status: 'new', amount: -30 },
        { ...mockTransaction, id: 'txn-3', status: 'converted', amount: 100 }
      ];

      (service as unknown as { _transactions: { set: (v: ImportedTransaction[]) => void } })._transactions.set(transactions);

      expect(service.pendingAmount()).toBe(80);
    });
  });

  describe('createLinkToken', () => {
    it('should create a link token', (done) => {
      const mockLinkToken: PlaidLinkToken = {
        link_token: 'link-sandbox-12345',
        expiration: '2024-01-15T10:00:00Z'
      };
      const mockResponse = { data: mockLinkToken, error: null };

      (supabaseServiceSpy.client.functions.invoke as jasmine.Spy).and.resolveTo(mockResponse);

      service.createLinkToken().subscribe({
        next: (token) => {
          expect(token).toEqual(mockLinkToken);
          expect(supabaseServiceSpy.client.functions.invoke).toHaveBeenCalledWith('plaid-link', {
            body: { action: 'create_link_token', user_id: mockUserId }
          });
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.createLinkToken().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should handle edge function error', (done) => {
      const mockError = new Error('Edge function failed');
      const mockResponse = { data: null, error: mockError };

      (supabaseServiceSpy.client.functions.invoke as jasmine.Spy).and.resolveTo(mockResponse);

      service.createLinkToken().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('Edge function failed');
          done();
        }
      });
    });
  });

  describe('exchangePublicToken', () => {
    it('should exchange public token for access token', (done) => {
      const publicToken = 'public-sandbox-12345';
      const metadata = { institution: { name: 'Test Bank' } };
      const mockResponse = { data: mockPlaidItem, error: null };

      (supabaseServiceSpy.client.functions.invoke as jasmine.Spy).and.resolveTo(mockResponse);

      // Mock getPlaidItems for the refresh call
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [mockPlaidItem], error: null });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.exchangePublicToken(publicToken, metadata).subscribe({
        next: (item) => {
          expect(item).toEqual(mockPlaidItem);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated or no org', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.exchangePublicToken('public-token', {}).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated or no organization selected');
          done();
        }
      });
    });
  });

  describe('getPlaidItems', () => {
    it('should return plaid items for the user', (done) => {
      const mockItems = [mockPlaidItem];
      const mockResponse = { data: mockItems, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getPlaidItems().subscribe({
        next: (items) => {
          expect(items).toEqual(mockItems);
          expect(service.plaidItems()).toEqual(mockItems);
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.getPlaidItems().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('removePlaidItem', () => {
    it('should remove a plaid item', (done) => {
      const deleteResponse = { error: null };
      const getItemsResponse = { data: [], error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(getItemsResponse);
      const getEqSpy = jasmine.createSpy('getEq').and.returnValue({ order: orderSpy });
      const getSelectSpy = jasmine.createSpy('getSelect').and.returnValue({ eq: getEqSpy });

      const deleteEqSpy = jasmine.createSpy('deleteEq').and.resolveTo(deleteResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: deleteEqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake((table: string) => {
        return { delete: deleteSpy, select: getSelectSpy };
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.removePlaidItem(mockItemId).subscribe({
        next: () => {
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getLinkedAccounts', () => {
    it('should return linked accounts for the user', (done) => {
      const mockAccounts = [mockLinkedAccount];
      const mockResponse = { data: mockAccounts, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getLinkedAccounts().subscribe({
        next: (accounts) => {
          expect(accounts).toEqual(mockAccounts);
          expect(service.linkedAccounts()).toEqual(mockAccounts);
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.getLinkedAccounts().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('updateLinkedAccount', () => {
    it('should update a linked account', (done) => {
      const updates = { default_category: 'Fuel' };
      const updatedAccount = { ...mockLinkedAccount, ...updates };
      const mockResponse = { data: updatedAccount, error: null };

      // Mock for update
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });

      // Mock for getLinkedAccounts refresh
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [updatedAccount], error: null });
      const getEqSpy = jasmine.createSpy('getEq').and.returnValue({ order: orderSpy });
      const getSelectSpy = jasmine.createSpy('getSelect').and.returnValue({ eq: getEqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy,
        select: getSelectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.updateLinkedAccount(mockAccountId, updates).subscribe({
        next: (account) => {
          expect(account.default_category).toBe('Fuel');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('toggleAccountEnabled', () => {
    it('should toggle account enabled status', (done) => {
      const updatedAccount = { ...mockLinkedAccount, is_enabled: false };
      const mockResponse = { data: updatedAccount, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });

      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [updatedAccount], error: null });
      const getEqSpy = jasmine.createSpy('getEq').and.returnValue({ order: orderSpy });
      const getSelectSpy = jasmine.createSpy('getSelect').and.returnValue({ eq: getEqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy,
        select: getSelectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.toggleAccountEnabled(mockAccountId, false).subscribe({
        next: (account) => {
          expect(account.is_enabled).toBe(false);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('syncTransactions', () => {
    it('should sync transactions from Plaid', (done) => {
      const syncResult = { added: 10, modified: 2, removed: 0 };
      const mockResponse = { data: syncResult, error: null };

      (supabaseServiceSpy.client.functions.invoke as jasmine.Spy).and.resolveTo(mockResponse);

      // Mock getTransactions for refresh
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.syncTransactions(mockItemId).subscribe({
        next: (result) => {
          expect(result).toEqual(syncResult);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.syncTransactions().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('getTransactions', () => {
    it('should return transactions', (done) => {
      const mockTransactions = [mockTransaction];
      const mockResponse = { data: mockTransactions, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getTransactions().subscribe({
        next: (transactions) => {
          expect(transactions).toEqual(mockTransactions);
          expect(service.transactions()).toEqual(mockTransactions);
          done();
        },
        error: done.fail
      });
    });

    it('should apply status filter', (done) => {
      const mockTransactions = [mockTransaction];
      const mockResponse = { data: mockTransactions, error: null };

      const createThenable = () => {
        const thenable: { then: (fn: (r: { data: ImportedTransaction[]; error: null }) => void) => Promise<void>; eq: jasmine.Spy; gte: jasmine.Spy; lte: jasmine.Spy } = {
          then: (fn: (r: { data: ImportedTransaction[]; error: null }) => void) => Promise.resolve(mockResponse).then(fn),
          eq: jasmine.createSpy('filterEq').and.callFake(() => createThenable()),
          gte: jasmine.createSpy('gte').and.callFake(() => createThenable()),
          lte: jasmine.createSpy('lte').and.callFake(() => createThenable())
        };
        return thenable;
      };

      const orderSpy = jasmine.createSpy('order').and.callFake(() => createThenable());
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getTransactions({ status: 'new' }).subscribe({
        next: (transactions) => {
          expect(transactions).toEqual(mockTransactions);
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.getTransactions().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('matchTransaction', () => {
    it('should match transaction to expense', (done) => {
      const expenseId = 'expense-123';
      const mockResponse = { data: expenseId, error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      // Mock getTransactions for refresh
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.matchTransaction(mockTransactionId).subscribe({
        next: (result) => {
          expect(result).toBe(expenseId);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('match_transaction_to_expense', {
            p_transaction_id: mockTransactionId
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return null if no match', (done) => {
      const mockResponse = { data: null, error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.matchTransaction(mockTransactionId).subscribe({
        next: (result) => {
          expect(result).toBeNull();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('convertTransaction', () => {
    it('should convert transaction to expense', (done) => {
      const expenseId = 'expense-new';
      const dto: ConvertTransactionDto = {
        transaction_id: mockTransactionId,
        category: 'Meals',
        notes: 'Business lunch'
      };
      const mockResponse = { data: expenseId, error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.convertTransaction(dto).subscribe({
        next: (result) => {
          expect(result).toBe(expenseId);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('ignoreTransaction', () => {
    it('should ignore a transaction', (done) => {
      const mockResponse = { error: null };

      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });

      // Mock getTransactions for refresh
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
      const getEqSpy = jasmine.createSpy('getEq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: getEqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy,
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.ignoreTransaction(mockTransactionId).subscribe({
        next: () => {
          expect(updateSpy).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getTransactionRules', () => {
    it('should return transaction rules', (done) => {
      const mockRules = [mockRule];
      const mockResponse = { data: mockRules, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getTransactionRules().subscribe({
        next: (rules) => {
          expect(rules).toEqual(mockRules);
          expect(service.rules()).toEqual(mockRules);
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.getTransactionRules().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('createTransactionRule', () => {
    it('should create a transaction rule', (done) => {
      const newRule: CreateTransactionRuleDto = {
        name: 'New Rule',
        match_merchant_contains: ['Amazon'],
        set_category: 'Office Supplies'
      };
      const mockResponse = { data: { ...mockRule, ...newRule }, error: null };

      // Mock for insert
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });

      // Mock for refresh
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [mockRule], error: null });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const getSelectSpy = jasmine.createSpy('getSelect').and.returnValue({ eq: eqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy,
        select: getSelectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.createTransactionRule(newRule).subscribe({
        next: (rule) => {
          expect(rule.name).toBe('New Rule');
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.createTransactionRule({ name: 'Test' }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateTransactionRule', () => {
    it('should update a transaction rule', (done) => {
      const updates: UpdateTransactionRuleDto = {
        id: mockRuleId,
        name: 'Updated Rule',
        priority: 2
      };
      const updatedRule = { ...mockRule, ...updates };
      const mockResponse = { data: updatedRule, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });

      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [updatedRule], error: null });
      const getEqSpy = jasmine.createSpy('getEq').and.returnValue({ order: orderSpy });
      const getSelectSpy = jasmine.createSpy('getSelect').and.returnValue({ eq: getEqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy,
        select: getSelectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.updateTransactionRule(updates).subscribe({
        next: (rule) => {
          expect(rule.name).toBe('Updated Rule');
          expect(rule.priority).toBe(2);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteTransactionRule', () => {
    it('should delete a transaction rule', (done) => {
      const mockResponse = { error: null };

      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });

      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
      const getEqSpy = jasmine.createSpy('getEq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: getEqSpy });

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        delete: deleteSpy,
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.deleteTransactionRule(mockRuleId).subscribe({
        next: () => {
          expect(deleteSpy).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getImportStats', () => {
    it('should return import statistics', (done) => {
      const mockStats: ImportStats = {
        total_transactions: 100,
        new_count: 50,
        matched_count: 20,
        converted_count: 25,
        ignored_count: 5,
        total_amount: 10000,
        converted_amount: 5000
      };
      const mockResponse = { data: [mockStats], error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getImportStats('2024-01-01', '2024-12-31').subscribe({
        next: (stats) => {
          expect(stats).toEqual(mockStats);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_import_stats', {
            p_organization_id: mockOrgId,
            p_start_date: '2024-01-01',
            p_end_date: '2024-12-31'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return default stats when no data', (done) => {
      const mockResponse = { data: [], error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getImportStats().subscribe({
        next: (stats) => {
          expect(stats.total_transactions).toBe(0);
          expect(stats.new_count).toBe(0);
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.getImportStats().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('initialize', () => {
    it('should load all data on init', () => {
      // Mock all three calls
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.initialize();

      expect(supabaseServiceSpy.client.from).toHaveBeenCalled();
    });

    it('should log warning on failure', fakeAsync(() => {
      const mockError = { message: 'Load failed' };
      const mockResponse = { data: null, error: mockError };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.initialize();

      tick(100);
      expect(loggerServiceSpy.warn).toHaveBeenCalled();
    }));
  });

  describe('error handling', () => {
    it('should handle database errors', (done) => {
      const mockError = new Error('Database connection failed');
      const mockResponse = { data: null, error: mockError };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getPlaidItems().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('Database connection failed');
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });
});
