import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { AnalyticsComponent } from './analytics.component';
import { AnalyticsService } from '../../../core/services/analytics.service';
import { NotificationService } from '../../../core/services/notification.service';
import { ThemeService } from '../../../core/services/theme.service';
import { AnalyticsDashboardData } from '../../../core/models/analytics.model';

describe('AnalyticsComponent', () => {
  let component: AnalyticsComponent;
  let fixture: ComponentFixture<AnalyticsComponent>;
  let mockAnalyticsService: jasmine.SpyObj<AnalyticsService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;

  const mockAnalyticsData: AnalyticsDashboardData = {
    summary: [
      { metric_key: 'total_expenses', metric_value: 50000, previous_value: 45000, change_percent: 10 },
      { metric_key: 'expense_count', metric_value: 150, previous_value: 143, change_percent: 5 },
      { metric_key: 'avg_expense', metric_value: 333, previous_value: 340, change_percent: -2 },
      { metric_key: 'pending_amount', metric_value: 5000, previous_value: 5000, change_percent: 0 }
    ],
    trends: [],
    categoryBreakdown: [
      { category: 'Fuel', total_amount: 25000, percentage: 50, expense_count: 75, avg_expense: 333, max_expense: 1000, min_expense: 50 },
      { category: 'Meals', total_amount: 15000, percentage: 30, expense_count: 50, avg_expense: 300, max_expense: 800, min_expense: 20 }
    ],
    departmentComparison: [
      { department: 'Sales', total_amount: 30000, percentage_of_total: 60, expense_count: 90, employee_count: 15, per_employee_avg: 2000 },
      { department: 'Engineering', total_amount: 20000, percentage_of_total: 40, expense_count: 60, employee_count: 10, per_employee_avg: 2000 }
    ],
    topSpenders: [
      { user_id: 'user1', user_name: 'John Doe', user_email: 'john@example.com', department: 'Sales', expense_count: 30, total_amount: 10000, avg_expense: 333, approval_rate: 95, policy_violation_count: 1 }
    ],
    merchantAnalysis: [
      { merchant: 'Shell Gas', most_common_category: 'Fuel', expense_count: 40, total_amount: 15000, avg_expense: 375, unique_users: 10 }
    ],
    approvalMetrics: [],
    budgetVsActual: [
      { budget_name: 'Q1 2024', budget_type: 'quarterly', budget_amount: 60000, actual_spent: 50000, remaining: 10000, utilization_percent: 83.33, status: 'on_track' }
    ]
  };

  beforeEach(async () => {
    mockAnalyticsService = jasmine.createSpyObj('AnalyticsService', ['loadDashboardData', 'exportToCsv']);
    mockNotificationService = jasmine.createSpyObj('NotificationService', ['showSuccess', 'showError']);
    mockThemeService = jasmine.createSpyObj('ThemeService', [], {
      chartColors: signal({ colors: ['#ff5900', '#3b82f6', '#22c55e'] })
    });

    await TestBed.configureTestingModule({
      imports: [AnalyticsComponent, NoopAnimationsModule],
      providers: [
        { provide: AnalyticsService, useValue: mockAnalyticsService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ThemeService, useValue: mockThemeService },
        provideRouter([])
      ]
    }).compileComponents();

    mockAnalyticsService.loadDashboardData.and.returnValue(of(mockAnalyticsData));

    fixture = TestBed.createComponent(AnalyticsComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load analytics data on init', () => {
    fixture.detectChanges();
    expect(mockAnalyticsService.loadDashboardData).toHaveBeenCalled();
  });

  it('should set loading to false after data loads', (done) => {
    fixture.detectChanges();
    setTimeout(() => {
      expect(component.loading()).toBe(false);
      done();
    }, 100);
  });

  it('should populate data signal after successful load', (done) => {
    fixture.detectChanges();
    setTimeout(() => {
      expect(component.data()).toEqual(mockAnalyticsData);
      done();
    }, 100);
  });

  it('should handle error when loading data fails', (done) => {
    mockAnalyticsService.loadDashboardData.and.returnValue(
      throwError(() => new Error('Failed to load'))
    );
    fixture.detectChanges();
    setTimeout(() => {
      expect(mockNotificationService.showError).toHaveBeenCalledWith('Failed to load analytics data');
      expect(component.loading()).toBe(false);
      done();
    }, 100);
  });

  it('should initialize with date presets', () => {
    expect(component.datePresets).toBeDefined();
    expect(component.datePresets.length).toBeGreaterThan(0);
  });

  it('should render page title', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const title = compiled.querySelector('.jensify-page-title');
    expect(title?.textContent).toContain('Analytics');
  });

  it('should use OnPush change detection', () => {
    expect(fixture.componentRef.changeDetectorRef).toBeDefined();
  });
});
