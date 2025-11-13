import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { RegisterComponent } from './register.component';
import { AuthService } from '../../../core/services/auth.service';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['register']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [
        RegisterComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the register form with empty values', () => {
    expect(component.registerForm).toBeDefined();
    expect(component.registerForm.get('fullName')?.value).toBe('');
    expect(component.registerForm.get('email')?.value).toBe('');
    expect(component.registerForm.get('password')?.value).toBe('');
    expect(component.registerForm.get('confirmPassword')?.value).toBe('');
  });

  describe('Form Validation', () => {
    it('should validate full name as required', () => {
      const fullNameControl = component.registerForm.get('fullName');
      fullNameControl?.setValue('');
      expect(fullNameControl?.hasError('required')).toBeTrue();
    });

    it('should validate full name minimum length', () => {
      const fullNameControl = component.registerForm.get('fullName');
      fullNameControl?.setValue('A');
      expect(fullNameControl?.hasError('minlength')).toBeTrue();

      fullNameControl?.setValue('AB');
      expect(fullNameControl?.hasError('minlength')).toBeFalse();
    });

    it('should validate email as required', () => {
      const emailControl = component.registerForm.get('email');
      emailControl?.setValue('');
      expect(emailControl?.hasError('required')).toBeTrue();
    });

    it('should validate email format', () => {
      const emailControl = component.registerForm.get('email');
      emailControl?.setValue('invalid-email');
      expect(emailControl?.hasError('email')).toBeTrue();

      emailControl?.setValue('valid@email.com');
      expect(emailControl?.hasError('email')).toBeFalse();
    });

    it('should validate password as required', () => {
      const passwordControl = component.registerForm.get('password');
      passwordControl?.setValue('');
      expect(passwordControl?.hasError('required')).toBeTrue();
    });

    it('should validate password minimum length', () => {
      const passwordControl = component.registerForm.get('password');
      passwordControl?.setValue('Pass1!');
      expect(passwordControl?.hasError('minlength')).toBeTrue();

      passwordControl?.setValue('Password1!');
      expect(passwordControl?.hasError('minlength')).toBeFalse();
    });

    it('should validate password strength', () => {
      const passwordControl = component.registerForm.get('password');

      // Weak passwords
      passwordControl?.setValue('password');
      expect(passwordControl?.hasError('passwordStrength')).toBeTrue();

      passwordControl?.setValue('PASSWORD');
      expect(passwordControl?.hasError('passwordStrength')).toBeTrue();

      passwordControl?.setValue('12345678');
      expect(passwordControl?.hasError('passwordStrength')).toBeTrue();

      // Strong passwords
      passwordControl?.setValue('Password1');
      expect(passwordControl?.hasError('passwordStrength')).toBeFalse();

      passwordControl?.setValue('Password!');
      expect(passwordControl?.hasError('passwordStrength')).toBeFalse();
    });

    it('should validate password confirmation', () => {
      component.registerForm.patchValue({
        password: 'Password1!',
        confirmPassword: 'DifferentPassword1!'
      });
      expect(component.registerForm.hasError('passwordMismatch')).toBeTrue();

      component.registerForm.patchValue({
        password: 'Password1!',
        confirmPassword: 'Password1!'
      });
      expect(component.registerForm.hasError('passwordMismatch')).toBeFalse();
    });
  });

  describe('Form Submission', () => {
    it('should call authService.register on valid form submission', async () => {
      mockAuthService.register.and.returnValue(Promise.resolve());
      mockRouter.navigate.and.returnValue(Promise.resolve(true));

      component.registerForm.patchValue({
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'Password1!',
        confirmPassword: 'Password1!'
      });

      await component.onSubmit();

      expect(mockAuthService.register).toHaveBeenCalledWith({
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'Password1!'
      });
      expect(component.successMessage).toContain('Registration successful');
    });

    it('should display error message on registration failure', async () => {
      mockAuthService.register.and.returnValue(
        Promise.reject(new Error('User already registered'))
      );

      component.registerForm.patchValue({
        fullName: 'John Doe',
        email: 'existing@example.com',
        password: 'Password1!',
        confirmPassword: 'Password1!'
      });

      await component.onSubmit();

      expect(component.errorMessage).toContain('already registered');
      expect(component.loading).toBeFalse();
    });

    it('should not submit form if invalid', async () => {
      component.registerForm.patchValue({
        fullName: '',
        email: '',
        password: '',
        confirmPassword: ''
      });

      await component.onSubmit();

      expect(mockAuthService.register).not.toHaveBeenCalled();
    });

    it('should reset form and redirect after successful registration', (done) => {
      mockAuthService.register.and.returnValue(Promise.resolve());
      mockRouter.navigate.and.returnValue(Promise.resolve(true));

      component.registerForm.patchValue({
        fullName: 'John Doe',
        email: 'john@example.com',
        password: 'Password1!',
        confirmPassword: 'Password1!'
      });

      component.onSubmit().then(() => {
        expect(component.registerForm.get('fullName')?.value).toBeNull();
        done();
      });
    });
  });

  describe('Password Visibility Toggle', () => {
    it('should toggle password visibility', () => {
      expect(component.hidePassword).toBeTrue();
      component.togglePasswordVisibility();
      expect(component.hidePassword).toBeFalse();
      component.togglePasswordVisibility();
      expect(component.hidePassword).toBeTrue();
    });

    it('should toggle confirm password visibility', () => {
      expect(component.hideConfirmPassword).toBeTrue();
      component.toggleConfirmPasswordVisibility();
      expect(component.hideConfirmPassword).toBeFalse();
      component.toggleConfirmPasswordVisibility();
      expect(component.hideConfirmPassword).toBeTrue();
    });
  });

  describe('Password Match Helper', () => {
    it('should return true when passwords match', () => {
      component.registerForm.patchValue({
        password: 'Password1!',
        confirmPassword: 'Password1!'
      });
      expect(component.passwordsMatch).toBeTrue();
    });

    it('should return false when passwords do not match', () => {
      component.registerForm.patchValue({
        password: 'Password1!',
        confirmPassword: 'Different1!'
      });
      expect(component.passwordsMatch).toBeFalse();
    });
  });
});
