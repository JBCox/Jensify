import { Component, ChangeDetectionStrategy, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { fromEvent, merge, of, Subject, Subscription } from 'rxjs';
import { map, takeUntil } from 'rxjs/operators';

/**
 * Offline Indicator Component
 * Shows banner when app is offline
 */
@Component({
  selector: 'app-offline-indicator',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    @if (!isOnline()) {
      <div class="offline-banner">
        <mat-icon>cloud_off</mat-icon>
        <span>You're offline. Some features may be limited.</span>
      </div>
    }
  `,
  styles: [`
    .offline-banner {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #F44336;
      color: white;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 2000;
      font-size: 14px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
    }

    .offline-banner mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OfflineIndicator implements OnInit, OnDestroy {
  isOnline = signal(navigator.onLine);
  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    merge(
      of(navigator.onLine),
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    )
      .pipe(takeUntil(this.destroy$))
      .subscribe(online => {
        this.isOnline.set(online);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
