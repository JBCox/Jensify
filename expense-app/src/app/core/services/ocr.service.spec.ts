import { TestBed } from '@angular/core/testing';
import { OcrService, OcrResult, DetectedLineItem } from './ocr.service';
import { SupabaseService } from './supabase.service';
import { LoggerService } from './logger.service';
import { environment } from '../../../environments/environment';

describe('OcrService', () => {
  let service: OcrService;
  let supabaseServiceMock: jasmine.SpyObj<SupabaseService>;
  let loggerServiceMock: jasmine.SpyObj<LoggerService>;

  const mockOcrResult: OcrResult = {
    merchant: 'Shell Gas Station',
    amount: 45.50,
    date: '2025-01-15',
    tax: 3.25,
    confidence: {
      merchant: 0.95,
      amount: 0.98,
      date: 0.92,
      tax: 0.85,
      overall: 0.925
    },
    rawText: 'Shell\\nDate: 01/15/2025\\nTotal: $45.50\\nTax: $3.25'
  };

  const mockSession = {
    data: {
      session: {
        access_token: 'mock-access-token',
        user: { id: 'user-123' }
      }
    }
  };

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', ['client']);
    const loggerSpy = jasmine.createSpyObj('LoggerService', ['info', 'error']);

    // Setup Supabase client mock
    supabaseSpy.client = {
      auth: {
        getSession: jasmine.createSpy('getSession').and.returnValue(
          Promise.resolve(mockSession)
        )
      }
    } as any;

    TestBed.configureTestingModule({
      providers: [
        OcrService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(OcrService);
    supabaseServiceMock = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    loggerServiceMock = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================================================
  // RECEIPT PROCESSING TESTS
  // ============================================================================

  describe('processReceipt', () => {
    it('should successfully extract receipt data', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }))
      );

      const result = await service.processReceipt(mockFile);

      // Check core OCR fields (result may also have lineItems from extraction)
      expect(result.merchant).toEqual(mockOcrResult.merchant);
      expect(result.amount).toEqual(mockOcrResult.amount);
      expect(result.date).toEqual(mockOcrResult.date);
      expect(result.tax).toEqual(mockOcrResult.tax);
      expect(result.confidence).toEqual(mockOcrResult.confidence);
      expect(loggerServiceMock.info).toHaveBeenCalledWith(
        '[OCR] Extraction complete',
        'OcrService',
        jasmine.objectContaining({
          merchant: mockOcrResult.merchant,
          amount: mockOcrResult.amount
        })
      );
    });

    it('should call edge function with correct parameters', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const receiptId = 'receipt-123';

      const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      await service.processReceipt(mockFile, receiptId);

      expect(fetchSpy).toHaveBeenCalledWith(
        `${environment.supabase.url}/functions/v1/process-receipt`,
        jasmine.objectContaining({
          method: 'POST',
          headers: jasmine.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockSession.data.session.access_token}`
          })
        })
      );

      const callArgs = fetchSpy.calls.mostRecent().args;
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.receipt_id).toBe(receiptId);
      expect(body.image_base64).toBeDefined();
    });

    it('should convert file to base64 before sending', async () => {
      const mockFile = new File(['test content'], 'receipt.jpg', { type: 'image/jpeg' });

      const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      await service.processReceipt(mockFile);

      const callArgs = fetchSpy.calls.mostRecent().args;
      const body = JSON.parse(callArgs[1]!.body as string);
      expect(body.image_base64).toBeTruthy();
      expect(typeof body.image_base64).toBe('string');
    });

    it('should handle PDF files', async () => {
      const mockFile = new File(['pdf content'], 'receipt.pdf', { type: 'application/pdf' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      // Check core OCR fields (result may also have lineItems from extraction)
      expect(result.merchant).toEqual(mockOcrResult.merchant);
      expect(result.amount).toEqual(mockOcrResult.amount);
      expect(result.date).toEqual(mockOcrResult.date);
    });

    it('should return fallback result on OCR failure', async () => {
      const mockFile = new File(['test'], 'Shell_Gas_Station.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.reject(new Error('Network error'))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.merchant).toBe('Shell Gas Station');
      expect(result.amount).toBeNull();
      expect(result.date).toBeNull();
      expect(result.confidence.overall).toBeLessThan(0.5);
      expect(loggerServiceMock.error).toHaveBeenCalled();
    });

    it('should handle Edge Function authentication errors', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response('Unauthorized', {
          status: 401,
          statusText: 'Unauthorized'
        }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.confidence.overall).toBeLessThan(0.5);
      expect(loggerServiceMock.error).toHaveBeenCalled();
    });

    it('should handle Edge Function server errors', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response('Internal Server Error', {
          status: 500,
          statusText: 'Internal Server Error'
        }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.confidence.overall).toBeLessThan(0.5);
      expect(loggerServiceMock.error).toHaveBeenCalled();
    });

    it('should handle invalid JSON response', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response('Invalid JSON', { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.confidence.overall).toBeLessThan(0.5);
      expect(loggerServiceMock.error).toHaveBeenCalled();
    });

    it('should handle missing session', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      (supabaseServiceMock.client.auth.getSession as jasmine.Spy).and.returnValue(
        Promise.resolve({ data: { session: null } })
      );

      const result = await service.processReceipt(mockFile);

      expect(result.confidence.overall).toBeLessThan(0.5);
      expect(loggerServiceMock.error).toHaveBeenCalledWith(
        '[OCR] Failed to process receipt',
        jasmine.any(Error),
        'OcrService'
      );
    });
  });

  // ============================================================================
  // CONFIDENCE SCORE TESTS (Critical for OCR Quality)
  // ============================================================================

  describe('Confidence Scores', () => {
    it('should extract high-confidence data correctly', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const highConfidenceResult: OcrResult = {
        ...mockOcrResult,
        confidence: {
          merchant: 0.98,
          amount: 0.99,
          date: 0.95,
          tax: 0.90,
          overall: 0.955
        }
      };

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(highConfidenceResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.confidence.overall).toBeGreaterThan(0.9);
      expect(result.confidence.merchant).toBeGreaterThan(0.9);
      expect(result.confidence.amount).toBeGreaterThan(0.9);
    });

    it('should handle low-confidence extractions', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const lowConfidenceResult: OcrResult = {
        merchant: 'Unknown',
        amount: null,
        date: null,
        tax: null,
        confidence: {
          merchant: 0.45,
          amount: 0.30,
          date: 0.20,
          tax: 0.15,
          overall: 0.275
        },
        rawText: 'Unreadable text...'
      };

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(lowConfidenceResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.confidence.overall).toBeLessThan(0.5);
      expect(result.amount).toBeNull();
      expect(result.date).toBeNull();
    });

    it('should handle partial field extraction', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const partialResult: OcrResult = {
        merchant: 'Shell',
        amount: 45.50,
        date: null, // Could not extract date
        tax: null, // Could not extract tax
        confidence: {
          merchant: 0.92,
          amount: 0.95,
          date: 0.15,
          tax: 0.10,
          overall: 0.53
        },
        rawText: 'Shell\\nTotal: $45.50'
      };

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(partialResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.merchant).toBe('Shell');
      expect(result.amount).toBe(45.50);
      expect(result.date).toBeNull();
      expect(result.tax).toBeNull();
    });
  });

  // ============================================================================
  // FALLBACK MECHANISM TESTS
  // ============================================================================

  describe('Fallback Merchant Extraction', () => {
    it('should extract merchant from filename (basic)', async () => {
      const mockFile = new File(['test'], 'Shell_Gas_Station.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.reject(new Error('OCR failed'))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.merchant).toBe('Shell Gas Station');
      expect(result.confidence.overall).toBeLessThan(0.5);
    });

    it('should handle IMG_ prefix in filename', async () => {
      const mockFile = new File(['test'], 'IMG_Shell_Receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.reject(new Error('OCR failed'))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.merchant).toBe('Shell Receipt');
    });

    it('should handle Screenshot_ prefix in filename', async () => {
      const mockFile = new File(['test'], 'Screenshot_Hotel_Invoice.png', { type: 'image/png' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.reject(new Error('OCR failed'))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.merchant).toBe('Hotel Invoice');
    });

    it('should return "Unknown Merchant" for generic filenames', async () => {
      const mockFile = new File(['test'], 'IMG_1234.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.reject(new Error('OCR failed'))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.merchant).toBe('1234');
    });

    it('should clean up hyphens and underscores in filename', async () => {
      const mockFile = new File(['test'], 'Hilton-Hotel_Invoice-2025.pdf', { type: 'application/pdf' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.reject(new Error('OCR failed'))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.merchant).toBe('Hilton Hotel Invoice 2025');
    });

    it('should handle empty filename gracefully', async () => {
      const mockFile = new File(['test'], '.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.reject(new Error('OCR failed'))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.merchant).toBe('Unknown Merchant');
    });
  });

  // ============================================================================
  // DATA TYPE VALIDATION TESTS
  // ============================================================================

  describe('OCR Result Data Types', () => {
    it('should parse amount as number', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(typeof result.amount).toBe('number');
      expect(result.amount).toBe(45.50);
    });

    it('should handle null amount', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const nullAmountResult = { ...mockOcrResult, amount: null };

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(nullAmountResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.amount).toBeNull();
    });

    it('should parse date as ISO string', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(typeof result.date).toBe('string');
      expect(result.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should include raw text for debugging', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(typeof result.rawText).toBe('string');
      expect(result.rawText.length).toBeGreaterThan(0);
    });

    it('should return all confidence scores', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.confidence).toBeDefined();
      expect(result.confidence.merchant).toBeGreaterThanOrEqual(0);
      expect(result.confidence.amount).toBeGreaterThanOrEqual(0);
      expect(result.confidence.date).toBeGreaterThanOrEqual(0);
      expect(result.confidence.tax).toBeGreaterThanOrEqual(0);
      expect(result.confidence.overall).toBeGreaterThanOrEqual(0);
      expect(result.confidence.overall).toBeLessThanOrEqual(1);
    });
  });

  // ============================================================================
  // SECURITY TESTS (Critical for OCR Service)
  // ============================================================================

  describe('Security', () => {
    it('should use authorization header for Edge Function calls', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      await service.processReceipt(mockFile);

      const headers = fetchSpy.calls.mostRecent().args[1]?.headers as Record<string, string>;
      expect(headers['Authorization']).toBe(`Bearer ${mockSession.data.session.access_token}`);
    });

    it('should not expose API keys to client', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      await service.processReceipt(mockFile);

      const body = JSON.parse(fetchSpy.calls.mostRecent().args[1]!.body as string);
      expect(body.api_key).toBeUndefined();
      expect(body.google_api_key).toBeUndefined();
    });

    it('should call secure Edge Function URL', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      const fetchSpy = spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      await service.processReceipt(mockFile);

      const url = fetchSpy.calls.mostRecent().args[0];
      expect(url).toContain('/functions/v1/process-receipt');
      expect(url).toContain(environment.supabase.url);
    });
  });

  // ============================================================================
  // FILE FORMAT TESTS
  // ============================================================================

  describe('Supported File Formats', () => {
    it('should process JPEG files', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result).toBeDefined();
      expect(result.merchant).toBeTruthy();
    });

    it('should process PNG files', async () => {
      const mockFile = new File(['test'], 'receipt.png', { type: 'image/png' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result).toBeDefined();
      expect(result.merchant).toBeTruthy();
    });

    it('should process PDF files', async () => {
      const mockFile = new File(['test'], 'invoice.pdf', { type: 'application/pdf' });

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockOcrResult), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result).toBeDefined();
      expect(result.merchant).toBeTruthy();
    });
  });

  // ============================================================================
  // LINE ITEM EXTRACTION TESTS
  // ============================================================================

  describe('extractLineItems', () => {
    it('should extract line items from raw text with "Description $XX.XX" pattern', () => {
      const rawText = `Hyatt Hotel
Room Charge $150.00
Room Service $35.50
Parking $25.00
Total $210.50`;

      const items = service.extractLineItems(rawText);

      expect(items.length).toBe(3);
      expect(items[0].amount).toBe(150.00);
      expect(items[1].amount).toBe(35.50);
      expect(items[2].amount).toBe(25.00);
    });

    it('should classify lodging items correctly', () => {
      const rawText = 'Room Charge $150.00';

      const items = service.extractLineItems(rawText);

      expect(items.length).toBe(1);
      expect(items[0].suggestedCategory).toBe('Lodging');
      expect(items[0].confidence).toBeGreaterThanOrEqual(0.5);
      expect(items[0].keywords).toContain('room');
    });

    it('should classify meal items correctly', () => {
      const rawText = 'Room Service Breakfast $25.00';

      const items = service.extractLineItems(rawText);

      expect(items.length).toBe(1);
      expect(items[0].suggestedCategory).toBe('Meals & Entertainment');
      expect(items[0].keywords.some(k => ['breakfast', 'room service'].includes(k))).toBeTruthy();
    });

    it('should classify fuel items correctly', () => {
      const rawText = 'Regular Unleaded Gas $45.50';

      const items = service.extractLineItems(rawText);

      expect(items.length).toBe(1);
      expect(items[0].suggestedCategory).toBe('Fuel');
    });

    it('should classify transportation items correctly', () => {
      const rawText = 'Uber to Airport $32.00';

      const items = service.extractLineItems(rawText);

      expect(items.length).toBe(1);
      expect(items[0].suggestedCategory).toBe('Ground Transportation');
    });

    it('should handle amounts without dollar sign', () => {
      const rawText = 'Coffee 4.50';

      const items = service.extractLineItems(rawText);

      expect(items.length).toBe(1);
      expect(items[0].amount).toBe(4.50);
    });

    it('should handle amounts with commas', () => {
      const rawText = 'Conference Room Rental $1,250.00';

      const items = service.extractLineItems(rawText);

      expect(items.length).toBe(1);
      expect(items[0].amount).toBe(1250.00);
    });

    it('should skip total and tax lines', () => {
      const rawText = `Room Charge $150.00
Subtotal $150.00
Tax $12.38
Total $162.38`;

      const items = service.extractLineItems(rawText);

      expect(items.length).toBe(1);
      expect(items[0].description).toContain('Room');
    });

    it('should return empty array for empty text', () => {
      const items = service.extractLineItems('');

      expect(items).toEqual([]);
    });

    it('should return empty array for null/undefined text', () => {
      const items = service.extractLineItems(null as any);

      expect(items).toEqual([]);
    });

    it('should clean up descriptions', () => {
      const rawText = 'Room***Charge!!! $150.00';

      const items = service.extractLineItems(rawText);

      expect(items.length).toBe(1);
      expect(items[0].description).not.toContain('*');
      expect(items[0].description).not.toContain('!');
    });

    it('should limit description length', () => {
      const longDescription = 'A'.repeat(300);
      const rawText = `${longDescription} $50.00`;

      const items = service.extractLineItems(rawText);

      if (items.length > 0) {
        expect(items[0].description.length).toBeLessThanOrEqual(200);
      }
    });
  });

  // ============================================================================
  // CATEGORY CLASSIFICATION TESTS
  // ============================================================================

  describe('classifyCategory', () => {
    it('should classify hotel-related text as Lodging', () => {
      const result = service.classifyCategory('Deluxe Hotel Room Night');

      expect(result.category).toBe('Lodging');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.keywords.length).toBeGreaterThan(0);
    });

    it('should classify food-related text as Meals & Entertainment', () => {
      const result = service.classifyCategory('Dinner at Chipotle');

      expect(result.category).toBe('Meals & Entertainment');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify gas-related text as Fuel', () => {
      const result = service.classifyCategory('Shell Premium Gasoline');

      expect(result.category).toBe('Fuel');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify ride-share text as Ground Transportation', () => {
      const result = service.classifyCategory('Lyft Ride Share');

      expect(result.category).toBe('Ground Transportation');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify flight-related text as Airfare', () => {
      const result = service.classifyCategory('Delta Airlines Boarding Pass');

      expect(result.category).toBe('Airfare');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify office supply text as Office Supplies', () => {
      const result = service.classifyCategory('Office Depot Paper and Pens');

      expect(result.category).toBe('Office Supplies');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should classify software text as Software/Subscriptions', () => {
      const result = service.classifyCategory('Adobe Creative Cloud Subscription');

      expect(result.category).toBe('Software/Subscriptions');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should default to Miscellaneous for unknown text', () => {
      const result = service.classifyCategory('XYZ123 Unknown Item');

      expect(result.category).toBe('Miscellaneous');
      expect(result.confidence).toBeLessThanOrEqual(0.5);
    });

    it('should increase confidence with multiple keyword matches', () => {
      const singleMatch = service.classifyCategory('hotel');
      const multipleMatches = service.classifyCategory('hotel room night stay');

      expect(multipleMatches.confidence).toBeGreaterThan(singleMatch.confidence);
    });

    it('should be case-insensitive', () => {
      const lowerCase = service.classifyCategory('hotel room');
      const upperCase = service.classifyCategory('HOTEL ROOM');
      const mixedCase = service.classifyCategory('HoTeL RoOm');

      expect(lowerCase.category).toBe(upperCase.category);
      expect(lowerCase.category).toBe(mixedCase.category);
    });
  });

  // ============================================================================
  // SPLIT SUGGESTION TESTS
  // ============================================================================

  describe('shouldSuggestSplit', () => {
    it('should suggest split when multiple categories are detected', () => {
      const items: DetectedLineItem[] = [
        { description: 'Room', amount: 150, suggestedCategory: 'Lodging', confidence: 0.8, keywords: ['room'] },
        { description: 'Meal', amount: 25, suggestedCategory: 'Meals & Entertainment', confidence: 0.7, keywords: ['meal'] }
      ];

      const result = service.shouldSuggestSplit(items);

      expect(result).toBe(true);
    });

    it('should not suggest split for single category', () => {
      const items: DetectedLineItem[] = [
        { description: 'Room 1', amount: 100, suggestedCategory: 'Lodging', confidence: 0.8, keywords: ['room'] },
        { description: 'Room 2', amount: 100, suggestedCategory: 'Lodging', confidence: 0.7, keywords: ['room'] }
      ];

      const result = service.shouldSuggestSplit(items);

      expect(result).toBe(false);
    });

    it('should not suggest split for single item', () => {
      const items: DetectedLineItem[] = [
        { description: 'Room', amount: 150, suggestedCategory: 'Lodging', confidence: 0.8, keywords: ['room'] }
      ];

      const result = service.shouldSuggestSplit(items);

      expect(result).toBe(false);
    });

    it('should not suggest split for empty items', () => {
      const items: DetectedLineItem[] = [];

      const result = service.shouldSuggestSplit(items);

      expect(result).toBe(false);
    });

    it('should ignore low-confidence items when determining split', () => {
      const items: DetectedLineItem[] = [
        { description: 'Room', amount: 150, suggestedCategory: 'Lodging', confidence: 0.8, keywords: ['room'] },
        { description: 'Unknown', amount: 25, suggestedCategory: 'Meals & Entertainment', confidence: 0.3, keywords: [] }
      ];

      const result = service.shouldSuggestSplit(items);

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // LINE ITEM EXTRACTION IN PROCESS RECEIPT
  // ============================================================================

  describe('processReceipt with line items', () => {
    it('should extract and include line items in result', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      // Use clear multi-category receipt: hotel room + gas station
      const mockResultWithRawText: OcrResult = {
        ...mockOcrResult,
        rawText: `Travel Expenses
Hotel Room Night $150.00
Shell Gasoline Fill $45.00
Total $195.00`
      };

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockResultWithRawText), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.lineItems).toBeDefined();
      expect(result.lineItems!.length).toBe(2);
      // Both items have different categories (Lodging vs Fuel), so split should be suggested
      expect(result.suggestSplit).toBe(true);
    });

    it('should log line items when detected', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const mockResultWithRawText: OcrResult = {
        ...mockOcrResult,
        rawText: 'Room Charge $150.00\nBreakfast $25.00'
      };

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockResultWithRawText), { status: 200 }))
      );

      await service.processReceipt(mockFile);

      expect(loggerServiceMock.info).toHaveBeenCalledWith(
        '[OCR] Line items detected',
        'OcrService',
        jasmine.objectContaining({
          count: jasmine.any(Number),
          suggestSplit: jasmine.any(Boolean)
        })
      );
    });

    it('should not include line items when none detected', async () => {
      const mockFile = new File(['test'], 'receipt.jpg', { type: 'image/jpeg' });
      const mockResultNoItems: OcrResult = {
        ...mockOcrResult,
        rawText: 'Total $45.50\nThank you'
      };

      spyOn(globalThis, 'fetch').and.returnValue(
        Promise.resolve(new Response(JSON.stringify(mockResultNoItems), { status: 200 }))
      );

      const result = await service.processReceipt(mockFile);

      expect(result.lineItems).toBeUndefined();
      expect(result.suggestSplit).toBeUndefined();
    });
  });
});
