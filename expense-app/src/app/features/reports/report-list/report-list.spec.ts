import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReportListComponent } from './report-list';
import { ReportService } from '../../../core/services/report.service';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { of, throwError } from 'rxjs';
import { ReportStatus } from '../../../core/models/report.model';
import { provideAnimations } from '@angular/platform-browser/animations';

describe('ReportListComponent', () => {
  let component: ReportListComponent;
  let fixture: ComponentFixture<ReportListComponent>;
  let reportServiceSpy: jasmine.SpyObj<ReportService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

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
        { id: 're-1', report_id: 'report-1', expense_id: 'exp-1', display_order: 0, added_at: '2025-11-18T10:00:00Z' }
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
    const dialogSpyObj = jasmine.createSpyObj('MatDialog', ['open']);

    await TestBed.configureTestingModule({
      imports: [ReportListComponent],
      providers: [
        { provide: ReportService, useValue: reportSpy },
        { provide: Router, useValue: routerSpyObj },
        { provide: MatSnackBar, useValue: snackBarSpyObj },
        { provide: MatDialog, useValue: dialogSpyObj },
        provideAnimations()
      ]
    }).compileComponents();

    reportServiceSpy = TestBed.inject(ReportService) as jasmine.SpyObj<ReportService>;
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    snackBarSpy = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
    dialogSpy = TestBed.inject(MatDialog) as jasmine.SpyObj<MatDialog>; // References dialogSpyObj from providers

    // Default mock return value
    reportServiceSpy.getReports.and.returnValue(of(mockReports as any));

    fixture = TestBed.createComponent(ReportListComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
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

  xit('should filter reports by status', () => {
    fixture.detectChanges();

    expect(component.filteredReports().length).toBe(2);

    component.statusFilter.setValue(ReportStatus.DRAFT);
    expect(component.filteredReports().length).toBe(1);
    expect(component.filteredReports()[0].status).toBe(ReportStatus.DRAFT);

    component.statusFilter.setValue(ReportStatus.SUBMITTED);
    expect(component.filteredReports().length).toBe(1);
    expect(component.filteredReports()[0].status).toBe(ReportStatus.SUBMITTED);
  });

  xit('should filter reports by search query', () => {
    fixture.detectChanges();

    expect(component.filteredReports().length).toBe(2);

    component.searchControl.setValue('Dallas');
    expect(component.filteredReports().length).toBe(1);
    expect(component.filteredReports()[0].name).toBe('Dallas Business Trip');

    component.searchControl.setValue('Austin');
    expect(component.filteredReports().length).toBe(1);
    expect(component.filteredReports()[0].name).toBe('Austin Conference');

    component.searchControl.setValue('nonexistent');
    expect(component.filteredReports().length).toBe(0);
  });

  it('should navigate to report detail on click', () => {
    fixture.detectChanges();

    component.viewReport(mockReports[0] as any);

    expect(routerSpy.navigate).toHaveBeenCalledWith(['/reports', 'report-1']);
  });

  xit('should submit draft report', () => {
    reportServiceSpy.submitReport.and.returnValue(of({
      ...mockReports[0],
      status: ReportStatus.SUBMITTED
    } as any));

    fixture.detectChanges();

    spyOn(window, 'confirm').and.returnValue(true);

    component.submitReport(mockReports[0] as any, new Event('click'));

    expect(reportServiceSpy.submitReport).toHaveBeenCalledWith('report-1');
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Report submitted for approval',
      'Close',
      { duration: 3000 }
    );
  });

  xit('should not submit report without expenses', () => {
    const emptyReport = {
      ...mockReports[0],
      report_expenses: []
    };

    fixture.detectChanges();

    component.submitReport(emptyReport as any, new Event('click'));

    expect(reportServiceSpy.submitReport).not.toHaveBeenCalled();
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Cannot submit empty report. Add expenses first.',
      'Close',
      { duration: 4000 }
    );
  });

  xit('should delete draft report', () => {
    reportServiceSpy.deleteReport.and.returnValue(of(undefined));

    fixture.detectChanges();

    spyOn(window, 'confirm').and.returnValue(true);

    component.deleteReport(mockReports[0] as any, new Event('click'));

    expect(reportServiceSpy.deleteReport).toHaveBeenCalledWith('report-1');
    expect(snackBarSpy.open).toHaveBeenCalledWith(
      'Report deleted',
      'Close',
      { duration: 3000 }
    );
  });

  xit('should not delete non-draft report', () => {
    fixture.detectChanges();

    component.deleteReport(mockReports[1] as any, new Event('click'));

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
