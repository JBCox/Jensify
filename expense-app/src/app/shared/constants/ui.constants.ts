/**
 * UI Constants
 * Centralized constants for UI-related values
 *
 * Extracted magic numbers to improve maintainability
 * and consistency across the application.
 */

/**
 * Snackbar duration constants (in milliseconds)
 * Used across the application for toast notifications
 */
export const SNACKBAR_DURATION = {
  /** Success messages - shorter duration */
  SUCCESS: 3000,

  /** Error messages - longer duration for users to read */
  ERROR: 4000,

  /** Critical errors - longest duration */
  CRITICAL: 5000,

  /** Persistent messages - don't auto-dismiss */
  PERSISTENT: 0
} as const;

/**
 * File upload constraints
 */
export const FILE_UPLOAD = {
  /** Maximum file size in bytes (5MB) */
  MAX_SIZE_BYTES: 5 * 1024 * 1024,

  /** Maximum file size in MB (for display) */
  MAX_SIZE_MB: 5,

  /** Accepted file types */
  ACCEPTED_TYPES: ['image/jpeg', 'image/png', 'application/pdf'] as const,

  /** Accepted file extensions */
  ACCEPTED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.pdf'] as const
} as const;

/**
 * Pagination defaults
 */
export const PAGINATION = {
  /** Default page size for lists */
  DEFAULT_PAGE_SIZE: 20,

  /** Page size options for dropdowns */
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100] as const
} as const;

/**
 * PWA update check interval
 */
export const PWA = {
  /** Check for updates every 6 hours (in milliseconds) */
  UPDATE_CHECK_INTERVAL: 6 * 60 * 60 * 1000
} as const;

/**
 * Image optimization settings
 * Reduces storage costs by 60-80% and improves load times
 */
export const IMAGE_OPTIMIZATION = {
  /** Maximum image width in pixels */
  MAX_WIDTH: 1920,

  /** Maximum image height in pixels */
  MAX_HEIGHT: 1080,

  /** JPEG compression quality (0-1) - 0.85 = 85% quality */
  JPEG_QUALITY: 0.85,

  /** Output format for compressed images */
  OUTPUT_FORMAT: 'image/jpeg' as const,

  /** File extension for compressed images */
  OUTPUT_EXTENSION: '.jpg' as const
} as const;
