import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { Router, NavigationEnd } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of, Subject, BehaviorSubject } from 'rxjs';
import { SidebarNav } from './sidebar-nav';
import { AuthService } from '../../services/auth.service';
import { OrganizationService } from '../../services/organization.service';
import { ExpenseService } from '../../services/expense.service';
import { ReportService } from '../../services/report.service';
import { ApprovalService } from '../../services/approval.service';
import { ThemeService } from '../../services/theme.service';
import { OrganizationMember, Organization } from '../../models';
import { UserRole } from '../../models/enums';

describe('SidebarNav', () => {
  let component: SidebarNav;
  let fixture: ComponentFixture<SidebarNav>;
  let organizationServiceMock: jasmine.SpyObj<OrganizationService>;
  let authServiceMock: jasmine.SpyObj<AuthService>;
  let expenseServiceMock: jasmine.SpyObj<ExpenseService>;
  let reportServiceMock: jasmine.SpyObj<ReportService>;
  let approvalServiceMock: jasmine.SpyObj<ApprovalService>;
  let themeServiceMock: jasmine.SpyObj<ThemeService>;

  const mockOrganization: Organization = {
    id: 'org-123',
    name: 'Test Organization',
    settings: {
      expense_policies: {
        max_single_receipt: 1000,
        max_daily_total: 5000,
        max_receipt_age_days: 90
      },
      approval_workflow: {
        require_manager_approval: true,
        require_finance_approval: true
      }
    },
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  const createMockMember = (role: UserRole, overrides: Partial<OrganizationMember> = {}): OrganizationMember => ({
    id: 'member-123',
    organization_id: 'org-123',
    user_id: 'user-123',
    role,
    is_active: true,
    joined_at: '2025-01-01T00:00:00Z',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides
  });

  const setupService = (role: UserRole, canManageExpenses = false, canAccessFinance = false) => {
    const membership = createMockMember(role, {
      can_manage_expenses: canManageExpenses,
      can_access_finance: canAccessFinance
    });

    // Update the mock methods based on role and permissions
    organizationServiceMock.isCurrentUserAdmin.and.callFake(() => role === UserRole.ADMIN);

    organizationServiceMock.isCurrentUserFinanceOrAdmin.and.callFake(() => {
      if (role === UserRole.FINANCE || role === UserRole.ADMIN) return true;
      if (role === UserRole.MANAGER && canAccessFinance) return true;
      return false;
    });

    organizationServiceMock.isCurrentUserManagerOrAbove.and.callFake(() => {
      if (role === UserRole.MANAGER || role === UserRole.ADMIN) return true;
      if (role === UserRole.FINANCE && canManageExpenses) return true;
      return false;
    });

    (organizationServiceMock as any).currentMembership$ = new BehaviorSubject(membership);
    (organizationServiceMock as any).currentOrganization$ = new BehaviorSubject(mockOrganization);
  };

  beforeEach(async () => {
    organizationServiceMock = jasmine.createSpyObj('OrganizationService', [
      'isCurrentUserAdmin',
      'isCurrentUserFinanceOrAdmin',
      'isCurrentUserManagerOrAbove',
      'getUserOrganizations',
      'setCurrentOrganization'
    ], {
      currentMembership$: new BehaviorSubject(null),
      currentOrganization$: new BehaviorSubject(null),
      currentOrganizationId: 'org-123'
    });

    // Default mock returns
    organizationServiceMock.getUserOrganizations.and.returnValue(of([mockOrganization]));

    authServiceMock = jasmine.createSpyObj('AuthService', ['logout']);
    expenseServiceMock = jasmine.createSpyObj('ExpenseService', ['getMyExpenses']);
    reportServiceMock = jasmine.createSpyObj('ReportService', ['getReports']);
    approvalServiceMock = jasmine.createSpyObj('ApprovalService', ['getPendingApprovals']);
    themeServiceMock = jasmine.createSpyObj('ThemeService', ['toggleTheme'], {
      isDarkMode$: of(false)
    });

    // Default return values
    expenseServiceMock.getMyExpenses.and.returnValue(of([]));
    reportServiceMock.getReports.and.returnValue(of([]));
    approvalServiceMock.getPendingApprovals.and.returnValue(of([]));

    // Set default role
    setupService(UserRole.EMPLOYEE);

    await TestBed.configureTestingModule({
      imports: [
        SidebarNav,
        BrowserAnimationsModule,
        RouterTestingModule
      ],
      providers: [
        { provide: AuthService, useValue: authServiceMock },
        { provide: OrganizationService, useValue: organizationServiceMock },
        { provide: ExpenseService, useValue: expenseServiceMock },
        { provide: ReportService, useValue: reportServiceMock },
        { provide: ApprovalService, useValue: approvalServiceMock },
        { provide: ThemeService, useValue: themeServiceMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(SidebarNav);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('Menu Visibility - Approvals Menu', () => {
    it('should show Approvals menu for managers', () => {
      setupService(UserRole.MANAGER);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const approvalsItem = navItems.find(item => item.route === '/approvals');

      expect(approvalsItem).toBeDefined();
    });

    it('should show Approvals menu for admins', () => {
      setupService(UserRole.ADMIN);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const approvalsItem = navItems.find(item => item.route === '/approvals');

      expect(approvalsItem).toBeDefined();
    });

    it('should show Approvals menu for finance users with can_manage_expenses', () => {
      setupService(UserRole.FINANCE, true, false);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const approvalsItem = navItems.find(item => item.route === '/approvals');

      expect(approvalsItem).toBeDefined();
    });

    it('should NOT show Approvals menu for regular finance users', () => {
      setupService(UserRole.FINANCE, false, false);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const approvalsItem = navItems.find(item => item.route === '/approvals');

      expect(approvalsItem).toBeUndefined();
    });

    it('should NOT show Approvals menu for regular employees', () => {
      setupService(UserRole.EMPLOYEE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const approvalsItem = navItems.find(item => item.route === '/approvals');

      expect(approvalsItem).toBeUndefined();
    });
  });

  describe('Menu Visibility - Finance Menu', () => {
    it('should show Finance menu for finance users', () => {
      setupService(UserRole.FINANCE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const financeItem = navItems.find(item => item.route === '/finance');

      expect(financeItem).toBeDefined();
    });

    it('should show Finance menu for admins', () => {
      setupService(UserRole.ADMIN);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const financeItem = navItems.find(item => item.route === '/finance');

      expect(financeItem).toBeDefined();
    });

    it('should show Finance menu for managers with can_access_finance', () => {
      setupService(UserRole.MANAGER, false, true);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const financeItem = navItems.find(item => item.route === '/finance');

      expect(financeItem).toBeDefined();
    });

    it('should NOT show Finance menu for regular managers', () => {
      setupService(UserRole.MANAGER, false, false);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const financeItem = navItems.find(item => item.route === '/finance');

      expect(financeItem).toBeUndefined();
    });

    it('should NOT show Finance menu for regular employees', () => {
      setupService(UserRole.EMPLOYEE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const financeItem = navItems.find(item => item.route === '/finance');

      expect(financeItem).toBeUndefined();
    });
  });

  describe('Menu Visibility - Admin Menu', () => {
    it('should show Admin menu only for admins', () => {
      setupService(UserRole.ADMIN);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const adminItem = navItems.find(item => item.route === '/admin');

      expect(adminItem).toBeDefined();
    });

    it('should NOT show Admin menu for managers', () => {
      setupService(UserRole.MANAGER);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const adminItem = navItems.find(item => item.route === '/admin');

      expect(adminItem).toBeUndefined();
    });

    it('should NOT show Admin menu for finance users', () => {
      setupService(UserRole.FINANCE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const adminItem = navItems.find(item => item.route === '/admin');

      expect(adminItem).toBeUndefined();
    });

    it('should NOT show Admin menu for employees', () => {
      setupService(UserRole.EMPLOYEE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const adminItem = navItems.find(item => item.route === '/admin');

      expect(adminItem).toBeUndefined();
    });
  });

  describe('Common Menu Items', () => {
    it('should show Dashboard for all roles', () => {
      setupService(UserRole.EMPLOYEE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const dashboardItem = navItems.find(item => item.route === '/home');

      expect(dashboardItem).toBeDefined();
    });

    it('should show Expenses for all roles', () => {
      setupService(UserRole.EMPLOYEE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const expensesItem = navItems.find(item => item.route === '/expenses');

      expect(expensesItem).toBeDefined();
    });

    it('should show Reports for all roles', () => {
      setupService(UserRole.EMPLOYEE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const reportsItem = navItems.find(item => item.route === '/reports');

      expect(reportsItem).toBeDefined();
    });

    it('should show Mileage for all roles', () => {
      setupService(UserRole.EMPLOYEE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const mileageItem = navItems.find(item => item.route === '/mileage');

      expect(mileageItem).toBeDefined();
    });

    it('should show Profile for all roles', () => {
      setupService(UserRole.EMPLOYEE);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const profileItem = navItems.find(item => item.route === '/profile');

      expect(profileItem).toBeDefined();
    });
  });

  describe('Combined Permissions', () => {
    it('should show both Approvals and Finance for finance user with can_manage_expenses', () => {
      setupService(UserRole.FINANCE, true, false);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const approvalsItem = navItems.find(item => item.route === '/approvals');
      const financeItem = navItems.find(item => item.route === '/finance');

      // Finance users always have finance access
      expect(financeItem).toBeDefined();
      // Finance users with can_manage_expenses can also approve
      expect(approvalsItem).toBeDefined();
    });

    it('should show both Approvals and Finance for manager with can_access_finance', () => {
      setupService(UserRole.MANAGER, false, true);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const approvalsItem = navItems.find(item => item.route === '/approvals');
      const financeItem = navItems.find(item => item.route === '/finance');

      // Managers always have approval access
      expect(approvalsItem).toBeDefined();
      // Managers with can_access_finance can also access finance
      expect(financeItem).toBeDefined();
    });

    it('should show all menus for admin', () => {
      setupService(UserRole.ADMIN);
      fixture.detectChanges();

      const navItems = component.filteredNavItems;
      const approvalsItem = navItems.find(item => item.route === '/approvals');
      const financeItem = navItems.find(item => item.route === '/finance');
      const adminItem = navItems.find(item => item.route === '/admin');

      expect(approvalsItem).toBeDefined();
      expect(financeItem).toBeDefined();
      expect(adminItem).toBeDefined();
    });
  });

  describe('Navigation', () => {
    it('should emit closeSidebar when navigate is called', () => {
      spyOn(component.closeSidebar, 'emit');

      component.navigate('/home');

      expect(component.closeSidebar.emit).toHaveBeenCalled();
    });

    it('should emit closeSidebar when backdrop is clicked', () => {
      spyOn(component.closeSidebar, 'emit');

      component.onBackdropClick();

      expect(component.closeSidebar.emit).toHaveBeenCalled();
    });
  });

  describe('Collapse Toggle', () => {
    it('should toggle collapsed state', () => {
      const initialState = component.collapsed();

      component.toggleCollapse();

      expect(component.collapsed()).toBe(!initialState);
    });

    it('should emit collapsedChange when toggled', () => {
      spyOn(component.collapsedChange, 'emit');

      component.toggleCollapse();

      expect(component.collapsedChange.emit).toHaveBeenCalled();
    });
  });

  describe('Route Active Detection', () => {
    it('should detect exact route match', () => {
      const router = TestBed.inject(Router);
      spyOnProperty(router, 'url').and.returnValue('/home');

      expect(component.isActive('/home')).toBe(true);
    });

    it('should detect child route match', () => {
      const router = TestBed.inject(Router);
      spyOnProperty(router, 'url').and.returnValue('/expenses/123');

      expect(component.isActive('/expenses')).toBe(true);
    });

    it('should not match unrelated routes', () => {
      const router = TestBed.inject(Router);
      spyOnProperty(router, 'url').and.returnValue('/expenses');

      expect(component.isActive('/reports')).toBe(false);
    });
  });
});
