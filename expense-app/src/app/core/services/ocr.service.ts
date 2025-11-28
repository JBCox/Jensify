import { Injectable, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { SupabaseService } from './supabase.service';
import { LoggerService } from './logger.service';

/**
 * Detected line item from receipt OCR
 */
export interface DetectedLineItem {
  description: string;
  amount: number;
  suggestedCategory: string;
  confidence: number;
  keywords: string[]; // Keywords that triggered the category match
}

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
  /** Detected line items with suggested categories */
  lineItems?: DetectedLineItem[];
  /** Whether the receipt appears to have multiple categories */
  suggestSplit?: boolean;
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
/**
 * Category keyword mappings for intelligent line item classification
 */
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Lodging': [
    'room', 'hotel', 'motel', 'inn', 'suite', 'accommodation', 'lodging',
    'resort', 'stay', 'night', 'checkout', 'check-in', 'bed', 'housekeeping',
    'hyatt', 'marriott', 'hilton', 'holiday inn', 'best western', 'airbnb'
  ],
  'Meals & Entertainment': [
    'breakfast', 'lunch', 'dinner', 'food', 'meal', 'restaurant', 'cafe',
    'coffee', 'snack', 'beverage', 'drink', 'bar', 'room service', 'catering',
    'minibar', 'mini bar', 'dining', 'eat', 'grill', 'pizza', 'burger',
    'sandwich', 'salad', 'soup', 'dessert', 'appetizer', 'entree', 'tip',
    'gratuity', 'starbucks', 'mcdonalds', 'subway', 'chipotle'
  ],
  'Fuel': [
    'gas', 'fuel', 'gasoline', 'diesel', 'petrol', 'gallon', 'unleaded',
    'premium', 'regular', 'shell', 'exxon', 'chevron', 'bp', 'texaco',
    'mobil', 'pump', 'filling station', 'gas station'
  ],
  'Ground Transportation': [
    'uber', 'lyft', 'taxi', 'cab', 'parking', 'toll', 'rental car', 'car rental',
    'hertz', 'enterprise', 'avis', 'budget', 'national', 'shuttle', 'bus',
    'metro', 'subway', 'train', 'transit', 'valet', 'garage'
  ],
  'Airfare': [
    'flight', 'airline', 'airfare', 'plane', 'boarding', 'baggage', 'luggage',
    'seat', 'delta', 'united', 'american', 'southwest', 'jetblue', 'alaska',
    'spirit', 'frontier', 'airport', 'tsa', 'terminal'
  ],
  'Office Supplies': [
    'office', 'supplies', 'paper', 'pen', 'pencil', 'stapler', 'folder',
    'binder', 'notebook', 'printer', 'ink', 'toner', 'staples', 'office depot',
    'office max'
  ],
  'Software/Subscriptions': [
    'software', 'subscription', 'license', 'saas', 'cloud', 'app', 'monthly',
    'annual', 'renewal', 'microsoft', 'adobe', 'zoom', 'slack', 'dropbox'
  ]
};

@Injectable({
  providedIn: 'root'
})
export class OcrService {
  private readonly supabase = inject(SupabaseService);
  private readonly logger = inject(LoggerService);

