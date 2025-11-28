import { Component, Input } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatCardModule } from "@angular/material/card";
import { MatIconModule } from "@angular/material/icon";

export interface TimelineItem {
  label: string;
  value: string;
}

@Component({
  selector: "app-report-timeline",
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule],
  template: `
    <mat-card class="jensify-card timeline-card">
      <div class="card-header">
        <div class="header-title">
          <mat-icon>timeline</mat-icon>
          <h3>Timeline</h3>
        </div>
      </div>

      <div class="timeline">
        @for (item of items; track item.label) {
          <div class="timeline-item">
            <span class="timeline-label">{{ item.label }}</span>
            <span class="timeline-value">{{ formatDate(item.value) }}</span>
          </div>
        }
      </div>
    </mat-card>
  `,
  styles: [`
    .timeline-card {
      height: fit-content;
    }

    .card-header {
      margin-bottom: 16px;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-title h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 500;
    }

    .header-title mat-icon {
      color: var(--jensify-primary, #FF5900);
    }

    .timeline {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .timeline-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 12px;
      background: rgba(0, 0, 0, 0.02);
      border-radius: 8px;
    }

    .timeline-label {
      font-weight: 500;
      color: rgba(0, 0, 0, 0.7);
    }

    .timeline-value {
      color: rgba(0, 0, 0, 0.54);
      font-size: 14px;
    }
  `],
})
export class ReportTimelineComponent {
  @Input() items: TimelineItem[] = [];

  formatDate(dateString?: string | null): string {
    if (!dateString) return "—";
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
}
