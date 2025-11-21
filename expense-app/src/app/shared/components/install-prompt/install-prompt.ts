import { Component, ChangeDetectionStrategy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { PwaService } from '../../../core/services/pwa.service';

/**
 * Install Prompt Component
 * Shows banner to install app if PWA is installable
 */
@Component({
  selector: 'app-install-prompt',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatCardModule],
  template: `
    @if (showPrompt()) {
      <div class="install-banner">
        <mat-card class="install-card">
          <div class="install-content">
            <mat-icon class="install-icon">get_app</mat-icon>
            <div class="install-text">
              <h3>Install Jensify</h3>
              <p>Get quick access and offline support</p>
            </div>
          </div>
          <div class="install-actions">
            <button mat-button (click)="dismiss()">
              Maybe Later
            </button>
            <button mat-raised-button color="primary" (click)="install()">
              Install
            </button>
          </div>
        </mat-card>
      </div>
    }
  `,
  styles: [`
    .install-banner {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      max-width: 500px;
      width: calc(100% - 32px);
    }

    .install-card {
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .install-content {
      display: flex;
      align-items: center;
      gap: 16px;
      margin-bottom: 16px;
    }

    .install-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      color: #FF5900;
    }

    .install-text h3 {
      margin: 0 0 4px 0;
      font-size: 18px;
      font-weight: 500;
    }

    .install-text p {
      margin: 0;
      color: rgba(0, 0, 0, 0.6);
      font-size: 14px;
    }

    .install-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class InstallPrompt {
  showPrompt = signal(false);

  constructor(private pwaService: PwaService) {
    // Check if we should show the prompt
    setTimeout(() => {
      if (this.pwaService.canInstall() && !this.pwaService.isInstalled()) {
        const dismissed = localStorage.getItem('jensify_install_dismissed');
        if (!dismissed || Date.now() - parseInt(dismissed) > 7 * 24 * 60 * 60 * 1000) {
          this.showPrompt.set(true);
        }
      }
    }, 3000); // Show after 3 seconds
  }

  async install(): Promise<void> {
    const installed = await this.pwaService.showInstallPrompt();
    if (installed) {
      this.showPrompt.set(false);
      localStorage.removeItem('jensify_install_dismissed');
    }
  }

  dismiss(): void {
    this.showPrompt.set(false);
    localStorage.setItem('jensify_install_dismissed', Date.now().toString());
  }
}
