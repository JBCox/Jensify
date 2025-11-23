import { Injectable, OnDestroy, inject } from "@angular/core";
import { Router } from "@angular/router";
import { SupabaseService } from "./supabase.service";
import { OrganizationService } from "./organization.service";
import { LoggerService } from "./logger.service";
import { NotificationService } from "./notification.service";
import { LoginCredentials, RegisterCredentials, User } from "../models";
import { UserRole } from "../models/enums";
import {
  BehaviorSubject,
  catchError,
  firstValueFrom,
  from,
  fromEvent,
  interval,
  map,
  merge,
  Observable,
  of,
  Subject,
  takeUntil,
  throttleTime,
} from "rxjs";
import { Session, User as SupabaseAuthUser } from "@supabase/supabase-js";

@Injectable({
  providedIn: "root",
})
export class AuthService implements OnDestroy {
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private organizationService = inject(OrganizationService);
  private logger = inject(LoggerService);
  private notification = inject(NotificationService);

  private userProfileSubject = new BehaviorSubject<User | null>(null);
  public userProfile$: Observable<User | null> = this.userProfileSubject
    .asObservable();
  private hasRedirectedToDefault = false;
  private suppressDefaultRedirect = false;
  private readonly legacyLandingRoutes = ["/"];

  // Subject for subscription cleanup
  private destroy$ = new Subject<void>();

  // Session timeout configuration
  private readonly SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
  private readonly SESSION_WARNING_MS = 25 * 60 * 1000; // 25 minutes (5 min warning)
  private readonly INACTIVITY_CHECK_INTERVAL_MS = 60 * 1000; // Check every 1 minute
  private lastActivityTimestamp = Date.now();
  private sessionWarningShown = false;

  constructor() {
    // Subscribe to auth changes and load user profile
    // Using takeUntil to prevent memory leaks
    this.supabase.currentUser$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (user) => {
        if (user) {
          this.userProfileSubject.next(this.createProvisionalProfile(user));
          await this.loadUserProfile(user.id);
          this.redirectToDefaultLanding();
        } else {
          this.userProfileSubject.next(null);
          this.hasRedirectedToDefault = false;
        }
      });

