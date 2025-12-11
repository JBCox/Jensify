import { Injectable, ApplicationRef, inject } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { concat, interval } from 'rxjs';
import { filter, first, switchMap } from 'rxjs/operators';
import { MatSnackBar } from '@angular/material/snack-bar';
import { PWA, SNACKBAR_DURATION } from '../../shared/constants/ui.constants';

/**
 * BeforeInstallPromptEvent interface
 * Represents the browser's install prompt event for PWA installation
 * Not officially part of TypeScript's DOM types, so we define it here
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Extended Navigator interface to include iOS standalone property
 */
interface NavigatorStandalone extends Navigator {
  standalone?: boolean;
}

/**
 * PWA Service
 * Handles service worker updates, app installation, and offline detection
 */
@Injectable({
  providedIn: 'root'
})
export class PwaService {
  private updates = inject(SwUpdate);
  private appRef = inject(ApplicationRef);
  private snackBar = inject(MatSnackBar);

  private promptEvent: BeforeInstallPromptEvent | null = null;

  constructor() {
    this.initUpdateCheck();
    this.listenForInstallPrompt();
  }

  /**
   * Check for updates every 6 hours when app is stable
   */
  private initUpdateCheck(): void {
    if (!this.updates.isEnabled) {
      return;
    }

    // Wait for app to stabilize, then check for updates every 6 hours
    const appIsStable$ = this.appRef.isStable.pipe(
      first(isStable => isStable === true)
    );
    const everySixHours$ = interval(PWA.UPDATE_CHECK_INTERVAL);
    const everySixHoursOnceAppIsStable$ = concat(appIsStable$, everySixHours$);

    everySixHoursOnceAppIsStable$
      .pipe(
        switchMap(() => this.updates.checkForUpdate())
      )
      .subscribe();

    // Listen for version updates
    this.updates.versionUpdates
      .pipe(
        filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY')
      )
      .subscribe(_evt => {
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
        duration: SNACKBAR_DURATION.PERSISTENT,
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
    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.promptEvent = e as BeforeInstallPromptEvent;
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
           (window.navigator as NavigatorStandalone).standalone === true;
  }
}
