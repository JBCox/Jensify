import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkeletonType = 'text' | 'circle' | 'rectangle' | 'card';

@Component({
  selector: 'app-loading-skeleton',
  imports: [CommonModule],
  templateUrl: './loading-skeleton.html',
  styleUrl: './loading-skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoadingSkeleton {
  @Input() type: SkeletonType = 'text';
  @Input() width = '100%';
  @Input() height = '16px';
  @Input() count = 1;

  get items(): number[] {
    return Array(this.count).fill(0).map((_, i) => i);
  }

  /**
   * TrackBy function for skeleton items - improves ngFor performance
   */
  trackByIndex(index: number): number {
    return index;
  }
}
