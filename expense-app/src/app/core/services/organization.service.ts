import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, from, Observable, throwError } from "rxjs";
import { catchError, map, tap } from "rxjs/operators";
import { SupabaseService } from "./supabase.service";
import { LoggerService } from "./logger.service";
import {
  CreateOrganizationDto,
  Organization,
  OrganizationMember,
  OrganizationWithStats,
  UpdateOrganizationDto,
  UpdateOrganizationMemberDto,
  UserOrganizationContext,
} from "../models/organization.model";
import { NotificationService } from "./notification.service";

/**
 * Service for managing organizations and memberships
 * Handles organization CRUD, member management, and context switching
 */
@Injectable({
  providedIn: "root",
})
export class OrganizationService {
  private supabase = inject(SupabaseService);
  private notificationService = inject(NotificationService);
  private logger = inject(LoggerService);

  /** Current organization context */
  private currentOrganizationSubject = new BehaviorSubject<Organization | null>(
    null,
  );
  public readonly currentOrganization$ = this.currentOrganizationSubject
    .asObservable();

  /** Current organization membership */
  private currentMembershipSubject = new BehaviorSubject<
    OrganizationMember | null
  >(null);
  public readonly currentMembership$ = this.currentMembershipSubject
    .asObservable();

  /** Track if organization context has been initialized */
  private organizationInitializedSubject = new BehaviorSubject<boolean>(false);
  public readonly organizationInitialized$ = this.organizationInitializedSubject
    .asObservable();

  // ============================================================================
  // ORGANIZATION CRUD
  // ============================================================================

