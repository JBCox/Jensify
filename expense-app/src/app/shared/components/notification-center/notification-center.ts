import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatDividerModule } from '@angular/material/divider';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { NotificationService, AppNotification, NotificationPreferences, NotificationType } from '../../../core/services/notification.service';
import { toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-notification-center',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    MatBadgeModule,
    MatDividerModule,
    MatSlideToggleModule,
    MatTooltipModule
  ],
  templateUrl: './notification-center.html',
  styleUrl: './notification-center.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationCenterComponent {
  private notificationService = inject(NotificationService);
  private router = inject(Router);

  notificationsSignal = toSignal(this.notificationService.notifications$, { initialValue: [] });
  preferencesSignal = toSignal(this.notificationService.preferences$, {
    initialValue: this.notificationService.currentPreferences
  });

  unreadCount = computed(() => this.notificationsSignal().filter(notification => !notification.read).length);

  markAllRead(): void {
    this.notificationService.markAllAsRead();
  }

  markAsRead(notification: AppNotification): void {
    if (!notification.read) {
      this.notificationService.markAsRead(notification.id);
    }
  }

  handleNotificationClick(notification: AppNotification, event: Event): void {
    event.stopPropagation();
    this.markAsRead(notification);

    // Navigate if there's an action URL
    if (notification.action_url) {
      this.router.navigateByUrl(notification.action_url);
    }
  }

  deleteNotification(notification: AppNotification, event: Event): void {
    event.stopPropagation();
    this.notificationService.deleteNotification(notification.id);
  }

  updatePreference(key: keyof NotificationPreferences, value: boolean): void {
    this.notificationService.updatePreferences({ [key]: value });
  }

  trackById(_: number, notification: AppNotification): string {
    return notification.id;
  }

  iconFor(type: NotificationType): string {
    switch (type) {
      case 'success':
        return 'check_circle';
      case 'warning':
        return 'warning';
      case 'error':
        return 'error';
      default:
        return 'info';
    }
  }

  /**
   * Format relative time (e.g., "2 minutes ago", "Yesterday")
   */
  formatRelativeTime(timestamp: string): string {
    const now = new Date();
    const date = new Date(timestamp);
    const diffMs = now.getTime() - date.getTime();
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSecs < 60) {
      return 'Just now';
    } else if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  }

  /**
   * Clear all notifications
   */
  clearAll(): void {
    this.notificationService.clearAll();
  }
}
