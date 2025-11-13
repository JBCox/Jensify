import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatCardModule } from '@angular/material/card';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ExpenseService } from '../../../core/services/expense.service';
import { Receipt, ReceiptUploadResponse } from '../../../core/models/receipt.model';

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
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatCardModule,
    MatSnackBarModule
  ],
  templateUrl: './receipt-upload.html',
  styleUrl: './receipt-upload.scss',
})
export class ReceiptUpload {
  // State signals
  selectedFile = signal<File | null>(null);
  previewUrl = signal<string | null>(null);
  isDragging = signal<boolean>(false);
  isUploading = signal<boolean>(false);
  uploadProgress = signal<number>(0);
  uploadedReceipt = signal<Receipt | null>(null);
  errorMessage = signal<string | null>(null);

  // Computed values
  canUpload = computed(() => this.selectedFile() !== null && !this.isUploading());
  hasPreview = computed(() => this.previewUrl() !== null);
  showProgress = computed(() => this.isUploading());

  // File validation constants
  readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];
  readonly ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf'];

  constructor(
    private expenseService: ExpenseService,
    private snackBar: MatSnackBar,
    private router: Router
  ) {}

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

    // Simulate progress (Supabase doesn't provide upload progress)
    const progressInterval = setInterval(() => {
      const current = this.uploadProgress();
      if (current < 90) {
        this.uploadProgress.set(current + 10);
      }
    }, 200);

    this.expenseService.uploadReceipt(file).subscribe({
      next: (response: ReceiptUploadResponse) => {
        clearInterval(progressInterval);
        this.uploadProgress.set(100);
        this.uploadedReceipt.set(response.receipt);
        this.showSuccess('Receipt uploaded successfully!');

        // Navigate to expense form with receipt ID
        setTimeout(() => {
          this.router.navigate(['/expenses/new'], {
            queryParams: { receiptId: response.receipt.id }
          });
        }, 1000);
      },
      error: (error: Error) => {
        clearInterval(progressInterval);
        this.isUploading.set(false);
        this.uploadProgress.set(0);
        const errorMsg = error.message || 'Failed to upload receipt';
        this.errorMessage.set(errorMsg);
        this.showError(errorMsg);
      }
    });
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
