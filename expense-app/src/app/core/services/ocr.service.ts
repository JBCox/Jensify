import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';
import { LoggerService } from './logger.service';

/**
 * OCR extraction result with individual field confidence scores
 */
export interface OcrResult {
  merchant: string | null;
  amount: number | null;
  date: string | null;
  tax: number | null;
  confidence: {
    merchant: number;
    amount: number;
    date: number;
    tax: number;
    overall: number;
  };
  rawText: string;
}

/**
 * OCR Service using Supabase Edge Function + Google Vision API
 *
 * Security: The Google Vision API key is stored securely in Supabase secrets
 * and never exposed to the client. This service calls a Supabase Edge Function
 * which handles the actual API call server-side.
 *
 * Extracts text from receipt images and parses key fields:
 * - Merchant name
 * - Total amount
 * - Date
 * - Tax amount
 */
@Injectable({
  providedIn: 'root'
})
export class OcrService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggerService);

  /**
   * Process receipt image using Supabase Edge Function (secure)
   * @param file Image file (JPEG, PNG, or PDF)
   * @param receiptId Optional receipt ID to auto-update receipt record
   * @returns OCR extraction result with parsed fields
   */
  async processReceipt(file: File, receiptId?: string): Promise<OcrResult> {
    try {
      // Convert file to base64
      const base64Image = await this.fileToBase64(file);

      // Call Supabase Edge Function (secure server-side processing)
      const result = await this.callEdgeFunction(base64Image, receiptId);

      this.logger.info('[OCR] Extraction complete', 'OcrService', result);
      return result;
    } catch (error) {
      this.logger.error('[OCR] Failed to process receipt', error, 'OcrService');
      // Return fallback result with low confidence
      return this.getFallbackResult(file.name);
    }
  }

  /**
   * Convert File to base64 string
   *
   * @param file - Image file to convert
   * @returns Promise resolving to base64 string (without data URI prefix)
   * @private
   */
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  /**
   * Call Supabase Edge Function for OCR processing (secure)
   *
   * The Edge Function handles the Google Vision API call server-side,
   * keeping the API key secure and never exposing it to the client.
   *
   * @param base64Image - Base64-encoded image string
   * @param receiptId - Optional receipt ID to auto-update database record
   * @returns Promise resolving to OCR extraction result
   * @throws Error if user not authenticated or Edge Function fails
   * @private
   */
  private async callEdgeFunction(base64Image: string, receiptId?: string): Promise<OcrResult> {
    // Get current session for authentication
    const session = await this.supabase.client.auth.getSession();

    if (!session.data.session) {
      throw new Error('User not authenticated');
    }

    const functionUrl = `${environment.supabase.url}/functions/v1/process-receipt`;

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.data.session.access_token}`,
      },
      body: JSON.stringify({
        image_base64: base64Image,
        receipt_id: receiptId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR Edge Function error: ${response.statusText} - ${errorText}`);
    }

    const result: OcrResult = await response.json();

    if (!result || typeof result !== 'object') {
      throw new Error('Invalid response from OCR Edge Function');
    }

    return result;
  }

  /**
   * Extract merchant name from filename as fallback
   *
   * Used only when OCR completely fails. Attempts to extract meaningful
   * merchant name from filename by removing common prefixes and cleaning up.
   *
   * @param fileName - Original file name
   * @returns Cleaned merchant name or 'Unknown Merchant'
   * @private
   */
  private getMerchantFromFilename(fileName: string): string {
    // Remove extension
    const baseName = fileName.replace(/\.(jpg|jpeg|png|pdf)$/i, '');

    // Remove common patterns like IMG_, Screenshot_, etc.
    const cleaned = baseName
      .replace(/^(IMG|Screenshot|Photo|Scan|Receipt)[-_\s]*/i, '')
      .replace(/[-_]/g, ' ')
      .trim();

    return cleaned || 'Unknown Merchant';
  }

  /**
   * Get fallback result when OCR fails
   *
   * Returns a minimal OCR result with low confidence scores,
   * allowing the user to manually enter expense data.
   *
   * @param fileName - Original file name (used to extract merchant name)
   * @returns Fallback OCR result with zero/low confidence
   * @private
   */
  private getFallbackResult(fileName: string): OcrResult {
    return {
      merchant: this.getMerchantFromFilename(fileName),
      amount: null,
      date: null,
      tax: null,
      confidence: {
        merchant: 0.3,
        amount: 0,
        date: 0,
        tax: 0,
        overall: 0.075
      },
      rawText: ''
    };
  }
}
