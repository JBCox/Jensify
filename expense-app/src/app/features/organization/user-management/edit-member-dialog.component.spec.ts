import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { EditMemberDialogComponent, EditMemberDialogData } from './edit-member-dialog.component';
import { OrganizationMember } from '../../../core/models';
import { UserRole } from '../../../core/models/enums';

describe('EditMemberDialogComponent', () => {
  let component: EditMemberDialogComponent;
  let fixture: ComponentFixture<EditMemberDialogComponent>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<EditMemberDialogComponent>>;

  const mockMember: OrganizationMember = {
    id: 'member-123',
    organization_id: 'org-123',
    user_id: 'user-123',
    role: UserRole.EMPLOYEE,
    is_active: true,
    joined_at: '2025-01-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    user: {
      id: 'user-123',
      email: 'test@example.com',
      full_name: 'Test User',
      role: UserRole.EMPLOYEE,
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z'
    }
  };

  const mockDialogData: EditMemberDialogData = {
    member: mockMember,
    managers: []
  };

  beforeEach(async () => {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);

    await TestBed.configureTestingModule({
      imports: [
        EditMemberDialogComponent,
        BrowserAnimationsModule
      ],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: MAT_DIALOG_DATA, useValue: mockDialogData }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EditMemberDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Toggle Visibility based on Role', () => {
    it('should show can_manage_expenses toggle only for Finance role', async () => {
      // Set role to Finance
      component.form.patchValue({ role: UserRole.FINANCE });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.showManagerRightsToggle()).toBe(true);
      expect(component.showFinanceAccessToggle()).toBe(false);
    });

    it('should show can_access_finance toggle only for Manager role', async () => {
      // Set role to Manager
      component.form.patchValue({ role: UserRole.MANAGER });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.showManagerRightsToggle()).toBe(false);
      expect(component.showFinanceAccessToggle()).toBe(true);
    });

    it('should hide both toggles for Employee role', async () => {
      // Set role to Employee
      component.form.patchValue({ role: UserRole.EMPLOYEE });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.showManagerRightsToggle()).toBe(false);
      expect(component.showFinanceAccessToggle()).toBe(false);
    });

    it('should hide both toggles for Admin role', async () => {
      // Set role to Admin (admins have all permissions by default)
      component.form.patchValue({ role: UserRole.ADMIN });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.showManagerRightsToggle()).toBe(false);
      expect(component.showFinanceAccessToggle()).toBe(false);
    });
  });

  describe('Permission Flag Reset on Role Change', () => {
    it('should reset can_manage_expenses when role changes from Finance', async () => {
      // Start with Finance role and can_manage_expenses enabled
      component.form.patchValue({
        role: UserRole.FINANCE,
        can_manage_expenses: true
      });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.form.value.can_manage_expenses).toBe(true);

      // Change role to Manager
      component.form.patchValue({ role: UserRole.MANAGER });
      fixture.detectChanges();
      await fixture.whenStable();

      // can_manage_expenses should be reset to false
      expect(component.form.value.can_manage_expenses).toBe(false);
    });

    it('should reset can_access_finance when role changes from Manager', async () => {
      // Start with Manager role and can_access_finance enabled
      component.form.patchValue({
        role: UserRole.MANAGER,
        can_access_finance: true
      });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.form.value.can_access_finance).toBe(true);

      // Change role to Finance
      component.form.patchValue({ role: UserRole.FINANCE });
      fixture.detectChanges();
      await fixture.whenStable();

      // can_access_finance should be reset to false
      expect(component.form.value.can_access_finance).toBe(false);
    });

    it('should reset both flags when changing to Employee', async () => {
      // Start with Manager role and flag enabled
      component.form.patchValue({
        role: UserRole.MANAGER,
        can_access_finance: true
      });
      fixture.detectChanges();

      // Change role to Employee
      component.form.patchValue({ role: UserRole.EMPLOYEE });
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.form.value.can_access_finance).toBe(false);
      expect(component.form.value.can_manage_expenses).toBe(false);
    });
  });

  describe('Save Output', () => {
    it('should include can_manage_expenses in output for Finance role', () => {
      component.form.patchValue({
        role: UserRole.FINANCE,
        department: 'Accounting',
        manager_id: null,
        can_manage_expenses: true
      });

      component.save();

      expect(dialogRefSpy.close).toHaveBeenCalledWith({
        role: UserRole.FINANCE,
        department: 'Accounting',
        manager_id: null,
        can_manage_expenses: true,
        can_access_finance: false
      });
    });

    it('should include can_access_finance in output for Manager role', () => {
      component.form.patchValue({
        role: UserRole.MANAGER,
        department: 'Sales',
        manager_id: null,
        can_access_finance: true
      });

      component.save();

      expect(dialogRefSpy.close).toHaveBeenCalledWith({
        role: UserRole.MANAGER,
        department: 'Sales',
        manager_id: null,
        can_manage_expenses: false,
        can_access_finance: true
      });
    });

    it('should set can_manage_expenses to false for non-Finance roles', () => {
      // Even if the form value is somehow true, save should reset it
      component.form.patchValue({
        role: UserRole.MANAGER,
        department: 'IT',
        manager_id: null,
        can_manage_expenses: true // This should be ignored for Manager
      });

      component.save();

      expect(dialogRefSpy.close).toHaveBeenCalledWith(jasmine.objectContaining({
        can_manage_expenses: false
      }));
    });

    it('should set can_access_finance to false for non-Manager roles', () => {
      // Even if the form value is somehow true, save should reset it
      component.form.patchValue({
        role: UserRole.FINANCE,
        department: 'Finance',
        manager_id: null,
        can_access_finance: true // This should be ignored for Finance
      });

      component.save();

      expect(dialogRefSpy.close).toHaveBeenCalledWith(jasmine.objectContaining({
        can_access_finance: false
      }));
    });

    it('should not close dialog when form is invalid', () => {
      // Make form invalid by clearing required field
      component.form.patchValue({ role: null });
      component.form.get('role')?.setErrors({ required: true });

      component.save();

      expect(dialogRefSpy.close).not.toHaveBeenCalled();
    });
  });

  describe('Initial Values', () => {
    it('should initialize with member data', () => {
      expect(component.form.value.role).toBe(mockMember.role);
      expect(component.data.member).toEqual(mockMember);
    });

    it('should initialize can_manage_expenses from member data', async () => {
      // Create new component with Finance member that has can_manage_expenses
      const financeMember = {
        ...mockMember,
        role: UserRole.FINANCE,
        can_manage_expenses: true
      };

      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [EditMemberDialogComponent, BrowserAnimationsModule],
        providers: [
          { provide: MatDialogRef, useValue: dialogRefSpy },
          { provide: MAT_DIALOG_DATA, useValue: { member: financeMember, managers: [] } }
        ]
      }).compileComponents();

      const newFixture = TestBed.createComponent(EditMemberDialogComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.form.value.can_manage_expenses).toBe(true);
    });

    it('should initialize can_access_finance from member data', async () => {
      // Create new component with Manager that has can_access_finance
      const managerMember = {
        ...mockMember,
        role: UserRole.MANAGER,
        can_access_finance: true
      };

      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [EditMemberDialogComponent, BrowserAnimationsModule],
        providers: [
          { provide: MatDialogRef, useValue: dialogRefSpy },
          { provide: MAT_DIALOG_DATA, useValue: { member: managerMember, managers: [] } }
        ]
      }).compileComponents();

      const newFixture = TestBed.createComponent(EditMemberDialogComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.form.value.can_access_finance).toBe(true);
    });
  });

  describe('getInitial', () => {
    it('should return first letter of user name', () => {
      expect(component.getInitial()).toBe('T'); // 'Test User' -> 'T'
    });

    it('should return U for unknown user', async () => {
      const memberWithNoName = { ...mockMember, user: undefined };

      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({
        imports: [EditMemberDialogComponent, BrowserAnimationsModule],
        providers: [
          { provide: MatDialogRef, useValue: dialogRefSpy },
          { provide: MAT_DIALOG_DATA, useValue: { member: memberWithNoName, managers: [] } }
        ]
      }).compileComponents();

      const newFixture = TestBed.createComponent(EditMemberDialogComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();

      expect(newComponent.getInitial()).toBe('U');
    });
  });
});
