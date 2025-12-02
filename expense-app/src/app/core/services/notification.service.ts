import { Injectable, inject, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, from, of } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { MatSnackBar, MatSnackBarConfig } from '@angular/material/snack-bar';
import { SupabaseService } from './supabase.service';
import { RealtimeChannel } from '@supabase/supabase-js';

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export type NotificationCategory =
  | 'smartscan'
  | 'receipt'
  | 'approval'
  | 'reimbursement'
  | 'expense'
  | 'report'
  | 'budget'
  | 'system';

export interface AppNotification {
  id: string;
  organization_id?: string;
  user_id: string;
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  action_url?: string;
  action_data?: Record<string, unknown>;
  read: boolean;
  read_at?: string;
  dismissed: boolean;
  created_at: string;
  expires_at?: string;
}

export interface NotificationPreferences {
  id?: string;
  user_id?: string;
  smartscan_enabled: boolean;
  receipt_enabled: boolean;
  approval_enabled: boolean;
  reimbursement_enabled: boolean;
  expense_enabled: boolean;
  report_enabled: boolean;
  budget_enabled: boolean;
  system_enabled: boolean;
  show_toast: boolean;
  play_sound: boolean;
  email_digest: boolean;
}

export interface CreateNotificationPayload {
  type: NotificationType;
  category: NotificationCategory;
  title: string;
  message: string;
  action_url?: string;
  action_data?: Record<string, unknown>;
}

// Legacy interface for backward compatibility
export interface LegacyNotificationPreferences {
  smartScanUpdates: boolean;
  receiptIssues: boolean;
  approvals: boolean;
  reimbursements: boolean;
}

/** Default notification preferences */
const DEFAULT_PREFERENCES: NotificationPreferences = {
  smartscan_enabled: true,
  receipt_enabled: true,
  approval_enabled: true,
  reimbursement_enabled: true,
  expense_enabled: true,
  report_enabled: true,
  budget_enabled: true,
  system_enabled: true,
  show_toast: true,
  play_sound: false,
  email_digest: false
};

// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

