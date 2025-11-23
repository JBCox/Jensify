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
    } catch (error) {
      console.error('Error initializing session:', error);
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
   * Sign up with email and password
   */
  async signUp(email: string, password: string, fullName: string) {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) throw error;

      // User profile is automatically created by database trigger
      // See migration: 20251113215904_handle_new_user_signup.sql

      return { data, error: null };
    } catch (error: unknown) {
      console.error('Sign up error:', error);
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
      console.error('Sign in error:', error);
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
      console.error('Sign out error:', error);
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
      console.error('Reset password error:', error);
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
      console.error('Update password error:', error);
      return { error };
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
      console.error('Upload file error:', error);
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
      console.error('Create signed URL error:', error);
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
      console.error('Download file error:', error);
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
      console.error('Delete file error:', error);
      return { error };
    }
  }
}
