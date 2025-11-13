import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private sessionSubject = new BehaviorSubject<Session | null>(null);

  public currentUser$: Observable<User | null> = this.currentUserSubject.asObservable();
  public session$: Observable<Session | null> = this.sessionSubject.asObservable();

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
      console.log('Auth state changed:', event);
      this.sessionSubject.next(session);
      this.currentUserSubject.next(session?.user || null);
    });
  }

  private async initializeSession(): Promise<void> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      this.sessionSubject.next(session);
      this.currentUserSubject.next(session?.user || null);
    } catch (error) {
      console.error('Error initializing session:', error);
    }
  }

  /**
   * Get the Supabase client instance
   */
  get client(): SupabaseClient {
    return this.supabase;
  }

  /**
   * Get current user
   */
  get currentUser(): User | null {
    return this.currentUserSubject.value;
  }

  /**
   * Get current session
   */
  get currentSession(): Session | null {
    return this.sessionSubject.value;
  }

  /**
   * Check if user is authenticated
   */
  get isAuthenticated(): boolean {
    return this.currentSession !== null;
  }

  /**
   * Get current user's ID
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
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) throw error;

      return { error: null };
    } catch (error: any) {
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
    } catch (error: any) {
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
    } catch (error: any) {
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
   * Download file from storage
   */
  async downloadFile(bucket: string, filePath: string) {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .download(filePath);

      if (error) throw error;

      return { data, error: null };
    } catch (error: any) {
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
    } catch (error: any) {
      console.error('Delete file error:', error);
      return { error };
    }
  }
}
