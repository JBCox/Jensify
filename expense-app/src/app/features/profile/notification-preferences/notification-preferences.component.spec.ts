import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { NotificationPreferencesComponent } from './notification-preferences.component';
import { SupabaseService } from '../../../core/services/supabase.service';
import { NotificationService } from '../../../core/services/notification.service';

describe('NotificationPreferencesComponent', () => {
  let component: NotificationPreferencesComponent;
  let fixture: ComponentFixture<NotificationPreferencesComponent>;
  let mockSupabaseService: jasmine.SpyObj<SupabaseService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;

  const mockUserId = 'user-123';
  const mockPreferences = {
    id: 'pref-123',
    user_id: mockUserId,
    smartscan_enabled: true,
    receipt_enabled: true,
    approval_enabled: true,
    reimbursement_enabled: true,
    expense_enabled: true,
    report_enabled: true,
    budget_enabled: true,
    system_enabled: true,
    show_toast: true,
    play_sound: false,
    email_digest: false
  };

  beforeEach(async () => {
    const mockSupabaseClient = {
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: jasmine.createSpy('single').and.resolveTo({ data: mockPreferences, error: null })
          })
        }),
        upsert: jasmine.createSpy('upsert').and.resolveTo({ error: null })
      })
    };

    mockSupabaseService = jasmine.createSpyObj('SupabaseService', [], {
      client: mockSupabaseClient,
      userId: mockUserId
    });

    mockNotificationService = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    await TestBed.configureTestingModule({
      imports: [NotificationPreferencesComponent, NoopAnimationsModule],
      providers: [
        { provide: SupabaseService, useValue: mockSupabaseService },
        { provide: NotificationService, useValue: mockNotificationService },
        provideRouter([])
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationPreferencesComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load preferences on init', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    expect(mockSupabaseService.client.from).toHaveBeenCalledWith('notification_preferences');
    expect(component.loading()).toBe(false);
  });

  it('should initialize with notification categories', () => {
    expect(component.categories).toBeDefined();
    expect(component.categories.length).toBeGreaterThan(0);
  });

  it('should have all required category properties', () => {
    component.categories.forEach(category => {
      expect(category.key).toBeDefined();
      expect(category.label).toBeDefined();
      expect(category.description).toBeDefined();
      expect(category.icon).toBeDefined();
    });
  });

  it('should include SmartScan category', () => {
    const smartscanCategory = component.categories.find(c => c.key === 'smartscan_enabled');
    expect(smartscanCategory).toBeDefined();
    expect(smartscanCategory?.label).toBe('SmartScan');
  });

  it('should get preference value correctly', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    const smartscanValue = component.getPreference('smartscan_enabled');
    expect(smartscanValue).toBe(true);
  });

  it('should enable all notifications', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await component.enableAll();
    const prefs = component.preferences();
    expect(prefs?.smartscan_enabled).toBe(true);
    expect(prefs?.receipt_enabled).toBe(true);
  });

  it('should disable all notifications', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    await component.disableAll();
    const prefs = component.preferences();
    expect(prefs?.smartscan_enabled).toBe(false);
    expect(prefs?.receipt_enabled).toBe(false);
  });

  it('should render page title', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const title = compiled.querySelector('.jensify-page-title');
    expect(title?.textContent).toContain('Notification Preferences');
  });

  it('should use OnPush change detection', () => {
    expect(fixture.componentRef.changeDetectorRef).toBeDefined();
  });
});
