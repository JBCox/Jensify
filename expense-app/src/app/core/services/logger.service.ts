import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { MAX_LOG_ENTRIES } from '../constants/app.constants';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4
}

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: string;
  data?: unknown;
  error?: Error;
}

/**
 * Centralized logging service for consistent error handling and debugging
 * Supports environment-based log levels and structured logging
 */
@Injectable({
  providedIn: 'root'
})
export class LoggerService {
  private readonly logLevel: LogLevel;
  private readonly logs: LogEntry[] = [];
  private readonly maxLogSize = MAX_LOG_ENTRIES;

  constructor() {
    // Set log level based on environment
    this.logLevel = environment.production ? LogLevel.WARN : LogLevel.DEBUG;
  }

  /**
   * Log debug message (development only)
   */
  debug(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, message, context, data);
  }

  /**
   * Log informational message
   */
  info(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.INFO, message, context, data);
  }

  /**
   * Log warning message
   */
  warn(message: string, context?: string, data?: unknown): void {
    this.log(LogLevel.WARN, message, context, data);
  }

  /**
   * Log error message
   */
  error(message: string, error?: Error | unknown, context?: string, data?: unknown): void {
    const errorObj = error instanceof Error ? error : undefined;
    const errorData = error instanceof Error ? undefined : error;
    this.log(LogLevel.ERROR, message, context, errorData ?? data, errorObj);
  }

  /**
   * Get all logged entries (useful for debugging)
   */
  getLogs(): readonly LogEntry[] {
    return [...this.logs];
  }

  /**
   * Clear all logs
   */
  clearLogs(): void {
    this.logs.length = 0;
  }

  /**
   * Internal logging method
   */
  private log(
    level: LogLevel,
    message: string,
    context?: string,
    data?: unknown,
    error?: Error
  ): void {
    // Skip if below current log level
    if (level < this.logLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      data,
      error
    };

    // Store in memory (circular buffer)
    this.logs.push(entry);
    if (this.logs.length > this.maxLogSize) {
      this.logs.shift();
    }

    // Output to console
    this.outputToConsole(entry);

    // TODO: In production, send ERROR level logs to error tracking service (Sentry, etc.)
    if (environment.production && level === LogLevel.ERROR) {
      // this.sendToErrorTrackingService(entry);
    }
  }

  /**
   * Format and output log entry to console
   */
  private outputToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const levelStr = LogLevel[entry.level];
    const contextStr = entry.context ? `[${entry.context}]` : '';
    const prefix = `${timestamp} ${levelStr} ${contextStr}`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, entry.data ?? '');
        break;
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.data ?? '');
        break;
      case LogLevel.WARN:
        console.warn(prefix, entry.message, entry.data ?? '');
        break;
      case LogLevel.ERROR:
        console.error(prefix, entry.message, entry.error ?? entry.data ?? '');
        if (entry.error?.stack) {
          console.error('Stack trace:', entry.error.stack);
        }
        break;
    }
  }

  /**
   * Extract error message from unknown error type
   */
  getErrorMessage(error: unknown, defaultMessage = 'An error occurred'): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (typeof error === 'object' && error !== null && 'message' in error) {
      return String(error.message);
    }
    return defaultMessage;
  }
}
