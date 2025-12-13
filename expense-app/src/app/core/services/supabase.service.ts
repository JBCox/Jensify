import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

/**
 * Supabase Service
 *
 * Core service for managing Supabase client instance and authentication state.
 * Provides reactive streams for user and session changes, and exposes the
 * Supabase client for database and storage operations.
 *
 * Features:
 * - Automatic session initialization and persistence
 * - Real-time authentication state tracking
 * - Auto-refresh tokens
 * - Reactive observables for user and session
 *
 * @example
 * ```typescript
 * constructor(private supabase: SupabaseService) {
 *   // Subscribe to user changes
 *   this.supabase.currentUser$.subscribe(user => {
 *     console.log('User:', user);
 *   });
 *
 *   // Access client for queries
 *   const { data } = await this.supabase.client
 *     .from('expenses')
 *     .select('*');
 * }
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  /** Supabase client instance */
  private supabase: SupabaseClient;

  /** BehaviorSubject for current user state */
  private currentUserSubject = new BehaviorSubject<User | null>(null);

  /** BehaviorSubject for current session state */
  private sessionSubject = new BehaviorSubject<Session | null>(null);

  /** BehaviorSubject to track if session initialization is complete */
  private sessionInitializedSubject = new BehaviorSubject<boolean>(false);

  /** Observable stream of current user changes */
  public currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();

  /** Observable stream of session changes */
  public session$: Observable<Session | null> = this.sessionSubject.asObservable();

  /** Observable stream indicating if session initialization is complete */
  public sessionInitialized$: Observable<boolean> = this.sessionInitializedSubject.asObservable();

  /**
   * Initializes the Supabase client with configuration from environment
   * Sets up authentication state listeners and session persistence
   */
  constructor() {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );

    // Initialize session
    this.initializeSession();

    // Listen for auth changes
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.sessionSubject.next(session);
      this.currentUserSubject.next(session?.user || null);
    });
  }

  /**
   * Initializes the user session from storage
   * Called automatically on service construction
   * @private
   */
  private async initializeSession(): Promise<void> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      this.sessionSubject.next(session);
      this.currentUserSubject.next(session?.user || null);
    } finally {
      // Mark session as initialized regardless of success/failure
      this.sessionInitializedSubject.next(true);
    }
  }

  /**
   * Get the Supabase client instance
   *
   * Use this to access Supabase database, storage, and auth methods
   *
   * @returns Supabase client instance
   *
   * @example
   * ```typescript
   * const { data, error } = await this.supabase.client
   *   .from('expenses')
   *   .select('*')
   *   .eq('user_id', userId);
   * ```
   */
  get client(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Get current authenticated user
   *
   * Returns synchronous snapshot of current user state.
   * For reactive updates, use `currentUser$` observable instead.
   *
   * @returns Current user or null if not authenticated
   */
  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Get current session
   *
   * Returns synchronous snapshot of current session state.
   * For reactive updates, use `session$` observable instead.
   *
   * @returns Current session or null if not authenticated
   */
  get currentSession(): Session | null {
    return this.sessionSubject.value;
  }

  /**
   * Check if user is authenticated
   *
   * @returns true if user has an active session
   */
  get isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  /**
   * Get current user's ID
   *
   * Convenience getter for accessing the user ID directly
   *
   * @returns User ID or null if not authenticated
   */
  get userId(): string | null {
    return this.currentUser?.id || null;
  }

  /**
   * Get Supabase URL
   *
   * Used by services that need to call Edge Functions directly
   *
   * @returns Supabase project URL
   */
  get supabaseUrl(): string {
    return environment.supabase.url;
  }

  /**
   * Get Supabase anon key
   *
   * SECURITY NOTE: This key is safe to expose in frontend code.
   * It only grants public (anon) role permissions and all data
   * access is protected by Row Level Security (RLS) policies.
   *
   * @returns Supabase anon key for API authentication
   */
  get supabaseAnonKey(): string {
    return environment.supabase.anonKey;
  }

  /**
   * Get current session asynchronously
   *
   * Used by services that need to get the access token for Edge Function calls
   *
   * @returns Current session or null if not authenticated
   */
  async getSession(): Promise<Session | null> {
    const { data: { session } } = await this.supabase.auth.getSession();
    return session;
  }

  /**
   * Sign up with email and password
   * @param email - User email
   * @param password - User password
   * @param fullName - User's full name
   * @param invitationToken - Optional invitation token to store in user metadata (for cross-device support)
   */
  async signUp(email: string, password: string, fullName: string, invitationToken?: string) {
    try {
      // Simple redirect URL - invitation token is stored in user metadata instead of URL params
      // This is more reliable because URL params can get lost in email confirmation redirects
      const redirectUrl = `${window.location.origin}/auth/callback`;

      // Store invitation token in user metadata - this persists server-side and works across devices
      const userData: Record<string, string> = {
        full_name: fullName
      };
      if (invitationToken) {
        userData['pending_invitation_token'] = invitationToken;
      }

      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: userData,
          emailRedirectTo: redirectUrl
        }
      });

      if (error) throw error;

      // User profile is automatically created by database trigger
      // See migration: 20251113215904_handle_new_user_signup.sql

      return { data, error: null };
    } catch (error: unknown) {
      return { data: null, error };
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string) {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;

      return { data, error: null };
    } catch (error: unknown) {
      return { data: null, error };
    }
  }

  /**
   * Sign out
   */
  async signOut() {
    try {
      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;

      this.currentUserSubject.next(null);
      this.sessionSubject.next(null);

      return { error: null };
    } catch (error: unknown) {
      return { error };
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string) {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`
      });

      if (error) throw error;

      return { error: null };
    } catch (error: unknown) {
      return { error };
    }
  }

  /**
   * Update password
   */
  async updatePassword(newPassword: string) {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      return { error: null };
    } catch (error: unknown) {
      return { error };
    }
  }

  /**
   * Clear pending invitation token from user metadata
   * Called after successful invitation acceptance
   */
  async clearPendingInvitationToken(): Promise<void> {
    try {
      // Get current metadata and remove the pending_invitation_token
      const currentMetadata = this.currentUser?.user_metadata || {};
      const { pending_invitation_token: _removed, ...cleanedMetadata } = currentMetadata;

      await this.supabase.auth.updateUser({
        data: cleanedMetadata
      });
    } catch (error) {
      // Non-critical - just log and continue
      console.warn('Failed to clear pending invitation token from metadata:', error);
    }
  }

  /**
   * NOTE: createUserProfile() method removed
   * User profile creation is now handled automatically by database trigger
   * See migration: 20251113215904_handle_new_user_signup.sql
   */

  /**
   * Upload file to storage
   */
  async uploadFile(bucket: string, filePath: string, file: File) {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      return { data, error: null };
    } catch (error: unknown) {
      return { data: null, error };
    }
  }

  /**
   * Get public URL for a file
   */
  getPublicUrl(bucket: string, filePath: string): string {
    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  /**
   * Get a signed URL for a private file
   */
  async getSignedUrl(bucket: string, filePath: string, expiresInSeconds = 60 * 30) {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, expiresInSeconds);

      if (error) throw error;

      return { signedUrl: data.signedUrl as string, error: null };
    } catch (error: unknown) {
      return { signedUrl: '', error };
    }
  }

  /**
   * Download file from storage
   */
  async downloadFile(bucket: string, filePath: string) {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      return { data, error: null };
    } catch (error: unknown) {
      return { data: null, error };
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(bucket: string, filePath: string) {
    try {
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([filePath]);

      if (error) throw error;

      return { error: null };
    } catch (error: unknown) {
      return { error };
    }
  }

  /**
   * Check if new user signups are enabled
   * Calls the public database function that checks platform_settings
   *
   * NOTE: This method uses console.error directly because LoggerService
   * cannot be injected into SupabaseService (it would cause a circular dependency)
   * since LoggerService is a simple utility that doesn't depend on anything.
   *
   * @returns true if signups are enabled, false if disabled
   */
  async areSignupsEnabled(): Promise<boolean> {
    try {
      const { data, error } = await this.supabase.rpc('are_signups_enabled');

      if (error) {
        // Use console.error as LoggerService would cause circular dep
        if (!environment.production) {
          console.error('[SupabaseService] Error checking signup status:', error);
        }
        // Default to enabled if we can't check (fail open for better UX)
        return true;
      }

      return data === true;
    } catch (error) {
      // Use console.error as LoggerService would cause circular dep
      if (!environment.production) {
        console.error('[SupabaseService] Error checking signup status:', error);
      }
      return true; // Default to enabled on error
    }
  }
}
