import { ChangeDetectionStrategy, Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatListModule } from '@angular/material/list';
import { MatDividerModule } from '@angular/material/divider';
import { Router } from '@angular/router';
import { EmailExpenseService } from '../../../core/services/email-expense.service';
import { NotificationService } from '../../../core/services/notification.service';
import { Clipboard } from '@angular/cdk/clipboard';
import {
  EmailInboxConfig,
  UserEmailAlias,
  InboundEmail,
  EmailProcessingStats,
  EMAIL_STATUS_CONFIG,
  EMAIL_SUBMISSION_INSTRUCTIONS,
  EmailProcessingStatus
} from '../../../core/models/email-expense.model';

@Component({
  selector: 'app-email-expense-settings',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatTabsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatListModule,
    MatDividerModule,
    DatePipe
  ],
  template: `
    <div class="email-expense-container">
      <header class="page-header">
        <div class="header-content">
          <button mat-icon-button (click)="goBack()" class="back-button">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <div class="header-text">
            <h1>Email-to-Expense</h1>
            <p>Submit expenses by forwarding receipts to your inbox</p>
          </div>
        </div>
      </header>

      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
          <span>Loading email settings...</span>
        </div>
      } @else {
        <!-- Status Banner -->
        <mat-card class="status-banner" [class.enabled]="inboxConfig()?.is_enabled" [class.disabled]="!inboxConfig()?.is_enabled">
          <mat-card-content>
            <div class="status-icon">
              <mat-icon>{{ inboxConfig()?.is_enabled ? 'check_circle' : 'pause_circle' }}</mat-icon>
            </div>
            <div class="status-text">
              <h3>Email Submission is {{ inboxConfig()?.is_enabled ? 'Enabled' : 'Disabled' }}</h3>
              @if (inboxConfig()?.inbox_address) {
                <p class="inbox-address">
                  <strong>Inbox:</strong> {{ inboxConfig()!.inbox_address }}
                  <button mat-icon-button matTooltip="Copy" (click)="copyToClipboard(inboxConfig()!.inbox_address)">
                    <mat-icon>content_copy</mat-icon>
                  </button>
                </p>
              }
            </div>
            <mat-slide-toggle
              [checked]="inboxConfig()?.is_enabled"
              (change)="toggleEnabled($event.checked)"
              [disabled]="!inboxConfig()">
              {{ inboxConfig()?.is_enabled ? 'On' : 'Off' }}
            </mat-slide-toggle>
          </mat-card-content>
        </mat-card>

        <!-- Stats Cards -->
        @if (stats()) {
          <div class="stats-cards">
            <mat-card class="stat-card">
              <mat-card-content>
                <div class="stat-icon total">
                  <mat-icon>email</mat-icon>
                </div>
                <div class="stat-info">
                  <span class="stat-value">{{ stats()!.total_emails }}</span>
                  <span class="stat-label">Total Emails</span>
                </div>
              </mat-card-content>
            </mat-card>

            <mat-card class="stat-card">
              <mat-card-content>
                <div class="stat-icon processed">
                  <mat-icon>check_circle</mat-icon>
                </div>
                <div class="stat-info">
                  <span class="stat-value">{{ stats()!.processed_count }}</span>
                  <span class="stat-label">Processed</span>
                </div>
              </mat-card-content>
            </mat-card>

            <mat-card class="stat-card">
              <mat-card-content>
                <div class="stat-icon expenses">
                  <mat-icon>receipt_long</mat-icon>
                </div>
                <div class="stat-info">
                  <span class="stat-value">{{ stats()!.expenses_created }}</span>
                  <span class="stat-label">Expenses Created</span>
                </div>
              </mat-card-content>
            </mat-card>

            <mat-card class="stat-card">
              <mat-card-content>
                <div class="stat-icon failed">
                  <mat-icon>error</mat-icon>
                </div>
                <div class="stat-info">
                  <span class="stat-value">{{ stats()!.failed_count }}</span>
                  <span class="stat-label">Failed</span>
                </div>
              </mat-card-content>
            </mat-card>
          </div>
        }

        <mat-tab-group animationDuration="200ms">
          <!-- How It Works Tab -->
          <mat-tab label="How It Works">
            <div class="tab-content">
              <div class="instructions-section">
                <h2>Submit Expenses via Email</h2>
                <p class="intro">Forward your receipt emails to automatically create expense drafts.</p>

                <div class="steps-grid">
                  <div class="step-card">
                    <div class="step-number">1</div>
                    <h3>Forward Receipt</h3>
                    <p>Forward any receipt email to your organization's expense inbox</p>
                  </div>
                  <div class="step-card">
                    <div class="step-number">2</div>
                    <h3>Auto-Processing</h3>
                    <p>Our system extracts receipt data using OCR technology</p>
                  </div>
                  <div class="step-card">
                    <div class="step-number">3</div>
                    <h3>Review Draft</h3>
                    <p>A draft expense is created for your review and submission</p>
                  </div>
                </div>

                <mat-card class="tips-card">
                  <mat-card-header>
                    <mat-icon mat-card-avatar>lightbulb</mat-icon>
                    <mat-card-title>Tips for Best Results</mat-card-title>
                  </mat-card-header>
                  <mat-card-content>
                    <ul class="tips-list">
                      @for (tip of tips; track $index) {
                        <li>
                          <mat-icon>check</mat-icon>
                          {{ tip }}
                        </li>
                      }
                    </ul>
                  </mat-card-content>
                </mat-card>
              </div>
            </div>
          </mat-tab>

          <!-- My Email Aliases Tab -->
          <mat-tab label="My Email Aliases">
            <div class="tab-content">
              <div class="section-header">
                <h2>Registered Email Addresses</h2>
                <p>Emails sent from these addresses will be linked to your account</p>
              </div>

              @if (emailAliases().length === 0) {
                <div class="empty-state">
                  <mat-icon>alternate_email</mat-icon>
                  <h3>No Email Aliases</h3>
                  <p>Add email addresses that you'll use to forward receipts</p>
                </div>
              } @else {
                <div class="aliases-list">
                  @for (alias of emailAliases(); track alias.id) {
                    <mat-card class="alias-card">
                      <mat-card-content>
                        <div class="alias-info">
                          <mat-icon>email</mat-icon>
                          <span class="alias-email">{{ alias.email }}</span>
                          @if (alias.is_verified) {
                            <mat-chip class="verified-chip">Verified</mat-chip>
                          } @else {
                            <mat-chip class="pending-chip">Pending Verification</mat-chip>
                          }
                        </div>
                        <div class="alias-actions">
                          @if (!alias.is_verified) {
                            <button mat-stroked-button color="primary" (click)="resendVerification(alias)">
                              Resend Verification
                            </button>
                          }
                          <button mat-icon-button matTooltip="Remove" (click)="removeAlias(alias)">
                            <mat-icon>delete</mat-icon>
                          </button>
                        </div>
                      </mat-card-content>
                    </mat-card>
                  }
                </div>
              }

              <mat-card class="add-alias-card">
                <mat-card-header>
                  <mat-card-title>Add Email Address</mat-card-title>
                </mat-card-header>
                <mat-card-content>
                  <form [formGroup]="aliasForm" (ngSubmit)="addAlias()" class="add-alias-form">
                    <mat-form-field appearance="outline">
                      <mat-label>Email Address</mat-label>
                      <input matInput formControlName="email" type="email" placeholder="your.email@example.com">
                      <mat-error>Please enter a valid email</mat-error>
                    </mat-form-field>
                    <button mat-flat-button color="primary" type="submit" [disabled]="aliasForm.invalid || addingAlias()">
                      @if (addingAlias()) {
                        <mat-spinner diameter="20"></mat-spinner>
                      } @else {
                        <ng-container><mat-icon>add</mat-icon> Add Email</ng-container>
                      }
                    </button>
                  </form>
                </mat-card-content>
              </mat-card>
            </div>
          </mat-tab>

          <!-- Configuration Tab (Admin) -->
          <mat-tab label="Configuration">
            <div class="tab-content">
              @if (!inboxConfig()) {
                <div class="empty-state">
                  <mat-icon>settings</mat-icon>
                  <h3>Email Inbox Not Configured</h3>
                  <p>Contact your administrator to set up email expense submission</p>
                </div>
              } @else {
                <div class="config-sections">
                  <mat-card class="config-card">
                    <mat-card-header>
                      <mat-card-title>Processing Settings</mat-card-title>
                    </mat-card-header>
                    <mat-card-content>
                      <div class="config-toggles">
                        <div class="config-toggle">
                          <div class="toggle-info">
                            <span class="toggle-label">Auto-Create Expense</span>
                            <span class="toggle-desc">Automatically create draft expenses from emails</span>
                          </div>
                          <mat-slide-toggle
                            [checked]="inboxConfig()!.auto_create_expense"
                            (change)="updateConfig({ auto_create_expense: $event.checked })">
                          </mat-slide-toggle>
                        </div>

                        <mat-divider></mat-divider>

                        <div class="config-toggle">
                          <div class="toggle-info">
                            <span class="toggle-label">Require Attachment</span>
                            <span class="toggle-desc">Only process emails with receipt attachments</span>
                          </div>
                          <mat-slide-toggle
                            [checked]="inboxConfig()!.require_attachment"
                            (change)="updateConfig({ require_attachment: $event.checked })">
                          </mat-slide-toggle>
                        </div>

                        <mat-divider></mat-divider>

                        <div class="config-toggle">
                          <div class="toggle-info">
                            <span class="toggle-label">Require Verified Sender</span>
                            <span class="toggle-desc">Only accept emails from verified user addresses</span>
                          </div>
                          <mat-slide-toggle
                            [checked]="inboxConfig()!.require_verified_sender"
                            (change)="updateConfig({ require_verified_sender: $event.checked })">
                          </mat-slide-toggle>
                        </div>
                      </div>
                    </mat-card-content>
                  </mat-card>

                  <mat-card class="config-card">
                    <mat-card-header>
                      <mat-card-title>Notifications</mat-card-title>
                    </mat-card-header>
                    <mat-card-content>
                      <div class="config-toggles">
                        <div class="config-toggle">
                          <div class="toggle-info">
                            <span class="toggle-label">Confirmation Email</span>
                            <span class="toggle-desc">Send confirmation when expense is created</span>
                          </div>
                          <mat-slide-toggle
                            [checked]="inboxConfig()!.notify_on_receipt"
                            (change)="updateConfig({ notify_on_receipt: $event.checked })">
                          </mat-slide-toggle>
                        </div>

                        <mat-divider></mat-divider>

                        <div class="config-toggle">
                          <div class="toggle-info">
                            <span class="toggle-label">Error Notifications</span>
                            <span class="toggle-desc">Notify users when email processing fails</span>
                          </div>
                          <mat-slide-toggle
                            [checked]="inboxConfig()!.notify_on_error"
                            (change)="updateConfig({ notify_on_error: $event.checked })">
                          </mat-slide-toggle>
                        </div>
                      </div>
                    </mat-card-content>
                  </mat-card>

                  <mat-card class="config-card">
                    <mat-card-header>
                      <mat-card-title>Default Category</mat-card-title>
                    </mat-card-header>
                    <mat-card-content>
                      <mat-form-field appearance="outline" class="full-width">
                        <mat-label>Default Expense Category</mat-label>
                        <input matInput
                               [value]="inboxConfig()!.default_category || ''"
                               (blur)="updateConfig({ default_category: $any($event.target).value || null })"
                               placeholder="e.g., Meals & Entertainment">
                        <mat-hint>Category assigned to email-created expenses</mat-hint>
                      </mat-form-field>
                    </mat-card-content>
                  </mat-card>
                </div>
              }
            </div>
          </mat-tab>

          <!-- Recent Emails Tab -->
          <mat-tab label="Recent Emails">
            <div class="tab-content">
              <div class="section-header">
                <h2>Recent Inbound Emails</h2>
                <button mat-stroked-button (click)="loadRecentEmails()">
                  <mat-icon>refresh</mat-icon>
                  Refresh
                </button>
              </div>

              @if (recentEmails().length === 0) {
                <div class="empty-state">
                  <mat-icon>inbox</mat-icon>
                  <h3>No Recent Emails</h3>
                  <p>Forwarded emails will appear here</p>
                </div>
              } @else {
                <div class="emails-list">
                  @for (email of recentEmails(); track email.id) {
                    <mat-card class="email-card">
                      <mat-card-content>
                        <div class="email-main">
                          <div class="email-from">
                            <mat-icon>person</mat-icon>
                            <span>{{ email.from_address }}</span>
                          </div>
                          <div class="email-subject">{{ email.subject || '(No subject)' }}</div>
                          <div class="email-meta">
                            <span class="email-date">{{ email.received_at | date:'short' }}</span>
                            @if (email.attachment_count > 0) {
                              <span class="email-attachments">
                                <mat-icon>attach_file</mat-icon>
                                {{ email.attachment_count }}
                              </span>
                            }
                          </div>
                        </div>
                        <div class="email-status">
                          <mat-chip [class]="'status-' + email.status">
                            <mat-icon>{{ getStatusIcon(email.status) }}</mat-icon>
                            {{ getStatusLabel(email.status) }}
                          </mat-chip>
                        </div>
                      </mat-card-content>
                      @if (email.error_message) {
                        <mat-card-footer class="error-footer">
                          <mat-icon>warning</mat-icon>
                          {{ email.error_message }}
                        </mat-card-footer>
                      }
                    </mat-card>
                  }
                </div>
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      }
    </div>
  `,
  styles: [`
    .email-expense-container {
      padding: 24px;
      max-width: 1200px;
      margin: 0 auto;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
    }

    .header-content {
      display: flex;
      align-items: flex-start;
      gap: 12px;
    }

    .back-button {
      margin-top: 4px;
    }

    .header-text h1 {
      font-size: 28px;
      font-weight: 600;
      margin: 0;
      color: var(--jensify-text-primary, #1a1a2e);
    }

    .header-text p {
      margin: 4px 0 0;
      color: var(--jensify-text-secondary, #666);
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 64px;
      gap: 16px;
      color: var(--jensify-text-secondary, #666);
    }

    .status-banner {
      margin-bottom: 24px;
    }

    .status-banner mat-card-content {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 24px !important;
    }

    .status-banner.enabled {
      border-left: 4px solid #4caf50;
    }

    .status-banner.disabled {
      border-left: 4px solid #9e9e9e;
    }

    .status-icon {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .status-banner.enabled .status-icon {
      background: rgba(76, 175, 80, 0.1);
      color: #4caf50;
    }

    .status-banner.disabled .status-icon {
      background: rgba(158, 158, 158, 0.1);
      color: #9e9e9e;
    }

    .status-text {
      flex: 1;
    }

    .status-text h3 {
      margin: 0 0 4px;
      font-size: 18px;
    }

    .status-text .inbox-address {
      margin: 0;
      color: var(--jensify-text-secondary, #666);
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .inbox-address button {
      width: 28px;
      height: 28px;
    }

    .inbox-address button mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .stats-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }

    .stat-card mat-card-content {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px !important;
    }

    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .stat-icon.total { background: rgba(255, 89, 0, 0.1); color: var(--jensify-primary, #ff5900); }
    .stat-icon.processed { background: rgba(76, 175, 80, 0.1); color: #4caf50; }
    .stat-icon.expenses { background: rgba(33, 150, 243, 0.1); color: #2196f3; }
    .stat-icon.failed { background: rgba(244, 67, 54, 0.1); color: #f44336; }

    .stat-info {
      display: flex;
      flex-direction: column;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: var(--jensify-text-primary, #1a1a2e);
    }

    .stat-label {
      font-size: 13px;
      color: var(--jensify-text-secondary, #666);
    }

    .tab-content {
      padding: 24px 0;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .section-header h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 0;
    }

    .section-header p {
      margin: 4px 0 0;
      color: var(--jensify-text-secondary, #666);
      font-size: 14px;
    }

    .empty-state {
      text-align: center;
      padding: 64px 24px;
      background: var(--jensify-surface-variant, #f5f5f5);
      border-radius: 12px;
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      color: var(--jensify-text-secondary, #999);
      margin-bottom: 16px;
    }

    .empty-state h3 {
      font-size: 18px;
      margin: 0 0 8px;
    }

    .empty-state p {
      color: var(--jensify-text-secondary, #666);
      margin: 0;
    }

    /* Instructions Tab */
    .instructions-section {
      max-width: 800px;
    }

    .instructions-section h2 {
      font-size: 24px;
      margin: 0 0 8px;
    }

    .instructions-section .intro {
      font-size: 16px;
      color: var(--jensify-text-secondary, #666);
      margin-bottom: 32px;
    }

    .steps-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }

    .step-card {
      text-align: center;
      padding: 24px;
      background: var(--jensify-surface, #fff);
      border-radius: 12px;
      border: 1px solid var(--jensify-border, #e0e0e0);
    }

    .step-number {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: var(--jensify-primary, #ff5900);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      font-weight: 700;
      margin: 0 auto 16px;
    }

    .step-card h3 {
      margin: 0 0 8px;
      font-size: 16px;
    }

    .step-card p {
      margin: 0;
      font-size: 14px;
      color: var(--jensify-text-secondary, #666);
    }

    .tips-card mat-icon[mat-card-avatar] {
      background: rgba(255, 193, 7, 0.1);
      color: #ffc107;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .tips-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    .tips-list li {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 8px 0;
    }

    .tips-list mat-icon {
      color: #4caf50;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    /* Aliases Tab */
    .aliases-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 24px;
    }

    .alias-card mat-card-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px !important;
    }

    .alias-info {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .alias-info mat-icon {
      color: var(--jensify-text-secondary, #666);
    }

    .alias-email {
      font-weight: 500;
    }

    .verified-chip {
      background: rgba(76, 175, 80, 0.1) !important;
      color: #2e7d32 !important;
    }

    .pending-chip {
      background: rgba(255, 193, 7, 0.1) !important;
      color: #f57f17 !important;
    }

    .alias-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .add-alias-card {
      max-width: 500px;
    }

    .add-alias-form {
      display: flex;
      gap: 16px;
      align-items: flex-start;
    }

    .add-alias-form mat-form-field {
      flex: 1;
    }

    /* Configuration Tab */
    .config-sections {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .config-card {
      max-width: 600px;
    }

    .config-toggles {
      display: flex;
      flex-direction: column;
    }

    .config-toggle {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
    }

    .toggle-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .toggle-label {
      font-weight: 500;
    }

    .toggle-desc {
      font-size: 13px;
      color: var(--jensify-text-secondary, #666);
    }

    .full-width {
      width: 100%;
    }

    /* Recent Emails Tab */
    .emails-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .email-card mat-card-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px !important;
    }

    .email-main {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .email-from {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 14px;
      color: var(--jensify-text-secondary, #666);
    }

    .email-from mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .email-subject {
      font-weight: 500;
    }

    .email-meta {
      display: flex;
      align-items: center;
      gap: 16px;
      font-size: 12px;
      color: var(--jensify-text-secondary, #666);
    }

    .email-attachments {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .email-attachments mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .email-status mat-chip {
      font-size: 11px;
    }

    .status-pending { background: rgba(158, 158, 158, 0.1) !important; color: #616161 !important; }
    .status-processing { background: rgba(33, 150, 243, 0.1) !important; color: #1565c0 !important; }
    .status-processed { background: rgba(76, 175, 80, 0.1) !important; color: #2e7d32 !important; }
    .status-failed { background: rgba(244, 67, 54, 0.1) !important; color: #c62828 !important; }
    .status-rejected { background: rgba(255, 152, 0, 0.1) !important; color: #ef6c00 !important; }

    .error-footer {
      background: rgba(244, 67, 54, 0.05);
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #c62828;
    }

    .error-footer mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    @media (max-width: 768px) {
      .email-expense-container {
        padding: 16px;
      }

      .status-banner mat-card-content {
        flex-direction: column;
        text-align: center;
      }

      .status-text {
        text-align: center;
      }

      .inbox-address {
        flex-direction: column;
      }

      .steps-grid {
        grid-template-columns: 1fr;
      }

      .alias-card mat-card-content {
        flex-direction: column;
        gap: 12px;
        align-items: stretch;
      }

      .alias-actions {
        justify-content: flex-end;
      }

      .add-alias-form {
        flex-direction: column;
      }

      .email-card mat-card-content {
        flex-direction: column;
        gap: 12px;
        align-items: stretch;
      }

      .email-status {
        align-self: flex-start;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class EmailExpenseSettingsComponent implements OnInit {
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private emailService = inject(EmailExpenseService);
  private notificationService = inject(NotificationService);
  private clipboard = inject(Clipboard);

  // State
  loading = signal(true);
  addingAlias = signal(false);

  // Data from service
  inboxConfig = this.emailService.inboxConfig;
  emailAliases = this.emailService.emailAliases;
  recentEmails = this.emailService.recentEmails;
  stats = signal<EmailProcessingStats | null>(null);

  // Constants
  tips = EMAIL_SUBMISSION_INSTRUCTIONS;

  // Form
  aliasForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.loading.set(true);

    this.emailService.getInboxConfig().subscribe({
      next: () => {
        this.emailService.getEmailAliases().subscribe();
        this.loadRecentEmails();
        this.loadStats();
        this.loading.set(false);
      },
      error: () => {
        this.notificationService.showError('Failed to load email settings');
        this.loading.set(false);
      }
    });
  }

  loadRecentEmails(): void {
    this.emailService.getRecentEmails().subscribe();
  }

  private loadStats(): void {
    this.emailService.getProcessingStats().subscribe({
      next: (stats) => this.stats.set(stats),
      error: () => {} // Silent fail for stats
    });
  }

  goBack(): void {
    this.router.navigate(['/admin']);
  }

  copyToClipboard(text: string): void {
    this.clipboard.copy(text);
    this.notificationService.showSuccess('Copied to clipboard');
  }

  toggleEnabled(enabled: boolean): void {
    this.updateConfig({ is_enabled: enabled });
  }

  updateConfig(updates: Partial<EmailInboxConfig>): void {
    this.emailService.updateInboxConfig(updates).subscribe({
      next: () => this.notificationService.showSuccess('Settings updated'),
      error: () => this.notificationService.showError('Failed to update settings')
    });
  }

  addAlias(): void {
    if (this.aliasForm.invalid) return;

    this.addingAlias.set(true);
    const email = this.aliasForm.value.email!;

    this.emailService.addEmailAlias({ email }).subscribe({
      next: () => {
        this.notificationService.showSuccess('Email added. Check your inbox for verification.');
        this.aliasForm.reset();
        this.addingAlias.set(false);
      },
      error: () => {
        this.notificationService.showError('Failed to add email');
        this.addingAlias.set(false);
      }
    });
  }

  removeAlias(alias: UserEmailAlias): void {
    if (!confirm(`Remove ${alias.email}?`)) return;

    this.emailService.removeEmailAlias(alias.id).subscribe({
      next: () => this.notificationService.showSuccess('Email removed'),
      error: () => this.notificationService.showError('Failed to remove email')
    });
  }

  resendVerification(alias: UserEmailAlias): void {
    this.notificationService.showWarning('Verification email would be sent (feature pending)');
  }

  getStatusIcon(status: EmailProcessingStatus): string {
    return EMAIL_STATUS_CONFIG[status]?.icon || 'help';
  }

  getStatusLabel(status: EmailProcessingStatus): string {
    return EMAIL_STATUS_CONFIG[status]?.label || status;
  }
}
