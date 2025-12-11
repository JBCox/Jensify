import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnDestroy,
  Output,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ThemeService } from '../../services/theme.service';
import { filter, Subject, takeUntil } from 'rxjs';

interface NavItem {
  icon: string;
  label: string;
  route: string;
  divider?: boolean;
  section?: string;
}

/**
 * Super Admin Sidebar Navigation
 *
 * Completely separate navigation for platform owners.
 * Shows only platform management features - no expense-related items.
 */
@Component({
  selector: 'app-super-admin-sidebar',
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatListModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: './super-admin-sidebar.html',
  styleUrl: './super-admin-sidebar.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminSidebar implements OnDestroy {
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  themeService = inject(ThemeService);

  @Input() isOpen = false;
  @Output() closeSidebar = new EventEmitter<void>();
  @Output() collapsedChange = new EventEmitter<boolean>();

  collapsed = signal(false);
  private readonly destroy$ = new Subject<void>();

  /**
   * Super Admin navigation items
   * Platform management only - no expense features
   * Organized into sections for better navigation
   */
  navItems: NavItem[] = [
    // Dashboard Section
    {
      icon: 'dashboard',
      label: 'Dashboard',
      route: '/super-admin',
      section: 'Dashboard',
    },
    {
      icon: 'business',
      label: 'Organizations',
      route: '/super-admin/organizations',
    },
    {
      icon: 'local_offer',
      label: 'Coupons',
      route: '/super-admin/coupons',
    },
    {
      icon: 'analytics',
      label: 'Analytics',
      route: '/super-admin/analytics',
    },
    {
      icon: 'history',
      label: 'Audit Log',
      route: '/super-admin/audit-log',
      divider: true,
    },

    // Platform Section
    {
      icon: 'settings',
      label: 'Settings',
      route: '/super-admin/settings',
      section: 'Platform',
    },
    {
      icon: 'campaign',
      label: 'Announcements',
      route: '/super-admin/announcements',
    },
    {
      icon: 'email',
      label: 'Email Templates',
      route: '/super-admin/email-templates',
    },
    {
      icon: 'card_membership',
      label: 'Plans',
      route: '/super-admin/plans',
      divider: true,
    },

    // Operations Section
    {
      icon: 'person',
      label: 'Impersonation',
      route: '/super-admin/impersonation',
      section: 'Operations',
    },
    {
      icon: 'playlist_add_check',
      label: 'Bulk Actions',
      route: '/super-admin/bulk-actions',
    },
    {
      icon: 'receipt_long',
      label: 'Invoices',
      route: '/super-admin/invoices',
    },
    {
      icon: 'vpn_key',
      label: 'API Keys',
      route: '/super-admin/api-keys',
      divider: true,
    },

    // System Section
    {
      icon: 'error',
      label: 'Error Logs',
      route: '/super-admin/errors',
      section: 'System',
    },
    {
      icon: 'hub',
      label: 'Integrations',
      route: '/super-admin/integrations',
    },
    {
      icon: 'schedule',
      label: 'Scheduled Tasks',
      route: '/super-admin/scheduled-tasks',
    },
    {
      icon: 'download',
      label: 'Data Export',
      route: '/super-admin/data-export',
    },
  ];

  constructor() {
    // Track navigation for active state updates - trigger change detection on route change
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        // With OnPush, we need to manually trigger change detection when route changes
        this.cdr.markForCheck();
      });
  }

  toggleCollapse(): void {
    this.collapsed.update((value) => !value);
    this.collapsedChange.emit(this.collapsed());
  }

  /**
   * Check if a route is currently active
   */
  isActive(route: string): boolean {
    const activeUrl = this.normalizeUrl(this.router.url);

    // Exact match for dashboard
    if (route === '/super-admin' && activeUrl === '/super-admin') {
      return true;
    }

    // For other routes, check if current URL starts with route
    if (route !== '/super-admin' && activeUrl.startsWith(route)) {
      return true;
    }

    return activeUrl === route;
  }

  private normalizeUrl(url: string): string {
    return url.split('?')[0].split('#')[0];
  }

  /**
   * Navigate to a route and close sidebar on mobile
   */
  navigate(route: string): void {
    this.router.navigate([route]);
    this.closeSidebar.emit();
  }

  /**
   * Handle backdrop click to close sidebar
   */
  onBackdropClick(): void {
    this.closeSidebar.emit();
  }

  /**
   * TrackBy function for navigation items
   */
  trackByNavItemRoute(_index: number, item: NavItem): string {
    return item.route;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
