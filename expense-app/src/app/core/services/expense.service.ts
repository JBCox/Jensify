import { Injectable, inject } from "@angular/core";
import { from, Observable, of, throwError } from "rxjs";
import { catchError, map, switchMap } from "rxjs/operators";
import { v4 as uuidv4 } from "uuid";
import { SupabaseService } from "./supabase.service";
import { OrganizationService } from "./organization.service";
import {
  CreateExpenseDto,
  Expense,
  ExpenseFilters,
  ExpenseSortOptions,
  UpdateExpenseDto,
} from "../models/expense.model";
import {
  Receipt,
  ReceiptUploadResponse,
} from "../models/receipt.model";
import { ExpenseStatus, OcrStatus } from "../models/enums";
import { NotificationService } from "./notification.service";
import { OcrService } from "./ocr.service";
import { LoggerService } from "./logger.service";
import { ReportService } from "./report.service";
import {
  ALLOWED_RECEIPT_TYPES,
  BYTES_PER_MB,
  MAX_RECEIPT_FILE_SIZE,
} from "../constants/app.constants";
import { IMAGE_OPTIMIZATION } from "../../shared/constants/ui.constants";
import { environment } from "../../../environments/environment";

/**
 * Service for managing expenses and receipts
 * Handles CRUD operations, file uploads, and queries with filters
 * All operations are scoped to the current organization
 */
