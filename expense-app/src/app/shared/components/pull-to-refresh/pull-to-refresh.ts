import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  signal,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

/**
 * Pull-to-Refresh Component
 *
 * A mobile-friendly pull-to-refresh indicator that can be placed at the top of list views.
 * Works as an overlay that appears when users pull down while at the top of the page.
 *
 * Usage:
 * <app-pull-to-refresh
 *   [isRefreshing]="loading()"
 *   (refresh)="onRefresh()">
 * </app-pull-to-refresh>
 */
@Component({
  selector: 'app-pull-to-refresh',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <!-- Pull indicator overlay -->
    <div class="pull-refresh-indicator"
         #indicator
         [class.visible]="pullDistance() > 10"
         [class.ready]="isReady()"
         [class.refreshing]="refreshing"
         [style.height.px]="indicatorHeight"
         [style.opacity]="Math.min(pullDistance() / threshold, 1)">
      @if (refreshing) {
        <mat-spinner diameter="24" color="primary"></mat-spinner>
        <span class="pull-text">Refreshing...</span>
      } @else if (isReady()) {
        <mat-icon class="pull-icon ready">refresh</mat-icon>
        <span class="pull-text ready">Release to refresh</span>
      } @else {
        <mat-icon class="pull-icon" [style.transform]="'rotate(' + Math.min(pullDistance() * 3, 180) + 'deg)'">arrow_downward</mat-icon>
        <span class="pull-text">Pull down to refresh</span>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .pull-refresh-indicator {
      display: none;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: linear-gradient(180deg, var(--jensify-surface-subtle, #f8f8f8) 0%, transparent 100%);
      overflow: hidden;
      transition: opacity 0.2s ease;
    }

    .pull-refresh-indicator.visible {
      display: flex;
    }

    .pull-refresh-indicator.refreshing {
      display: flex;
      opacity: 1 !important;
    }

    .pull-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: var(--jensify-text-muted, #666);
      transition: transform 0.1s linear, color 0.2s ease;
    }

    .pull-icon.ready {
      color: var(--jensify-primary, #FF5900);
      animation: pulse 0.5s ease infinite alternate;
    }

    .pull-text {
      font-size: 13px;
      color: var(--jensify-text-muted, #666);
      font-weight: 500;
      transition: color 0.2s ease;
    }

    .pull-text.ready {
      color: var(--jensify-primary, #FF5900);
    }

    @keyframes pulse {
      from { transform: scale(1); }
      to { transform: scale(1.1); }
    }

    /* Only show on touch devices */
    @media (hover: hover) and (pointer: fine) {
      :host {
        display: none !important;
      }
    }
  `],
  host: {
    '(document:touchstart)': 'onTouchStart($event)',
    '(document:touchmove)': 'onTouchMove($event)',
    '(document:touchend)': 'onTouchEnd()',
  }
})
export class PullToRefresh {
  @Input() disabled = false;
  @Input() threshold = 60; // Distance needed to trigger refresh
  @Input() indicatorHeight = 50;
  @Input() refreshing = false; // Controlled from parent

  @Output() refresh = new EventEmitter<void>();

  @ViewChild('indicator') indicator!: ElementRef;

  pullDistance = signal(0);
  isReady = signal(false);

  private startY = 0;
  private isDragging = false;

  // Expose Math to template
  Math = Math;

  onTouchStart(event: TouchEvent): void {
    if (this.disabled || this.refreshing) return;

    // Only start if we're at the top of the scroll container
    if (!this.isAtTop()) return;

    this.startY = event.touches[0].clientY;
    this.isDragging = true;
  }

  onTouchMove(event: TouchEvent): void {
    if (this.disabled || this.refreshing || !this.isDragging) return;

    // If we've scrolled down, cancel
    if (!this.isAtTop()) {
      this.resetPull();
      return;
    }

    const currentY = event.touches[0].clientY;
    const diff = currentY - this.startY;

    if (diff > 0) {
      // Apply resistance
      const resistance = 0.4;
      const distance = Math.min(diff * resistance, this.indicatorHeight + 20);
      this.pullDistance.set(distance);
      this.isReady.set(distance >= this.threshold);

      // Prevent default scroll behavior when pulling
      if (diff > 5) {
        event.preventDefault();
      }
    } else {
      this.resetPull();
    }
  }

  onTouchEnd(): void {
    if (this.disabled || this.refreshing || !this.isDragging) return;

    this.isDragging = false;

    if (this.pullDistance() >= this.threshold) {
      this.triggerRefresh();
    } else {
      this.resetPull();
    }
  }

  private triggerRefresh(): void {
    this.isReady.set(false);
    this.pullDistance.set(0);
    this.refresh.emit();
  }

  private resetPull(): void {
    this.pullDistance.set(0);
    this.isReady.set(false);
    this.isDragging = false;
    this.startY = 0;
  }

  private isAtTop(): boolean {
    // Check various scroll positions
    return window.scrollY <= 0 &&
           document.documentElement.scrollTop <= 0 &&
           document.body.scrollTop <= 0;
  }
}
