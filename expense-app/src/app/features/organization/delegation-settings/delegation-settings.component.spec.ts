import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule } from '@angular/forms';
import { of, throwError } from 'rxjs';
import { DelegationSettingsComponent } from './delegation-settings.component';
import { DelegationService } from '../../../core/services/delegation.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { NotificationService } from '../../../core/services/notification.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ExpenseDelegation } from '../../../core/models/delegation.model';

describe('DelegationSettingsComponent', () => {
  let component: DelegationSettingsComponent;
  let fixture: ComponentFixture<DelegationSettingsComponent>;
  let delegationServiceMock: jasmine.SpyObj<DelegationService>;
  let organizationServiceMock: jasmine.SpyObj<OrganizationService>;
  let notificationServiceMock: jasmine.SpyObj<NotificationService>;
  let supabaseServiceMock: jasmine.SpyObj<SupabaseService>;

  const mockDelegation: ExpenseDelegation = {
    id: 'delegation-1',
    organization_id: 'org-123',
    delegator_id: 'user-1',
    delegate_id: 'user-2',
    scope: 'all',
    valid_from: '2025-01-01',
    valid_until: null,
    notes: 'Test delegation',
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    delegator: { id: 'user-1', full_name: 'John Doe', email: 'john@example.com' },
    delegate: { id: 'user-2', full_name: 'Jane Smith', email: 'jane@example.com' }
  };

  const mockMembers = [
    {
      id: 'member-1',
      user_id: 'user-1',
      user: { id: 'user-1', full_name: 'John Doe', email: 'john@example.com' }
    },
    {
      id: 'member-2',
      user_id: 'user-2',
      user: { id: 'user-2', full_name: 'Jane Smith', email: 'jane@example.com' }
    }
  ];

  beforeEach(async () => {
    delegationServiceMock = jasmine.createSpyObj('DelegationService', [
      'getAllDelegations',
      'createDelegation',
      'revokeDelegation',
      'deleteDelegation'
    ]);

    organizationServiceMock = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: 'org-123'
    });

    notificationServiceMock = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    const supabaseClientMock = {
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue(
              Promise.resolve({ data: mockMembers, error: null })
            )
          })
        })
      })
    };

    supabaseServiceMock = jasmine.createSpyObj('SupabaseService', [], {
      client: supabaseClientMock
    });

    // Default return values
    delegationServiceMock.getAllDelegations.and.returnValue(of([mockDelegation]));
    delegationServiceMock.createDelegation.and.returnValue(of('delegation-1'));
    delegationServiceMock.revokeDelegation.and.returnValue(of(true));
    delegationServiceMock.deleteDelegation.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [
        DelegationSettingsComponent,
        BrowserAnimationsModule,
        ReactiveFormsModule
      ],
      providers: [
        { provide: DelegationService, useValue: delegationServiceMock },
        { provide: OrganizationService, useValue: organizationServiceMock },
        { provide: NotificationService, useValue: notificationServiceMock },
        { provide: SupabaseService, useValue: supabaseServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(DelegationSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load delegations on init', async () => {
    await component.loadData();
    expect(delegationServiceMock.getAllDelegations).toHaveBeenCalled();
    expect(component.delegations().length).toBe(1);
  });

  it('should load organization members on init', async () => {
    await component.loadData();
    expect(supabaseServiceMock.client.from).toHaveBeenCalledWith('organization_members');
    expect(component.members().length).toBe(2);
  });

  it('should set loading to false after data loads', async () => {
    await component.loadData();
    expect(component.loading()).toBe(false);
  });

  it('should have scope options available', () => {
    expect(component.scopes).toEqual(['all', 'create', 'submit', 'view']);
    expect(component.scopeDescriptions).toBeTruthy();
    expect(component.scopeIcons).toBeTruthy();
  });

  it('should show create form when showCreateForm is true', () => {
    component.showCreateForm = false;
    expect(component.showCreateForm).toBe(false);
    component.showCreateForm = true;
    expect(component.showCreateForm).toBe(true);
  });

  it('should create delegation successfully', () => {
    component.delegationForm.patchValue({
      delegator_id: 'user-1',
      delegate_id: 'user-2',
      scope: 'all',
      valid_until: null,
      notes: 'Test'
    });

    component.createDelegation();

    expect(component.saving()).toBe(true);
    setTimeout(() => {
      expect(delegationServiceMock.createDelegation).toHaveBeenCalled();
      expect(notificationServiceMock.showSuccess).toHaveBeenCalledWith('Delegation created successfully');
      expect(component.showCreateForm).toBe(false);
    });
  });

  it('should not create delegation if form is invalid', () => {
    component.delegationForm.patchValue({ delegator_id: '' });
    component.createDelegation();
    expect(delegationServiceMock.createDelegation).not.toHaveBeenCalled();
  });

  it('should show error if delegator and delegate are the same', () => {
    component.delegationForm.patchValue({
      delegator_id: 'user-1',
      delegate_id: 'user-1',
      scope: 'all'
    });

    component.createDelegation();

    expect(notificationServiceMock.showError).toHaveBeenCalledWith(
      'Delegator and delegate must be different users'
    );
    expect(delegationServiceMock.createDelegation).not.toHaveBeenCalled();
  });

  it('should reset form after successful creation', () => {
    component.delegationForm.patchValue({
      delegator_id: 'user-1',
      delegate_id: 'user-2',
      scope: 'create',
      notes: 'Test'
    });

    component.createDelegation();

    setTimeout(() => {
      expect(component.delegationForm.value.scope).toBe('all');
      expect(component.delegationForm.value.notes).toBe('');
    });
  });

  it('should handle create delegation error', () => {
    delegationServiceMock.createDelegation.and.returnValue(
      throwError(() => new Error('Create failed'))
    );

    component.delegationForm.patchValue({
      delegator_id: 'user-1',
      delegate_id: 'user-2',
      scope: 'all'
    });

    component.createDelegation();

    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to create delegation');
      expect(component.saving()).toBe(false);
    });
  });

  it('should cancel create and reset form', () => {
    component.showCreateForm = true;
    component.delegationForm.patchValue({
      delegator_id: 'user-1',
      delegate_id: 'user-2',
      notes: 'Test'
    });

    component.cancelCreate();

    expect(component.showCreateForm).toBe(false);
    expect(component.delegationForm.value.scope).toBe('all');
    expect(component.delegationForm.value.notes).toBe('');
  });

  it('should revoke delegation when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);

    component.revokeDelegation(mockDelegation);

    expect(window.confirm).toHaveBeenCalled();
    expect(delegationServiceMock.revokeDelegation).toHaveBeenCalledWith('delegation-1');
  });

  it('should not revoke delegation if not confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(false);

    component.revokeDelegation(mockDelegation);

    expect(delegationServiceMock.revokeDelegation).not.toHaveBeenCalled();
  });

  it('should handle revoke delegation error', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    delegationServiceMock.revokeDelegation.and.returnValue(
      throwError(() => new Error('Revoke failed'))
    );

    component.revokeDelegation(mockDelegation);

    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to revoke delegation');
    });
  });

  it('should delete delegation when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);

    component.deleteDelegation(mockDelegation);

    expect(window.confirm).toHaveBeenCalled();
    expect(delegationServiceMock.deleteDelegation).toHaveBeenCalledWith('delegation-1');
  });

  it('should not delete delegation if not confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(false);

    component.deleteDelegation(mockDelegation);

    expect(delegationServiceMock.deleteDelegation).not.toHaveBeenCalled();
  });

  it('should handle delete delegation error', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    delegationServiceMock.deleteDelegation.and.returnValue(
      throwError(() => new Error('Delete failed'))
    );

    component.deleteDelegation(mockDelegation);

    setTimeout(() => {
      expect(notificationServiceMock.showError).toHaveBeenCalledWith('Failed to delete delegation');
    });
  });

  it('should reload data after successful revoke', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    spyOn(component, 'loadData');

    component.revokeDelegation(mockDelegation);

    setTimeout(() => {
      expect(component.loadData).toHaveBeenCalled();
    });
  });

  it('should reload data after successful delete', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    spyOn(component, 'loadData');

    component.deleteDelegation(mockDelegation);

    setTimeout(() => {
      expect(component.loadData).toHaveBeenCalled();
    });
  });

  it('should handle load delegations error', () => {
    delegationServiceMock.getAllDelegations.and.returnValue(
      throwError(() => new Error('Load failed'))
    );

    spyOn(console, 'error');
    component.loadData();

    setTimeout(() => {
      expect(console.error).toHaveBeenCalledWith('Error loading delegations:', jasmine.any(Error));
    });
  });

  it('should handle error loading organization data', async () => {
    const errorClientMock = {
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue(
              Promise.resolve({ data: null, error: new Error('Load failed') })
            )
          })
        })
      })
    };

    (supabaseServiceMock as any).client = errorClientMock;

    spyOn(console, 'error');
    await component.loadData();

    expect(console.error).toHaveBeenCalled();
  });

  it('should set loading to false even if errors occur', async () => {
    delegationServiceMock.getAllDelegations.and.returnValue(
      throwError(() => new Error('Load failed'))
    );

    await component.loadData();
    expect(component.loading()).toBe(false);
  });

  it('should format valid_until date correctly when creating delegation', () => {
    const testDate = new Date('2025-12-31');
    component.delegationForm.patchValue({
      delegator_id: 'user-1',
      delegate_id: 'user-2',
      scope: 'all',
      valid_until: testDate
    });

    component.createDelegation();

    setTimeout(() => {
      const callArgs = delegationServiceMock.createDelegation.calls.mostRecent().args[0];
      expect(callArgs.valid_until).toBe('2025-12-31');
    });
  });

  it('should initialize with default form values', () => {
    expect(component.delegationForm.value.scope).toBe('all');
    expect(component.delegationForm.value.delegator_id).toBe('');
    expect(component.delegationForm.value.delegate_id).toBe('');
  });
});