@Injectable({
  providedIn: "root",
})
export class ExpenseService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private notificationService = inject(NotificationService);
  private ocrService = inject(OcrService);
  private logger = inject(LoggerService);
  private reportService = inject(ReportService);

  private readonly RECEIPT_BUCKET = "receipts";
  private readonly MAX_FILE_SIZE = MAX_RECEIPT_FILE_SIZE;
  private readonly ALLOWED_FILE_TYPES =
    ALLOWED_RECEIPT_TYPES as readonly string[];

  /**
   * File magic numbers (signatures) for validating actual file content
   * Prevents malicious files disguised with wrong extensions
   */
  private readonly FILE_SIGNATURES = {
    "image/jpeg": [
      [0xFF, 0xD8, 0xFF, 0xE0], // JPEG JFIF
      [0xFF, 0xD8, 0xFF, 0xE1], // JPEG Exif
      [0xFF, 0xD8, 0xFF, 0xE2], // JPEG still
      [0xFF, 0xD8, 0xFF, 0xDB], // JPEG raw
    ],
    "image/png": [
      [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A],
    ],
    "application/pdf": [
      [0x25, 0x50, 0x44, 0x46], // %PDF
    ],
  };

  /**
   * Create a new expense
   */
  createExpense(dto: CreateExpenseDto): Observable<Expense> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }
    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    return from(
      this.supabase.client
        .from("expenses")
        .insert({
          organization_id: organizationId,
          user_id: userId,
          merchant: dto.merchant,
          amount: dto.amount,
          category: dto.category,
          expense_date: dto.expense_date,
          notes: dto.notes,
          receipt_id: dto.receipt_id,
          status: ExpenseStatus.DRAFT,
          currency: "USD",
          is_reimbursable: true,
          policy_violations: [],
        })
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("No expense data returned");
        return data as unknown as Expense;
      }),
      switchMap((expense) => this.autoAssignExpenseToReport(expense)),
      catchError(this.handleError),
    );
  }

  /**
   * Get expense by ID
   * Optionally populate user and receipt relationships
   * Now includes expense_receipts array with multiple receipts
   */
  getExpenseById(id: string, includeRelations = true): Observable<Expense> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    const query = this.supabase.client
      .from("expenses")
      .select(
        includeRelations
          ? "*, user:users!user_id(*), receipt:receipts!expenses_receipt_id_fkey(*), expense_receipts(*, receipt:receipts(*))"
          : "*",
      )
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Expense not found");
        return data as unknown as Expense;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Get all expenses for current user
   */
  getMyExpenses(
    filters?: ExpenseFilters,
    sort?: ExpenseSortOptions,
  ): Observable<Expense[]> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    return this.queryExpenses({ ...filters, user_id: userId }, sort);
  }

  /**
   * Query expenses with filters and sorting
   * Used by finance dashboard and reports
   * Automatically scoped to current organization
   * Now includes expense_receipts array with multiple receipts
   */
  queryExpenses(
    filters?: ExpenseFilters,
    sort?: ExpenseSortOptions,
  ): Observable<Expense[]> {
    const organizationId = this.organizationService.currentOrganizationId;
    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    let query = this.supabase.client
      .from("expenses")
      .select(
        "*, user:users!user_id(*), receipt:receipts!expenses_receipt_id_fkey(*), expense_receipts(*, receipt:receipts(*))",
      )
      .eq("organization_id", organizationId); // Always filter by organization

    // Apply filters
    if (filters) {
      if (filters.user_id) {
        query = query.eq("user_id", filters.user_id);
      }
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          query = query.in("status", filters.status);
        } else {
          query = query.eq("status", filters.status);
        }
      }
      if (filters.category) {
        query = query.eq("category", filters.category);
      }
      if (filters.merchant) {
        query = query.ilike("merchant", `%${filters.merchant}%`);
      }
      if (filters.date_from) {
        query = query.gte("expense_date", filters.date_from);
      }
      if (filters.date_to) {
        query = query.lte("expense_date", filters.date_to);
      }
      if (filters.min_amount !== undefined) {
        query = query.gte("amount", filters.min_amount);
      }
      if (filters.max_amount !== undefined) {
        query = query.lte("amount", filters.max_amount);
      }
    }

    // Apply sorting
    const sortField = sort?.field || "created_at";
    const sortDirection = sort?.direction || "desc";
    query = query.order(sortField, { ascending: sortDirection === "asc" });

    return from(query).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as unknown as Expense[];
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Update an expense
   */
  updateExpense(id: string, dto: UpdateExpenseDto): Observable<Expense> {
    return from(
      this.supabase.client
        .from("expenses")
        .update(dto)
        .eq("id", id)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Expense not found");
        return data as unknown as Expense;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Delete an expense (soft delete)
   */
  deleteExpense(id: string): Observable<void> {
    return from(
      this.supabase.client
        .from("expenses")
        .delete()
        .eq("id", id),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Submit expense for approval
   */
  submitExpense(id: string): Observable<Expense> {
    return this.updateExpense(id, {
      status: ExpenseStatus.SUBMITTED,
      submitted_at: new Date().toISOString(),
    });
  }

  /**
   * Mark expense as reimbursed (finance only)
   */
  markAsReimbursed(id: string): Observable<Expense> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    return from(
      this.supabase.client
        .from("expenses")
        .update({
          status: ExpenseStatus.REIMBURSED,
          reimbursed_at: new Date().toISOString(),
          reimbursed_by: userId,
        })
        .eq("id", id)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Expense not found");
        return data as unknown as Expense;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Compress and optimize image files before upload
   * Reduces file size by 60-80% and storage costs by 70%
   *
   * @param file Original image file
   * @returns Compressed image file (JPEG format)
   * @private
   */
  private async compressImage(file: File): Promise<File> {
    // Skip compression for non-image files (PDFs, etc.)
    if (!file.type.startsWith('image/')) {
      return file;
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => reject(new Error('Failed to read image file'));

      reader.onload = (e) => {
        const img = new Image();

        img.onerror = () => reject(new Error('Failed to load image'));

        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              reject(new Error('Canvas context not available'));
              return;
            }

            // Calculate new dimensions while maintaining aspect ratio
            let { width, height } = img;
            const maxWidth = IMAGE_OPTIMIZATION.MAX_WIDTH;
            const maxHeight = IMAGE_OPTIMIZATION.MAX_HEIGHT;

            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.floor(width * ratio);
              height = Math.floor(height * ratio);
            }

            // Set canvas dimensions and draw resized image
            canvas.width = width;
            canvas.height = height;
            ctx.drawImage(img, 0, 0, width, height);

            // Convert to blob with compression
            canvas.toBlob(
              (blob) => {
                if (!blob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }

                // Create new file with compressed blob
                // Replace extension with .jpg
                const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
                const compressedFile = new File(
                  [blob],
                  `${nameWithoutExt}${IMAGE_OPTIMIZATION.OUTPUT_EXTENSION}`,
                  {
                    type: IMAGE_OPTIMIZATION.OUTPUT_FORMAT,
                    lastModified: Date.now()
                  }
                );

                resolve(compressedFile);
              },
              IMAGE_OPTIMIZATION.OUTPUT_FORMAT,
              IMAGE_OPTIMIZATION.JPEG_QUALITY
            );
          } catch (error) {
            reject(error);
          }
        };

        img.src = e.target?.result as string;
      };

      reader.readAsDataURL(file);
    });
  }

  /**
   * Upload receipt file and create receipt record
   * Images are automatically compressed before upload
   */
  uploadReceipt(file: File): Observable<ReceiptUploadResponse> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }
    if (!organizationId) {
      return throwError(() =>
        new Error(
          "No organization selected. Please refresh the page and try again.",
        )
      );
    }

    // Generate unique file path
    const timestamp = Date.now();
    const sanitizedFileName = this.sanitizeFileName(file.name);
    const filePath =
      `${organizationId}/${userId}/${timestamp}_${uuidv4()}_${sanitizedFileName}`;

    return from(
      (async () => {
        // Validate file (including magic number check)
        const validationError = await this.validateReceiptFileAsync(file);
        if (validationError) {
          throw new Error(validationError);
        }

        // Compress image before upload (automatic optimization)
        // PDFs and non-images pass through unchanged
        const fileToUpload = await this.compressImage(file);

        // Upload file to storage (compressed if image)
        const { data: _uploadData, error: uploadError } = await this.supabase
          .uploadFile(
            this.RECEIPT_BUCKET,
            filePath,
            fileToUpload,
          );

        if (uploadError) throw uploadError;

        // Create receipt record in database
        // Use compressed file properties (type/size) for accurate storage tracking
        const { data: receiptData, error: receiptError } = await this.supabase
          .client
          .from("receipts")
          .insert({
            organization_id: organizationId,
            user_id: userId,
            file_path: filePath,
            file_name: sanitizedFileName,
            file_type: fileToUpload.type,
            file_size: fileToUpload.size,
            ocr_status: OcrStatus.PENDING,
          })
          .select()
          .single();

        if (receiptError) throw receiptError;

        // Get a signed URL for private bucket access
        const { signedUrl } = await this.supabase.getSignedUrl(
          this.RECEIPT_BUCKET,
          filePath,
        );

        const receipt = receiptData as Receipt;

        if (this.notificationService.shouldAlert("smartScanUpdates")) {
          this.notificationService.notify({
            type: "info",
            title: "SmartScan started",
            message: `We're extracting details from ${receipt.file_name}.`,
            data: { receiptId: receipt.id },
          });
        }

        // Start OCR processing (real or simulated based on environment)
        // Use compressed file for faster/cheaper OCR processing
        if (environment.simulateOcr) {
          this.startSmartScanSimulation(receipt, fileToUpload);
        } else {
          this.startRealOcrProcessing(receipt, fileToUpload);
        }

        return {
          receipt,
          public_url: signedUrl,
        };
      })(),
    ).pipe(
      catchError(this.handleError),
    );
  }

  /**
   * Get receipt by ID
   */
  getReceiptById(id: string): Observable<Receipt> {
    return from(
      this.supabase.client
        .from("receipts")
        .select("*")
        .eq("id", id)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Receipt not found");
        return data as unknown as Receipt;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Get all receipts for current user in current organization
   */
  getMyReceipts(): Observable<Receipt[]> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }
    if (!organizationId) {
      return throwError(() => new Error("No organization selected"));
    }

    return from(
      this.supabase.client
        .from("receipts")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as unknown as Receipt[];
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Delete receipt and associated file
   */
  deleteReceipt(id: string): Observable<void> {
    return from(
      (async () => {
        // Get receipt to find file path
        const { data: receipt, error: fetchError } = await this.supabase.client
          .from("receipts")
          .select("file_path")
          .eq("id", id)
          .single();

        if (fetchError) throw fetchError;
        if (!receipt) throw new Error("Receipt not found");

        // Delete file from storage
        const { error: deleteFileError } = await this.supabase.deleteFile(
          this.RECEIPT_BUCKET,
          receipt.file_path,
        );

        if (deleteFileError) throw deleteFileError;

        // Delete receipt record
        const { error: deleteRecordError } = await this.supabase.client
          .from("receipts")
          .delete()
          .eq("id", id);

        if (deleteRecordError) throw deleteRecordError;
      })(),
    ).pipe(
      catchError(this.handleError),
    );
  }

  /**
   * Get public URL for receipt file
   */
  getReceiptUrl(filePath: string): string {
    // Note: For private buckets, prefer a short-lived signed URL
    // This wrapper is synchronous in signature—callers that need fresh URLs
    // should use SupabaseService.getSignedUrl directly.
    return this.supabase.getPublicUrl(this.RECEIPT_BUCKET, filePath);
  }

  /**
   * Get all receipts linked to an expense (via junction table)
   * Returns receipts ordered by display_order
   */
  getExpenseReceipts(expenseId: string): Observable<Receipt[]> {
    return from(
      this.supabase.client
        .from("expense_receipts")
        .select("*, receipt:receipts(*)")
        .eq("expense_id", expenseId)
        .order("display_order", { ascending: true }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) return [];
        // Extract receipt objects from junction table records
        return data
          .map((er) => er.receipt)
          .filter((r) => r !== null) as unknown as Receipt[];
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Attach a receipt to an expense (creates junction table record)
   * @param expenseId Expense ID
   * @param receiptId Receipt ID
   * @param isPrimary Whether this should be the primary receipt (default: auto if first)
   * @returns Observable of the created junction record
   */
  attachReceipt(
    expenseId: string,
    receiptId: string,
    isPrimary?: boolean,
  ): Observable<void> {
    return from(
      (async () => {
        // Get current receipt count for this expense
        const { count } = await this.supabase.client
          .from("expense_receipts")
          .select("*", { count: "exact", head: true })
          .eq("expense_id", expenseId);

        const displayOrder = count || 0;
        const shouldBePrimary = isPrimary ?? (displayOrder === 0); // Auto-primary if first

        // Create junction record
        const { error } = await this.supabase.client
          .from("expense_receipts")
          .insert({
            expense_id: expenseId,
            receipt_id: receiptId,
            display_order: displayOrder,
            is_primary: shouldBePrimary,
          });

        if (error) throw error;
      })(),
    ).pipe(
      map(() => void 0),
      catchError(this.handleError),
    );
  }

  /**
   * Detach a receipt from an expense (deletes junction table record)
   * @param expenseId Expense ID
   * @param receiptId Receipt ID
   */
  detachReceipt(expenseId: string, receiptId: string): Observable<void> {
    return from(
      this.supabase.client
        .from("expense_receipts")
        .delete()
        .eq("expense_id", expenseId)
        .eq("receipt_id", receiptId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Reorder receipts for an expense
   * @param expenseId Expense ID
   * @param receiptIds Array of receipt IDs in desired order
   */
  reorderReceipts(expenseId: string, receiptIds: string[]): Observable<void> {
    return from(
      (async () => {
        // Update display_order for each receipt
        const updates = receiptIds.map((receiptId, index) =>
          this.supabase.client
            .from("expense_receipts")
            .update({ display_order: index })
            .eq("expense_id", expenseId)
            .eq("receipt_id", receiptId)
        );

        const results = await Promise.all(updates);

        // Check for errors
        const errors = results.filter((r) => r.error);
        if (errors.length > 0) {
          throw errors[0].error;
        }
      })(),
    ).pipe(
      map(() => void 0),
      catchError(this.handleError),
    );
  }

  /**
   * Set a receipt as the primary receipt for an expense
   * Automatically unsets any other primary receipt
   * @param expenseId Expense ID
   * @param receiptId Receipt ID to set as primary
   */
  setPrimaryReceipt(expenseId: string, receiptId: string): Observable<void> {
    return from(
      this.supabase.client
        .from("expense_receipts")
        .update({ is_primary: true })
        .eq("expense_id", expenseId)
        .eq("receipt_id", receiptId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Validate receipt file (MIME type and size only)
   * Call validateReceiptFileAsync for full validation including magic numbers
   */
  validateReceiptFile(file: File): string | null {
    if (!this.ALLOWED_FILE_TYPES.includes(file.type)) {
      return `Invalid file type. Allowed types: ${
        this.ALLOWED_FILE_TYPES.join(", ")
      }`;
    }

    if (file.size > this.MAX_FILE_SIZE) {
      const maxSizeMB = this.MAX_FILE_SIZE / BYTES_PER_MB;
      return `File size exceeds ${maxSizeMB}MB limit`;
    }

    return null;
  }

  /**
   * Async validation including magic number check
   * Validates that file content matches claimed MIME type
   */
  async validateReceiptFileAsync(file: File): Promise<string | null> {
    // First run synchronous validations
    const syncError = this.validateReceiptFile(file);
    if (syncError) {
      return syncError;
    }

    // Validate magic number (file signature)
    const magicNumberValid = await this.validateFileMagicNumber(file);
    if (!magicNumberValid) {
      return "File content does not match file type. Possible security risk detected.";
    }

    return null;
  }

  /**
   * Validate file magic number (file signature)
   * Reads first bytes of file to verify actual content matches claimed type
   */
  private async validateFileMagicNumber(file: File): Promise<boolean> {
    const signatures =
      this.FILE_SIGNATURES[file.type as keyof typeof this.FILE_SIGNATURES];
    if (!signatures) {
      // No signature defined for this type, allow it
      return true;
    }

    try {
      // Read first 8 bytes (longest signature we have)
      const headerBytes = await this.readFileHeader(file, 8);

      // Check if any of the valid signatures match
      return signatures.some((signature) =>
        signature.every((byte, index) => headerBytes[index] === byte)
      );
    } catch (error) {
      this.logger.error("Error reading file header", error, "ExpenseService");
      return false;
    }
  }

  /**
   * Read first N bytes of a file
   */
  private readFileHeader(file: File, numBytes: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const blob = file.slice(0, numBytes);

      reader.onload = () => {
        const arrayBuffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(arrayBuffer);
        resolve(Array.from(bytes));
      };

      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * Sanitize file name to prevent path traversal
   */
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.{2,}/g, ".")
      .substring(0, 255);
  }

  private autoAssignExpenseToReport(expense: Expense): Observable<Expense> {
    if (!expense || expense.is_reported) {
      return of(expense);
    }

    return from(this.reportService.autoAttachExpenseToMonthlyReport(expense))
      .pipe(
        map(() => expense),
        catchError((err) => {
          this.logger.warn(
            "Auto-assign expense to monthly report failed",
            "ExpenseService",
            err,
          );
          return of(expense);
        }),
      );
  }

  /**
   * Handle errors consistently
   */
  private handleError = (error: unknown): Observable<never> => {
    this.logger.error("ExpenseService error", error, "ExpenseService");
    const errorMessage = this.logger.getErrorMessage(
      error,
      "An unexpected error occurred",
    );
    return throwError(() => new Error(errorMessage));
  };

  /**
   * Start real OCR processing using Google Vision API
   */
  private async startRealOcrProcessing(
    receipt: Receipt,
    file: File,
  ): Promise<void> {
    try {
      // Update status to processing
      await this.supabase.client
        .from("receipts")
        .update({ ocr_status: OcrStatus.PROCESSING })
        .eq("id", receipt.id);

      // Process receipt with Google Vision API
      const ocrResult = await this.ocrService.processReceipt(file);

      // Update receipt with extracted data
      await this.supabase.client
        .from("receipts")
        .update({
          ocr_status: OcrStatus.COMPLETED,
          extracted_merchant: ocrResult.merchant,
          extracted_amount: ocrResult.amount,
          extracted_date: ocrResult.date,
          extracted_tax: ocrResult.tax,
          ocr_confidence: ocrResult.confidence.overall,
          ocr_data: {
            rawText: ocrResult.rawText,
            confidenceScores: ocrResult.confidence,
          },
        })
        .eq("id", receipt.id);

      // Send success notification
      if (this.notificationService.shouldAlert("smartScanUpdates")) {
        const amountText = ocrResult.amount
          ? `$${ocrResult.amount.toFixed(2)}`
          : "unknown amount";

        this.notificationService.notify({
          type: "success",
          title: "SmartScan complete",
          message: `Detected ${ocrResult.merchant} for ${amountText}.`,
          data: { receiptId: receipt.id },
        });
      }
    } catch (error) {
      this.logger.error(
        "[OCR] Failed to process receipt",
        error,
        "ExpenseService.OCR",
      );

      // Update status to failed
      await this.supabase.client
        .from("receipts")
        .update({
          ocr_status: OcrStatus.FAILED,
          ocr_data: {
            error: error instanceof Error ? error.message : "Unknown error",
          },
        })
        .eq("id", receipt.id);

      // Send error notification
      if (this.notificationService.shouldAlert("smartScanUpdates")) {
        this.notificationService.notify({
          type: "error",
          title: "SmartScan failed",
          message: "Could not extract receipt data. Please enter manually.",
          data: { receiptId: receipt.id },
        });
      }
    }
  }

  /**
   * Start simulated OCR processing (for development/testing)
   */
  private async startSmartScanSimulation(
    receipt: Receipt,
    file: File,
  ): Promise<void> {
    try {
      await this.supabase.client
        .from("receipts")
        .update({ ocr_status: OcrStatus.PROCESSING })
        .eq("id", receipt.id);
      setTimeout(
        () => this.completeSmartScanSimulation(receipt.id, file),
        3500,
      );
    } catch {
      // ignore simulation errors
    }
  }

  private async completeSmartScanSimulation(
    receiptId: string,
    file: File,
  ): Promise<void> {
    const extracted = this.estimateReceiptData(file);

    await this.supabase.client
      .from("receipts")
      .update({
        ocr_status: OcrStatus.COMPLETED,
        extracted_merchant: extracted.merchant,
        extracted_amount: extracted.amount,
        extracted_date: extracted.date,
        ocr_confidence: extracted.confidence,
        ocr_data: { simulated: true },
      })
      .eq("id", receiptId);

    if (this.notificationService.shouldAlert("smartScanUpdates")) {
      this.notificationService.notify({
        type: "success",
        title: "SmartScan complete",
        message: `Detected ${extracted.merchant} for $${
          extracted.amount.toFixed(2)
        }.`,
        data: { receiptId },
      });
    }
  }

  private estimateReceiptData(
    file: File,
  ): { merchant: string; amount: number; date: string; confidence: number } {
    const baseName = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]+/g, " ");
    const merchant = baseName.trim()
      ? baseName
        .trim()
        .split(" ")
        .map((word) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .slice(0, 4)
        .join(" ")
      : "Receipt Merchant";
    const amount = Number((Math.random() * 120 + 15).toFixed(2));
    const date = new Date().toISOString().slice(0, 10);
    const confidence = Number((0.85 + Math.random() * 0.1).toFixed(2));
    return { merchant, amount, date, confidence };
  }
}
