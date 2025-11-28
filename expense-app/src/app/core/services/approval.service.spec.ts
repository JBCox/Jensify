import { TestBed } from '@angular/core/testing';
import { ApprovalService } from './approval.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { NotificationService } from './notification.service';
import { LoggerService } from './logger.service';
import {
  ApprovalWorkflow,
  ApprovalStep,
  ExpenseApproval,
  ApprovalAction,
  ApprovalStatus,
  CreateWorkflowDto,
  UpdateWorkflowDto,
  ApproveExpenseDto,
  RejectExpenseDto,
  ApprovalWithDetails,
  ApprovalFilters,
  ApprovalStats
} from '../models/approval.model';
import { of, throwError } from 'rxjs';

describe('ApprovalService', () => {
  let service: ApprovalService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let notificationServiceSpy: jasmine.SpyObj<NotificationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;
  let mockSupabaseClient: any;

  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';

  const mockWorkflow: ApprovalWorkflow = {
    id: 'workflow-1',
    organization_id: mockOrganizationId,
    name: 'Manager Approval',
    description: 'Requires manager approval',
    conditions: { amount_min: 100, amount_max: 1000 },
    priority: 1,
    is_active: true,
    created_by: mockUserId,
    created_at: '2025-11-23T00:00:00Z',
    updated_at: '2025-11-23T00:00:00Z'
  };

  const mockStep: ApprovalStep = {
    id: 'step-1',
    workflow_id: 'workflow-1',
    step_order: 1,
    step_type: 'role',
    approver_role: 'manager',
    require_all: false
  };

  const mockApproval: ExpenseApproval = {
    id: 'approval-1',
    organization_id: mockOrganizationId,
    expense_id: 'expense-1',
    workflow_id: 'workflow-1',
    current_step: 1,
    total_steps: 2,
    current_approver_id: mockUserId,
    status: ApprovalStatus.PENDING,
    submitted_at: '2025-11-23T00:00:00Z',
    completed_at: null,
    created_at: '2025-11-23T00:00:00Z',
    updated_at: '2025-11-23T00:00:00Z'
  };

  const mockApprovalAction: ApprovalAction = {
    id: 'action-1',
    expense_approval_id: 'approval-1',
    step_number: 1,
    actor_id: mockUserId,
    actor_role: 'employee',
    action: 'submitted',
    action_at: '2025-11-23T00:00:00Z'
  };

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabaseClient = {
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null })),
            single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null })),
            gte: jasmine.createSpy('gte').and.returnValue({
              lte: jasmine.createSpy('lte').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
              }),
              order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
            }),
            lte: jasmine.createSpy('lte').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
            }),
            in: jasmine.createSpy('in').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
            })
          }),
          order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null })),
          gte: jasmine.createSpy('gte').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
          }),
          lte: jasmine.createSpy('lte').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
          }),
          in: jasmine.createSpy('in').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
          })
        }),
        insert: jasmine.createSpy('insert').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null }))
          })
        }),
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null }))
            })
          })
        }),
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ data: null, error: null }))
        })
      }),
      rpc: jasmine.createSpy('rpc').and.returnValue(Promise.resolve({ data: null, error: null }))
    };

    const supabaseSpy = jasmine.createSpyObj('SupabaseService', ['client', 'userId'], {
      client: mockSupabaseClient,
      userId: mockUserId
    });
    Object.defineProperty(supabaseSpy, 'client', { get: () => mockSupabaseClient });
    Object.defineProperty(supabaseSpy, 'userId', { get: () => mockUserId });

    const orgServiceSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrganizationId
    });
    Object.defineProperty(orgServiceSpy, 'currentOrganizationId', { get: () => mockOrganizationId });

    const notificationSpy = jasmine.createSpyObj('NotificationService', ['showSuccess', 'showError']);
    const loggerSpy = jasmine.createSpyObj('LoggerService', ['error', 'info', 'warn']);

    TestBed.configureTestingModule({
      providers: [
        ApprovalService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: orgServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(ApprovalService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    notificationServiceSpy = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================================================
  // WORKFLOW MANAGEMENT TESTS
  // ============================================================================

  describe('getWorkflows', () => {
    it('should fetch workflows for current organization', (done) => {
      const mockWorkflows = [mockWorkflow];
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockWorkflows, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getWorkflows().subscribe({
        next: (workflows) => {
          expect(workflows).toEqual(mockWorkflows);
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('approval_workflows');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      service.getWorkflows().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should handle Supabase errors', (done) => {
      const mockError = { message: 'Database error' };
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getWorkflows().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('getWorkflow', () => {
    it('should fetch a single workflow by ID', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockWorkflow, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.getWorkflow('workflow-1').subscribe({
        next: (workflow) => {
          expect(workflow).toEqual(mockWorkflow);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getWorkflowSteps', () => {
    it('should fetch steps for a workflow', (done) => {
      const mockSteps = [mockStep];
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockSteps, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getWorkflowSteps('workflow-1').subscribe({
        next: (steps) => {
          expect(steps).toEqual(mockSteps);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('createWorkflow', () => {
    it('should create workflow with steps', (done) => {
      const dto: CreateWorkflowDto = {
        name: 'Manager Approval',
        description: 'Requires manager approval',
        conditions: { amount_min: 100 },
        priority: 1,
        steps: [
          {
            step_order: 1,
            step_type: 'role',
            approver_role: 'manager'
          }
        ]
      };

      const workflowInsertSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockWorkflow, error: null })
      );

      const stepsInsertSpy = jasmine.createSpy('insert').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValues(
        {
          insert: jasmine.createSpy('insert').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: workflowInsertSpy
            })
          })
        },
        {
          insert: stepsInsertSpy
        }
      );

      service.createWorkflow(dto).subscribe({
        next: (workflow) => {
          expect(workflow).toEqual(mockWorkflow);
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      const dto: CreateWorkflowDto = {
        name: 'Test',
        conditions: {},
        steps: []
      };

      service.createWorkflow(dto).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('updateWorkflow', () => {
    it('should update workflow', (done) => {
      const dto: UpdateWorkflowDto = {
        name: 'Updated Name',
        is_active: false
      };

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: { ...mockWorkflow, ...dto }, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: singleSpy
            })
          })
        })
      });

      service.updateWorkflow('workflow-1', dto).subscribe({
        next: (workflow) => {
          expect(workflow.name).toBe('Updated Name');
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteWorkflow', () => {
    it('should delete workflow', (done) => {
      const deleteSpy = jasmine.createSpy('eq').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: deleteSpy
        })
      });

      service.deleteWorkflow('workflow-1').subscribe({
        next: () => {
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // APPROVAL QUEUE TESTS
  // ============================================================================

  describe('getPendingApprovals', () => {
    it('should fetch pending approvals for current user', (done) => {
      const mockApprovals = [mockApproval];

      // Mock the initial query: from('expense_approvals').select('*').eq().eq().order()
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockApprovals, error: null })
      );

      // Track which table is being queried and return appropriate mocks
      mockSupabaseClient.from.and.callFake((table: string) => {
        if (table === 'expense_approvals') {
          return {
            select: jasmine.createSpy('select').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue({
                eq: jasmine.createSpy('eq').and.returnValue({
                  order: orderSpy
                })
              })
            })
          };
        } else if (table === 'approval_workflows') {
          // .in(...).then(...) pattern - .in() must return a Promise
          return {
            select: jasmine.createSpy('select').and.returnValue({
              in: jasmine.createSpy('in').and.returnValue(
                Promise.resolve({ data: [mockWorkflow], error: null })
              )
            })
          };
        } else if (table === 'expenses') {
          return {
            select: jasmine.createSpy('select').and.returnValue({
              in: jasmine.createSpy('in').and.returnValue(
                Promise.resolve({ data: [], error: null })
              )
            })
          };
        } else if (table === 'expense_reports') {
          return {
            select: jasmine.createSpy('select').and.returnValue({
              in: jasmine.createSpy('in').and.returnValue(
                Promise.resolve({ data: [], error: null })
              )
            })
          };
        }
        return {};
      });

      service.getPendingApprovals().subscribe({
        next: (approvals) => {
          expect(approvals.length).toBe(1);
          done();
        },
        error: done.fail
      });
    });

    it('should apply date filters', (done) => {
      const filters: ApprovalFilters = {
        date_from: '2025-11-01',
        date_to: '2025-11-30'
      };

      const gteSpy = jasmine.createSpy('gte').and.returnValue({
        lte: jasmine.createSpy('lte').and.returnValue({
          order: jasmine.createSpy('order').and.returnValue(
            Promise.resolve({ data: [], error: null })
          )
        })
      });

      const eqSpy = jasmine.createSpy('eq').and.returnValues(
        {
          eq: jasmine.createSpy('eq').and.returnValue({
            gte: gteSpy
          })
        }
      );

      let callCount = 0;
      mockSupabaseClient.from.and.callFake(() => {
        callCount++;
        if (callCount === 1) {
          return {
            select: jasmine.createSpy('select').and.returnValue({
              eq: eqSpy
            })
          };
        } else {
          return {
            select: jasmine.createSpy('select').and.returnValue({
              in: jasmine.createSpy('in').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue(
                  Promise.resolve({ data: [], error: null })
                )
              })
            })
          };
        }
      });

      service.getPendingApprovals(filters).subscribe({
        next: () => {
          expect(gteSpy).toHaveBeenCalledWith('submitted_at', filters.date_from);
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.getPendingApprovals().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('getMySubmissions', () => {
    it('should fetch user submissions', (done) => {
      const mockApprovals = [mockApproval];

      // Mock the initial query: from('expense_approvals').select('*').eq('organization_id', ...).order()
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockApprovals, error: null })
      );

      // Track which table is being queried and return appropriate mocks
      mockSupabaseClient.from.and.callFake((table: string) => {
        if (table === 'expense_approvals') {
          return {
            select: jasmine.createSpy('select').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue({
                order: orderSpy
              })
            })
          };
        } else if (table === 'approval_workflows') {
          // .in(...).then(...) pattern - .in() must return a Promise
          return {
            select: jasmine.createSpy('select').and.returnValue({
              in: jasmine.createSpy('in').and.returnValue(
                Promise.resolve({ data: [mockWorkflow], error: null })
              )
            })
          };
        } else if (table === 'expenses') {
          return {
            select: jasmine.createSpy('select').and.returnValue({
              in: jasmine.createSpy('in').and.returnValue(
                Promise.resolve({ data: [], error: null })
              )
            })
          };
        } else if (table === 'expense_reports') {
          return {
            select: jasmine.createSpy('select').and.returnValue({
              in: jasmine.createSpy('in').and.returnValue(
                Promise.resolve({ data: [], error: null })
              )
            })
          };
        }
        return {};
      });

      service.getMySubmissions().subscribe({
        next: (approvals) => {
          expect(approvals.length).toBe(1);
          expect(approvals[0].id).toEqual(mockApproval.id);
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // APPROVAL ACTIONS TESTS
  // ============================================================================

  describe('approve', () => {
    it('should approve expense via RPC', (done) => {
      const dto: ApproveExpenseDto = {
        comment: 'Looks good'
      };

      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: { ...mockApproval, status: ApprovalStatus.APPROVED }, error: null })
      );

      let callCount = 0;
      mockSupabaseClient.from.and.callFake(() => {
        callCount++;
        return {
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              maybeSingle: maybeSingleSpy
            })
          })
        };
      });

      service.approve('approval-1', dto).subscribe({
        next: (approval) => {
          expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('approve_expense', {
            p_approval_id: 'approval-1',
            p_approver_id: mockUserId,
            p_comment: dto.comment
          });
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should return minimal object when record not visible after approval', (done) => {
      const dto: ApproveExpenseDto = {
        comment: 'Looks good'
      };

      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      // Simulate record not found after approval (maybeSingle returns null)
      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.callFake(() => ({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            maybeSingle: maybeSingleSpy
          })
        })
      }));

      service.approve('approval-1', dto).subscribe({
        next: (approval) => {
          expect(approval.id).toBe('approval-1');
          expect(approval.status).toBe(ApprovalStatus.APPROVED);
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
          expect(loggerServiceSpy.warn).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.approve('approval-1', {}).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('reject', () => {
    it('should reject expense via RPC', (done) => {
      const dto: RejectExpenseDto = {
        rejection_reason: 'Invalid receipt',
        comment: 'Please resubmit'
      };

      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: { ...mockApproval, status: ApprovalStatus.REJECTED }, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            maybeSingle: maybeSingleSpy
          })
        })
      });

      service.reject('approval-1', dto).subscribe({
        next: (approval) => {
          expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('reject_expense', {
            p_approval_id: 'approval-1',
            p_approver_id: mockUserId,
            p_rejection_reason: dto.rejection_reason,
            p_comment: dto.comment
          });
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should return minimal object when record not visible after rejection', (done) => {
      const dto: RejectExpenseDto = {
        rejection_reason: 'Invalid receipt',
        comment: 'Please resubmit'
      };

      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      // Simulate record not found after rejection (maybeSingle returns null)
      const maybeSingleSpy = jasmine.createSpy('maybeSingle').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.callFake(() => ({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            maybeSingle: maybeSingleSpy
          })
        })
      }));

      service.reject('approval-1', dto).subscribe({
        next: (approval) => {
          expect(approval.id).toBe('approval-1');
          expect(approval.status).toBe(ApprovalStatus.REJECTED);
          expect(notificationServiceSpy.showSuccess).toHaveBeenCalled();
          expect(loggerServiceSpy.warn).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getApprovalHistory', () => {
    it('should fetch approval history', (done) => {
      const mockHistory = [mockApprovalAction];

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockHistory, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getApprovalHistory('approval-1').subscribe({
        next: (history) => {
          expect(history).toEqual(mockHistory as any);
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // STATS TESTS
  // ============================================================================

  describe('getApprovalStats', () => {
    it('should fetch approval statistics', (done) => {
      const mockStats: ApprovalStats = {
        pending_count: 5,
        approved_count: 10,
        rejected_count: 2,
        avg_approval_time_hours: 24
      };

      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: mockStats, error: null })
      );

      service.getApprovalStats().subscribe({
        next: (stats) => {
          expect(stats).toEqual(mockStats);
          expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_approval_stats', {
            p_approver_id: mockUserId,
            p_organization_id: mockOrganizationId
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return default stats on error', (done) => {
      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: null, error: { message: 'Error' } })
      );

      service.getApprovalStats().subscribe({
        next: (stats) => {
          expect(stats.pending_count).toBe(0);
          expect(stats.approved_count).toBe(0);
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // HELPER METHODS TESTS
  // ============================================================================

  describe('canApprove', () => {
    it('should return true if user is current approver and status is pending', () => {
      const approval = { ...mockApproval, current_approver_id: mockUserId, status: ApprovalStatus.PENDING };
      expect(service.canApprove(approval)).toBe(true);
    });

    it('should return false if user is not current approver', () => {
      const approval = { ...mockApproval, current_approver_id: 'other-user', status: ApprovalStatus.PENDING };
      expect(service.canApprove(approval)).toBe(false);
    });

    it('should return false if status is not pending', () => {
      const approval = { ...mockApproval, current_approver_id: mockUserId, status: ApprovalStatus.APPROVED };
      expect(service.canApprove(approval)).toBe(false);
    });
  });

  describe('getStatusDisplay', () => {
    it('should return correct display text for each status', () => {
      expect(service.getStatusDisplay(ApprovalStatus.PENDING)).toBe('Pending Approval');
      expect(service.getStatusDisplay(ApprovalStatus.APPROVED)).toBe('Approved');
      expect(service.getStatusDisplay(ApprovalStatus.REJECTED)).toBe('Rejected');
      expect(service.getStatusDisplay(ApprovalStatus.CANCELLED)).toBe('Cancelled');
    });
  });

  describe('getStatusColor', () => {
    it('should return correct color class for each status', () => {
      expect(service.getStatusColor(ApprovalStatus.PENDING)).toBe('warning');
      expect(service.getStatusColor(ApprovalStatus.APPROVED)).toBe('success');
      expect(service.getStatusColor(ApprovalStatus.REJECTED)).toBe('danger');
      expect(service.getStatusColor(ApprovalStatus.CANCELLED)).toBe('muted');
    });
  });
});
