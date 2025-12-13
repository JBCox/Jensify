import { Injectable, inject } from '@angular/core';
import { Observable, from, throwError } from 'rxjs';
import { map, catchError, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import { INVITATION_EXPIRY_MS } from '../constants/app.constants';
import {
  Invitation,
  CreateInvitationDto,
  BulkInvitationDto,
  AcceptInvitationDto,
  OrganizationMember
} from '../models/organization.model';
import { UserRole } from '../models/enums';
import { NotificationService } from './notification.service';

/**
 * Service for managing organization invitations
 * Handles invitation creation, sending, and acceptance
 */
@Injectable({
  providedIn: 'root'
})
export class InvitationService {
  private supabase = inject(SupabaseService);
  private organizationService = inject(OrganizationService);
  private notificationService = inject(NotificationService);
  private logger = inject(LoggerService);


  // ============================================================================
  // INVITATION CRUD
  // ============================================================================

  /**
   * Create a new invitation
   * Requires admin or manager role
   */
  createInvitation(dto: CreateInvitationDto): Observable<Invitation> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('invitations')
        .insert({
          organization_id: organizationId,
          email: dto.email.toLowerCase(),
          role: dto.role,
          manager_id: dto.manager_id || null,
          department: dto.department || null,
          invited_by: userId,
          status: 'pending',
          expires_at: new Date(Date.now() + INVITATION_EXPIRY_MS).toISOString()
        })
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('No invitation data returned');
        return data as Invitation;
      }),
      tap((invitation) => {
        // Send invitation email via Edge Function (fire-and-forget)
        // NOTE: Success notification is handled by the component to avoid duplicate notifications
        this.sendInvitationEmail(invitation);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Create multiple invitations (bulk upload)
   * Requires admin or manager role
   */
  createBulkInvitations(dto: BulkInvitationDto): Observable<Invitation[]> {
    const userId = this.supabase.userId;
    const organizationId = this.organizationService.currentOrganizationId;

    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }
    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    const invitations = dto.invitations.map(inv => ({
      organization_id: organizationId,
      email: inv.email.toLowerCase(),
      role: inv.role,
      manager_id: inv.manager_id || null,
      department: inv.department || null,
      invited_by: userId,
      status: 'pending',
      expires_at: new Date(Date.now() + INVITATION_EXPIRY_MS).toISOString()
    }));

    return from(
      this.supabase.client
        .from('invitations')
        .insert(invitations)
        .select()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Invitation[];
      }),
      tap((invitations) => {
        // Send invitation emails via Edge Function (fire-and-forget)
        // NOTE: Success notification is handled by the component to avoid duplicate notifications
        invitations.forEach(invitation => this.sendInvitationEmail(invitation));
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get invitation by token
   * Uses SECURITY DEFINER RPC to bypass RLS and fetch org name for unauthenticated users
   */
  getInvitationByToken(token: string): Observable<Invitation | null> {
    return from(
      this.supabase.client.rpc('get_invitation_by_token', { p_token: token })
    ).pipe(
      map(({ data, error }) => {
        if (error) {
          // RPC returns empty array if not found (not an error)
          if (error.code === 'PGRST116') return null;
          throw error;
        }

        // RPC returns an array, get first result
        const result = Array.isArray(data) ? data[0] : data;
        if (!result) return null;

        // Transform flat RPC response to Invitation interface
        const invitation: Invitation = {
          id: result.id,
          organization_id: result.organization_id,
          email: result.email,
          role: result.role,
          manager_id: result.manager_id,
          department: result.department,
          token: result.token,
          expires_at: result.expires_at,
          status: result.status,
          invited_by: result.invited_by,
          accepted_by: result.accepted_by,
          accepted_at: result.accepted_at,
          created_at: result.created_at,
          // Map flat fields to nested objects for UI compatibility
          organization: result.organization_name ? {
            id: result.organization_id,
            name: result.organization_name
          } as Invitation['organization'] : undefined,
          inviter: result.inviter_name ? {
            full_name: result.inviter_name
          } as Invitation['inviter'] : undefined
        };

        return invitation;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get all invitations for current organization
   * Optionally filter by status
   */
  getOrganizationInvitations(status?: string): Observable<Invitation[]> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    let query = this.supabase.client
      .from('invitations')
      .select('*')
      .eq('organization_id', organizationId);

    if (status) {
      query = query.eq('status', status);
    }

    return from(query.order('created_at', { ascending: false })).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        return (data || []) as Invitation[];
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Get pending invitations count for current organization
   */
  getPendingInvitationsCount(): Observable<number> {
    const organizationId = this.organizationService.currentOrganizationId;

    if (!organizationId) {
      return throwError(() => new Error('No organization selected'));
    }

    return from(
      this.supabase.client
        .from('invitations')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('status', 'pending')
    ).pipe(
      map(({ count, error }) => {
        if (error) throw error;
        return count || 0;
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Accept an invitation
   * Creates organization membership and marks invitation as accepted
   */
  acceptInvitation(dto: AcceptInvitationDto): Observable<OrganizationMember> {
    const userId = this.supabase.userId;
    if (!userId) {
      return throwError(() => new Error('User not authenticated'));
    }

    return from(
      this.supabase.client.rpc('accept_invitation', {
        p_token: dto.token,
        p_user_id: userId
      })
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Failed to accept invitation');
        return data as OrganizationMember;
      }),
      tap((_membership) => {
        this.notificationService.showSuccess('Successfully joined organization');
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Revoke an invitation
   * Requires admin role
   */
  revokeInvitation(invitationId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('invitations')
        .update({ status: 'revoked' })
        .eq('id', invitationId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      tap(() => {
        this.notificationService.showSuccess('Invitation revoked');
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Resend an invitation
   * Requires admin or manager role
   */
  resendInvitation(invitationId: string): Observable<Invitation> {
    // Extend expiration date
    const newExpiresAt = new Date(Date.now() + INVITATION_EXPIRY_MS).toISOString();

    return from(
      this.supabase.client
        .from('invitations')
        .update({ expires_at: newExpiresAt })
        .eq('id', invitationId)
        .select()
        .single()
    ).pipe(
      map(({ data, error }) => {
        if (error) throw error;
        if (!data) throw new Error('Invitation not found');
        return data as Invitation;
      }),
      tap((invitation) => {
        // Fire-and-forget email send
        // NOTE: Success notification is handled by the component to avoid duplicate notifications
        this.sendInvitationEmail(invitation);
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Delete an invitation
   * Requires admin role
   */
  deleteInvitation(invitationId: string): Observable<void> {
    return from(
      this.supabase.client
        .from('invitations')
        .delete()
        .eq('id', invitationId)
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      tap(() => {
        this.notificationService.showSuccess('Invitation deleted');
      }),
      catchError(this.handleError)
    );
  }

  /**
   * Expire old invitations
   * Called periodically to clean up pending invitations
   */
  expireOldInvitations(): Observable<void> {
    return from(
      this.supabase.client.rpc('expire_old_invitations')
    ).pipe(
      map(({ error }) => {
        if (error) throw error;
      }),
      catchError(this.handleError)
    );
  }

  // ============================================================================
  // INVITATION EMAIL
  // ============================================================================

  /**
   * Send invitation email via Edge Function
   * @private
   */
  private async sendInvitationEmail(invitation: Invitation): Promise<void> {
    try {
      const { data: _data, error } = await this.supabase.client.functions.invoke('send-invitation-email', {
        body: {
          invitation_id: invitation.id,
          email: invitation.email,
          token: invitation.token,
          organization_id: invitation.organization_id
        }
      });

      if (error) {
        this.logger.error('Failed to send invitation email', error, 'InvitationService');
        this.notificationService.showWarning(
          'Invitation created but email delivery failed. You can copy the invitation link and share it manually.'
        );
      }
    } catch (error) {
      this.logger.error('Failed to send invitation email', error, 'InvitationService');
      this.notificationService.showWarning(
        'Invitation created but email delivery failed. You can copy the invitation link and share it manually.'
      );
    }
  }

  /**
   * Generate invitation link for sharing
   */
  getInvitationLink(token: string): string {
    const baseUrl = window.location.origin;
    return `${baseUrl}/auth/accept-invitation?token=${token}`;
  }

  // ============================================================================
  // CSV PARSING
  // ============================================================================

  /**
   * Parse CSV file for bulk invitations
   * Expected format: email,role,department,manager_email
   */
  parseInvitationCsv(csvContent: string): CreateInvitationDto[] {
    const lines = csvContent.trim().split('\n');
    const invitations: CreateInvitationDto[] = [];

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const [email, role, department, _managerEmail] = line.split(',').map(s => s.trim());

      if (!email || !role) {
        this.logger.warn(`Skipping invalid row ${i}: missing email or role`, 'InvitationService.CSV');
        continue;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        this.logger.warn(`Skipping invalid email: ${email}`, 'InvitationService.CSV');
        continue;
      }

      // Validate role
      const validRoles = ['employee', 'manager', 'finance', 'admin'];
      if (!validRoles.includes(role.toLowerCase())) {
        this.logger.warn(`Skipping invalid role: ${role}`, 'InvitationService.CSV');
        continue;
      }

      invitations.push({
        email: email.toLowerCase(),
        role: role.toLowerCase() as UserRole, // Validated above to be one of the valid roles
        department: department || undefined,
        manager_id: undefined // Will need to be resolved separately if manager_email provided
      });
    }

    return invitations;
  }

  // ============================================================================
  // ERROR HANDLING
  // ============================================================================

  private handleError = (error: unknown): Observable<never> => {
    this.logger.error('InvitationService error', error, 'InvitationService');

    let message = this.logger.getErrorMessage(error, 'An error occurred');

    // Handle specific error cases (PostgreSQL error codes)
    if (typeof error === 'object' && error !== null && 'code' in error) {
      const dbError = error as { code?: string };
      if (dbError.code === '23505') {
        // Unique constraint violation
        message = 'An invitation for this email already exists';
      }
    }

    this.notificationService.showError(message);
    return throwError(() => new Error(message));
  };
}
