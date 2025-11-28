import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Input, OnDestroy, Output, signal, inject, ViewChild, AfterViewInit } from "@angular/core";
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
import { ApprovalService } from "../../services/approval.service";
import { ThemeService } from "../../services/theme.service";
import { OrgSwitcher } from "../org-switcher/org-switcher";
import { BehaviorSubject, filter, map, Observable, of, shareReplay, Subject, switchMap, takeUntil, catchError } from "rxjs";
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
    OrgSwitcher,
  ],
  templateUrl: "./sidebar-nav.html",
  styleUrl: "./sidebar-nav.scss",
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidebarNav implements OnDestroy, AfterViewInit {
  private router = inject(Router);
  private authService = inject(AuthService);
  private organizationService = inject(OrganizationService);
  private expenseService = inject(ExpenseService);
  private reportService = inject(ReportService);
  private approvalService = inject(ApprovalService);
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

  @ViewChild(OrgSwitcher) orgSwitcher?: OrgSwitcher;

  // Refresh triggers for badge counts
  private refreshTrigger$ = new BehaviorSubject<void>(undefined);

  // Badge counts
  unreportedCount$: Observable<number>;
  draftReportsCount$: Observable<number>;
  pendingApprovalCount$: Observable<number>;

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
    {
      icon: "speed",
      label: "Mileage Settings",
      route: "/organization/mileage-settings",
      requiredRole: "admin",
    },
    {
      icon: "account_balance_wallet",
      label: "Budgets",
      route: "/organization/budgets",
      requiredRole: "finance",
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
    // Unreported expenses count - refreshes on navigation
    this.unreportedCount$ = this.refreshTrigger$.pipe(
      switchMap(() => this.expenseService.getMyExpenses().pipe(
        map((list: Expense[]) =>
          list.filter((e: Expense) => !e.is_reported).length
        ),
        catchError(() => of(0)),
      )),
      shareReplay(1),
    );

    // Draft reports count - refreshes on navigation
    this.draftReportsCount$ = this.refreshTrigger$.pipe(
      switchMap(() => this.reportService.getReports().pipe(
        map((list: ExpenseReport[]) =>
          list.filter((r) => r.status === ReportStatus.DRAFT).length
        ),
        catchError(() => of(0)),
      )),
      shareReplay(1),
    );

    // Pending approvals count from expense_approvals table - refreshes on navigation
    // This is the count of items waiting for the current user to approve
    this.pendingApprovalCount$ = this.refreshTrigger$.pipe(
      switchMap(() => this.approvalService.getPendingApprovals().pipe(
        map((approvals) => approvals.length),
        catchError(() => of(0)),
      )),
      shareReplay(1),
    );

    // Refresh badge counts on every navigation
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd =>
          event instanceof NavigationEnd
        ),
        takeUntil(this.destroy$),
      )
      .subscribe(() => {
        this.refreshBadgeCounts();
        this.cdr.markForCheck();
      });
  }

  /**
   * Refresh all badge counts
   * Called on navigation and can be called manually
   */
  refreshBadgeCounts(): void {
    this.refreshTrigger$.next();
  }

  ngAfterViewInit(): void {
    // Sync initial collapsed state with org switcher
    this.syncOrgSwitcherCollapsed();
  }

  toggleCollapse(): void {
    this.collapsed.update((value) => !value);
    this.collapsedChange.emit(this.collapsed());
    this.syncOrgSwitcherCollapsed();
  }

  private syncOrgSwitcherCollapsed(): void {
    if (this.orgSwitcher) {
      this.orgSwitcher.setCollapsed(this.collapsed());
    }
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
