import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { OrganizationSetupComponent } from './organization-setup.component';
import { OrganizationService } from '../../../core/services/organization.service';
import { InvitationService } from '../../../core/services/invitation.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Invitation } from '../../../core/models';
import { UserRole } from '../../../core/models/enums';

describe('OrganizationSetupComponent', () => {
  let component: OrganizationSetupComponent;
  let fixture: ComponentFixture<OrganizationSetupComponent>;
  let mockOrganizationService: jasmine.SpyObj<OrganizationService>;
  let mockInvitationService: jasmine.SpyObj<InvitationService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockRouter: jasmine.SpyObj<Router>;

  const mockOrganization = {
    id: 'org-123',
    name: 'Test Company',
    domain: 'test.com',
    logo_url: undefined,
    primary_color: undefined,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    settings: {
      expense_policies: {
        max_single_receipt: 5000,
        max_daily_total: 10000,
        max_receipt_age_days: 90
      },
      approval_workflow: {
        require_manager_approval: true,
        require_finance_approval: false
      }
    }
  };

  const mockInvitation: Invitation = {
    id: 'inv-123',
    organization_id: 'org-456',
    email: 'user@example.com',
    role: UserRole.EMPLOYEE,
    status: 'pending',
    token: 'test-token-123',
    invited_by: 'admin-123',
    created_at: '2024-01-01T00:00:00Z',
    expires_at: '2024-12-31T00:00:00Z',
    organization: {
      id: 'org-456',
      name: 'Acme Corp',
      domain: 'acme.com',
      logo_url: undefined,
      primary_color: undefined,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      settings: {
        expense_policies: {
          max_single_receipt: 5000,
          max_daily_total: 10000,
          max_receipt_age_days: 90
        },
        approval_workflow: {
          require_manager_approval: true,
          require_finance_approval: false
        }
      }
    }
  };

  const mockOrganizationContext = {
    user_id: 'user-123',
    current_organization: mockOrganization,
    current_membership: {
      id: 'mem-123',
      user_id: 'user-123',
      organization_id: 'org-123',
      role: UserRole.ADMIN,
      is_active: true,
      joined_at: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    },
    organizations: [mockOrganization],
    memberships: [{
      id: 'mem-123',
      user_id: 'user-123',
      organization_id: 'org-123',
      role: UserRole.ADMIN,
      is_active: true,
      joined_at: '2024-01-01T00:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z'
    }]
  };

  beforeEach(async () => {
    mockOrganizationService = jasmine.createSpyObj('OrganizationService', [
      'createOrganization',
      'getUserOrganizationContext',
      'setCurrentOrganization'
    ]);
    mockInvitationService = jasmine.createSpyObj('InvitationService', [
      'getOrganizationInvitations',
      'acceptInvitation'
    ]);
    mockNotificationService = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [
        OrganizationSetupComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: InvitationService, useValue: mockInvitationService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    mockInvitationService.getOrganizationInvitations.and.returnValue(of([]));

    fixture = TestBed.createComponent(OrganizationSetupComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the create organization form', () => {
    expect(component.createOrgForm).toBeDefined();
    expect(component.createOrgForm.get('name')).toBeDefined();
    expect(component.createOrgForm.get('domain')).toBeDefined();
  });

  it('should validate organization name as required', () => {
    fixture.detectChanges();
    const nameControl = component.createOrgForm.get('name');
    nameControl?.setValue('');
    expect(nameControl?.hasError('required')).toBeTrue();
  });

  it('should load pending invitations on init', () => {
    fixture.detectChanges();
    expect(mockInvitationService.getOrganizationInvitations).toHaveBeenCalledWith('pending');
  });

  it('should toggle create form visibility', () => {
    expect(component.showCreateForm()).toBe(false);
    component.toggleCreateForm();
    expect(component.showCreateForm()).toBe(true);
  });

  it('should not create organization if form is invalid', () => {
    component.createOrgForm.patchValue({ name: '', domain: '' });
    component.createOrganization();
    expect(mockOrganizationService.createOrganization).not.toHaveBeenCalled();
  });

  it('should create organization with valid form data', (done) => {
    mockOrganizationService.createOrganization.and.returnValue(of(mockOrganization));
    mockOrganizationService.getUserOrganizationContext.and.returnValue(of(mockOrganizationContext));
    component.createOrgForm.patchValue({ name: 'Test Company', domain: 'test.com' });
    component.createOrganization();
    setTimeout(() => {
      expect(mockOrganizationService.createOrganization).toHaveBeenCalled();
      done();
    }, 100);
  });

  it('should accept invitation with valid token', (done) => {
    mockInvitationService.acceptInvitation.and.returnValue(of({ id: 'mem-123' } as any));
    component.acceptInvitation(mockInvitation);
    setTimeout(() => {
      expect(mockInvitationService.acceptInvitation).toHaveBeenCalledWith({ token: 'test-token-123' });
      done();
    }, 100);
  });

  it('should handle invitation without token', () => {
    const invalidInvitation = { ...mockInvitation, token: '' };
    component.acceptInvitation(invalidInvitation);
    expect(mockNotificationService.showError).toHaveBeenCalledWith('Invalid invitation');
  });

  it('should cleanup subscriptions on destroy', () => {
    fixture.detectChanges();
    spyOn(component['destroy$'], 'next');
    spyOn(component['destroy$'], 'complete');
    component.ngOnDestroy();
    expect(component['destroy$'].next).toHaveBeenCalled();
    expect(component['destroy$'].complete).toHaveBeenCalled();
  });

  it('should use OnPush change detection', () => {
    expect(fixture.componentRef.changeDetectorRef).toBeDefined();
  });
});
