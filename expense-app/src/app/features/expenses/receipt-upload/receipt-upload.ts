import { Component, signal, computed, OnDestroy, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ExpenseService } from '../../../core/services/expense.service';
import { LoggerService } from '../../../core/services/logger.service';
import { Receipt, ReceiptUploadResponse } from '../../../core/models/receipt.model';
import { OcrStatus, ExpenseCategory } from '../../../core/models/enums';
import { Subject, interval, takeUntil, take } from 'rxjs';

/**
 * Receipt Upload Component
 * Allows users to upload expense receipts (gas, hotels, flights, meals, etc.)
 * via file picker, drag-and-drop, or camera. Validates file type and size,
 * shows preview, and uploads to Supabase Storage.
 */
@Component({
  selector: 'app-receipt-upload',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  templateUrl: './receipt-upload.html',
  styleUrl: './receipt-upload.scss',

  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptUpload implements OnDestroy {
  private expenseService = inject(ExpenseService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private logger = inject(LoggerService);

  // State signals
  selectedFile = signal<File | null>(null);
  previewUrl = signal<string | null>(null);
  isDragging = signal<boolean>(false);
  isUploading = signal<boolean>(false);
  uploadProgress = signal<number>(0);
  uploadedReceipt = signal<Receipt | null>(null);
  errorMessage = signal<string | null>(null);
  ocrProcessing = signal<boolean>(false);

  // Editable extracted data signals
  extractedMerchant = signal<string>('');
  extractedAmount = signal<number | null>(null);
  extractedDate = signal<string>('');
  extractedCategory = signal<ExpenseCategory>(ExpenseCategory.MISCELLANEOUS);

  // Computed values
  canUpload = computed(() => this.selectedFile() !== null && !this.isUploading());
  hasPreview = computed(() => this.previewUrl() !== null);
  showProgress = computed(() => this.isUploading());
  ocrCompleted = computed(() => {
    const receipt = this.uploadedReceipt();
    return receipt?.ocr_status === OcrStatus.COMPLETED;
  });
  ocrFailed = computed(() => {
    const receipt = this.uploadedReceipt();
    return receipt?.ocr_status === OcrStatus.FAILED;
  });

  // File validation constants
  readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
  readonly ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];

  // Enums for template
  readonly OcrStatus = OcrStatus;
  readonly ExpenseCategory = ExpenseCategory;

  // Category options for dropdown
  readonly categoryOptions = [
    { value: ExpenseCategory.FUEL, label: 'Fuel/Gas' },
    { value: ExpenseCategory.MEALS, label: 'Meals & Entertainment' },
    { value: ExpenseCategory.LODGING, label: 'Lodging/Hotels' },
    { value: ExpenseCategory.AIRFARE, label: 'Airfare' },
    { value: ExpenseCategory.GROUND_TRANSPORTATION, label: 'Ground Transportation' },
    { value: ExpenseCategory.OFFICE_SUPPLIES, label: 'Office Supplies' },
    { value: ExpenseCategory.SOFTWARE, label: 'Software/Subscriptions' },
    { value: ExpenseCategory.MISCELLANEOUS, label: 'Miscellaneous' }
  ];

  // Subject for subscription cleanup
  private destroy$ = new Subject<void>();
  private progressIntervalId: number | null = null;
  private ocrPollIntervalId: number | null = null;
  private hasPopulatedOcrFields = false;

  /**
   * Clean up subscriptions and timers when component is destroyed
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearProgressInterval();
    this.clearOcrPollInterval();
  }

  /**
   * Handle file selection from input
   */
  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processFile(input.files[0]);
    }
  }

  /**
   * Handle camera capture (mobile)
   */
  onCameraCapture(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processFile(input.files[0]);
    }
  }

  /**
   * Handle drag over event
   */
  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  /**
   * Handle drag leave event
   */
  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  /**
   * Handle file drop
   */
  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFile(files[0]);
    }
  }

  /**
   * Process and validate selected file
   */
  private processFile(file: File): void {
    this.errorMessage.set(null);

    // Validate file
    const validationError = this.expenseService.validateReceiptFile(file);
    if (validationError) {
      this.errorMessage.set(validationError);
      this.showError(validationError);
      return;
    }

    // Set selected file
    this.selectedFile.set(file);

    // Generate preview for images
    if (file.type.startsWith('image/')) {
      this.generateImagePreview(file);
    } else if (file.type === 'application/pdf') {
      // For PDFs, show a placeholder icon
      this.previewUrl.set(null);
    }
  }

  /**
   * Generate image preview
   */
  private generateImagePreview(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      this.previewUrl.set(reader.result as string);
    };
    reader.onerror = () => {
      this.showError('Failed to generate image preview');
    };
    reader.readAsDataURL(file);
  }

  /**
   * Upload receipt to Supabase
   */
  uploadReceipt(): void {
    const file = this.selectedFile();
    if (!file || this.isUploading()) {
      return;
    }

    this.isUploading.set(true);
    this.uploadProgress.set(0);
    this.errorMessage.set(null);

    // Clear any existing progress interval
    this.clearProgressInterval();

    // Simulate progress (Supabase doesn't provide upload progress)
    this.progressIntervalId = window.setInterval(() => {
      const current = this.uploadProgress();
      if (current < 90) {
        this.uploadProgress.set(current + 10);
      }
    }, 200);

    this.expenseService.uploadReceipt(file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ReceiptUploadResponse) => {
          this.clearProgressInterval();
          this.uploadProgress.set(100);
          this.uploadedReceipt.set(response.receipt);
          this.isUploading.set(false);  // Reset loading state
          this.showSuccess('Receipt uploaded successfully!');
          // Start polling for OCR completion
          this.startOcrPolling(response.receipt.id);
        },
        error: (error: Error) => {
          this.clearProgressInterval();
          this.isUploading.set(false);
          this.uploadProgress.set(0);
          const errorMsg = error.message || 'Failed to upload receipt';
          this.errorMessage.set(errorMsg);
          this.showError(errorMsg);
        }
      });
  }

  /**
   * Clear progress simulation interval
   */
  private clearProgressInterval(): void {
    if (this.progressIntervalId !== null) {
      clearInterval(this.progressIntervalId);
      this.progressIntervalId = null;
    }
  }

  /**
   * Clear selected file and preview
   */
  clearFile(): void {
    this.selectedFile.set(null);
    this.previewUrl.set(null);
    this.errorMessage.set(null);
    this.uploadProgress.set(0);
    this.uploadedReceipt.set(null);
  }

  /**
   * Reset form to upload another receipt
   */
  resetForAnotherUpload(): void {
    this.clearOcrPollInterval();
    this.selectedFile.set(null);
    this.previewUrl.set(null);
    this.uploadProgress.set(0);
    this.uploadedReceipt.set(null);
    this.errorMessage.set(null);
    this.ocrProcessing.set(false);
    this.extractedMerchant.set('');
    this.extractedAmount.set(null);
    this.extractedDate.set('');
    this.extractedCategory.set(ExpenseCategory.MISCELLANEOUS);
    this.hasPopulatedOcrFields = false;
  }

  /**
   * Navigate to expense form with receipt and edited OCR data
   */
  navigateToExpenseForm(): void {
    const receipt = this.uploadedReceipt();
    if (!receipt) return;

    const queryParams: Record<string, string> = { receiptId: receipt.id };

    // Pass edited values as query params (expense form will use these instead of receipt values)
    if (this.ocrCompleted()) {
      const merchant = this.extractedMerchant();
      const amount = this.extractedAmount();
      const date = this.extractedDate();
      const category = this.extractedCategory();

      if (merchant) {
        queryParams['merchant'] = merchant;
      }
      if (amount !== null) {
        queryParams['amount'] = String(amount);
      }
      if (date) {
        queryParams['date'] = date;
      }
      if (category) {
        queryParams['category'] = category;
      }
    }

    // Navigate to expense form
    this.router.navigate(['/expenses/new'], { queryParams });
  }

  /**
   * Get file size in human-readable format
   */
  getFileSizeLabel(): string {
    const file = this.selectedFile();
    if (!file) return '';

    const sizeInKB = file.size / 1024;
    if (sizeInKB < 1024) {
      return `${sizeInKB.toFixed(1)} KB`;
    }
    return `${(sizeInKB / 1024).toFixed(1)} MB`;
  }

  /**
   * Check if file is PDF
   */
  isPdf(): boolean {
    const file = this.selectedFile();
    return file?.type === 'application/pdf' || false;
  }

  /**
   * Start polling for OCR completion
   */
  private startOcrPolling(receiptId: string): void {
    this.ocrProcessing.set(true);

    // Poll every 2 seconds for up to 30 seconds (15 attempts)
    interval(2000)
      .pipe(
        take(15),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.expenseService.getReceiptById(receiptId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (receipt: Receipt) => {
              this.uploadedReceipt.set(receipt);

              // Stop polling if OCR completed or failed
              if (receipt.ocr_status === OcrStatus.COMPLETED || receipt.ocr_status === OcrStatus.FAILED) {
                this.ocrProcessing.set(false);
                this.clearOcrPollInterval();

                // Populate editable fields with extracted data ONLY ONCE (prevent overwriting user edits)
                if (receipt.ocr_status === OcrStatus.COMPLETED && !this.hasPopulatedOcrFields) {
                  this.extractedMerchant.set(receipt.extracted_merchant || '');
                  this.extractedAmount.set(receipt.extracted_amount || null);
                  this.extractedDate.set(receipt.extracted_date || '');
                  this.hasPopulatedOcrFields = true;
                }
              }
            },
            error: (err: Error) => {
              this.logger.error('Failed to poll OCR status', err);
            }
          });
      });
  }

  /**
   * Clear OCR polling interval
   */
  private clearOcrPollInterval(): void {
    if (this.ocrPollIntervalId !== null) {
      clearInterval(this.ocrPollIntervalId);
      this.ocrPollIntervalId = null;
    }
  }

  /**
   * Show success message
   */
  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 3000,
      panelClass: ['success-snackbar']
    });
  }

  /**
   * Show error message
   */
  private showError(message: string): void {
    this.snackBar.open(message, 'Close', {
      duration: 5000,
      panelClass: ['error-snackbar']
    });
  }
}
