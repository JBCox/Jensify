import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, signal, inject } from "@angular/core";
import { CommonModule } from "@angular/common";
import { NavigationEnd, Router, RouterModule } from "@angular/router";
import { MatIconModule } from "@angular/material/icon";
import { MatListModule } from "@angular/material/list";
import { MatButtonModule } from "@angular/material/button";
import { MatTooltipModule } from "@angular/material/tooltip";
import { AuthService } from "../../services/auth.service";
import { OrganizationService } from "../../services/organization.service";
import { ExpenseService } from "../../services/expense.service";
import { ReportService } from "../../services/report.service";
import { ThemeService } from "../../services/theme.service";
import { filter, map, Observable, shareReplay, Subject, takeUntil } from "rxjs";
import { Expense } from "../../models/expense.model";
import { ExpenseReport, ReportStatus } from "../../models/report.model";

interface NavItem {
  icon: string;
  label: string;
  route: string;
  requiredRole?: string;
}

@Component({
  selector: "app-sidebar-nav",
  imports: [
    CommonModule,
    RouterModule,
    MatIconModule,
    MatListModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  templateUrl: "./sidebar-nav.html",
  styleUrl: "./sidebar-nav.scss",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarNav implements OnDestroy {
  private router = inject(Router);
  private authService = inject(AuthService);
  private organizationService = inject(OrganizationService);
  private expenseService = inject(ExpenseService);
  private reportService = inject(ReportService);
  private cdr = inject(ChangeDetectorRef);
  themeService = inject(ThemeService);

  @Input()
  isOpen = false;
  @Output()
  closeSidebar = new EventEmitter<void>();
  @Output()
  collapsedChange = new EventEmitter<boolean>();
  collapsed = signal(false);
  private readonly destroy$ = new Subject<void>();

  // Badge counts
  unreportedCount$: Observable<number>;
  draftReportsCount$: Observable<number>;
  submittedReportsCount$: Observable<number>;

  navItems: NavItem[] = [
    // Dashboard & Admin
    {
      icon: "dashboard",
      label: "Dashboard",
      route: "/home",
    },
    {
      icon: "task_alt",
      label: "Approvals",
      route: "/approvals",
      requiredRole: "manager",
    },
    {
      icon: "people",
      label: "User Management",
      route: "/organization/users",
      requiredRole: "admin",
    },
    // Natural expense workflow: Upload → Receipts → Create → View → Report → Mileage
    {
      icon: "receipt_long",
      label: "Upload Receipt",
      route: "/expenses/upload",
    },
    {
      icon: "inventory_2",
      label: "Receipts",
      route: "/receipts",
    },
    {
      icon: "playlist_add",
      label: "New Expense",
      route: "/expenses/new",
    },
    {
      icon: "list_alt",
      label: "My Expenses",
      route: "/expenses",
    },
    {
      icon: "folder_open",
      label: "Reports",
      route: "/reports",
    },
    {
      icon: "commute",
      label: "Mileage",
      route: "/mileage",
    },
  ];

  constructor() {
    this.unreportedCount$ = this.expenseService.getMyExpenses().pipe(
      map((list: Expense[]) =>
        list.filter((e: Expense) => !e.is_reported).length
      ),
      shareReplay(1),
    );

    this.draftReportsCount$ = this.reportService.getReports().pipe(
      map((list: ExpenseReport[]) =>
        list.filter((r) => r.status === ReportStatus.DRAFT).length
      ),
      shareReplay(1),
    );

    this.submittedReportsCount$ = this.reportService.getReports({
      status: ReportStatus.SUBMITTED,
    }).pipe(
      map((list: ExpenseReport[]) => list.length),
      shareReplay(1),
    );

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd =>
          event instanceof NavigationEnd
        ),
        takeUntil(this.destroy$),
      )
      .subscribe(() => this.cdr.markForCheck());
  }

  toggleCollapse(): void {
    this.collapsed.update((value) => !value);
    this.collapsedChange.emit(this.collapsed());
  }

  /**
   * Get filtered nav items based on user role
   * Uses organization membership role, not global user role
   */
  get filteredNavItems(): NavItem[] {
    return this.navItems.filter((item) => {
      if (!item.requiredRole) {
        return true;
      }
      // Check specific role requirements based on organization membership
      if (item.requiredRole === "admin") {
        return this.organizationService.isCurrentUserAdmin();
      }
      if (item.requiredRole === "finance") {
        return this.organizationService.isCurrentUserFinanceOrAdmin();
      }
      if (item.requiredRole === "manager") {
        return this.organizationService.isCurrentUserManagerOrAbove();
      }
      return false;
    });
  }

  /**
   * Check if a route is currently active without colliding with more specific routes.
   */
  isActive(route: string): boolean {
    const activeUrl = this.normalizeUrl(this.router.url);

    if (activeUrl === route) {
      return true;
    }

    if (!activeUrl.startsWith(`${route}/`)) {
      return false;
    }

    return !this.hasConflictingChildRoute(route, activeUrl);
  }

  /**
   * Remove query params and hash fragments before comparing routes.
   */
  private normalizeUrl(url: string): string {
    return url.split("?")[0].split("#")[0];
  }

  /**
   * Avoid highlighting a parent route when a more specific nav item matches.
   */
  private hasConflictingChildRoute(route: string, activeUrl: string): boolean {
    return this.navItems.some((item) =>
      item.route !== route &&
      item.route.startsWith(`${route}/`) &&
      activeUrl.startsWith(item.route)
    );
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
   * TrackBy function for navigation items - improves ngFor performance
   */
  trackByNavItemRoute(_index: number, item: NavItem): string {
    return item.route;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
