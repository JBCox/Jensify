import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from './core/services/auth.service';
import { KeyboardShortcutsService } from './core/services/keyboard-shortcuts.service';
import { Observable, Subject, combineLatest, map, filter, fromEvent } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { User } from './core/models/user.model';
import { SidebarNav } from './core/components/sidebar-nav/sidebar-nav';
import { NotificationCenterComponent } from './shared/components/notification-center/notification-center';
import { ShortcutsHelpDialog } from './shared/components/shortcuts-help-dialog/shortcuts-help-dialog';
import { Breadcrumbs } from './shared/components/breadcrumbs/breadcrumbs';
import { InstallPrompt } from './shared/components/install-prompt/install-prompt';
import { OfflineIndicator } from './shared/components/offline-indicator/offline-indicator';

interface ShellViewModel {
  profile: User | null;
  isAuthenticated: boolean;
  displayName: string;
  email: string;
}

/**
 * Root application component with navigation
 */
@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    SidebarNav,
    NotificationCenterComponent,
    Breadcrumbs,
    InstallPrompt,
    OfflineIndicator
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss'
,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App implements OnInit, OnDestroy {
  // Cleanup
  private destroy$ = new Subject<void>();

  vm$: Observable<ShellViewModel>;
  isSidebarOpen = false;
  isAuthRoute = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private dialog: MatDialog,
    private keyboardShortcuts: KeyboardShortcutsService
  ) {
    this.isAuthRoute = this.router.url.startsWith('/auth');
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event) => {
        this.isAuthRoute = event.urlAfterRedirects.startsWith('/auth');
      });

    this.vm$ = combineLatest([this.authService.userProfile$, this.authService.session$]).pipe(
      map(([profile, session]) => {
        const sessionMetadata = (session?.user?.user_metadata ?? {}) as Record<string, any>;
        const email = profile?.email || session?.user?.email || sessionMetadata['email'] || '';
        const displayName =
          profile?.full_name ||
          sessionMetadata['full_name'] ||
          sessionMetadata['name'] ||
          email ||
          'User';
        return {
          profile,
          isAuthenticated: !!session,
          displayName,
          email
        };
      })
    );
  }

  ngOnInit(): void {
    this.setupKeyboardShortcuts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Toggle sidebar on mobile
   */
  toggleSidebar(): void {
    this.isSidebarOpen = !this.isSidebarOpen;
  }

  /**
   * Close sidebar
   */
  closeSidebar(): void {
    this.isSidebarOpen = false;
  }

  /**
   * Set up keyboard shortcuts listeners
   */
  private setupKeyboardShortcuts(): void {
    // Listen for show help event
    fromEvent(window, 'keyboard:show-help')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.openShortcutsHelp();
      });

    // Listen for escape event to close dialogs
    fromEvent(window, 'keyboard:escape')
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        // Close any open dialogs
        this.dialog.closeAll();
      });
  }

  /**
   * Open keyboard shortcuts help dialog
   */
  openShortcutsHelp(): void {
    this.dialog.open(ShortcutsHelpDialog, {
      width: '600px',
      maxWidth: '95vw',
      panelClass: 'shortcuts-dialog-panel'
    });
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    await this.authService.signOut();
  }
}
