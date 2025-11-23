import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  data?: Record<string, unknown>;
}

export interface NotificationPreferences {
  smartScanUpdates: boolean;
  receiptIssues: boolean;
  approvals: boolean;
  reimbursements: boolean;
}

/** Default notification preferences */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  smartScanUpdates: true,
  receiptIssues: true,
  approvals: true,
  reimbursements: true
};

/**
 * Notification Service
 *
 * Manages in-app notifications and user notification preferences.
 * Provides toast notifications, notification center, and preference management.
 *
 * Features:
 * - In-app notification center with read/unread tracking
 * - Type-safe notification types (info, success, warning, error)
 * - User-configurable notification preferences
 * - Persistent preferences via localStorage
 * - Maximum 50 notifications stored
 *
 * @example
 * ```typescript
 * // Show success notification
 * this.notificationService.showSuccess('Expense created successfully');
 *
 * // Send custom notification
 * this.notificationService.notify({
 *   type: 'info',
 *   title: 'OCR Complete',
 *   message: 'Receipt processed successfully',
 *   data: { receiptId: '123' }
 * });
 *
 * // Check preferences
 * if (this.notificationService.shouldAlert('approvals')) {
 *   this.notificationService.showInfo('New approval required');
 * }
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  /** BehaviorSubject for notifications array */
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);

  /** Observable stream of all notifications */
  notifications$ = this.notificationsSubject.asObservable();

  /** BehaviorSubject for notification preferences */
  private preferencesSubject = new BehaviorSubject<NotificationPreferences>(this.loadPreferences());

  /** Observable stream of notification preferences */
  preferences$ = this.preferencesSubject.asObservable();

  /**
   * Send a notification to the notification center
   *
   * Automatically generates ID and timestamp, adds to notification list
   * (limited to 50 most recent notifications)
   *
   * @param payload - Notification data (id, timestamp, read auto-generated)
   *
   * @example
   * ```typescript
   * this.notificationService.notify({
   *   type: 'success',
   *   title: 'Upload Complete',
   *   message: 'Receipt uploaded successfully'
   * });
   * ```
   */
  notify(payload: Omit<AppNotification, 'id' | 'timestamp' | 'read'>): void {
    const notification: AppNotification = {
      ...payload,
      id: this.generateId(),
      timestamp: new Date().toISOString(),
      read: false
    };

    const current = this.notificationsSubject.value;
    this.notificationsSubject.next([notification, ...current].slice(0, 50));
  }

  /**
   * Convenience method to show success notification
   *
   * @param message - Success message to display
   * @param title - Optional title (defaults to 'Success')
   */
  showSuccess(message: string, title = 'Success'): void {
    this.notify({
      type: 'success',
      title,
      message
    });
  }

  /**
   * Convenience method to show error notification
   *
   * @param message - Error message to display
   * @param title - Optional title (defaults to 'Error')
   */
  showError(message: string, title = 'Error'): void {
    this.notify({
      type: 'error',
      title,
      message
    });
  }

  /**
   * Convenience method to show info notification
   *
   * @param message - Info message to display
   * @param title - Optional title (defaults to 'Info')
   */
  showInfo(message: string, title = 'Info'): void {
    this.notify({
      type: 'info',
      title,
      message
    });
  }

  /**
   * Convenience method to show warning notification
   *
   * @param message - Warning message to display
   * @param title - Optional title (defaults to 'Warning')
   */
  showWarning(message: string, title = 'Warning'): void {
    this.notify({
      type: 'warning',
      title,
      message
    });
  }

  /**
   * Mark a specific notification as read
   *
   * @param id - Notification ID to mark as read
   */
  markAsRead(id: string): void {
    this.notificationsSubject.next(
      this.notificationsSubject.value.map(notification =>
        notification.id === id ? { ...notification, read: true } : notification
      )
    );
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): void {
    this.notificationsSubject.next(
      this.notificationsSubject.value.map(notification => ({ ...notification, read: true }))
    );
  }

  /**
   * Get count of unread notifications
   *
   * @returns Number of unread notifications
   */
  unreadCount(): number {
    return this.notificationsSubject.value.filter(notification => !notification.read).length;
  }

  /**
   * Update user notification preferences
   *
   * Partial updates are merged with existing preferences and persisted to localStorage
   *
   * @param update - Partial preferences to update
   *
   * @example
   * ```typescript
   * this.notificationService.updatePreferences({
   *   approvals: false,
   *   smartScanUpdates: true
   * });
   * ```
   */
  updatePreferences(update: Partial<NotificationPreferences>): void {
    const next = { ...this.preferencesSubject.value, ...update };
    this.preferencesSubject.next(next);
    localStorage.setItem('jensify_notification_preferences', JSON.stringify(next));
  }

  /**
   * Get current notification preferences snapshot
   *
   * For reactive updates, use `preferences$` observable instead
   *
   * @returns Current notification preferences
   */
  get currentPreferences(): NotificationPreferences {
    return this.preferencesSubject.value;
  }

  /**
   * Check if user wants to be alerted for a specific topic
   *
   * @param topic - Notification topic key
   * @returns true if user has enabled notifications for this topic
   *
   * @example
   * ```typescript
   * if (this.notificationService.shouldAlert('approvals')) {
   *   this.notificationService.showInfo('New approval required');
   * }
   * ```
   */
  shouldAlert(topic: keyof NotificationPreferences): boolean {
    return !!this.preferencesSubject.value[topic];
  }

  /**
   * Load notification preferences from localStorage
   *
   * Falls back to default preferences if none exist or parsing fails
   *
   * @returns Notification preferences
   * @private
   */
  private loadPreferences(): NotificationPreferences {
    try {
      const stored = localStorage.getItem('jensify_notification_preferences');
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) };
      }
    } catch {
      // ignore parse errors
    }
    return DEFAULT_PREFERENCES;
  }

  /**
   * Generate a unique notification ID
   *
   * Uses crypto.randomUUID() if available, falls back to timestamp + random
   *
   * @returns Unique notification ID
   * @private
   */
  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}
