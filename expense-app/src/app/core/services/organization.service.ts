import { Injectable, inject } from "@angular/core";
import { BehaviorSubject, from, Observable, throwError } from "rxjs";
import { catchError, map, tap } from "rxjs/operators";
import { SupabaseService } from "./supabase.service";
import { LoggerService } from "./logger.service";
import {
  CreateOrganizationDto,
  DEFAULT_GL_CODE_MAPPINGS,
  GLCodeMappings,
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
   * Upload organization logo to Supabase Storage
   * @param organizationId Organization ID
   * @param file Logo file (PNG, JPG, or SVG)
   * @returns Observable with the public URL of the uploaded logo
   */
  uploadLogo(organizationId: string, file: File): Observable<string> {
    const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
    const fileName = `${organizationId}/logo.${fileExt}`;

    return from(
      this.supabase.client.storage
        .from('organization-logos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: true, // Replace existing logo
        })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Upload failed');

        // Get public URL
        const { data: urlData } = this.supabase.client.storage
          .from('organization-logos')
          .getPublicUrl(fileName);

        return urlData.publicUrl;
      }),
      catchError(this.handleError),
    );
  }

  /**
   * Delete organization logo from storage
   */
  deleteLogo(organizationId: string): Observable<void> {
    // We need to list files first since we don't know the extension
    return from(
      this.supabase.client.storage
        .from('organization-logos')
        .list(organizationId)
    ).pipe(
      map(({ data: files, error }) => {
        if (error) throw error;
        return files || [];
      }),
      map(async (files) => {
        if (files.length > 0) {
          const filesToRemove = files.map(f => `${organizationId}/${f.name}`);
          const { error } = await this.supabase.client.storage
            .from('organization-logos')
            .remove(filesToRemove);
          if (error) throw error;
        }
      }),
      map(() => undefined),
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
   * Includes user data for display (name, email)
   */
  getOrganizationMembers(
    organizationId: string,
    activeOnly = true,
  ): Observable<OrganizationMember[]> {
    // Query with user join for name/email display
    let query = this.supabase.client
      .from("organization_members")
      .select("*, user:users!organization_members_user_id_fkey(id, email, full_name)")
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
   * Includes user data for display
   */
  getOrganizationMember(
    organizationId: string,
    userId: string,
  ): Observable<OrganizationMember | null> {
    return from(
      this.supabase.client
        .from("organization_members")
        .select("*, user:users!organization_members_user_id_fkey(id, email, full_name)")
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
        .select("*, user:users!organization_members_user_id_fkey(*)")
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
        if (!data) return null;
        // Supabase RPC may return array - take first element if so
        const context = Array.isArray(data) ? data[0] : data;
        if (!context) return null;
        return context as UserOrganizationContext;
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
   * Check if user has finance dashboard access
   * - Finance: Always has access
   * - Admin: Always has access
   * - Manager: Only if can_access_finance flag is enabled
   */
  isCurrentUserFinanceOrAdmin(): boolean {
    const role = this.currentUserRole;
    const membership = this.currentMembershipSubject.value;

    // Finance and admins always have finance access
    if (role === "finance" || role === "admin") {
      return true;
    }

    // Managers only have finance access if explicitly granted
    if (role === "manager" && membership?.can_access_finance) {
      return true;
    }

    return false;
  }

  /**
   * Check if user can access finance dashboard
   * Alias for isCurrentUserFinanceOrAdmin for clarity
   */
  canAccessFinance(): boolean {
    return this.isCurrentUserFinanceOrAdmin();
  }

  /**
   * Check if user has manager capabilities (can approve expenses)
   * - Managers: Always have approval rights
   * - Admins: Always have approval rights
   * - Finance: Only if can_manage_expenses flag is enabled
   */
  isCurrentUserManagerOrAbove(): boolean {
    const role = this.currentUserRole;
    const membership = this.currentMembershipSubject.value;

    // Managers and admins always have manager rights
    if (role === "manager" || role === "admin") {
      return true;
    }

    // Finance users only have manager rights if explicitly granted
    if (role === "finance" && membership?.can_manage_expenses) {
      return true;
    }

    return false;
  }

  /**
   * Check if user can manage expenses (has approval capabilities)
   * Alias for isCurrentUserManagerOrAbove for clarity
   */
  canManageExpenses(): boolean {
    return this.isCurrentUserManagerOrAbove();
  }

  // ============================================================================
  // GL CODE HELPERS
  // ============================================================================

  /**
   * Get GL code mappings for the current organization
   * Returns default mappings if organization has no custom mappings
   */
  getGLCodeMappings(): GLCodeMappings {
    const org = this.currentOrganizationSubject.value;
    return org?.settings?.gl_code_mappings || DEFAULT_GL_CODE_MAPPINGS;
  }

  /**
   * Get the GL code for a specific expense category
   * @param category The expense category (e.g., "Fuel", "Airfare")
   * @returns The GL code (e.g., "travel", "meals")
   */
  getGLCodeForCategory(category: string): string {
    const mappings = this.getGLCodeMappings();
    return mappings[category]?.gl_code || 'uncategorized';
  }

  /**
   * Get all active categories grouped by their GL code
   * Useful for reporting and summaries
   */
  getCategoriesByGLCode(): Map<string, string[]> {
    const mappings = this.getGLCodeMappings();
    const grouped = new Map<string, string[]>();

    for (const [category, mapping] of Object.entries(mappings)) {
      if (mapping.is_active) {
        const code = mapping.gl_code;
        if (!grouped.has(code)) {
          grouped.set(code, []);
        }
        grouped.get(code)!.push(category);
      }
    }

    return grouped;
  }

  /**
   * Get list of active categories for dropdown selection
   * Only returns categories that are marked as active in GL code mappings
   */
  getActiveCategories(): string[] {
    const mappings = this.getGLCodeMappings();
    return Object.entries(mappings)
      .filter(([, mapping]) => mapping.is_active)
      .map(([category]) => category)
      .sort();
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
