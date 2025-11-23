import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
  selector: 'app-empty-state',
  imports: [CommonModule, MatIconModule, MatButtonModule],
  templateUrl: './empty-state.html',
  styleUrl: './empty-state.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmptyState {
  @Input() icon = 'inbox';
  @Input() title = 'No data available';
  @Input() message = '';
  @Input() actionLabel?: string;
  @Input() actionIcon?: string;
  @Output() action = new EventEmitter<void>();

  onActionClick(): void {
    this.action.emit();
  }
}
