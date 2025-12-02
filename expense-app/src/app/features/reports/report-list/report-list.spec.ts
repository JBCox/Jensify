import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ReportListComponent } from './report-list';
import { ReportService } from '../../../core/services/report.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError, Subject } from 'rxjs';
import { ReportStatus } from '../../../core/models/report.model';

describe('ReportListComponent', () => {
  let component: ReportListComponent;
  let fixture: ComponentFixture<ReportListComponent>;
  let reportServiceSpy: jasmine.SpyObj<ReportService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;
  let notificationServiceSpy: jasmine.SpyObj<NotificationService>;

  const mockReports = [
    {
      id: 'report-1',
      organization_id: 'org-1',
      user_id: 'user-1',
      name: 'Dallas Business Trip',
      description: 'Client meetings',
      status: ReportStatus.DRAFT,
      total_amount: 1250.50,
      currency: 'USD',
      created_at: '2025-11-18T10:00:00Z',
      updated_at: '2025-11-18T10:00:00Z',
      report_expenses: [
        {
          id: 're-1',
          report_id: 'report-1',
          expense_id: 'exp-1',
          display_order: 0,
          added_at: '2025-11-18T10:00:00Z',
          expense: {
            id: 'exp-1',
            receipt_id: 'receipt-1',
            expense_receipts: [
              { id: 'er-1', expense_id: 'exp-1', receipt_id: 'receipt-1' }
            ]
          }
        }
      ]
    },
    {
      id: 'report-2',
      organization_id: 'org-1',
      user_id: 'user-1',
      name: 'Austin Conference',
      status: ReportStatus.SUBMITTED,
      total_amount: 850.00,
      currency: 'USD',
      created_at: '2025-11-17T10:00:00Z',
      updated_at: '2025-11-17T10:00:00Z',
      report_expenses: []
    }
  ];

  beforeEach(async () => {
    const reportSpy = jasmine.createSpyObj('ReportService', [
      'getReports',
      'submitReport',
      'deleteReport'
    ]);
    const routerSpyObj = jasmine.createSpyObj('Router', ['navigate']);
    const snackBarSpyObj = jasmine.createSpyObj('MatSnackBar', ['open']);
    const notificationSpyObj = jasmine.createSpyObj('NotificationService', [
      'shouldAlert',
      'showSuccess',
      'showWarning'
    ]);

    // Create a proper MatDialog spy with controllable afterClosed behavior
    const dialogSpyObj = jasmine.createSpyObj('MatDialog', ['open']);
    const mockDialogRef = {
      afterClosed: () => of(false)
    };
    dialogSpyObj.open.and.returnValue(mockDialogRef as any);

    await TestBed.configureTestingModule({
      imports: [
        ReportListComponent,
        NoopAnimationsModule,
        MatSnackBarModule,
        MatDialogModule
      ],
      providers: [
        { provide: ReportService, useValue: reportSpy },
        { provide: Router, useValue: routerSpyObj },
        { provide: MatSnackBar, useValue: snackBarSpyObj },
        { provide: NotificationService, useValue: notificationSpyObj },
        { provide: MatDialog, useValue: dialogSpyObj }
      ]
    }).overrideComponent(ReportListComponent, {
      set: {
        providers: [
          { provide: MatSnackBar, useValue: snackBarSpyObj },
          { provide: MatDialog, useValue: dialogSpyObj }
        ]
      }
    }).compileComponents();

    // Default mock return value
    reportSpy.getReports.and.returnValue(of(mockReports as any));

    // Create fixture and component
    fixture = TestBed.createComponent(ReportListComponent);
    component = fixture.componentInstance;

    // Get injected spies
    reportServiceSpy = TestBed.inject(ReportService) as jasmine.SpyObj<ReportService>;
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    snackBarSpy = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
    notificationServiceSpy = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    dialogSpy = dialogSpyObj;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have snackBar spy injected', () => {
    const componentSnackBar = (component as any).snackBar;
    expect(componentSnackBar).toBe(snackBarSpy);
  });

  it('should have dialog instance', () => {
    const componentDialog = (component as any).dialog;
    expect(componentDialog).toBeTruthy();
    expect(componentDialog).toBe(dialogSpy);
  });

  it('should load reports on init', () => {
    fixture.detectChanges();

    expect(reportServiceSpy.getReports).toHaveBeenCalled();
    expect(component.reports().length).toBe(2);
    expect(component.loading()).toBe(false);
  });

  it('should handle load error', () => {
    reportServiceSpy.getReports.and.returnValue(
      throwError(() => new Error('Network error'))
    );

    fixture.detectChanges();

    expect(component.error()).toBe('Network error');
    expect(component.loading()).toBe(false);
  });

  it('should filter reports by status', () => {
    fixture.detectChanges();

    expect(component.filteredReports().length).toBe(2);

    // Set filter and trigger re-evaluation by updating reports signal
    component.statusFilter.setValue(ReportStatus.DRAFT);
    component.reports.set([...component.reports()]); // Force computed re-evaluation
    expect(component.filteredReports().length).toBe(1);
    expect(component.filteredReports()[0].status).toBe(ReportStatus.DRAFT);

    component.statusFilter.setValue(ReportStatus.SUBMITTED);
    component.reports.set([...component.reports()]); // Force computed re-evaluation
    expect(component.filteredReports().length).toBe(1);
    expect(component.filteredReports()[0].status).toBe(ReportStatus.SUBMITTED);
  });

  it('should filter reports by search query', () => {
    fixture.detectChanges();

    expect(component.filteredReports().length).toBe(2);

    // Set search and trigger re-evaluation by updating reports signal
    component.searchControl.setValue('Dallas');
    component.reports.set([...component.reports()]); // Force computed re-evaluation
    expect(component.filteredReports().length).toBe(1);
    expect(component.filteredReports()[0].name).toBe('Dallas Business Trip');

    component.searchControl.setValue('Austin');
    component.reports.set([...component.reports()]); // Force computed re-evaluation
    expect(component.filteredReports().length).toBe(1);
    expect(component.filteredReports()[0].name).toBe('Austin Conference');

    component.searchControl.setValue('nonexistent');
    component.reports.set([...component.reports()]); // Force computed re-evaluation
    expect(component.filteredReports().length).toBe(0);
  });

  it('should navigate to report detail on click', () => {
    fixture.detectChanges();

    component.viewReport(mockReports[0] as any);

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/reports', 'report-1']);
  });

  it('should submit draft report', (done) => {
    reportServiceSpy.submitReport.and.returnValue(of({
      ...mockReports[0],
      status: ReportStatus.SUBMITTED
    } as any));

    fixture.detectChanges();

    // Verify mock data has receipts
    const report = mockReports[0];
    expect(report.report_expenses.length).toBeGreaterThan(0);
    expect(report.report_expenses[0].expense).toBeTruthy();
    expect(report.report_expenses[0].expense.receipt_id).toBeTruthy();

    // Mock dialog to return true (confirmed)
    dialogSpy.open.and.returnValue({
      afterClosed: () => of(true)
    } as any);

    const event = new Event('click');
    spyOn(event, 'stopPropagation');

    component.submitReport(report as any, event);

    // Use setTimeout to allow async operations to complete
    setTimeout(() => {
      expect(dialogSpy.open).toHaveBeenCalled();
      expect(reportServiceSpy.submitReport).toHaveBeenCalledWith('report-1');
      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'Report submitted for approval',
        'Close',
        { duration: 3000 }
      );
      done();
    }, 100);
  });

  it('should not submit report without expenses', () => {
    const emptyReport = {
      ...mockReports[0],
      report_expenses: []
    };

    fixture.detectChanges();

    component.submitReport(emptyReport as any, new Event('click'));

    // Dialog should NOT be opened for empty reports
    expect(dialogSpy.open).not.toHaveBeenCalled();
    expect(reportServiceSpy.submitReport).not.toHaveBeenCalled();
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Cannot submit empty report. Add expenses first.',
      'Close',
      { duration: 4000 }
    );
  });

  it('should delete draft report', (done) => {
    reportServiceSpy.deleteReport.and.returnValue(of(undefined));

    fixture.detectChanges();

    // Mock dialog to return true (confirmed)
    dialogSpy.open.and.returnValue({
      afterClosed: () => of(true)
    } as any);

    const event = new Event('click');
    spyOn(event, 'stopPropagation');
    component.deleteReport(mockReports[0] as any, event);

    // Use setTimeout to allow async operations to complete
    setTimeout(() => {
      expect(dialogSpy.open).toHaveBeenCalled();
      expect(reportServiceSpy.deleteReport).toHaveBeenCalledWith('report-1');
      expect(snackBarSpy.open).toHaveBeenCalledWith(
        'Report deleted',
        'Close',
        { duration: 3000 }
      );
      done();
    }, 100);
  });

  it('should not delete non-draft report', () => {
    fixture.detectChanges();

    // Verify the report is actually SUBMITTED status
    expect(mockReports[1].status).toBe(ReportStatus.SUBMITTED);

    // Create a new event for testing
    const event = new Event('click');
    spyOn(event, 'stopPropagation');

    component.deleteReport(mockReports[1] as any, event);

    // Verify stopPropagation was called
    expect(event.stopPropagation).toHaveBeenCalled();

    // Dialog should NOT be opened for non-draft reports
    expect(dialogSpy.open).not.toHaveBeenCalled();
    expect(reportServiceSpy.deleteReport).not.toHaveBeenCalled();
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Only draft reports can be deleted',
      'Close',
      { duration: 3000 }
    );
  });

  it('should format currency correctly', () => {
    expect(component.formatCurrency(1250.50)).toBe('$1,250.50');
    expect(component.formatCurrency(0)).toBe('$0.00');
  });

  it('should get expense count correctly', () => {
    expect(component.getExpenseCount(mockReports[0] as any)).toBe(1);
    expect(component.getExpenseCount(mockReports[1] as any)).toBe(0);
  });

  it('should determine if report can be submitted', () => {
    expect(component.canSubmit(mockReports[0] as any)).toBe(true); // Draft with expenses
    expect(component.canSubmit(mockReports[1] as any)).toBe(false); // Submitted
  });

  it('should determine if report can be deleted', () => {
    expect(component.canDelete(mockReports[0] as any)).toBe(true); // Draft
    expect(component.canDelete(mockReports[1] as any)).toBe(false); // Submitted
  });
});
