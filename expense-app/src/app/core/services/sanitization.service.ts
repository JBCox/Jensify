import { Injectable } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/**
 * Sanitization Service
 * Provides XSS protection and input validation utilities
 */
@Injectable({
  providedIn: 'root'
})
export class SanitizationService {
  // Dangerous patterns that could indicate XSS attempts
  private readonly dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, // <script> tags
    /javascript:/gi, // javascript: protocol
    /on\w+\s*=/gi, // Event handlers (onclick, onerror, etc.)
    /<iframe/gi, // iframe tags
    /<object/gi, // object tags
    /<embed/gi, // embed tags
    /<link/gi, // link tags
    /<style/gi, // style tags
    /eval\(/gi, // eval() calls
    /expression\(/gi, // CSS expressions
    /<img[^>]+src[^>]*>/gi // img tags with src (potential for onerror)
  ];

  /**
   * Sanitize a string by removing potentially dangerous content
   * @param input - The string to sanitize
   * @returns Sanitized string
   */
  sanitizeInput(input: string | null | undefined): string {
    if (!input) return '';

    let sanitized = input.toString();

    // Remove dangerous patterns
    this.dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Encode special HTML characters
    sanitized = this.encodeHtmlEntities(sanitized);

    return sanitized.trim();
  }

  /**
   * Sanitize text input (merchant names, notes, etc.)
   * Removes HTML but allows basic punctuation
   * @param input - The text to sanitize
   * @returns Sanitized text
   */
  sanitizeText(input: string | null | undefined): string {
    if (!input) return '';

    // Remove all HTML tags
    let sanitized = input.toString().replace(/<[^>]*>/g, '');

    // Remove script-related content
    this.dangerousPatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    return sanitized.trim();
  }

  /**
   * Encode HTML special characters to prevent XSS
   * @param input - String to encode
   * @returns Encoded string
   */
  private encodeHtmlEntities(input: string): string {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
  }

  /**
   * Check if a string contains potentially dangerous content
   * @param input - String to check
   * @returns true if dangerous content detected
   */
  containsDangerousContent(input: string | null | undefined): boolean {
    if (!input) return false;

    const str = input.toString();
    return this.dangerousPatterns.some(pattern => {
      pattern.lastIndex = 0; // Reset regex state for global flag
      return pattern.test(str);
    });
  }

  /**
   * Custom form validator to prevent XSS in form inputs
   * @returns ValidatorFn
   */
  noXssValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }

      if (this.containsDangerousContent(control.value)) {
        return {
          xssDetected: {
            value: control.value,
            message: 'Input contains potentially dangerous content'
          }
        };
      }

      return null;
    };
  }

  /**
   * Validator for preventing script injection in text fields
   * @returns ValidatorFn
   */
  noScriptTagsValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) {
        return null;
      }

      const scriptPattern = /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi;
      const eventHandlerPattern = /on\w+\s*=/gi;

      if (scriptPattern.test(control.value) || eventHandlerPattern.test(control.value)) {
        return {
          scriptInjection: {
            value: control.value,
            message: 'Script tags and event handlers are not allowed'
          }
        };
      }

      return null;
    };
  }

  /**
   * Sanitize URL to prevent javascript: protocol
   * @param url - URL to sanitize
   * @returns Sanitized URL or empty string if dangerous
   */
  sanitizeUrl(url: string | null | undefined): string {
    if (!url) return '';

    const str = url.toString().trim().toLowerCase();

    // Block dangerous protocols
    if (
      str.startsWith('javascript:') ||
      str.startsWith('data:') ||
      str.startsWith('vbscript:')
    ) {
      return '';
    }

    return url;
  }

  /**
   * Sanitize filename to prevent path traversal
   * @param filename - Filename to sanitize
   * @returns Sanitized filename
   */
  sanitizeFilename(filename: string | null | undefined): string {
    if (!filename) return '';

    // Remove path traversal attempts
    let sanitized = filename.toString().replace(/\.\./g, '');

    // Remove path separators
    sanitized = sanitized.replace(/[/\\]/g, '');

    // Remove null bytes
    sanitized = sanitized.replace(/\0/g, '');

    // Limit to alphanumeric, dash, underscore, dot
    sanitized = sanitized.replace(/[^a-zA-Z0-9._-]/g, '_');

    return sanitized.trim();
  }

  /**
   * Sanitize CSV value to prevent formula injection
   * @param value - Value to sanitize
   * @returns Sanitized value
   */
  sanitizeCsvValue(value: string | number | null | undefined): string {
    const str = (value ?? '').toString();

    // Escape double quotes for CSV format
    let sanitized = str.replace(/"/g, '""');

    // Prevent CSV injection by escaping formula characters
    // If value starts with =, +, -, @, or tab, prefix with single quote
    if (/^[=+@\t-]/.test(sanitized)) {
      sanitized = "'" + sanitized;
    }

    // Wrap in double quotes for CSV
    return `"${sanitized}"`;
  }
}
