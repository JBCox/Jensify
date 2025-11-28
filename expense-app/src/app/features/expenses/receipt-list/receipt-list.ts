import { Component, ChangeDetectionStrategy, inject, signal, computed, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterModule } from '@angular/router';
import { ExpenseService } from '../../../core/services/expense.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { LoggerService } from '../../../core/services/logger.service';
import { Subject, interval, takeUntil, take } from 'rxjs';
import { Receipt, ReceiptUploadResponse } from '../../../core/models/receipt.model';
import { OcrStatus, ExpenseCategory } from '../../../core/models/enums';

@Component({
  selector: 'app-receipt-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    RouterModule
  ],
  templateUrl: './receipt-list.html',
  styleUrl: './receipt-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ReceiptList implements OnDestroy {
  private readonly expenseService = inject(ExpenseService);
  private readonly router = inject(Router);
  private readonly supabase = inject(SupabaseService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly logger = inject(LoggerService);

  // Receipts list
  receipts = signal<Receipt[]>([]);
  loadingReceipts = signal<boolean>(true);

  // Upload state signals
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
  private hasPopulatedOcrFields = false;

  constructor() {
    this.loadReceipts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.clearProgressInterval();
  }

  /** Load receipts from service */
  loadReceipts(): void {
    this.loadingReceipts.set(true);
    this.expenseService.getMyReceipts()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (receipts) => {
          this.receipts.set(receipts);
          this.loadingReceipts.set(false);
        },
        error: (err) => {
          this.logger.error('Failed to load receipts', err);
          this.loadingReceipts.set(false);
        }
      });
  }

  /** Create expense from receipt */
  createExpense(receipt: Receipt): void {
    this.router.navigate(['/expenses/new'], { queryParams: { receiptId: receipt.id } });
  }

  /** View receipt in new tab */
  async viewReceipt(receipt: Receipt): Promise<void> {
    try {
      const { signedUrl } = await this.supabase.getSignedUrl('receipts', receipt.file_path, 86400);
      if (signedUrl) {
        window.open(signedUrl, '_blank');
      }
    } catch (error) {
      this.logger.error('Failed to get receipt URL:', error);
    }
  }

  getStatusLabel(receipt: Receipt): string {
    switch (receipt.ocr_status as OcrStatus) {
      case OcrStatus.COMPLETED: return 'Ready';
      case OcrStatus.PROCESSING: return 'Processing';
      case OcrStatus.FAILED: return 'Failed';
      default: return 'Queued';
    }
  }

  getStatusClass(receipt: Receipt): string {
    return `status-${receipt.ocr_status}`;
  }

  trackByReceiptId(_index: number, receipt: Receipt): string {
    return receipt.id;
  }

  // ========== Upload functionality ==========

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processFile(input.files[0]);
    }
  }

  onCameraCapture(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processFile(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragging.set(false);
    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.processFile(files[0]);
    }
  }

  private processFile(file: File): void {
    this.errorMessage.set(null);
    const validationError = this.expenseService.validateReceiptFile(file);
    if (validationError) {
      this.errorMessage.set(validationError);
      this.showError(validationError);
      return;
    }
    this.selectedFile.set(file);
    if (file.type.startsWith('image/')) {
      this.generateImagePreview(file);
    } else {
      this.previewUrl.set(null);
    }
  }

  private generateImagePreview(file: File): void {
    const reader = new FileReader();
    reader.onload = () => this.previewUrl.set(reader.result as string);
    reader.onerror = () => this.showError('Failed to generate image preview');
    reader.readAsDataURL(file);
  }

  uploadReceipt(): void {
    const file = this.selectedFile();
    if (!file || this.isUploading()) return;

    this.isUploading.set(true);
    this.uploadProgress.set(0);
    this.errorMessage.set(null);
    this.clearProgressInterval();

    // Simulate progress
    this.progressIntervalId = window.setInterval(() => {
      const current = this.uploadProgress();
      if (current < 90) this.uploadProgress.set(current + 10);
    }, 200);

    this.expenseService.uploadReceipt(file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: ReceiptUploadResponse) => {
          this.clearProgressInterval();
          this.uploadProgress.set(100);
          this.uploadedReceipt.set(response.receipt);
          this.isUploading.set(false);
          this.showSuccess('Receipt uploaded successfully!');
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

  private clearProgressInterval(): void {
    if (this.progressIntervalId !== null) {
      clearInterval(this.progressIntervalId);
      this.progressIntervalId = null;
    }
  }

  clearFile(): void {
    this.selectedFile.set(null);
    this.previewUrl.set(null);
    this.errorMessage.set(null);
    this.uploadProgress.set(0);
    this.uploadedReceipt.set(null);
    this.ocrProcessing.set(false);
    this.extractedMerchant.set('');
    this.extractedAmount.set(null);
    this.extractedDate.set('');
    this.extractedCategory.set(ExpenseCategory.MISCELLANEOUS);
    this.hasPopulatedOcrFields = false;
  }

  resetAndReload(): void {
    this.clearFile();
    this.loadReceipts();
  }

  navigateToExpenseForm(): void {
    const receipt = this.uploadedReceipt();
    if (!receipt) return;

    const queryParams: Record<string, string> = { receiptId: receipt.id };
    if (this.ocrCompleted()) {
      const merchant = this.extractedMerchant();
      const amount = this.extractedAmount();
      const date = this.extractedDate();
      const category = this.extractedCategory();
      if (merchant) queryParams['merchant'] = merchant;
      if (amount !== null) queryParams['amount'] = String(amount);
      if (date) queryParams['date'] = date;
      if (category) queryParams['category'] = category;
    }
    this.router.navigate(['/expenses/new'], { queryParams });
  }

  getFileSizeLabel(): string {
    const file = this.selectedFile();
    if (!file) return '';
    const sizeInKB = file.size / 1024;
    return sizeInKB < 1024 ? `${sizeInKB.toFixed(1)} KB` : `${(sizeInKB / 1024).toFixed(1)} MB`;
  }

  isPdf(): boolean {
    return this.selectedFile()?.type === 'application/pdf' || false;
  }

  private startOcrPolling(receiptId: string): void {
    this.ocrProcessing.set(true);
    interval(2000)
      .pipe(take(15), takeUntil(this.destroy$))
      .subscribe(() => {
        this.expenseService.getReceiptById(receiptId)
          .pipe(takeUntil(this.destroy$))
          .subscribe({
            next: (receipt: Receipt) => {
              this.uploadedReceipt.set(receipt);
              if (receipt.ocr_status === OcrStatus.COMPLETED || receipt.ocr_status === OcrStatus.FAILED) {
                this.ocrProcessing.set(false);
                if (receipt.ocr_status === OcrStatus.COMPLETED && !this.hasPopulatedOcrFields) {
                  this.extractedMerchant.set(receipt.extracted_merchant || '');
                  this.extractedAmount.set(receipt.extracted_amount || null);
                  this.extractedDate.set(receipt.extracted_date || '');
                  this.hasPopulatedOcrFields = true;
                }
              }
            },
            error: (err: Error) => this.logger.error('Failed to poll OCR status', err)
          });
      });
  }

  private showSuccess(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 3000, panelClass: ['success-snackbar'] });
  }

  private showError(message: string): void {
    this.snackBar.open(message, 'Close', { duration: 5000, panelClass: ['error-snackbar'] });
  }
}
