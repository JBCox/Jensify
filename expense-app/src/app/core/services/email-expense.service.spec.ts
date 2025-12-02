import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { EmailExpenseService } from './email-expense.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  EmailInboxConfig,
  UserEmailAlias,
  InboundEmail,
  EmailProcessingStats,
  EMAIL_SUBMISSION_INSTRUCTIONS
} from '../models/email-expense.model';

describe('EmailExpenseService', () => {
  let service: EmailExpenseService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';

  const mockInboxConfig: EmailInboxConfig = {
    id: 'config-1',
    organization_id: mockOrgId,
    inbox_address: 'expenses@test.jensify.com',
    is_enabled: true,
    auto_create_expense: true,
    require_attachment: true,
    notify_on_receipt: true,
    notify_on_error: true,
    require_verified_sender: false,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockEmailAlias: UserEmailAlias = {
    id: 'alias-1',
    user_id: mockUserId,
    organization_id: mockOrgId,
    email: 'user@company.com',
    is_verified: true,
    created_at: '2024-01-01T10:00:00Z'
  };

  const mockInboundEmail: InboundEmail = {
    id: 'email-1',
    organization_id: mockOrgId,
    message_id: 'msg-12345',
    from_address: 'user@company.com',
    to_address: 'expenses@test.jensify.com',
    subject: 'Lunch receipt',
    body_text: 'Please process this expense',
    status: 'processed',
    attachment_count: 1,
    matched_user_id: mockUserId,
    received_at: '2024-01-01T10:00:00Z',
    processed_at: '2024-01-01T10:01:00Z'
  };

  const mockProcessingStats: EmailProcessingStats = {
    organization_id: mockOrgId,
    total_emails: 100,
    processed_count: 95,
    failed_count: 3,
    pending_count: 2,
    expenses_created: 90,
    avg_processing_time_seconds: 5.5
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from'),
        rpc: jasmine.createSpy('rpc')
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
        EmailExpenseService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(EmailExpenseService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // =============================================================================
  // INBOX CONFIGURATION TESTS
  // =============================================================================

  describe('getInboxConfig', () => {
    it('should return inbox configuration', (done) => {
      const mockResponse = { data: mockInboxConfig, error: null };

      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getInboxConfig().subscribe({
        next: (config) => {
          expect(config).toEqual(mockInboxConfig);
          expect(service.inboxConfig()).toEqual(mockInboxConfig);
          done();
        },
        error: done.fail
      });
    });

    it('should return null when no config exists', (done) => {
      const mockResponse = { data: null, error: null };

      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getInboxConfig().subscribe({
        next: (config) => {
          expect(config).toBeNull();
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

      service.getInboxConfig().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('createInboxConfig', () => {
    it('should create inbox configuration', (done) => {
      const mockResponse = { data: mockInboxConfig, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.createInboxConfig('expenses@test.jensify.com').subscribe({
        next: (config) => {
          expect(config).toEqual(mockInboxConfig);
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

      service.createInboxConfig('expenses@test.jensify.com').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateInboxConfig', () => {
    it('should update inbox configuration', (done) => {
      // First set the config
      (service as unknown as { _inboxConfig: { set: (v: EmailInboxConfig) => void } })._inboxConfig.set(mockInboxConfig);

      const updatedConfig = { ...mockInboxConfig, is_enabled: false };
      const mockResponse = { data: updatedConfig, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.updateInboxConfig({ is_enabled: false }).subscribe({
        next: (config) => {
          expect(config.is_enabled).toBe(false);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no inbox configuration found', (done) => {
      service.updateInboxConfig({ is_enabled: false }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No inbox configuration found');
          done();
        }
      });
    });
  });

  // =============================================================================
  // EMAIL ALIASES TESTS
  // =============================================================================

  describe('getEmailAliases', () => {
    it('should return email aliases', (done) => {
      const mockAliases = [mockEmailAlias];
      const mockResponse = { data: mockAliases, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getEmailAliases().subscribe({
        next: (aliases) => {
          expect(aliases).toEqual(mockAliases);
          expect(service.emailAliases()).toEqual(mockAliases);
          done();
        },
        error: done.fail
      });
    });

    it('should return empty array when no aliases exist', (done) => {
      const mockResponse = { data: null, error: null };

      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getEmailAliases().subscribe({
        next: (aliases) => {
          expect(aliases).toEqual([]);
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

      service.getEmailAliases().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('addEmailAlias', () => {
    it('should add email alias', (done) => {
      const mockResponse = { data: mockEmailAlias, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });

      // For the refresh call
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [mockEmailAlias], error: null });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy2 = jasmine.createSpy('select2').and.returnValue({ eq: eqSpy });

      let callCount = 0;
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake(() => {
        callCount++;
        if (callCount === 1) {
          return { insert: insertSpy };
        }
        return { select: selectSpy2 };
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.addEmailAlias({ email: 'user@company.com' }).subscribe({
        next: (alias) => {
          expect(alias).toEqual(mockEmailAlias);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated or no organization', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.addEmailAlias({ email: 'test@test.com' }).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated or no organization selected');
          done();
        }
      });
    });
  });

  describe('verifyEmailAlias', () => {
    it('should verify email alias', (done) => {
      const verifiedAlias = { ...mockEmailAlias, is_verified: true, verified_at: '2024-01-01T10:00:00Z' };
      const mockResponse = { data: verifiedAlias, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const tokenEqSpy = jasmine.createSpy('tokenEq').and.returnValue({ select: selectSpy });
      const idEqSpy = jasmine.createSpy('idEq').and.returnValue({ eq: tokenEqSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: idEqSpy });

      // For the refresh call
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [verifiedAlias], error: null });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy2 = jasmine.createSpy('select2').and.returnValue({ eq: eqSpy });

      let callCount = 0;
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake(() => {
        callCount++;
        if (callCount === 1) {
          return { update: updateSpy };
        }
        return { select: selectSpy2 };
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.verifyEmailAlias('alias-1', 'verification-token').subscribe({
        next: (alias) => {
          expect(alias.is_verified).toBe(true);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('removeEmailAlias', () => {
    it('should remove email alias', (done) => {
      const mockResponse = { error: null };

      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });

      // For the refresh call
      const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
      const userEqSpy = jasmine.createSpy('userEq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: userEqSpy });

      let callCount = 0;
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake(() => {
        callCount++;
        if (callCount === 1) {
          return { delete: deleteSpy };
        }
        return { select: selectSpy };
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.removeEmailAlias('alias-1').subscribe({
        next: () => {
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // INBOUND EMAILS TESTS
  // =============================================================================

  describe('getRecentEmails', () => {
    it('should return recent emails', (done) => {
      const mockEmails = [mockInboundEmail];
      const mockResponse = { data: mockEmails, error: null };

      const limitSpy = jasmine.createSpy('limit').and.resolveTo(mockResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ limit: limitSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getRecentEmails().subscribe({
        next: (emails) => {
          expect(emails).toEqual(mockEmails);
          expect(service.recentEmails()).toEqual(mockEmails);
          done();
        },
        error: done.fail
      });
    });

    it('should use custom limit', (done) => {
      const mockEmails = [mockInboundEmail];
      const mockResponse = { data: mockEmails, error: null };

      const limitSpy = jasmine.createSpy('limit').and.resolveTo(mockResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ limit: limitSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getRecentEmails(50).subscribe({
        next: () => {
          expect(limitSpy).toHaveBeenCalledWith(50);
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

      service.getRecentEmails().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('getAllEmails', () => {
    it('should return all emails for organization', (done) => {
      const mockEmails = [mockInboundEmail];
      const mockResponse = { data: mockEmails, error: null };

      const limitSpy = jasmine.createSpy('limit').and.resolveTo(mockResponse);
      const orderSpy = jasmine.createSpy('order').and.returnValue({ limit: limitSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getAllEmails().subscribe({
        next: (emails) => {
          expect(emails).toEqual(mockEmails);
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

      service.getAllEmails().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getEmail', () => {
    it('should return single email by ID', (done) => {
      const mockResponse = { data: mockInboundEmail, error: null };

      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getEmail('email-1').subscribe({
        next: (email) => {
          expect(email).toEqual(mockInboundEmail);
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // STATISTICS TESTS
  // =============================================================================

  describe('getProcessingStats', () => {
    it('should return processing statistics', (done) => {
      const mockResponse = { data: mockProcessingStats, error: null };

      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getProcessingStats().subscribe({
        next: (stats) => {
          expect(stats).toEqual(mockProcessingStats);
          expect(stats?.total_emails).toBe(100);
          expect(stats?.processed_count).toBe(95);
          done();
        },
        error: done.fail
      });
    });

    it('should return null when no stats exist', (done) => {
      const mockResponse = { data: null, error: null };

      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getProcessingStats().subscribe({
        next: (stats) => {
          expect(stats).toBeNull();
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

      service.getProcessingStats().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  // =============================================================================
  // SUBMISSION INFO TESTS
  // =============================================================================

  describe('getSubmissionInfo', () => {
    it('should return submission info', (done) => {
      const mockSubmissionEmail = 'user123@submit.jensify.com';
      const mockResponse = { data: mockSubmissionEmail, error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getSubmissionInfo().subscribe({
        next: (info) => {
          expect(info.submission_email).toBe(mockSubmissionEmail);
          expect(info.is_enabled).toBe(true);
          expect(info.instructions).toEqual(EMAIL_SUBMISSION_INSTRUCTIONS);
          done();
        },
        error: done.fail
      });
    });

    it('should return disabled when no email', (done) => {
      const mockResponse = { data: null, error: null };

      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.getSubmissionInfo().subscribe({
        next: (info) => {
          expect(info.submission_email).toBe('');
          expect(info.is_enabled).toBe(false);
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

      service.getSubmissionInfo().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  // =============================================================================
  // COMPUTED PROPERTIES TESTS
  // =============================================================================

  describe('isEmailSubmissionEnabled', () => {
    it('should return false when no config', () => {
      expect(service.isEmailSubmissionEnabled()).toBe(false);
    });

    it('should return config is_enabled value', () => {
      (service as unknown as { _inboxConfig: { set: (v: EmailInboxConfig) => void } })._inboxConfig.set(mockInboxConfig);
      expect(service.isEmailSubmissionEnabled()).toBe(true);
    });

    it('should return false when config is disabled', () => {
      const disabledConfig = { ...mockInboxConfig, is_enabled: false };
      (service as unknown as { _inboxConfig: { set: (v: EmailInboxConfig) => void } })._inboxConfig.set(disabledConfig);
      expect(service.isEmailSubmissionEnabled()).toBe(false);
    });
  });

  // =============================================================================
  // INITIALIZATION TESTS
  // =============================================================================

  describe('initialize', () => {
    it('should load inbox config and email aliases', fakeAsync(() => {
      const configResponse = { data: mockInboxConfig, error: null };
      const aliasesResponse = { data: [mockEmailAlias], error: null };

      let callCount = 0;
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake((table: string) => {
        callCount++;
        if (table === 'email_inbox_config') {
          const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.resolveTo(configResponse);
          const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
          const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
          return { select: selectSpy };
        }
        if (table === 'user_email_aliases') {
          const orderSpy = jasmine.createSpy('order').and.resolveTo(aliasesResponse);
          const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
          const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
          return { select: selectSpy };
        }
        return {};
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.initialize();
      tick();

      expect(supabaseServiceSpy.client.from).toHaveBeenCalledWith('email_inbox_config');
      expect(supabaseServiceSpy.client.from).toHaveBeenCalledWith('user_email_aliases');
    }));

    it('should log warning on config load failure', fakeAsync(() => {
      const configError = new Error('Failed to load config');

      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake((table: string) => {
        if (table === 'email_inbox_config') {
          const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.resolveTo({ data: null, error: configError });
          const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
          const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
          return { select: selectSpy };
        }
        if (table === 'user_email_aliases') {
          const orderSpy = jasmine.createSpy('order').and.resolveTo({ data: [], error: null });
          const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
          const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
          return { select: selectSpy };
        }
        return {};
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.initialize();
      tick();

      expect(loggerServiceSpy.warn).toHaveBeenCalled();
    }));
  });

  // =============================================================================
  // ERROR HANDLING TESTS
  // =============================================================================

  describe('error handling', () => {
    it('should handle database errors', (done) => {
      const mockError = new Error('Database connection failed');
      const mockResponse = { data: null, error: mockError };

      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ maybeSingle: maybeSingleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      service.getInboxConfig().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });
});