    // Initialize session timeout tracking
    this.initializeSessionTimeout();
  }

  /**
   * Clean up subscriptions when service is destroyed
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Get current user profile
   */
  get currentUserProfile(): User | null {
    return this.userProfileSubject.value;
  }

  /**
   * Check if user is authenticated
   */
  get isAuthenticated(): boolean {
    return this.supabase.isAuthenticated;
  }
  /**
   * Get current user's role
   */
  get userRole(): string | null {
    return this.currentUserProfile?.role || null;
  }

  /**
   * Check if user has a specific role
   */
  hasRole(role: string): boolean {
    return this.userRole === role;
  }

  /**
   * Check if user is finance or admin
   */
  get isFinanceOrAdmin(): boolean {
    return this.userRole === UserRole.FINANCE ||
      this.userRole === UserRole.ADMIN;
  }

  /**
   * Check if user is admin
   */
  get isAdmin(): boolean {
    return this.userRole === UserRole.ADMIN;
  }

  /**
   * Determine the default landing route for current user
   */
  getDefaultRoute(): string {
    // Check if user needs organization setup
    if (!this.organizationService.currentOrganizationId) {
      return "/organization/setup";
    }

    // Everyone goes to /home, which shows role-appropriate dashboard
    return "/home";
  }

  /**
   * Check if user has an organization
   */
  get hasOrganization(): boolean {
    return !!this.organizationService.currentOrganizationId;
  }

  /**
   * Register a new user
   */
  register(
    credentials: RegisterCredentials,
  ): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.signUp(
        credentials.email,
        credentials.password,
        credentials.full_name,
      ),
    ).pipe(
      map(({ data: _data, error }) => {
        if (error) {
          return { success: false, error: this.getErrorMessage(error) };
        }
        return { success: true };
      }),
      catchError((error) => {
        return of({
          success: false,
          error: this.getErrorMessage(error, "Registration failed"),
        });
      }),
    );
  }

  /**
   * Sign in with email and password
   */
  signIn(
    credentials: LoginCredentials,
  ): Observable<{ success: boolean; error?: string }> {
    return from(
      this.supabase.signIn(credentials.email, credentials.password),
    ).pipe(
      map(({ data: _data, error }) => {
        if (error) {
          return { success: false, error: this.getErrorMessage(error) };
        }
        return { success: true };
      }),
      catchError((error) => {
        return of({
          success: false,
          error: this.getErrorMessage(error, "Login failed"),
        });
      }),
    );
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    await this.supabase.signOut();
    this.userProfileSubject.next(null);
    this.hasRedirectedToDefault = false;

    // Clear organization context
    this.organizationService.clearCurrentOrganization();

    this.router.navigate(["/auth/login"]);
  }

  /**
   * Request password reset
   */
  resetPassword(
    email: string,
  ): Observable<{ success: boolean; error?: string }> {
    return from(this.supabase.resetPassword(email)).pipe(
      map(({ error }) => {
        if (error) {
          return { success: false, error: this.getErrorMessage(error) };
        }
        return { success: true };
      }),
      catchError((error) => {
        return of({
          success: false,
          error: this.getErrorMessage(error, "Password reset failed"),
        });
      }),
    );
  }

  /**
   * Update password
   */
  updatePassword(
    newPassword: string,
  ): Observable<{ success: boolean; error?: string }> {
    return from(this.supabase.updatePassword(newPassword)).pipe(
      map(({ error }) => {
        if (error) {
          return { success: false, error: this.getErrorMessage(error) };
        }
        return { success: true };
      }),
      catchError((error) => {
        return of({
          success: false,
          error: this.getErrorMessage(error, "Password update failed"),
        });
      }),
    );
  }

  /**
   * Load user profile from database and organization context
   */
  private async loadUserProfile(userId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase.client
        .from("users")
        .select("*")
        .eq("id", userId)
        .single();

      if (error || !data) {
        this.logger.warn(
          "Error loading user profile, using provisional",
          "AuthService",
          error,
        );
        return;
      }

      this.userProfileSubject.next(data as User);

      // Load organization context
      await this.loadOrganizationContext(userId);
    } catch (error) {
      this.logger.error("Error loading user profile", error, "AuthService");
    }
  }

  /**
   * Load organization context for user
   * Sets the current organization and membership
   */
  private async loadOrganizationContext(_userId: string): Promise<void> {
    try {
      console.log('[AuthService] Loading organization context for user:', _userId);
      // Get user's organization context - wait for it to complete
      const context = await firstValueFrom(
        this.organizationService.getUserOrganizationContext(),
      );

      console.log('[AuthService] Organization context received:', context);

      if (
        context && context.current_organization && context.current_membership
      ) {
        console.log('[AuthService] Setting organization:', context.current_organization.name);
        console.log('[AuthService] User role:', context.current_membership.role);
        // Set current organization - types are validated by UserOrganizationContext interface
        this.organizationService.setCurrentOrganization(
          context.current_organization,
          context.current_membership,
        );
      } else {
        // User has no organization - may need to create one or accept an invitation
        console.warn('[AuthService] User has no organization membership');
        this.logger.info("User has no organization membership", "AuthService");
        // Clear any stale organization data
        this.organizationService.clearCurrentOrganization();
      }
    } catch (error) {
      console.error('[AuthService] Error loading organization context:', error);
      this.logger.error(
        "Error loading organization context",
        error,
        "AuthService",
      );
      // Clear stale data on error
      this.organizationService.clearCurrentOrganization();
    }
  }

  /**
   * Refresh user profile
   */
  async refreshUserProfile(): Promise<void> {
    const userId = this.supabase.userId;
    if (userId) {
      await this.loadUserProfile(userId);
    }
  }

  suppressNextDefaultRedirect(): void {
    this.suppressDefaultRedirect = true;
  }

  private redirectToDefaultLanding(): void {
    if (this.suppressDefaultRedirect) {
      this.suppressDefaultRedirect = false;
      return;
    }

    if (this.hasRedirectedToDefault) {
      return;
    }

    if (this.shouldUseDefaultRoute(this.router.url)) {
      this.hasRedirectedToDefault = true;
      this.router.navigateByUrl(this.getDefaultRoute());
    }
  }

  get session$(): Observable<Session | null> {
    return this.supabase.session$;
  }

  shouldUseDefaultRoute(path?: string | null): boolean {
    if (!path) {
      return false;
    }
    const normalized = path.split("?")[0] || path;
    return this.legacyLandingRoutes.includes(normalized);
  }

  private createProvisionalProfile(user: SupabaseAuthUser): User {
    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const now = new Date().toISOString();
    return {
      id: user.id,
      email: String(user.email || metadata["email"] || "user@example.com") as string,
      full_name: String(metadata["full_name"] || metadata["name"] || user.email || "User") as string,
      role: (metadata["role"] as UserRole) || UserRole.EMPLOYEE,
      department: metadata["department"] ? String(metadata["department"]) as string : undefined,
      manager_id: metadata["manager_id"] ? String(metadata["manager_id"]) as string : undefined,
      created_at: user.created_at || now,
      updated_at: user.updated_at || now,
    };
  }

  /**
   * Initialize session timeout tracking
   * Tracks user activity and automatically logs out inactive users
   */
  private initializeSessionTimeout(): void {
    // Only track session timeout for authenticated users
    if (!this.isAuthenticated) {
      return;
    }

    // Track user activity events
    const activityEvents = ['click', 'keypress', 'scroll', 'mousemove'];
    merge(...activityEvents.map(event => fromEvent(document, event)))
      .pipe(
        throttleTime(1000), // Throttle to max once per second to reduce overhead
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.lastActivityTimestamp = Date.now();
        this.sessionWarningShown = false; // Reset warning if user becomes active again
      });

    // Check for inactivity periodically
    interval(this.INACTIVITY_CHECK_INTERVAL_MS)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        if (!this.isAuthenticated) {
          return; // Skip if user already logged out
        }

        const inactiveDuration = Date.now() - this.lastActivityTimestamp;

        // Show warning at 25 minutes (5 minutes before timeout)
        if (inactiveDuration >= this.SESSION_WARNING_MS && !this.sessionWarningShown) {
          this.sessionWarningShown = true;
          this.notification.showWarning(
            'Your session will expire in 5 minutes due to inactivity. Any activity will extend your session.'
          );
          this.logger.info('Session timeout warning shown', 'AuthService');
        }

        // Handle session timeout at 30 minutes
        if (inactiveDuration >= this.SESSION_TIMEOUT_MS) {
          this.handleSessionTimeout();
        }
      });

    this.logger.info('Session timeout tracking initialized', 'AuthService', {
      timeout: this.SESSION_TIMEOUT_MS / 1000 / 60 + ' minutes',
      warning: this.SESSION_WARNING_MS / 1000 / 60 + ' minutes'
    });
  }

  /**
   * Handle session timeout - sign out user and show notification
   */
  private handleSessionTimeout(): void {
    this.logger.warn('Session expired due to inactivity', 'AuthService');

    // Show notification before signing out
    this.notification.showError(
      'Your session has expired due to inactivity. Please log in again.'
    );

    // Sign out user
    this.signOut();
  }

  /**
   * Extract error message from unknown error type
   */
  private getErrorMessage(
    error: unknown,
    defaultMessage = "An error occurred",
  ): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === "string") {
      return error;
    }
    if (typeof error === "object" && error !== null && "message" in error) {
      return String(error.message);
    }
    return defaultMessage;
  }
}
