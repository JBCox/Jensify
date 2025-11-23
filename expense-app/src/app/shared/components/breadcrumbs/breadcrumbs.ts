import { Component, OnInit, OnDestroy, signal, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { filter, map, takeUntil } from 'rxjs/operators';
import { Subject } from 'rxjs';

/**
 * Breadcrumb Interface
 */
export interface Breadcrumb {
  label: string;
  url: string;
  icon?: string;
}

/**
 * Breadcrumbs Component
 * Displays navigation breadcrumb trail based on current route
 *
 * Features:
 * - Automatic breadcrumb generation from route data
 * - Clickable navigation to parent routes
 * - Icon support
 * - Mobile responsive
 * - Jensify design system styled
 *
 * @example
 * Route configuration:
 * ```typescript
 * {
 *   path: 'mileage',
 *   data: { breadcrumb: 'Mileage' },
 *   children: [
 *     {
 *       path: ':id',
 *       data: { breadcrumb: 'Trip Details' }
 *     }
 *   ]
 * }
 * ```
 */
@Component({
  selector: 'app-breadcrumbs',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule
  ],
  templateUrl: './breadcrumbs.html',
  styleUrl: './breadcrumbs.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Breadcrumbs implements OnInit, OnDestroy {
  private router = inject(Router);
  private activatedRoute = inject(ActivatedRoute);

  private destroy$ = new Subject<void>();

  breadcrumbs = signal<Breadcrumb[]>([]);

  // Route label mapping for dynamic routes (e.g., :id)
  private readonly routeLabelMap: Record<string, string> = {
    'home': 'Home',
    'expenses': 'Expenses',
    'mileage': 'Mileage',
    'receipts': 'Receipts',
    'approvals': 'Approvals',
    'finance': 'Finance',
    'organization': 'Organization',
    'auth': 'Authentication',
    'new': 'New',
    'edit': 'Edit',
    'upload': 'Upload Receipt',
    'dashboard': 'Dashboard',
    'users': 'User Management',
    'setup': 'Setup'
  };

  // Icon mapping for specific routes
  private readonly routeIconMap: Record<string, string> = {
    'home': 'home',
    'expenses': 'receipt_long',
    'mileage': 'directions_car',
    'receipts': 'receipt',
    'approvals': 'task_alt',
    'finance': 'account_balance',
    'organization': 'business',
    'dashboard': 'dashboard'
  };

  ngOnInit(): void {
    // Generate breadcrumbs on navigation
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        map(() => this.buildBreadcrumbs(this.activatedRoute.root)),
        takeUntil(this.destroy$)
      )
      .subscribe(breadcrumbs => {
        this.breadcrumbs.set(breadcrumbs);
      });

    // Initial breadcrumbs
    this.breadcrumbs.set(this.buildBreadcrumbs(this.activatedRoute.root));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Build breadcrumbs from route tree
   */
  private buildBreadcrumbs(
    route: ActivatedRoute,
    url = '',
    breadcrumbs: Breadcrumb[] = []
  ): Breadcrumb[] {
    // Get route data
    const routeData = route.snapshot.data;
    const routeUrl = route.snapshot.url.map(segment => segment.path).join('/');

    // Build URL
    const newUrl = url + (routeUrl ? `/${routeUrl}` : '');

    // Add breadcrumb if label exists
    if (routeData['breadcrumb']) {
      breadcrumbs.push({
        label: routeData['breadcrumb'],
        url: newUrl,
        icon: routeData['breadcrumbIcon']
      });
    } else if (routeUrl && this.shouldGenerateBreadcrumb(routeUrl)) {
      // Auto-generate breadcrumb for routes without explicit data
      const label = this.generateLabel(routeUrl);
      const icon = this.getIconForSegment(routeUrl);
      if (label) {
        breadcrumbs.push({
          label,
          url: newUrl,
          icon
        });
      }
    }

    // Recurse through children
    if (route.firstChild) {
      return this.buildBreadcrumbs(route.firstChild, newUrl, breadcrumbs);
    }

    // Filter out duplicate home breadcrumbs
    return this.deduplicateBreadcrumbs(breadcrumbs);
  }

  /**
   * Check if breadcrumb should be auto-generated for this segment
   */
  private shouldGenerateBreadcrumb(segment: string): boolean {
    // Don't generate for IDs (UUIDs or numeric IDs)
    if (this.isId(segment)) {
      return false;
    }

    // Don't generate for auth routes
    if (segment === 'auth' || segment.startsWith('auth/')) {
      return false;
    }

    return true;
  }

  /**
   * Check if segment is an ID (UUID or numeric)
   */
  private isId(segment: string): boolean {
    // Check for UUID pattern
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (uuidPattern.test(segment)) {
      return true;
    }

    // Check for numeric ID
    if (/^\d+$/.test(segment)) {
      return true;
    }

    return false;
  }

  /**
   * Generate label from route segment
   */
  private generateLabel(segment: string): string | null {
    // Use mapping if available
    if (this.routeLabelMap[segment]) {
      return this.routeLabelMap[segment];
    }

    // Skip IDs
    if (this.isId(segment)) {
      return null;
    }

    // Convert kebab-case to Title Case
    return segment
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Get icon for route segment
   */
  private getIconForSegment(segment: string): string | undefined {
    return this.routeIconMap[segment];
  }

  /**
   * Remove duplicate breadcrumbs
   */
  private deduplicateBreadcrumbs(breadcrumbs: Breadcrumb[]): Breadcrumb[] {
    const seen = new Set<string>();
    return breadcrumbs.filter(breadcrumb => {
      if (seen.has(breadcrumb.url)) {
        return false;
      }
      seen.add(breadcrumb.url);
      return true;
    });
  }

  /**
   * Navigate to breadcrumb URL
   */
  navigateTo(breadcrumb: Breadcrumb): void {
    this.router.navigateByUrl(breadcrumb.url);
  }

  /**
   * Check if breadcrumb is the last one (current page)
   */
  isLast(index: number): boolean {
    return index === this.breadcrumbs().length - 1;
  }
}
