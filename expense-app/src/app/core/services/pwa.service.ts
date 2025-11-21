import { Injectable, ApplicationRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, interval, NEVER } from 'rxjs';
import { filter, first, map, switchMap, tap } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';

/**
 * PWA Service
 * Handles service worker updates, app installation, and offline detection
 */
@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private promptEvent: any;

  constructor(
    private updates: SwUpdate,
    private appRef: ApplicationRef,
    private snackBar: MatSnackBar
  ) {
    this.initUpdateCheck();
    this.listenForInstallPrompt();
  }

  /**
   * Check for updates every 6 hours when app is stable
   */
  private initUpdateCheck(): void {
    if (!this.updates.isEnabled) {
      console.log('Service Worker not enabled');
      return;
    }

    // Wait for app to stabilize, then check for updates every 6 hours
    const appIsStable$ = this.appRef.isStable.pipe(
      first(isStable => isStable === true)
    );
    const everySixHours$ = interval(6 * 60 * 60 * 1000); // 6 hours
    const everySixHoursOnceAppIsStable$ = concat(appIsStable$, everySixHours$);

    everySixHoursOnceAppIsStable$
      .pipe(
        switchMap(() => this.updates.checkForUpdate()),
        tap(updateAvailable => {
          if (updateAvailable) {
            console.log('Update available');
          }
        })
      )
      .subscribe();

    // Listen for version updates
    this.updates.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      )
      .subscribe(evt => {
        this.promptUserToUpdate();
      });
  }

  /**
   * Prompt user to reload for update
   */
  private promptUserToUpdate(): void {
    const snackBarRef = this.snackBar.open(
      'New version available!',
      'Reload',
      {
        duration: 0, // Don't auto-dismiss
        horizontalPosition: 'center',
        verticalPosition: 'bottom'
      }
    );

    snackBarRef.onAction().subscribe(() => {
      this.updates.activateUpdate().then(() => document.location.reload());
    });
  }

  /**
   * Listen for beforeinstallprompt event
   */
  private listenForInstallPrompt(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.promptEvent = e;
      console.log('Install prompt ready');
    });
  }

  /**
   * Check if app can be installed
   */
  canInstall(): boolean {
    return !!this.promptEvent;
  }

  /**
   * Show install prompt
   */
  async showInstallPrompt(): Promise<boolean> {
    if (!this.promptEvent) {
      return false;
    }

    this.promptEvent.prompt();
    const { outcome } = await this.promptEvent.userChoice;
    this.promptEvent = null;

    return outcome === 'accepted';
  }

  /**
   * Check if app is installed
   */
  isInstalled(): boolean {
    return window.matchMedia('(display-mode: standalone)').matches ||
           (window.navigator as any).standalone === true;
  }
}
