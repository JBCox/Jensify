/**
 * Email processing status
 */
export type EmailProcessingStatus = 'pending' | 'processing' | 'processed' | 'failed' | 'rejected';

/**
 * OCR status for attachments
 */
export type OcrStatus = 'pending' | 'processing' | 'completed' | 'failed';

/**
 * Email inbox configuration
 */
export interface EmailInboxConfig {
  id: string;
  organization_id: string;

  /** Inbox email address (e.g., expenses@yourorg.jensify.com) */
  inbox_address: string;
  /** Whether email processing is enabled */
  is_enabled: boolean;

  /** Auto-create draft expense from email */
  auto_create_expense: boolean;
  /** Default category for email expenses */
  default_category?: string | null;
  /** Require receipt attachment to process */
  require_attachment: boolean;

  /** Send confirmation email when processed */
  notify_on_receipt: boolean;
  /** Send error notification on failure */
  notify_on_error: boolean;

  /** Only accept emails from these domains */
  allowed_sender_domains?: string[] | null;
  /** Only process from verified user emails */
  require_verified_sender: boolean;

  created_at: string;
  updated_at: string;
}

/**
 * User email alias for submission
 */
export interface UserEmailAlias {
  id: string;
  user_id: string;
  organization_id: string;

  /** Alternative email address */
  email: string;
  /** Whether email has been verified */
  is_verified: boolean;
  /** Verification token */
  verification_token?: string | null;
  /** When email was verified */
  verified_at?: string | null;

  created_at: string;
}

/**
 * Inbound email record
 */
export interface InboundEmail {
  id: string;
  organization_id?: string | null;

  /** Email message ID for deduplication */
  message_id: string;
  /** Sender email address */
  from_address: string;
  /** Recipient address */
  to_address: string;
  /** Email subject */
  subject?: string | null;
  /** Plain text body */
  body_text?: string | null;
  /** HTML body */
  body_html?: string | null;

  /** Matched user ID */
  matched_user_id?: string | null;

  /** Processing status */
  status: EmailProcessingStatus;
  /** Error message if failed */
  error_message?: string | null;

  /** Created expense ID */
  created_expense_id?: string | null;
  /** Created receipt ID */
  created_receipt_id?: string | null;

  /** Number of attachments */
  attachment_count: number;

  /** Raw webhook payload */
  raw_payload?: Record<string, unknown> | null;

  received_at: string;
  processed_at?: string | null;

  // Populated relations
  attachments?: EmailAttachment[];
}

/**
 * Email attachment
 */
export interface EmailAttachment {
  id: string;
  email_id: string;

  /** Original filename */
  filename: string;
  /** MIME type */
  content_type?: string | null;
  /** File size in bytes */
  file_size?: number | null;
  /** Storage path in Supabase */
  storage_path?: string | null;

  /** Identified as receipt */
  is_receipt: boolean;
  /** Created receipt ID */
  processed_receipt_id?: string | null;

  /** OCR processing status */
  ocr_status?: OcrStatus | null;
  /** OCR results */
  ocr_result?: Record<string, unknown> | null;

  created_at: string;
}

/**
 * Email processing statistics
 */
export interface EmailProcessingStats {
  organization_id: string;
  total_emails: number;
  processed_count: number;
  failed_count: number;
  pending_count: number;
  expenses_created: number;
  avg_processing_time_seconds: number;
}

/**
 * DTO for updating inbox config
 */
export interface UpdateInboxConfigDto {
  is_enabled?: boolean;
  auto_create_expense?: boolean;
  default_category?: string | null;
  require_attachment?: boolean;
  notify_on_receipt?: boolean;
  notify_on_error?: boolean;
  allowed_sender_domains?: string[] | null;
  require_verified_sender?: boolean;
}

/**
 * DTO for adding email alias
 */
export interface AddEmailAliasDto {
  email: string;
}

/**
 * Email submission info for user
 */
export interface EmailSubmissionInfo {
  /** User's unique submission email */
  submission_email: string;
  /** Whether email submission is enabled */
  is_enabled: boolean;
  /** Instructions for email submission */
  instructions: string[];
}

/**
 * Status display configuration
 */
export const EMAIL_STATUS_CONFIG: Record<EmailProcessingStatus, { label: string; color: string; icon: string }> = {
  pending: { label: 'Pending', color: 'default', icon: 'schedule' },
  processing: { label: 'Processing', color: 'primary', icon: 'sync' },
  processed: { label: 'Processed', color: 'success', icon: 'check_circle' },
  failed: { label: 'Failed', color: 'warn', icon: 'error' },
  rejected: { label: 'Rejected', color: 'warn', icon: 'block' }
};

/**
 * OCR status display configuration
 */
export const OCR_STATUS_CONFIG: Record<OcrStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'default' },
  processing: { label: 'Processing', color: 'primary' },
  completed: { label: 'Completed', color: 'success' },
  failed: { label: 'Failed', color: 'warn' }
};

/**
 * Email submission instructions
 */
export const EMAIL_SUBMISSION_INSTRUCTIONS = [
  'Forward receipts to your unique submission email address',
  'Attach receipt images (JPEG, PNG) or PDF files',
  'Include expense details in the email subject or body',
  'One receipt per email for best results',
  'Expenses will be created as drafts for your review'
];
