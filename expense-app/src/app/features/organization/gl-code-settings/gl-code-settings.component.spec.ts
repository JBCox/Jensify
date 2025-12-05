import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { GlCodeSettingsComponent } from './gl-code-settings.component';
import { CategoryService } from '../../../core/services/category.service';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { GLCode, CustomExpenseCategory } from '../../../core/models/gl-code.model';

describe('GlCodeSettingsComponent', () => {
  let component: GlCodeSettingsComponent;
  let fixture: ComponentFixture<GlCodeSettingsComponent>;
  let categoryServiceMock: jasmine.SpyObj<CategoryService>;
  let dialogMock: jasmine.SpyObj<MatDialog>;
  let snackBarMock: jasmine.SpyObj<MatSnackBar>;

  const mockGLCode: GLCode = {
    id: 'gl-1',
    organization_id: 'org-123',
    code: '4000',
    name: 'Travel Expenses',
    description: 'All travel related expenses',
    is_active: true,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  const mockCategory: CustomExpenseCategory = {
    id: 'cat-1',
    organization_id: 'org-123',
    name: 'Travel',
    description: 'Travel expenses',
    icon: 'flight',
    color: '#ff5900',
    gl_code_id: 'gl-1',
    gl_code: '4000',
    requires_receipt: true,
    requires_description: false,
    is_active: true,
    display_order: 1,
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z'
  };

  beforeEach(async () => {
    categoryServiceMock = jasmine.createSpyObj('CategoryService', [
      'getGLCodes',
      'getCategories',
      'updateGLCode',
      'deleteGLCode',
      'updateCategory',
      'deleteCategory'
    ]);
    dialogMock = jasmine.createSpyObj('MatDialog', ['open']);
    snackBarMock = jasmine.createSpyObj('MatSnackBar', ['open']);

    // Default return values
    categoryServiceMock.getGLCodes.and.returnValue(of([mockGLCode]));
    categoryServiceMock.getCategories.and.returnValue(of([mockCategory]));
    categoryServiceMock.updateGLCode.and.returnValue(of(mockGLCode));
    categoryServiceMock.deleteGLCode.and.returnValue(of(undefined));
    categoryServiceMock.updateCategory.and.returnValue(of(mockCategory));
    categoryServiceMock.deleteCategory.and.returnValue(of(undefined));

    await TestBed.configureTestingModule({
      imports: [
        GlCodeSettingsComponent,
        BrowserAnimationsModule
      ],
      providers: [
        { provide: CategoryService, useValue: categoryServiceMock },
        { provide: MatDialog, useValue: dialogMock },
        { provide: MatSnackBar, useValue: snackBarMock }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(GlCodeSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load GL codes and categories on init', () => {
    expect(categoryServiceMock.getGLCodes).toHaveBeenCalled();
    expect(categoryServiceMock.getCategories).toHaveBeenCalled();
    expect(component.glCodes().length).toBe(1);
    expect(component.categories().length).toBe(1);
    expect(component.loading()).toBe(false);
  });

  it('should calculate active categories count', () => {
    expect(component.activeCategories()).toBe(1);
  });

  it('should get categories using a GL code', () => {
    const categories = component.getCategoriesUsingCode('gl-1');
    expect(categories).toEqual(['Travel']);
  });

  it('should open GL code dialog', () => {
    const dialogRefMock = {
      afterClosed: () => of(true)
    };
    dialogMock.open.and.returnValue(dialogRefMock as any);

    component.openGLCodeDialog();

    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('should open GL code dialog with existing code', () => {
    const dialogRefMock = {
      afterClosed: () => of(true)
    };
    dialogMock.open.and.returnValue(dialogRefMock as any);

    component.openGLCodeDialog(mockGLCode);

    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('should toggle GL code active status', () => {
    component.toggleGLCodeActive(mockGLCode);

    expect(categoryServiceMock.updateGLCode).toHaveBeenCalledWith('gl-1', { is_active: false });
  });

  it('should not delete GL code if in use', () => {
    spyOn(window, 'confirm');
    component.deleteGLCode(mockGLCode);

    expect(snackBarMock.open).toHaveBeenCalledWith(
      'Cannot delete GL code that is assigned to categories',
      'Close',
      { duration: 3000 }
    );
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it('should delete GL code if not in use', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.categories.set([]);

    component.deleteGLCode(mockGLCode);

    expect(window.confirm).toHaveBeenCalled();
    expect(categoryServiceMock.deleteGLCode).toHaveBeenCalledWith('gl-1');
  });

  it('should open category dialog', () => {
    const dialogRefMock = {
      afterClosed: () => of(true)
    };
    dialogMock.open.and.returnValue(dialogRefMock as any);

    component.openCategoryDialog();

    expect(dialogMock.open).toHaveBeenCalled();
  });

  it('should toggle category active status', () => {
    component.toggleCategoryActive(mockCategory);

    expect(categoryServiceMock.updateCategory).toHaveBeenCalledWith('cat-1', { is_active: false });
  });

  it('should delete category when confirmed', () => {
    spyOn(window, 'confirm').and.returnValue(true);

    component.deleteCategory(mockCategory);

    expect(window.confirm).toHaveBeenCalled();
    expect(categoryServiceMock.deleteCategory).toHaveBeenCalledWith('cat-1');
  });

  it('should handle refresh', () => {
    component.onRefresh();
    expect(component.refreshing()).toBe(true);
  });

  it('should handle load error', () => {
    categoryServiceMock.getGLCodes.and.returnValue(throwError(() => new Error('Load failed')));
    component.ngOnInit();
    expect(component.loading()).toBe(false);
  });
});
