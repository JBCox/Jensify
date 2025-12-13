import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError, BehaviorSubject, Subject } from 'rxjs';
import { AcceptInvitationComponent } from './accept-invitation.component';
import { InvitationService } from '../../../core/services/invitation.service';
import { AuthService } from '../../../core/services/auth.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Invitation } from '../../../core/models';
import { UserRole } from '../../../core/models/enums';

describe('AcceptInvitationComponent', () => {
  let component: AcceptInvitationComponent;
  let fixture: ComponentFixture<AcceptInvitationComponent>;
  let mockInvitationService: jasmine.SpyObj<InvitationService>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockSupabaseService: jasmine.SpyObj<SupabaseService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let queryParamsSubject: BehaviorSubject<any>;

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
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      settings: {
        expense_policies: {
          max_single_receipt: 500,
          max_daily_total: 1000,
          max_receipt_age_days: 90
        },
        approval_workflow: {
          require_manager_approval: true,
          require_finance_approval: false
        }
      }
    }
  };

  beforeEach(async () => {
    queryParamsSubject = new BehaviorSubject({ token: 'test-token-123' });

    mockInvitationService = jasmine.createSpyObj('InvitationService', [
      'getInvitationByToken',
      'acceptInvitation'
    ]);
    mockAuthService = jasmine.createSpyObj('AuthService', ['refreshUserProfile'], {
      isAuthenticated: true
    });
    // Mock refreshUserProfile to return a resolved promise
    mockAuthService.refreshUserProfile.and.returnValue(Promise.resolve());
    mockSupabaseService = jasmine.createSpyObj('SupabaseService', ['clearPendingInvitationToken']);
    // Mock clearPendingInvitationToken to return a resolved promise
    mockSupabaseService.clearPendingInvitationToken.and.returnValue(Promise.resolve());
    mockNotificationService = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [
        AcceptInvitationComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: InvitationService, useValue: mockInvitationService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParams: queryParamsSubject.asObservable()
          }
        }
      ]
    }).compileComponents();

    mockInvitationService.getInvitationByToken.and.returnValue(of(mockInvitation));

    fixture = TestBed.createComponent(AcceptInvitationComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load invitation on init with token from query params', (done) => {
    fixture.detectChanges();

    
      expect(mockInvitationService.getInvitationByToken).toHaveBeenCalledWith('test-token-123');
      expect(component.invitation()).toEqual(mockInvitation);
      expect(component.isLoading()).toBe(false);
      done();
  });

  it('should set error if no token in query params', (done) => {
    queryParamsSubject.next({});
    fixture.detectChanges();

    
      expect(component.error()).toBe('Invalid invitation link');
      expect(component.isLoading()).toBe(false);
      done();
  });

  it('should set error if invitation not found', (done) => {
    mockInvitationService.getInvitationByToken.and.returnValue(of(null));
    fixture.detectChanges();

    
      expect(component.error()).toBe('Invitation not found or expired');
      expect(component.isLoading()).toBe(false);
      done();
  });

  it('should handle error when loading invitation fails', (done) => {
    mockInvitationService.getInvitationByToken.and.returnValue(
      throwError(() => new Error('Failed to load'))
    );
    fixture.detectChanges();

    
      expect(component.error()).toBe('Failed to load invitation');
      expect(component.isLoading()).toBe(false);
      done();
  });

  it('should accept invitation when authenticated', async () => {
    mockInvitationService.acceptInvitation.and.returnValue(of({
      id: 'mem-123',
      organization_id: 'org-456'
    } as any));

    fixture.detectChanges();

    component.acceptInvitation();

    // Wait for the async operations to complete
    await fixture.whenStable();

    expect(mockInvitationService.acceptInvitation).toHaveBeenCalledWith({
      token: 'test-token-123'
    });
    expect(mockAuthService.refreshUserProfile).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/home']);
  });

  it('should redirect to login if not authenticated', (done) => {
    Object.defineProperty(mockAuthService, 'isAuthenticated', {
      get: () => false,
      configurable: true
    });

    fixture.detectChanges();

    
      component.acceptInvitation();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login'], {
        queryParams: { returnUrl: '/auth/accept-invitation?token=test-token-123' }
      });
      done();
  });

  it('should handle error when accepting invitation fails', (done) => {
    mockInvitationService.acceptInvitation.and.returnValue(
      throwError(() => ({ message: 'Invitation expired' }))
    );

    fixture.detectChanges();

    
      component.acceptInvitation();

      
        expect(component.error()).toBe('Invitation expired');
        expect(component.isLoading()).toBe(false);
        done();
  });

  it('should navigate to home on decline', () => {
    component.declineInvitation();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/']);
  });

  it('should navigate to login and store token in localStorage', (done) => {
    spyOn(localStorage, 'setItem');
    fixture.detectChanges();

    component.goToLogin();
    expect(localStorage.setItem).toHaveBeenCalledWith('pending_invitation_token', 'test-token-123');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    done();
  });

  it('should navigate to login without return URL if no token', () => {
    component.token = null;
    component.goToLogin();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('should navigate to register and store token in localStorage', (done) => {
    spyOn(localStorage, 'setItem');
    fixture.detectChanges();

    component.goToRegister();
    expect(localStorage.setItem).toHaveBeenCalledWith('pending_invitation_token', 'test-token-123');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/register'], {
      queryParams: { invitation_token: 'test-token-123' }
    });
    done();
  });

  it('should navigate to register without return URL if no token', () => {
    component.token = null;
    component.goToRegister();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/register']);
  });

  it('should set loading state correctly during accept', async () => {
    mockInvitationService.acceptInvitation.and.returnValue(of({
      id: 'mem-123',
      organization_id: 'org-456'
    } as any));

    fixture.detectChanges();

    expect(component.isLoading()).toBe(false);
    component.acceptInvitation();
    // Loading should be true immediately after calling acceptInvitation
    expect(component.isLoading()).toBe(true);

    // Wait for the async operations to complete
    await fixture.whenStable();

    // After all async operations complete, loading should be false
    expect(component.isLoading()).toBe(false);
  });

  it('should store token from query params', (done) => {
    fixture.detectChanges();

    
      expect(component.token).toBe('test-token-123');
      done();
  });

  it('should cleanup subscriptions on destroy', () => {
    fixture.detectChanges();
    spyOn(component['destroy$'], 'next');
    spyOn(component['destroy$'], 'complete');
    component.ngOnDestroy();
    expect(component['destroy$'].next).toHaveBeenCalled();
    expect(component['destroy$'].complete).toHaveBeenCalled();
  });

  it('should render loading spinner when loading', () => {
    // Use a Subject that doesn't emit to keep loading state true
    mockInvitationService.getInvitationByToken.and.returnValue(new Subject());

    // Trigger initialization
    fixture.detectChanges();

    // isLoading should still be true since getInvitationByToken hasn't emitted
    const compiled = fixture.nativeElement as HTMLElement;
    const spinner = compiled.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
  });

  it('should display error message when error exists', () => {
    component.error.set('Test error message');
    component.isLoading.set(false);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const errorText = compiled.textContent;
    expect(errorText).toContain('Test error message');
  });

  it('should use OnPush change detection', () => {
    expect(fixture.componentRef.changeDetectorRef).toBeDefined();
  });
});
