import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type MetricIconType = 'spend' | 'approvals' | 'budget' | 'recent' | 'pending' | 'reimbursed' | 'flagged';
export type ChangeType = 'positive' | 'negative' | 'neutral';

@Component({
  selector: 'app-metric-card',
  imports: [CommonModule, MatIconModule],
  templateUrl: './metric-card.html',
  styleUrl: './metric-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MetricCard {
  @Input() value = '0';
  @Input() label = '';
  @Input() icon = 'trending_up';
  @Input() iconType: MetricIconType = 'spend';
  @Input() change?: string;
  @Input() changeType?: ChangeType;
  @Input() loading = false;
}