/**
 * Enhanced Notification Service
 *
 * Complete notification system with:
 * - Database persistence via Supabase
 * - Real-time push notifications via Supabase Realtime
 * - Toast snackbar notifications
 * - User-configurable preferences
 * - Clickable actions with routing
 *
 * @example
 * ```typescript
 * // Show success toast and save to database
 * this.notificationService.showSuccess('Expense approved', 'approval');
 *
 * // Create notification with action
 * this.notificationService.notify({
 *   type: 'info',
 *   category: 'approval',
 *   title: 'New Approval Required',
 *   message: 'John submitted an expense for $150',
 *   action_url: '/approvals/queue'
 * });
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private supabase = inject(SupabaseService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private ngZone = inject(NgZone);

  /** BehaviorSubject for notifications array */
  private notificationsSubject = new BehaviorSubject<AppNotification[]>([]);

  /** Observable stream of all notifications */
  notifications$ = this.notificationsSubject.asObservable();

  /** BehaviorSubject for notification preferences */
  private preferencesSubject = new BehaviorSubject<NotificationPreferences>(DEFAULT_PREFERENCES);

  /** Observable stream of notification preferences */
  preferences$ = this.preferencesSubject.asObservable();

  /** Realtime subscription channel */
  private realtimeChannel: RealtimeChannel | null = null;

  /** Track if service has been initialized */
  private initialized = false;

  constructor() {
    // Wait for session to be initialized, then check for user
    this.supabase.sessionInitialized$.subscribe(initialized => {
      if (initialized) {
        const user = this.supabase.currentUser;
        if (user && !this.initialized) {
          this.initialize();
        }
      }
    });

    // Also subscribe to future user changes (login/logout)
    this.supabase.currentUser$.subscribe(user => {
      if (user && !this.initialized) {
        this.initialize();
      } else if (!user && this.initialized) {
        this.cleanup();
      }
    });
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize the notification service
   * Loads notifications from database and sets up realtime subscription
   */
  private async initialize(): Promise<void> {
    this.initialized = true;
    try {
      await this.loadNotifications();
      await this.loadPreferences();
      this.setupRealtimeSubscription();
      console.log('[NotificationService] Initialized');
    } catch (err) {
      console.warn('[NotificationService] Initialization error:', err);
    }
  }

  /**
   * Cleanup when user logs out
   */
  private cleanup(): void {
    this.initialized = false;
    this.notificationsSubject.next([]);
    this.preferencesSubject.next(DEFAULT_PREFERENCES);
    if (this.realtimeChannel) {
      this.supabase.client.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  // ============================================================================
  // LOAD DATA
  // ============================================================================

  /**
   * Load notifications from database
   */
  private async loadNotifications(): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      this.notificationsSubject.next(data || []);
    } catch (error) {
      console.error('Failed to load notifications:', error);
      // Fall back to empty array
      this.notificationsSubject.next([]);
    }
  }

  /**
   * Load user preferences from database
   */
  private async loadPreferences(): Promise<void> {
    try {
      const user = await this.supabase.client.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await this.supabase.client
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.data.user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 = no rows returned, which is fine
        throw error;
      }

      if (data) {
        this.preferencesSubject.next(data);
      } else {
        // Create default preferences for user
        await this.createDefaultPreferences(user.data.user.id);
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  }

  /**
   * Create default preferences for new user
   */
  private async createDefaultPreferences(userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from('notification_preferences')
        .insert({ user_id: userId })
        .select()
        .single();

      if (error) throw error;
      if (data) {
        this.preferencesSubject.next(data);
      }
    } catch (error) {
      console.error('Failed to create default preferences:', error);
    }
  }

  // ============================================================================
  // REALTIME SUBSCRIPTION
  // ============================================================================

  /**
   * Setup realtime subscription for new notifications
   */
  private setupRealtimeSubscription(): void {
    const user = this.supabase.client.auth.getUser();

    user.then(({ data }) => {
      if (!data.user) return;

      this.realtimeChannel = this.supabase.client
        .channel('notifications-realtime')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${data.user.id}`
          },
          (payload) => {
            this.ngZone.run(() => {
              const newNotification = payload.new as AppNotification;
              const current = this.notificationsSubject.value;
              this.notificationsSubject.next([newNotification, ...current].slice(0, 50));

              // Show toast if preferences allow
              if (this.preferencesSubject.value.show_toast) {
                this.showToast(newNotification);
              }
            });
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${data.user.id}`
          },
          (payload) => {
            this.ngZone.run(() => {
              const updated = payload.new as AppNotification;
              const current = this.notificationsSubject.value;
              this.notificationsSubject.next(
                current.map(n => n.id === updated.id ? updated : n)
              );
            });
          }
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            console.log('[NotificationService] Realtime subscription active');
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[NotificationService] Realtime subscription failed:', status, err);
            // Don't rethrow - gracefully degrade to polling-only mode
          } else if (err) {
            console.warn('[NotificationService] Realtime subscription error:', err);
          }
        });
    }).catch((err) => {
      console.warn('[NotificationService] Failed to setup realtime subscription:', err);
    });
  }

  // ============================================================================
  // CREATE NOTIFICATIONS
  // ============================================================================

  /**
   * Create and send a notification
   * Saves to database and shows toast if enabled
   *
   * @param payload - Notification data
   * @param showToast - Override preference to force show/hide toast
   */
  async notify(
    payload: CreateNotificationPayload,
    showToast?: boolean
  ): Promise<AppNotification | null> {
    try {
      const user = await this.supabase.client.auth.getUser();
      if (!user.data.user) {
        console.error('Cannot create notification: No authenticated user');
        return null;
      }

      // Get organization ID if available
      const orgId = await this.getCurrentOrganizationId();

      // Insert into database
      const { data, error } = await this.supabase.client
        .from('notifications')
        .insert({
          user_id: user.data.user.id,
          organization_id: orgId,
          type: payload.type,
          category: payload.category,
          title: payload.title,
          message: payload.message,
          action_url: payload.action_url,
          action_data: payload.action_data || {}
        })
        .select()
        .single();

      if (error) throw error;

      // Add to local state (realtime will also fire, but this is faster)
      if (data) {
        const current = this.notificationsSubject.value;
        // Avoid duplicate if realtime already added it
        if (!current.find(n => n.id === data.id)) {
          this.notificationsSubject.next([data, ...current].slice(0, 50));
        }

        // Show toast
        const shouldShowToast = showToast ?? this.preferencesSubject.value.show_toast;
        if (shouldShowToast) {
          this.showToast(data);
        }
      }

      return data;
    } catch (error) {
      console.error('Failed to create notification:', error);
      // Fall back to local-only notification
      return this.notifyLocal(payload, showToast);
    }
  }

  /**
   * Create local-only notification (fallback when database unavailable)
   */
  private notifyLocal(
    payload: CreateNotificationPayload,
    showToast?: boolean
  ): AppNotification {
    const notification: AppNotification = {
      id: this.generateId(),
      user_id: '',
      type: payload.type,
      category: payload.category,
      title: payload.title,
      message: payload.message,
      action_url: payload.action_url,
      action_data: payload.action_data,
      read: false,
      dismissed: false,
      created_at: new Date().toISOString()
    };

    const current = this.notificationsSubject.value;
    this.notificationsSubject.next([notification, ...current].slice(0, 50));

    const shouldShowToast = showToast ?? this.preferencesSubject.value.show_toast;
    if (shouldShowToast) {
      this.showToast(notification);
    }

    return notification;
  }

  // ============================================================================
  // CONVENIENCE METHODS
  // ============================================================================

  /**
   * Show success notification
   */
  showSuccess(message: string, title = 'Success', category: NotificationCategory = 'system'): void {
    this.notify({
      type: 'success',
      category,
      title,
      message
    });
  }

  /**
   * Show error notification
   */
  showError(message: string, title = 'Error', category: NotificationCategory = 'system'): void {
    this.notify({
      type: 'error',
      category,
      title,
      message
    });
  }

  /**
   * Show info notification
   */
  showInfo(message: string, title = 'Info', category: NotificationCategory = 'system'): void {
    this.notify({
      type: 'info',
      category,
      title,
      message
    });
  }

  /**
   * Show warning notification
   */
  showWarning(message: string, title = 'Warning', category: NotificationCategory = 'system'): void {
    this.notify({
      type: 'warning',
      category,
      title,
      message
    });
  }

  // ============================================================================
  // TOAST SNACKBAR
  // ============================================================================

  /**
   * Show toast notification using Material Snackbar
   */
  private showToast(notification: AppNotification): void {
    const config: MatSnackBarConfig = {
      duration: this.getToastDuration(notification.type),
      horizontalPosition: 'right',
      verticalPosition: 'bottom',
      panelClass: this.getToastPanelClass(notification.type)
    };

    const message = notification.title + (notification.message ? `: ${notification.message}` : '');
    const action = notification.action_url ? 'View' : 'Dismiss';

    const snackBarRef = this.snackBar.open(message, action, config);

    // Handle action click
    snackBarRef.onAction().subscribe(() => {
      if (notification.action_url) {
        this.router.navigateByUrl(notification.action_url);
      }
      this.markAsRead(notification.id);
    });
  }

  /**
   * Get toast duration based on notification type
   */
  private getToastDuration(type: NotificationType): number {
    switch (type) {
      case 'error':
        return 8000; // Errors stay longer
      case 'warning':
        return 6000;
      case 'success':
        return 4000;
      default:
        return 5000;
    }
  }

  /**
   * Get CSS panel class for toast styling
   */
  private getToastPanelClass(type: NotificationType): string[] {
    return [`jensify-toast`, `jensify-toast-${type}`];
  }

  // ============================================================================
  // READ/DISMISS ACTIONS
  // ============================================================================

  /**
   * Mark a notification as read
   */
  async markAsRead(id: string): Promise<void> {
    try {
      const { error } = await this.supabase.client
        .from('notifications')
        .update({ read: true, read_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      // Update local state
      this.notificationsSubject.next(
        this.notificationsSubject.value.map(n =>
          n.id === id ? { ...n, read: true, read_at: new Date().toISOString() } : n
        )
      );
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      // Update local state anyway
      this.notificationsSubject.next(
        this.notificationsSubject.value.map(n =>
          n.id === id ? { ...n, read: true } : n
        )
      );
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<void> {
    try {
      const { error } = await this.supabase.client.rpc('mark_all_notifications_read');
      if (error) throw error;

      // Update local state
      this.notificationsSubject.next(
        this.notificationsSubject.value.map(n => ({ ...n, read: true, read_at: new Date().toISOString() }))
      );
    } catch (error) {
      console.error('Failed to mark all notifications as read:', error);
      // Update local state anyway
      this.notificationsSubject.next(
        this.notificationsSubject.value.map(n => ({ ...n, read: true }))
      );
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(id: string): Promise<void> {
    try {
      const { error } = await this.supabase.client
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;

      this.notificationsSubject.next(
        this.notificationsSubject.value.filter(n => n.id !== id)
      );
    } catch (error) {
      console.error('Failed to delete notification:', error);
    }
  }

  /**
   * Clear all notifications
   */
  async clearAll(): Promise<void> {
    try {
      const user = await this.supabase.client.auth.getUser();
      if (!user.data.user) return;

      const { error } = await this.supabase.client
        .from('notifications')
        .delete()
        .eq('user_id', user.data.user.id);

      if (error) throw error;
      this.notificationsSubject.next([]);
    } catch (error) {
      console.error('Failed to clear notifications:', error);
    }
  }

  // ============================================================================
  // PREFERENCES
  // ============================================================================

  /**
   * Update notification preferences
   */
  async updatePreferences(update: Partial<NotificationPreferences>): Promise<void> {
    try {
      const user = await this.supabase.client.auth.getUser();
      if (!user.data.user) return;

      const { data, error } = await this.supabase.client
        .from('notification_preferences')
        .update({ ...update, updated_at: new Date().toISOString() })
        .eq('user_id', user.data.user.id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        this.preferencesSubject.next(data);
      }
    } catch (error) {
      console.error('Failed to update preferences:', error);
      // Update local state anyway
      this.preferencesSubject.next({
        ...this.preferencesSubject.value,
        ...update
      });
    }

    // Also update localStorage for legacy compatibility
    const legacyPrefs = this.toLegacyPreferences({
      ...this.preferencesSubject.value,
      ...update
    });
    localStorage.setItem('jensify_notification_preferences', JSON.stringify(legacyPrefs));
  }

  /**
   * Get current preferences snapshot
   */
  get currentPreferences(): NotificationPreferences {
    return this.preferencesSubject.value;
  }

  /**
   * Check if user wants notifications for a category
   */
  shouldAlert(category: NotificationCategory): boolean {
    const prefs = this.preferencesSubject.value;
    switch (category) {
      case 'smartscan':
        return prefs.smartscan_enabled;
      case 'receipt':
        return prefs.receipt_enabled;
      case 'approval':
        return prefs.approval_enabled;
      case 'reimbursement':
        return prefs.reimbursement_enabled;
      case 'expense':
        return prefs.expense_enabled;
      case 'report':
        return prefs.report_enabled;
      case 'budget':
        return prefs.budget_enabled;
      case 'system':
        return prefs.system_enabled;
      default:
        return true;
    }
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  /**
   * Get unread notification count
   */
  unreadCount(): number {
    return this.notificationsSubject.value.filter(n => !n.read).length;
  }

  /**
   * Convert to legacy preferences format
   */
  private toLegacyPreferences(prefs: NotificationPreferences): LegacyNotificationPreferences {
    return {
      smartScanUpdates: prefs.smartscan_enabled,
      receiptIssues: prefs.receipt_enabled,
      approvals: prefs.approval_enabled,
      reimbursements: prefs.reimbursement_enabled
    };
  }

  /**
   * Get current organization ID
   */
  private async getCurrentOrganizationId(): Promise<string | null> {
    try {
      const user = await this.supabase.client.auth.getUser();
      if (!user.data.user) return null;

      const { data } = await this.supabase.client
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.data.user.id)
        .eq('status', 'active')
        .single();

      return data?.organization_id || null;
    } catch {
      return null;
    }
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `notif_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Refresh notifications from database
   */
  async refresh(): Promise<void> {
    await this.loadNotifications();
  }
}
