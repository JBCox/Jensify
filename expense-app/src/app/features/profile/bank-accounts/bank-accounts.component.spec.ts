import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { BankAccountsComponent } from './bank-accounts.component';
import { PayoutService } from '../../../core/services/payout.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { EmployeeBankAccount } from '../../../core/models/payout.model';

describe('BankAccountsComponent', () => {
  let component: BankAccountsComponent;
  let fixture: ComponentFixture<BankAccountsComponent>;
  let mockPayoutService: jasmine.SpyObj<PayoutService>;
  let mockOrganizationService: jasmine.SpyObj<OrganizationService>;
  let mockSnackBar: jasmine.SpyObj<MatSnackBar>;
  let mockDialog: jasmine.SpyObj<MatDialog>;

  const mockBankAccounts: EmployeeBankAccount[] = [
    {
      id: 'account-1',
      user_id: 'user-1',
      organization_id: 'org-1',
      stripe_bank_account_id: 'ba_test_1',
      stripe_customer_id: 'cus_test_1',
      bank_name: 'Chase',
      account_holder_name: 'John Doe',
      account_type: 'checking',
      last_four: '1234',
      verification_status: 'verified',
      is_default: true,
      is_verified: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      verified_at: '2024-01-01T00:00:00Z'
    },
    {
      id: 'account-2',
      user_id: 'user-1',
      organization_id: 'org-1',
      stripe_bank_account_id: 'ba_test_2',
      stripe_customer_id: 'cus_test_1',
      bank_name: 'Bank of America',
      account_holder_name: 'John Doe',
      account_type: 'savings',
      last_four: '5678',
      verification_status: 'pending',
      is_default: false,
      is_verified: false,
      created_at: '2024-01-02T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      verified_at: null
    }
  ];

  beforeEach(async () => {
    mockPayoutService = jasmine.createSpyObj('PayoutService', [
      'getMyBankAccounts',
      'addBankAccount',
      'setDefaultBankAccount',
      'verifyBankAccount',
      'deleteBankAccount'
    ], {
      payoutSettings$: of(null)
    });

    mockPayoutService.getMyBankAccounts.and.returnValue(of(mockBankAccounts));
    mockPayoutService.addBankAccount.and.returnValue(of({ success: true }));
    mockPayoutService.setDefaultBankAccount.and.returnValue(of(undefined));
    mockPayoutService.verifyBankAccount.and.returnValue(of({ success: true, verified: true }));
    mockPayoutService.deleteBankAccount.and.returnValue(of(undefined));

    mockOrganizationService = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: 'org-1'
    });

    mockSnackBar = jasmine.createSpyObj('MatSnackBar', ['open']);
    mockDialog = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      imports: [
        BankAccountsComponent,
        NoopAnimationsModule
      ],
      providers: [
        { provide: PayoutService, useValue: mockPayoutService },
        { provide: OrganizationService, useValue: mockOrganizationService },
        { provide: MatSnackBar, useValue: mockSnackBar },
        { provide: MatDialog, useValue: mockDialog }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(BankAccountsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initialization', () => {
    it('should load bank accounts on init', fakeAsync(() => {
      tick();
      expect(mockPayoutService.getMyBankAccounts).toHaveBeenCalledWith('org-1');
      expect(component.bankAccounts().length).toBe(2);
      expect(component.isLoading()).toBe(false);
    }));

    it('should handle load error', fakeAsync(() => {
      mockPayoutService.getMyBankAccounts.and.returnValue(
        throwError(() => new Error('Load failed'))
      );

      const newFixture = TestBed.createComponent(BankAccountsComponent);
      newFixture.detectChanges();
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to load bank accounts',
        'Dismiss',
        { duration: 5000 }
      );
    }));

    it('should not load accounts if no organization', fakeAsync(() => {
      Object.defineProperty(mockOrganizationService, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      const newFixture = TestBed.createComponent(BankAccountsComponent);
      const newComponent = newFixture.componentInstance;
      newFixture.detectChanges();
      tick();

      expect(newComponent.isLoading()).toBe(false);
    }));
  });

  describe('onTokenCreated', () => {
    it('should add bank account with token', fakeAsync(() => {
      component.onTokenCreated('tok_test_123');
      tick();

      expect(mockPayoutService.addBankAccount).toHaveBeenCalledWith('org-1', 'tok_test_123');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Bank account added successfully',
        'Dismiss',
        { duration: 3000 }
      );
      expect(component.showAddForm()).toBe(false);
    }));

    it('should handle add failure', fakeAsync(() => {
      mockPayoutService.addBankAccount.and.returnValue(
        of({ success: false, error: 'Invalid token' })
      );

      component.onTokenCreated('tok_invalid');
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Invalid token',
        'Dismiss',
        { duration: 5000 }
      );
    }));

    it('should handle add error', fakeAsync(() => {
      mockPayoutService.addBankAccount.and.returnValue(
        throwError(() => new Error('Network error'))
      );

      component.onTokenCreated('tok_test_123');
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to add bank account',
        'Dismiss',
        { duration: 5000 }
      );
    }));

    it('should not add if no organization', () => {
      Object.defineProperty(mockOrganizationService, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      component.onTokenCreated('tok_test_123');

      expect(mockPayoutService.addBankAccount).not.toHaveBeenCalled();
    });
  });

  describe('onFormError', () => {
    it('should display error in snackbar', () => {
      component.onFormError('Invalid bank details');

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Invalid bank details',
        'Dismiss',
        { duration: 5000 }
      );
    });
  });

  describe('onFormCancel', () => {
    it('should hide add form', () => {
      component.showAddForm.set(true);
      component.onFormCancel();

      expect(component.showAddForm()).toBe(false);
    });
  });

  describe('setAsDefault', () => {
    it('should set account as default', fakeAsync(() => {
      component.setAsDefault(mockBankAccounts[1]);
      tick();

      expect(mockPayoutService.setDefaultBankAccount).toHaveBeenCalledWith('account-2', 'org-1');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Default account updated',
        'Dismiss',
        { duration: 3000 }
      );
    }));

    it('should handle set default error', fakeAsync(() => {
      mockPayoutService.setDefaultBankAccount.and.returnValue(
        throwError(() => new Error('Update failed'))
      );

      component.setAsDefault(mockBankAccounts[1]);
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to update default account',
        'Dismiss',
        { duration: 5000 }
      );
    }));
  });

  describe('verification', () => {
    it('should start verification', () => {
      component.startVerification(mockBankAccounts[1]);

      expect(component.verifyingAccountId()).toBe('account-2');
      expect(component.verifyAmount1()).toBe('');
      expect(component.verifyAmount2()).toBe('');
    });

    it('should cancel verification', () => {
      component.verifyingAccountId.set('account-2');
      component.cancelVerification();

      expect(component.verifyingAccountId()).toBeNull();
    });

    it('should submit verification successfully', fakeAsync(() => {
      component.verifyAmount1.set('32');
      component.verifyAmount2.set('45');

      component.submitVerification(mockBankAccounts[1]);
      tick();

      expect(mockPayoutService.verifyBankAccount).toHaveBeenCalledWith('account-2', [32, 45]);
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Bank account verified successfully',
        'Dismiss',
        { duration: 3000 }
      );
      expect(component.verifyingAccountId()).toBeNull();
    }));

    it('should handle invalid verification amounts', () => {
      component.verifyAmount1.set('invalid');
      component.verifyAmount2.set('45');

      component.submitVerification(mockBankAccounts[1]);

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Please enter valid amounts (in cents)',
        'Dismiss',
        { duration: 3000 }
      );
      expect(mockPayoutService.verifyBankAccount).not.toHaveBeenCalled();
    });

    it('should handle verification failure', fakeAsync(() => {
      mockPayoutService.verifyBankAccount.and.returnValue(
        of({ success: false, verified: false, error: 'Incorrect amounts' })
      );

      component.verifyAmount1.set('10');
      component.verifyAmount2.set('20');

      component.submitVerification(mockBankAccounts[1]);
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Incorrect amounts',
        'Dismiss',
        { duration: 5000 }
      );
    }));

    it('should update verification amounts', () => {
      component.updateVerifyAmount(1, '32');
      expect(component.verifyAmount1()).toBe('32');

      component.updateVerifyAmount(2, '45');
      expect(component.verifyAmount2()).toBe('45');
    });
  });

  describe('deleteAccount', () => {
    it('should delete account after confirmation', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);

      component.deleteAccount(mockBankAccounts[0]);
      tick();

      expect(mockPayoutService.deleteBankAccount).toHaveBeenCalledWith('account-1', 'org-1');
      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Bank account removed',
        'Dismiss',
        { duration: 3000 }
      );
    }));

    it('should not delete if user cancels', () => {
      spyOn(window, 'confirm').and.returnValue(false);

      component.deleteAccount(mockBankAccounts[0]);

      expect(mockPayoutService.deleteBankAccount).not.toHaveBeenCalled();
    });

    it('should handle delete error', fakeAsync(() => {
      spyOn(window, 'confirm').and.returnValue(true);
      mockPayoutService.deleteBankAccount.and.returnValue(
        throwError(() => new Error('Delete failed'))
      );

      component.deleteAccount(mockBankAccounts[0]);
      tick();

      expect(mockSnackBar.open).toHaveBeenCalledWith(
        'Failed to remove bank account',
        'Dismiss',
        { duration: 5000 }
      );
    }));
  });

  describe('helper methods', () => {
    it('should get status color', () => {
      expect(component.getStatusColor('verified')).toBe('primary');
      expect(component.getStatusColor('pending')).toBe('warn');
      expect(component.getStatusColor('failed')).toBe('warn');
      expect(component.getStatusColor('unknown')).toBe('');
    });

    it('should get status text', () => {
      expect(component.getStatusText('verified')).toBe('Verified');
      expect(component.getStatusText('pending')).toBe('Pending Verification');
      expect(component.getStatusText('failed')).toBe('Verification Failed');
      expect(component.getStatusText('expired')).toBe('Expired');
    });
  });

  describe('template rendering', () => {
    it('should render component', () => {
      const compiled = fixture.nativeElement;
      expect(compiled).toBeTruthy();
    });

    it('should show loading spinner when loading', () => {
      component.isLoading.set(true);
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('mat-spinner')).toBeTruthy();
    });

    it('should show add form when toggled', () => {
      component.showAddForm.set(true);
      fixture.detectChanges();
      const compiled = fixture.nativeElement;
      expect(compiled.querySelector('app-bank-account-form')).toBeTruthy();
    });
  });

  describe('computed properties', () => {
    it('should check if Stripe is enabled', () => {
      expect(component.stripeEnabled()).toBe(true);
    });
  });
});