  /**
   * Extract line items from OCR raw text
   * Looks for patterns like "Description $XX.XX" or "XX.XX Description"
   *
   * @param rawText - Raw OCR text from receipt
   * @returns Array of detected line items with suggested categories
   */
  extractLineItems(rawText: string): DetectedLineItem[] {
    if (!rawText || rawText.trim().length === 0) {
      return [];
    }

    const lineItems: DetectedLineItem[] = [];
    const lines = rawText.split('\n').map(line => line.trim()).filter(line => line.length > 0);

    // Common patterns for line items on receipts
    // Pattern 1: "Description $XX.XX" or "Description XX.XX"
    const pattern1 = /^(.+?)\s+\$?([\d,]+\.?\d{0,2})\s*$/;
    // Pattern 2: "$XX.XX Description" or "XX.XX Description"
    const pattern2 = /^\$?([\d,]+\.?\d{0,2})\s+(.+)$/;
    // Pattern 3: "Description ... $XX.XX" (with dots/spaces in between)
    const pattern3 = /^(.+?)[\s.]+\$?([\d,]+\.?\d{0,2})\s*$/;

    // Skip common non-item lines
    const skipPatterns = [
      /^(subtotal|sub-total|total|tax|tip|gratuity|change|cash|credit|debit|visa|mastercard|amex)/i,
      /^(thank you|thanks|have a|come again|receipt|invoice|date|time)/i,
      /^[\d/]+$/, // Just dates or numbers
      /^[a-z0-9-]+$/i, // Just codes or short strings
    ];

    for (const line of lines) {
      // Skip non-item lines
      if (skipPatterns.some(pattern => pattern.test(line))) {
        continue;
      }

      let description: string | null = null;
      let amount: number | null = null;

      // Try each pattern
      let match = line.match(pattern1);
      if (match) {
        description = match[1].trim();
        amount = parseFloat(match[2].replace(/,/g, ''));
      }

      if (!match) {
        match = line.match(pattern2);
        if (match) {
          amount = parseFloat(match[1].replace(/,/g, ''));
          description = match[2].trim();
        }
      }

      if (!match) {
        match = line.match(pattern3);
        if (match && match[1].length > 3) {
          description = match[1].replace(/\.+$/, '').trim();
          amount = parseFloat(match[2].replace(/,/g, ''));
        }
      }

      // Validate the extracted item
      if (description && amount && amount > 0 && amount < 10000 && description.length >= 3) {
        const classification = this.classifyCategory(description);

        // Only include items with reasonable confidence
        if (classification.confidence >= 0.3) {
          lineItems.push({
            description: this.cleanDescription(description),
            amount,
            suggestedCategory: classification.category,
            confidence: classification.confidence,
            keywords: classification.keywords
          });
        }
      }
    }

    return lineItems;
  }

  /**
   * Classify a line item description into an expense category
   *
   * @param text - Description text to classify
   * @returns Category, confidence score, and matched keywords
   */
  classifyCategory(text: string): { category: string; confidence: number; keywords: string[] } {
    const normalizedText = text.toLowerCase();
    let bestMatch = {
      category: 'Miscellaneous',
      confidence: 0.3, // Default low confidence
      keywords: [] as string[]
    };

    for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
      const matchedKeywords: string[] = [];
      let matchCount = 0;

      for (const keyword of keywords) {
        if (normalizedText.includes(keyword.toLowerCase())) {
          matchedKeywords.push(keyword);
          matchCount++;
        }
      }

      if (matchCount > 0) {
        // Calculate confidence based on matches and keyword specificity
        const confidence = Math.min(0.95, 0.5 + (matchCount * 0.15));

        if (confidence > bestMatch.confidence) {
          bestMatch = {
            category,
            confidence,
            keywords: matchedKeywords
          };
        }
      }
    }

    return bestMatch;
  }

  /**
   * Determine if a split should be suggested based on detected line items
   *
   * @param lineItems - Array of detected line items
   * @returns True if split should be suggested
   */
  shouldSuggestSplit(lineItems: DetectedLineItem[]): boolean {
    if (lineItems.length < 2) {
      return false;
    }

    // Get unique categories with high confidence
    const uniqueCategories = new Set(
      lineItems
        .filter(item => item.confidence >= 0.5)
        .map(item => item.suggestedCategory)
    );

    // Suggest split if there are multiple distinct categories
    return uniqueCategories.size >= 2;
  }

  /**
   * Clean up a description string
   *
   * @param description - Raw description from OCR
   * @returns Cleaned description
   */
  private cleanDescription(description: string): string {
    return description
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/[^\w\s&\-']/g, '') // Remove special chars except common ones
      .trim()
      .substring(0, 200); // Limit length
  }

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

      // Extract line items from the raw OCR text
      if (result.rawText) {
        const lineItems = this.extractLineItems(result.rawText);
        if (lineItems.length > 0) {
          result.lineItems = lineItems;
          result.suggestSplit = this.shouldSuggestSplit(lineItems);

          this.logger.info('[OCR] Line items detected', 'OcrService', {
            count: lineItems.length,
            suggestSplit: result.suggestSplit,
            categories: [...new Set(lineItems.map(i => i.suggestedCategory))]
          });
        }
      }

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
