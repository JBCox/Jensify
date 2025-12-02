import { TestBed } from '@angular/core/testing';
import { ReceiptService } from './receipt.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { NotificationService } from './notification.service';
import { OcrService } from './ocr.service';
import { LoggerService } from './logger.service';
import { Receipt, ReceiptUploadResponse } from '../models/receipt.model';
import { OcrStatus } from '../models/enums';
import { environment } from '../../../environments/environment';

describe('ReceiptService', () => {
  let service: ReceiptService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let notificationServiceSpy: jasmine.SpyObj<NotificationService>;
  let ocrServiceSpy: jasmine.SpyObj<OcrService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;
  let mockSupabaseClient: any;

  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';
  const mockReceiptId = 'receipt-123';
  const mockFilePath = `${mockOrganizationId}/${mockUserId}/1234567890_uuid_test.jpg`;

  const mockReceipt: Receipt = {
    id: mockReceiptId,
    organization_id: mockOrganizationId,
    user_id: mockUserId,
    expense_id: undefined,
    file_path: mockFilePath,
    file_name: 'test.jpg',
    file_type: 'image/jpeg',
    file_size: 102400,
    ocr_status: OcrStatus.PENDING,
    extracted_merchant: undefined,
    extracted_amount: undefined,
    extracted_date: undefined,
    extracted_tax: undefined,
    ocr_confidence: undefined,
    ocr_data: undefined,
    created_at: '2025-11-27T00:00:00Z'
  };

  const mockOcrResult = {
    merchant: 'Test Merchant',
    amount: 123.45,
    date: '2025-11-27',
    tax: 12.34,
    confidence: {
      overall: 0.95,
      merchant: 0.98,
      amount: 0.92,
      date: 0.96,
      tax: 0.94
    },
    rawText: 'Receipt text content'
  };

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabaseClient = {
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null })),
            order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
          }),
          order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
        }),
        insert: jasmine.createSpy('insert').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null }))
          })
        }),
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ data: null, error: null }))
        }),
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ data: null, error: null }))
        })
      })
    };

    const supabaseSpy = jasmine.createSpyObj('SupabaseService',
      ['uploadFile', 'getSignedUrl', 'getPublicUrl', 'deleteFile'],
      {
        client: mockSupabaseClient,
        userId: mockUserId
      }
    );
    Object.defineProperty(supabaseSpy, 'client', { get: () => mockSupabaseClient });
    Object.defineProperty(supabaseSpy, 'userId', { get: () => mockUserId });

    const orgServiceSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrganizationId
    });
    Object.defineProperty(orgServiceSpy, 'currentOrganizationId', { get: () => mockOrganizationId });

    const notificationSpy = jasmine.createSpyObj('NotificationService', ['notify', 'shouldAlert']);
    notificationSpy.shouldAlert.and.returnValue(true);

    const ocrSpy = jasmine.createSpyObj('OcrService', ['processReceipt']);
    const loggerSpy = jasmine.createSpyObj('LoggerService', ['error', 'info', 'warn', 'getErrorMessage']);
    loggerSpy.getErrorMessage.and.returnValue('An unexpected error occurred');

    TestBed.configureTestingModule({
      providers: [
        ReceiptService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: orgServiceSpy },
        { provide: NotificationService, useValue: notificationSpy },
        { provide: OcrService, useValue: ocrSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(ReceiptService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    notificationServiceSpy = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;
    ocrServiceSpy = TestBed.inject(OcrService) as jasmine.SpyObj<OcrService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================================================
  // UPLOAD RECEIPT TESTS
  // ============================================================================

  describe('uploadReceipt', () => {
    let mockFile: File;

    beforeEach(() => {
      // Create a mock JPEG file with proper magic number
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      mockFile = new File([jpegBytes], 'test.jpg', { type: 'image/jpeg' });
    });

    it('should upload receipt successfully', (done) => {
      // Spy on internal validation and compression methods to bypass them in tests
      spyOn<any>(service, 'validateReceiptFileAsync').and.returnValue(Promise.resolve(null));
      spyOn<any>(service, 'compressImage').and.returnValue(Promise.resolve(mockFile));

      // Mock file upload
      supabaseServiceSpy.uploadFile.and.returnValue(
        Promise.resolve({ data: { path: mockFilePath }, error: null } as any)
      );

      // Mock database insert
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockReceipt, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        insert: jasmine.createSpy('insert').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            single: singleSpy
          })
        })
      });

      // Mock signed URL
      supabaseServiceSpy.getSignedUrl.and.returnValue(
        Promise.resolve({ signedUrl: 'https://example.com/signed-url', error: null } as any)
      );

      // Mock OCR processing
      ocrServiceSpy.processReceipt.and.returnValue(Promise.resolve(mockOcrResult));

      // Execute the upload
      service.uploadReceipt(mockFile).subscribe({
        next: (response: ReceiptUploadResponse) => {
          expect(response.receipt).toEqual(mockReceipt);
          expect(response.public_url).toBe('https://example.com/signed-url');
          expect(supabaseServiceSpy.uploadFile).toHaveBeenCalled();
          expect(notificationServiceSpy.notify).toHaveBeenCalled();
          done();
        },
        error: (err) => {
          done.fail(`Upload failed: ${err.message}`);
        }
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.uploadReceipt(mockFile).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      service.uploadReceipt(mockFile).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('No organization selected');
          done();
        }
      });
    });

    it('should return error if file validation fails', (done) => {
      // Mock logger to return the file size error message
      loggerServiceSpy.getErrorMessage.and.returnValue('File size exceeds 10MB limit');

      const oversizedFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });

      service.uploadReceipt(oversizedFile).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('File size exceeds');
          done();
        }
      });
    });

    it('should return error if file upload fails', (done) => {
      supabaseServiceSpy.uploadFile.and.returnValue(
        Promise.resolve({ data: null, error: { message: 'Upload failed' } } as any)
      );

      service.uploadReceipt(mockFile).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: () => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });

    it('should return error if database insert fails', (done) => {
      supabaseServiceSpy.uploadFile.and.returnValue(
        Promise.resolve({ data: { path: mockFilePath }, error: null } as any)
      );

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: { message: 'Insert failed' } })
      );

      mockSupabaseClient.from.and.returnValue({
        insert: jasmine.createSpy('insert').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.uploadReceipt(mockFile).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: () => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  // ============================================================================
  // GET RECEIPT TESTS
  // ============================================================================

  describe('getReceiptById', () => {
    it('should fetch receipt by ID', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockReceipt, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.getReceiptById(mockReceiptId).subscribe({
        next: (receipt) => {
          expect(receipt).toEqual(mockReceipt as any);
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('receipts');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if receipt not found', (done) => {
      // Mock logger to return 'Receipt not found' (handleError transforms errors via logger)
      loggerServiceSpy.getErrorMessage.and.returnValue('Receipt not found');

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.getReceiptById(mockReceiptId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('Receipt not found');
          done();
        }
      });
    });

    it('should handle Supabase errors', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: { message: 'Database error' } })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.getReceiptById(mockReceiptId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: () => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  describe('getMyReceipts', () => {
    it('should fetch all receipts for current user in current organization', (done) => {
      const mockReceipts = [mockReceipt];

      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockReceipts, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              order: orderSpy
            })
          })
        })
      });

      service.getMyReceipts().subscribe({
        next: (receipts) => {
          expect(receipts).toEqual(mockReceipts as any);
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('receipts');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.getMyReceipts().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      service.getMyReceipts().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should return empty array when no receipts found', (done) => {
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: [], error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              order: orderSpy
            })
          })
        })
      });

      service.getMyReceipts().subscribe({
        next: (receipts) => {
          expect(receipts).toEqual([]);
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // DELETE RECEIPT TESTS
  // ============================================================================

  describe('deleteReceipt', () => {
    it('should delete receipt and associated file', (done) => {
      // Mock fetching receipt
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: { file_path: mockFilePath }, error: null })
      );

      // Mock file deletion
      supabaseServiceSpy.deleteFile.and.returnValue(
        Promise.resolve({ data: null, error: null } as any)
      );

      // Mock record deletion
      const deleteEqSpy = jasmine.createSpy('eq').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValues(
        {
          select: jasmine.createSpy('select').and.returnValue({
            eq: jasmine.createSpy('eq').and.returnValue({
              single: singleSpy
            })
          })
        },
        {
          delete: jasmine.createSpy('delete').and.returnValue({
            eq: deleteEqSpy
          })
        }
      );

      service.deleteReceipt(mockReceiptId).subscribe({
        next: () => {
          expect(supabaseServiceSpy.deleteFile).toHaveBeenCalledWith('receipts', mockFilePath);
          done();
        },
        error: done.fail
      });
    });

    it('should return error if receipt not found during delete', (done) => {
      // Mock logger to return 'Receipt not found' (handleError transforms errors via logger)
      loggerServiceSpy.getErrorMessage.and.returnValue('Receipt not found');

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.deleteReceipt(mockReceiptId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('Receipt not found');
          done();
        }
      });
    });

    it('should return error if file deletion fails', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: { file_path: mockFilePath }, error: null })
      );

      supabaseServiceSpy.deleteFile.and.returnValue(
        Promise.resolve({ data: null, error: { message: 'Delete failed' } } as any)
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.deleteReceipt(mockReceiptId).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: () => {
          expect(loggerServiceSpy.error).toHaveBeenCalled();
          done();
        }
      });
    });
  });

  // ============================================================================
  // GET RECEIPT URL TESTS
  // ============================================================================

  describe('getReceiptUrl', () => {
    it('should return public URL for receipt file', () => {
      const mockUrl = 'https://example.com/receipts/test.jpg';
      supabaseServiceSpy.getPublicUrl.and.returnValue(mockUrl);

      const url = service.getReceiptUrl(mockFilePath);

      expect(url).toBe(mockUrl);
      expect(supabaseServiceSpy.getPublicUrl).toHaveBeenCalledWith('receipts', mockFilePath);
    });
  });

  // ============================================================================
  // FILE VALIDATION TESTS
  // ============================================================================

  describe('validateReceiptFile', () => {
    it('should return null for valid JPEG file', () => {
      const validFile = new File([new ArrayBuffer(1024)], 'test.jpg', { type: 'image/jpeg' });
      const error = service.validateReceiptFile(validFile);
      expect(error).toBeNull();
    });

    it('should return null for valid PNG file', () => {
      const validFile = new File([new ArrayBuffer(1024)], 'test.png', { type: 'image/png' });
      const error = service.validateReceiptFile(validFile);
      expect(error).toBeNull();
    });

    it('should return null for valid PDF file', () => {
      const validFile = new File([new ArrayBuffer(1024)], 'test.pdf', { type: 'application/pdf' });
      const error = service.validateReceiptFile(validFile);
      expect(error).toBeNull();
    });

    it('should return error for invalid file type', () => {
      const invalidFile = new File([new ArrayBuffer(1024)], 'test.txt', { type: 'text/plain' });
      const error = service.validateReceiptFile(invalidFile);
      expect(error).toContain('Invalid file type');
    });

    it('should return error for oversized file', () => {
      const oversizedFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });
      const error = service.validateReceiptFile(oversizedFile);
      expect(error).toContain('File size exceeds');
    });
  });

  describe('validateReceiptFileAsync', () => {
    it('should validate file with correct JPEG magic number', async () => {
      const jpegBytes = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46]);
      const validFile = new File([jpegBytes], 'test.jpg', { type: 'image/jpeg' });

      const error = await service.validateReceiptFileAsync(validFile);
      expect(error).toBeNull();
    });

    it('should validate file with correct PNG magic number', async () => {
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const validFile = new File([pngBytes], 'test.png', { type: 'image/png' });

      const error = await service.validateReceiptFileAsync(validFile);
      expect(error).toBeNull();
    });

    it('should validate file with correct PDF magic number', async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D, 0x31, 0x2E, 0x34]);
      const validFile = new File([pdfBytes], 'test.pdf', { type: 'application/pdf' });

      const error = await service.validateReceiptFileAsync(validFile);
      expect(error).toBeNull();
    });

    it('should return error for invalid magic number', async () => {
      const invalidBytes = new Uint8Array([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      const invalidFile = new File([invalidBytes], 'test.jpg', { type: 'image/jpeg' });

      const error = await service.validateReceiptFileAsync(invalidFile);
      expect(error).toContain('File content does not match file type');
    });

    it('should return error for oversized file', async () => {
      const oversizedFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'huge.jpg', { type: 'image/jpeg' });

      const error = await service.validateReceiptFileAsync(oversizedFile);
      expect(error).toContain('File size exceeds');
    });
  });

  // ============================================================================
  // IMAGE COMPRESSION TESTS
  // ============================================================================

  describe('compressImage', () => {
    it('should skip compression for PDF files', async () => {
      const pdfFile = new File([new ArrayBuffer(1024)], 'test.pdf', { type: 'application/pdf' });

      const result = await service.compressImage(pdfFile);

      expect(result).toBe(pdfFile);
    });

    it('should skip compression for non-image files', async () => {
      const textFile = new File([new ArrayBuffer(1024)], 'test.txt', { type: 'text/plain' });

      const result = await service.compressImage(textFile);

      expect(result).toBe(textFile);
    });

    // Note: Full image compression testing requires DOM manipulation and is better suited for E2E tests
    // The core logic is validated through integration testing
  });
});
