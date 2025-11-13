import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatSnackBar } from '@angular/material/snack-bar';
import { of, throwError } from 'rxjs';
import { ReceiptUpload } from './receipt-upload';
import { ExpenseService } from '../../../core/services/expense.service';
import { ReceiptUploadResponse } from '../../../core/models/receipt.model';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

describe('ReceiptUpload', () => {
  let component: ReceiptUpload;
  let fixture: ComponentFixture<ReceiptUpload>;
  let expenseServiceSpy: jasmine.SpyObj<ExpenseService>;
  let routerSpy: jasmine.SpyObj<Router>;
  let snackBarSpy: jasmine.SpyObj<MatSnackBar>;

  const mockReceipt: ReceiptUploadResponse = {
    receipt: {
      id: 'receipt-1',
      user_id: 'user-1',
      file_path: 'user-1/receipt.jpg',
      file_name: 'receipt.jpg',
      file_type: 'image/jpeg',
      file_size: 100000,
      ocr_status: 'pending' as any,
      created_at: '2025-11-13T10:00:00Z'
    },
    public_url: 'https://example.com/receipt.jpg'
  };

  beforeEach(async () => {
    const expenseSpy = jasmine.createSpyObj('ExpenseService', [
      'validateReceiptFile',
      'uploadReceipt'
    ]);
    const routerSpyObj = jasmine.createSpyObj('Router', ['navigate']);
    const snackBarSpyObj = jasmine.createSpyObj('MatSnackBar', ['open']);

    await TestBed.configureTestingModule({
      imports: [ReceiptUpload, NoopAnimationsModule],
      providers: [
        { provide: ExpenseService, useValue: expenseSpy },
        { provide: Router, useValue: routerSpyObj },
        { provide: MatSnackBar, useValue: snackBarSpyObj }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ReceiptUpload);
    component = fixture.componentInstance;
    expenseServiceSpy = TestBed.inject(ExpenseService) as jasmine.SpyObj<ExpenseService>;
    routerSpy = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    snackBarSpy = TestBed.inject(MatSnackBar) as jasmine.SpyObj<MatSnackBar>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('File Selection', () => {
    it('should process valid file on selection', () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const event = {
        target: {
          files: [mockFile]
        }
      } as any;

      expenseServiceSpy.validateReceiptFile.and.returnValue(null);

      component.onFileSelected(event);

      expect(component.selectedFile()).toBe(mockFile);
      expect(expenseServiceSpy.validateReceiptFile).toHaveBeenCalledWith(mockFile);
    });

    it('should reject invalid file type', () => {
      const mockFile = new File(['test'], 'document.txt', { type: 'text/plain' });
      const event = {
        target: {
          files: [mockFile]
        }
      } as any;

      expenseServiceSpy.validateReceiptFile.and.returnValue('Invalid file type');

      component.onFileSelected(event);

      expect(component.selectedFile()).toBeNull();
      expect(component.errorMessage()).toBe('Invalid file type');
      expect(snackBarSpy.open).toHaveBeenCalled();
    });

    it('should reject file exceeding size limit', () => {
      const largeContent = new Array(6 * 1024 * 1024).fill('a').join('');
      const mockFile = new File([largeContent], 'large.jpg', { type: 'image/jpeg' });
      const event = {
        target: {
          files: [mockFile]
        }
      } as any;

      expenseServiceSpy.validateReceiptFile.and.returnValue('File size exceeds 5MB limit');

      component.onFileSelected(event);

      expect(component.selectedFile()).toBeNull();
      expect(component.errorMessage()).toBe('File size exceeds 5MB limit');
      expect(snackBarSpy.open).toHaveBeenCalled();
    });
  });

  describe('Drag and Drop', () => {
    it('should handle drag over event', () => {
      const event = new DragEvent('dragover');
      spyOn(event, 'preventDefault');
      spyOn(event, 'stopPropagation');

      component.onDragOver(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.isDragging()).toBe(true);
    });

    it('should handle drag leave event', () => {
      const event = new DragEvent('dragleave');
      spyOn(event, 'preventDefault');
      spyOn(event, 'stopPropagation');

      component.isDragging.set(true);
      component.onDragLeave(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.isDragging()).toBe(false);
    });

    it('should process dropped file', () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(mockFile);

      const event = new DragEvent('drop', { dataTransfer });
      spyOn(event, 'preventDefault');
      spyOn(event, 'stopPropagation');

      expenseServiceSpy.validateReceiptFile.and.returnValue(null);

      component.onDrop(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.isDragging()).toBe(false);
      expect(component.selectedFile()).toBe(mockFile);
    });
  });

  describe('Camera Capture', () => {
    it('should handle camera capture', () => {
      const mockFile = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
      const event = {
        target: {
          files: [mockFile]
        }
      } as any;

      expenseServiceSpy.validateReceiptFile.and.returnValue(null);

      component.onCameraCapture(event);

      expect(component.selectedFile()).toBe(mockFile);
      expect(expenseServiceSpy.validateReceiptFile).toHaveBeenCalledWith(mockFile);
    });
  });

  describe('Upload Receipt', () => {
    it('should upload receipt successfully', (done) => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);

      expenseServiceSpy.uploadReceipt.and.returnValue(of(mockReceipt));

      component.uploadReceipt();

      expect(component.isUploading()).toBe(true);

      setTimeout(() => {
        expect(expenseServiceSpy.uploadReceipt).toHaveBeenCalledWith(mockFile);
        expect(component.uploadedReceipt()).toEqual(mockReceipt.receipt);
        expect(snackBarSpy.open).toHaveBeenCalledWith(
          'Receipt uploaded successfully!',
          'Close',
          jasmine.any(Object)
        );
        done();
      }, 100);
    });

    it('should handle upload error', (done) => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);

      const errorMessage = 'Upload failed';
      expenseServiceSpy.uploadReceipt.and.returnValue(
        throwError(() => new Error(errorMessage))
      );

      component.uploadReceipt();

      setTimeout(() => {
        expect(component.isUploading()).toBe(false);
        expect(component.errorMessage()).toBe(errorMessage);
        expect(snackBarSpy.open).toHaveBeenCalledWith(
          errorMessage,
          'Close',
          jasmine.any(Object)
        );
        done();
      }, 100);
    });

    it('should not upload if no file selected', () => {
      component.selectedFile.set(null);

      component.uploadReceipt();

      expect(expenseServiceSpy.uploadReceipt).not.toHaveBeenCalled();
    });

    it('should not upload if already uploading', () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);
      component.isUploading.set(true);

      component.uploadReceipt();

      expect(expenseServiceSpy.uploadReceipt).not.toHaveBeenCalled();
    });

    it('should navigate to expense form after successful upload', (done) => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);

      expenseServiceSpy.uploadReceipt.and.returnValue(of(mockReceipt));

      component.uploadReceipt();

      setTimeout(() => {
        expect(routerSpy.navigate).toHaveBeenCalledWith(
          ['/expenses/new'],
          { queryParams: { receiptId: mockReceipt.receipt.id } }
        );
        done();
      }, 1100); // Wait for navigation delay
    });
  });

  describe('Clear File', () => {
    it('should clear all file state', () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);
      component.previewUrl.set('data:image/jpeg;base64,test');
      component.errorMessage.set('Some error');
      component.uploadProgress.set(50);

      component.clearFile();

      expect(component.selectedFile()).toBeNull();
      expect(component.previewUrl()).toBeNull();
      expect(component.errorMessage()).toBeNull();
      expect(component.uploadProgress()).toBe(0);
      expect(component.uploadedReceipt()).toBeNull();
    });
  });

  describe('Helper Methods', () => {
    it('should return file size in KB', () => {
      const mockFile = new File(['x'.repeat(2048)], 'test.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);

      const sizeLabel = component.getFileSizeLabel();

      expect(sizeLabel).toContain('KB');
    });

    it('should return file size in MB', () => {
      const content = 'x'.repeat(2 * 1024 * 1024); // 2MB
      const mockFile = new File([content], 'test.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);

      const sizeLabel = component.getFileSizeLabel();

      expect(sizeLabel).toContain('MB');
    });

    it('should return empty string if no file', () => {
      component.selectedFile.set(null);

      const sizeLabel = component.getFileSizeLabel();

      expect(sizeLabel).toBe('');
    });

    it('should identify PDF files', () => {
      const mockFile = new File(['test'], 'receipt.pdf', { type: 'application/pdf' });
      component.selectedFile.set(mockFile);

      expect(component.isPdf()).toBe(true);
    });

    it('should identify non-PDF files', () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);

      expect(component.isPdf()).toBe(false);
    });
  });

  describe('Computed Values', () => {
    it('should compute canUpload as true when file selected and not uploading', () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);
      component.isUploading.set(false);

      expect(component.canUpload()).toBe(true);
    });

    it('should compute canUpload as false when no file selected', () => {
      component.selectedFile.set(null);
      component.isUploading.set(false);

      expect(component.canUpload()).toBe(false);
    });

    it('should compute canUpload as false when uploading', () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      component.selectedFile.set(mockFile);
      component.isUploading.set(true);

      expect(component.canUpload()).toBe(false);
    });

    it('should compute hasPreview correctly', () => {
      component.previewUrl.set(null);
      expect(component.hasPreview()).toBe(false);

      component.previewUrl.set('data:image/jpeg;base64,test');
      expect(component.hasPreview()).toBe(true);
    });

    it('should compute showProgress correctly', () => {
      component.isUploading.set(false);
      expect(component.showProgress()).toBe(false);

      component.isUploading.set(true);
      expect(component.showProgress()).toBe(true);
    });
  });
});
