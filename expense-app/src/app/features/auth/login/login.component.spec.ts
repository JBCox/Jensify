import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { LoginComponent } from './login.component';
import { AuthService } from '../../../core/services/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    // Create mock services
    mockAuthService = jasmine.createSpyObj('AuthService', ['signIn']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [
        LoginComponent,
        ReactiveFormsModule,
        NoopAnimationsModule
      ],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParams: {}
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialize the login form with empty values', () => {
    expect(component.loginForm).toBeDefined();
    expect(component.loginForm.get('email')?.value).toBe('');
    expect(component.loginForm.get('password')?.value).toBe('');
  });

  it('should validate email field as required', () => {
    const emailControl = component.loginForm.get('email');
    emailControl?.setValue('');
    expect(emailControl?.hasError('required')).toBeTrue();
  });

  it('should validate email format', () => {
    const emailControl = component.loginForm.get('email');
    emailControl?.setValue('invalid-email');
    expect(emailControl?.hasError('email')).toBeTrue();

    emailControl?.setValue('valid@email.com');
    expect(emailControl?.hasError('email')).toBeFalse();
  });

  it('should validate password as required', () => {
    const passwordControl = component.loginForm.get('password');
    passwordControl?.setValue('');
    expect(passwordControl?.hasError('required')).toBeTrue();
  });

  it('should validate password minimum length', () => {
    const passwordControl = component.loginForm.get('password');
    passwordControl?.setValue('12345');
    expect(passwordControl?.hasError('minlength')).toBeTrue();

    passwordControl?.setValue('123456');
    expect(passwordControl?.hasError('minlength')).toBeFalse();
  });

  it('should call authService.signIn on valid form submission', async () => {
    mockAuthService.signIn.and.returnValue(Promise.resolve());
    mockRouter.navigate.and.returnValue(Promise.resolve(true));

    component.loginForm.patchValue({
      email: 'test@example.com',
      password: 'password123'
    });

    await component.onSubmit();

    expect(mockAuthService.signIn).toHaveBeenCalledWith('test@example.com', 'password123');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/expenses']);
  });

  it('should display error message on login failure', async () => {
    mockAuthService.signIn.and.returnValue(
      Promise.reject(new Error('Invalid login credentials'))
    );

    component.loginForm.patchValue({
      email: 'test@example.com',
      password: 'wrongpassword'
    });

    await component.onSubmit();

    expect(component.errorMessage).toBe('Invalid email or password. Please try again.');
    expect(component.loading).toBeFalse();
  });

  it('should not submit form if invalid', async () => {
    component.loginForm.patchValue({
      email: '',
      password: ''
    });

    await component.onSubmit();

    expect(mockAuthService.signIn).not.toHaveBeenCalled();
  });

  it('should toggle password visibility', () => {
    expect(component.hidePassword).toBeTrue();
    component.togglePasswordVisibility();
    expect(component.hidePassword).toBeFalse();
    component.togglePasswordVisibility();
    expect(component.hidePassword).toBeTrue();
  });

  it('should use returnUrl from query params', () => {
    const route = TestBed.inject(ActivatedRoute);
    route.snapshot.queryParams = { returnUrl: '/custom-route' };

    const newComponent = new LoginComponent(
      TestBed.inject(ReactiveFormsModule) as any,
      mockAuthService,
      mockRouter,
      route
    );
    newComponent.ngOnInit();

    expect(newComponent.returnUrl).toBe('/custom-route');
  });
});
