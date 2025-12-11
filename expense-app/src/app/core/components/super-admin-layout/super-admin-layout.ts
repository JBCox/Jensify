import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../services/auth.service';
import { ThemeService } from '../../services/theme.service';
import { SuperAdminSidebar } from '../super-admin-sidebar/super-admin-sidebar';
import { Subject } from 'rxjs';

/**
 * Super Admin Layout Component
 *
 * Provides a completely separate UI shell for platform owners.
 * - Dark themed toolbar
 * - Super admin specific sidebar (no expense features)
 * - Minimal, focused interface
 */
@Component({
  selector: 'app-super-admin-layout',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    SuperAdminSidebar,
  ],
  templateUrl: './super-admin-layout.html',
  styleUrl: './super-admin-layout.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminLayout implements OnDestroy {
  private authService = inject(AuthService);
  themeService = inject(ThemeService);

  private destroy$ = new Subject<void>();

  isSidebarOpen = false;
  isSidebarCollapsed = false;

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
   * Handle sidebar collapsed state change
   */
  onSidebarCollapsedChange(collapsed: boolean): void {
    this.isSidebarCollapsed = collapsed;
  }

  /**
   * Toggle dark/light theme
   */
  toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  /**
   * Sign out the current user
   */
  async signOut(): Promise<void> {
    await this.authService.signOut();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
