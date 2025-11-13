import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { ForgotPasswordComponent } from './forgot-password.component';
import { AuthService } from '../../../core/services/auth.service';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;

  beforeEach(async () => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['resetPassword']);

    await TestBed.configureTestingModule({
      imports: [
        ForgotPasswordComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: AuthService, useValue: mockAuthService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the forgot password form with empty email', () => {
    expect(component.forgotPasswordForm).toBeDefined();
    expect(component.forgotPasswordForm.get('email')?.value).toBe('');
  });

  describe('Form Validation', () => {
    it('should validate email as required', () => {
      const emailControl = component.forgotPasswordForm.get('email');
      emailControl?.setValue('');
      expect(emailControl?.hasError('required')).toBeTrue();
    });

    it('should validate email format', () => {
      const emailControl = component.forgotPasswordForm.get('email');
      emailControl?.setValue('invalid-email');
      expect(emailControl?.hasError('email')).toBeTrue();

      emailControl?.setValue('valid@email.com');
      expect(emailControl?.hasError('email')).toBeFalse();
    });
  });

  describe('Form Submission', () => {
    it('should call authService.resetPassword on valid form submission', async () => {
      mockAuthService.resetPassword.and.returnValue(Promise.resolve());

      component.forgotPasswordForm.patchValue({
        email: 'test@example.com'
      });

      await component.onSubmit();

      expect(mockAuthService.resetPassword).toHaveBeenCalledWith('test@example.com');
      expect(component.successMessage).toContain('Password reset instructions');
    });

    it('should display success message on successful password reset', async () => {
      mockAuthService.resetPassword.and.returnValue(Promise.resolve());

      component.forgotPasswordForm.patchValue({
        email: 'test@example.com'
      });

      await component.onSubmit();

      expect(component.successMessage).toBeTruthy();
      expect(component.errorMessage).toBe('');
      expect(component.loading).toBeFalse();
    });

    it('should display error message on password reset failure', async () => {
      mockAuthService.resetPassword.and.returnValue(
        Promise.reject(new Error('Network error'))
      );

      component.forgotPasswordForm.patchValue({
        email: 'test@example.com'
      });

      await component.onSubmit();

      expect(component.errorMessage).toBeTruthy();
      expect(component.successMessage).toBe('');
      expect(component.loading).toBeFalse();
    });

    it('should not submit form if invalid', async () => {
      component.forgotPasswordForm.patchValue({
        email: ''
      });

      await component.onSubmit();

      expect(mockAuthService.resetPassword).not.toHaveBeenCalled();
    });

    it('should reset form after successful submission', async () => {
      mockAuthService.resetPassword.and.returnValue(Promise.resolve());

      component.forgotPasswordForm.patchValue({
        email: 'test@example.com'
      });

      await component.onSubmit();

      expect(component.forgotPasswordForm.get('email')?.value).toBeNull();
    });

    it('should handle network errors gracefully', async () => {
      mockAuthService.resetPassword.and.returnValue(
        Promise.reject(new Error('Network error'))
      );

      component.forgotPasswordForm.patchValue({
        email: 'test@example.com'
      });

      await component.onSubmit();

      expect(component.errorMessage).toContain('Network error');
    });

    it('should not expose user existence in error messages', async () => {
      mockAuthService.resetPassword.and.returnValue(
        Promise.reject(new Error('User not found'))
      );

      component.forgotPasswordForm.patchValue({
        email: 'nonexistent@example.com'
      });

      await component.onSubmit();

      // Should show generic message for security
      expect(component.errorMessage).toContain('If an account exists');
    });
  });

  describe('Loading State', () => {
    it('should set loading to true during submission', async () => {
      mockAuthService.resetPassword.and.returnValue(
        new Promise(resolve => setTimeout(resolve, 100))
      );

      component.forgotPasswordForm.patchValue({
        email: 'test@example.com'
      });

      const submitPromise = component.onSubmit();
      expect(component.loading).toBeTrue();

      await submitPromise;
      expect(component.loading).toBeFalse();
    });
  });
});