  /**
   * Create a new organization
   * The current user becomes the admin
   */
  createOrganization(dto: CreateOrganizationDto): Observable<Organization> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    return from(
      this.supabase.client.rpc("create_organization_with_admin", {
        p_name: dto.name,
        p_domain: dto.domain || null,
        p_settings: dto.settings || null,
        p_admin_user_id: userId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("No organization data returned");
        return data as Organization;
      }),
      tap((org) => {
        this.notificationService.showSuccess(
          `Organization "${org.name}" created successfully`,
        );
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Get organization by ID
   */
  getOrganizationById(id: string): Observable<Organization> {
    return from(
      this.supabase.client
        .from("organizations")
        .select("*")
        .eq("id", id)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Organization not found");
        return data as Organization;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Update organization
   * Requires admin role
   */
  updateOrganization(
    id: string,
    dto: UpdateOrganizationDto,
  ): Observable<Organization> {
    return from(
      this.supabase.client
        .from("organizations")
        .update(dto)
        .eq("id", id)
        .select()
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Organization not found");
        return data as Organization;
      }),
      tap((org) => {
        this.notificationService.showSuccess(
          "Organization updated successfully",
        );
        // Update current organization if it's the active one
        if (this.currentOrganizationSubject.value?.id === id) {
          this.currentOrganizationSubject.next(org);
        }
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Get organization with statistics
   */
  getOrganizationWithStats(id: string): Observable<OrganizationWithStats> {
    return from(
      this.supabase.client.rpc("get_organization_stats", {
        p_organization_id: id,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Organization not found");
        return data as OrganizationWithStats;
      }),
      catchError(this.handleError),
    );
  }

  // ============================================================================
  // ORGANIZATION MEMBERS
  // ============================================================================

  /**
   * Get all members of an organization
   */
  getOrganizationMembers(
    organizationId: string,
    activeOnly = true,
  ): Observable<OrganizationMember[]> {
    let query = this.supabase.client
      .from("organization_members")
      .select(
        "*, user:users!user_id(*), manager:organization_members!manager_id(*)",
      )
      .eq("organization_id", organizationId);

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    return from(query.order("created_at", { ascending: false })).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as OrganizationMember[];
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Get a specific organization member
   */
  getOrganizationMember(
    organizationId: string,
    userId: string,
  ): Observable<OrganizationMember | null> {
    return from(
      this.supabase.client
        .from("organization_members")
        .select(
          "*, user:users!user_id(*), manager:organization_members!manager_id(*)",
        )
        .eq("organization_id", organizationId)
        .eq("user_id", userId)
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error?.code === "PGRST116") {
          // Not found
          return null;
        }
        if (error) throw error;
        return data as OrganizationMember;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Update organization member (role, manager, department, etc.)
   * Requires admin role
   */
  updateOrganizationMember(
    membershipId: string,
    dto: UpdateOrganizationMemberDto,
  ): Observable<OrganizationMember> {
    return from(
      this.supabase.client
        .from("organization_members")
        .update(dto)
        .eq("id", membershipId)
        .select("*, user:users!user_id(*)")
        .single(),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error("Member not found");
        return data as OrganizationMember;
      }),
      tap(() => {
        this.notificationService.showSuccess("Member updated successfully");
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Deactivate a member (soft delete)
   * Requires admin role
   */
  deactivateMember(membershipId: string): Observable<void> {
    return from(
      this.supabase.client
        .from("organization_members")
        .update({ is_active: false })
        .eq("id", membershipId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      tap(() => {
        this.notificationService.showSuccess("Member deactivated");
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Reactivate a member
   * Requires admin role
   */
  reactivateMember(membershipId: string): Observable<void> {
    return from(
      this.supabase.client
        .from("organization_members")
        .update({ is_active: true })
        .eq("id", membershipId),
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      tap(() => {
        this.notificationService.showSuccess("Member reactivated");
      }),
      catchError(this.handleError),
    );
  }

  // ============================================================================
  // USER ORGANIZATION CONTEXT
  // ============================================================================

  /**
   * Get all organizations the current user is a member of
   */
  getUserOrganizations(): Observable<Organization[]> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    return from(
      this.supabase.client
        .from("organization_members")
        .select("organization:organizations(*)")
        .eq("user_id", userId)
        .eq("is_active", true),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        // Double type assertion needed because Supabase doesn't properly infer foreign key relations
        return ((data || []) as unknown as { organization: Organization }[]).map((item) => item.organization);
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Get full organization context for current user
   * Includes all organizations and memberships
   */
  getUserOrganizationContext(): Observable<UserOrganizationContext | null> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error("User not authenticated"));
    }

    return from(
      this.supabase.client.rpc("get_user_organization_context", {
        p_user_id: userId,
      }),
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data || data.length === 0) return null;
        return data[0] as UserOrganizationContext;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Set the current active organization
   */
  setCurrentOrganization(
    organization: Organization,
    membership: OrganizationMember,
  ): void {
    console.log('[OrganizationService] setCurrentOrganization called');
    console.log('[OrganizationService] Organization:', organization.name, organization.id);
    console.log('[OrganizationService] Membership role:', membership.role);
    console.log('[OrganizationService] Membership data:', membership);

    this.currentOrganizationSubject.next(organization);
    this.currentMembershipSubject.next(membership);

    // Store in localStorage for persistence
    localStorage.setItem("current_organization_id", organization.id);

    // Mark organization as initialized
    this.organizationInitializedSubject.next(true);
    console.log('[OrganizationService] Organization context set, initialized=true');
  }

  /**
   * Get current organization ID
   */
  get currentOrganizationId(): string | null {
    return this.currentOrganizationSubject.value?.id ||
      localStorage.getItem("current_organization_id");
  }

  /**
   * Get current user's role in current organization
   */
  get currentUserRole(): string | null {
    return this.currentMembershipSubject.value?.role || null;
  }

  /**
   * Check if current user has a specific role or higher
   */
  hasRole(requiredRole: "employee" | "finance" | "manager" | "admin"): boolean {
    const role = this.currentUserRole;
    if (!role) return false;

    const roleHierarchy = ["employee", "finance", "manager", "admin"];
    const userRoleLevel = roleHierarchy.indexOf(role);
    const requiredRoleLevel = roleHierarchy.indexOf(requiredRole);

    return userRoleLevel >= requiredRoleLevel;
  }

  /**
   * Clear current organization context (on logout)
   */
  clearCurrentOrganization(): void {
    this.currentOrganizationSubject.next(null);
    this.currentMembershipSubject.next(null);
    localStorage.removeItem("current_organization_id");

    // Mark as initialized (with no organization)
    this.organizationInitializedSubject.next(true);
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  /**
   * Check if user is admin of current organization
   */
  isCurrentUserAdmin(): boolean {
    return this.currentUserRole === "admin";
  }

  /**
   * Check if user is finance or admin of current organization
   */
  isCurrentUserFinanceOrAdmin(): boolean {
    const role = this.currentUserRole;
    return role === "finance" || role === "admin";
  }

  /**
   * Check if user is manager, finance, or admin of current organization
   */
  isCurrentUserManagerOrAbove(): boolean {
    const role = this.currentUserRole;
    return role === "manager" || role === "finance" || role === "admin";
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error(
      "OrganizationService error",
      error,
      "OrganizationService",
    );

    const message = this.logger.getErrorMessage(error, "An error occurred");

    this.notificationService.showError(message);
    return throwError(() => new Error(message));
  };
}
