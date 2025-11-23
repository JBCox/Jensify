import { TestBed } from '@angular/core/testing';
import { App } from './app';
import { of } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';

describe('App', () => {
  beforeEach(async () => {
    const mockSwUpdate = {
      versionUpdates: of(),
      checkForUpdate: () => Promise.resolve(false),
      activateUpdate: () => Promise.resolve(true)
    };

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        {
          provide: AuthService,
          useValue: {
            userProfile$: of({ id: 'test-id', email: 'test@example.com', full_name: 'Test User', role: 'employee' }),
            session$: of({ user: { id: 'test-id', email: 'test@example.com', user_metadata: {} } }),
            isFinanceOrAdmin: false,
            signOut: () => Promise.resolve()
          }
        },
        {
          provide: SwUpdate,
          useValue: mockSwUpdate
        },
        provideRouter([])
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  // Basic smoke test ensures component renders without throwing
  it('should render toolbar outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).toBeTruthy();
  });
});
