import { Component, EventEmitter, Input, Output } from "@angular/core";
import { CommonModule } from "@angular/common";
import { MatButtonModule } from "@angular/material/button";
import { MatDividerModule } from "@angular/material/divider";
import { MatIconModule } from "@angular/material/icon";

export interface TestStepResult {
  stepNumber: number;
  stepType: string;
  approverName: string;
  approverRole: string;
}

export interface TestResults {
  steps: TestStepResult[];
  estimatedHours: number;
}

@Component({
  selector: "app-workflow-test-panel",
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
  ],
  template: `
    <div class="form-section">
      <div class="section-header">
        <h3><mat-icon>science</mat-icon> Test Workflow</h3>
        <button mat-stroked-button type="button" (click)="runTest.emit()" color="primary" [disabled]="!canTest">
          <mat-icon>play_arrow</mat-icon>
          Preview Approval Chain
        </button>
      </div>
      <p class="section-hint">Preview how this workflow will route expenses through the approval chain.</p>

      @if (showResults && results) {
        <div class="test-results">
          <div class="approval-chain">
            <div class="chain-start">
              <mat-icon>assignment</mat-icon>
              <strong>Expense Submitted</strong>
            </div>

            @for (step of results.steps; track step.stepNumber) {
              <div class="chain-arrow">
                <mat-icon>arrow_downward</mat-icon>
              </div>
              <div class="chain-step">
                <div class="step-badge">Step {{step.stepNumber}}</div>
                <div class="step-info">
                  <strong>{{step.approverName}}</strong>
                  <span class="step-role">{{step.approverRole}}</span>
                </div>
                @if (step.approverName.includes('⚠️')) {
                  <mat-icon class="warning-icon" color="warn">warning</mat-icon>
                }
              </div>
            }

            <div class="chain-arrow">
              <mat-icon>arrow_downward</mat-icon>
            </div>
            <div class="chain-end">
              <mat-icon>check_circle</mat-icon>
              <strong>Approved</strong>
            </div>
          </div>

          <div class="test-metadata">
            <div class="metadata-item">
              <mat-icon>layers</mat-icon>
              <span><strong>{{results.steps.length}}</strong> approval step(s)</span>
            </div>
            <div class="metadata-item">
              <mat-icon>schedule</mat-icon>
              <span>Estimated time: <strong>~{{results.estimatedHours}} hours</strong></span>
            </div>
          </div>

          <button mat-stroked-button type="button" (click)="resetClicked.emit()" class="reset-test-btn">
            <mat-icon>refresh</mat-icon>
            Close Preview
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .form-section {
      margin: 24px 0;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .section-header h3 {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 0;
      font-size: 16px;
      font-weight: 500;
    }

    .section-hint {
      color: rgba(0, 0, 0, 0.54);
      font-size: 14px;
      margin-bottom: 16px;
    }

    .test-results {
      background: linear-gradient(135deg, color-mix(in srgb, var(--jensify-primary) 5%, transparent) 0%, color-mix(in srgb, var(--jensify-primary) 2%, transparent) 100%);
      border: 1px solid color-mix(in srgb, var(--jensify-primary) 20%, transparent);
      border-radius: 12px;
      padding: 24px;
      margin-top: 16px;
    }

    .approval-chain {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
    }

    .chain-start, .chain-end {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 500;
    }

    .chain-start {
      background: color-mix(in srgb, var(--jensify-primary) 10%, transparent);
      color: var(--jensify-primary, #FF5900);
    }

    .chain-end {
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
    }

    .chain-arrow {
      color: rgba(0, 0, 0, 0.3);
    }

    .chain-step {
      display: flex;
      align-items: center;
      gap: 12px;
      background: white;
      border: 1px solid rgba(0, 0, 0, 0.12);
      border-radius: 8px;
      padding: 12px 20px;
      min-width: 200px;
    }

    .step-badge {
      background: var(--jensify-primary, #FF5900);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }

    .step-info {
      display: flex;
      flex-direction: column;
    }

    .step-role {
      font-size: 12px;
      color: rgba(0, 0, 0, 0.54);
    }

    .warning-icon {
      color: #ff9800;
    }

    .test-metadata {
      display: flex;
      justify-content: center;
      gap: 24px;
      margin-top: 24px;
      padding-top: 16px;
      border-top: 1px solid rgba(0, 0, 0, 0.08);
    }

    .metadata-item {
      display: flex;
      align-items: center;
      gap: 8px;
      color: rgba(0, 0, 0, 0.7);
      font-size: 14px;
    }

    .metadata-item mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: rgba(0, 0, 0, 0.54);
    }

    .reset-test-btn {
      margin-top: 16px;
    }
  `],
})
export class WorkflowTestPanelComponent {
  @Input() canTest = false;
  @Input() showResults = false;
  @Input() results: TestResults | null = null;

  @Output() runTest = new EventEmitter<void>();
  @Output() resetClicked = new EventEmitter<void>();
}
