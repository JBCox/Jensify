import { OcrStatus } from './enums';

/**
 * Line item detected from OCR analysis
 */
export interface ExtractedLineItem {
  description: string;
  amount: number;
  suggested_category: string;
  confidence: number;
  keywords: string[];
}

export interface Receipt {
  id: string;
  organization_id: string;
  expense_id?: string;
  user_id: string;

  // File info
  file_path: string;
  file_name: string;
  file_type: string;
  file_size: number;

  // OCR data
  ocr_status: OcrStatus;
  ocr_data?: unknown; // Raw OCR response data (varies by provider)
  ocr_confidence?: number;

  // Extracted fields
  extracted_merchant?: string;
  extracted_amount?: number;
  extracted_date?: string;
  extracted_tax?: number;

  // Line item extraction (for split suggestions)
  extracted_line_items?: ExtractedLineItem[];
  suggest_split?: boolean;

  created_at: string;
}

export interface UploadReceiptDto {
  file: File;
  user_id: string;
  organization_id: string;
}

export interface OcrResult {
  merchant?: string;
  amount?: number;
  date?: string;
  tax?: number;
  confidence: number;
  raw_data: unknown; // Raw OCR provider response
}

export interface ReceiptUploadResponse {
  receipt: Receipt;
  public_url: string;
}
