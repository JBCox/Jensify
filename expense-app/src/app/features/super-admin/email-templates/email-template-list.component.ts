import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { LoggerService } from '../../../core/services/logger.service';

interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  category: 'transactional' | 'marketing' | 'notification' | 'system';
  variables: string[];
  last_updated: string;
}

/**
 * Email Template List Component
 * Manages email templates for automated communications
 */
@Component({
  selector: 'app-email-template-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatChipsModule,
  ],
  templateUrl: './email-template-list.component.html',
  styles: [`
    .email-template-list-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Header */
    .page-header {
      margin-bottom: 32px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-left h1 {
      font-size: 1.75rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.95);
      margin: 0 0 4px;
    }

    .subtitle {
      font-size: 0.95rem;
      color: rgba(255, 255, 255, 0.7);
      margin: 0;
    }

    /* Loading */
    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px;
      gap: 16px;
      color: rgba(255, 255, 255, 0.7);
    }

    /* Templates Grid */
    .templates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
      gap: 24px;
    }

    /* Template Card */
    .template-card {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%) !important;
      border-radius: 16px !important;
      padding: 0 !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
      transition: transform 0.2s ease, box-shadow 0.2s ease !important;
      overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .template-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3) !important;
    }

    .card-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 20px 0;
    }

    .template-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .template-icon mat-icon {
      font-size: 26px;
      width: 26px;
      height: 26px;
    }

    /* Category Colors */
    .category-transactional {
      background: rgba(255, 89, 0, 0.15);
    }
    .category-transactional mat-icon {
      color: #ff5900;
    }

    .category-marketing {
      background: rgba(156, 39, 176, 0.15);
    }
    .category-marketing mat-icon {
      color: #ce93d8;
    }

    .category-notification {
      background: rgba(33, 150, 243, 0.15);
    }
    .category-notification mat-icon {
      color: #64b5f6;
    }

    .category-system {
      background: rgba(255, 152, 0, 0.15);
    }
    .category-system mat-icon {
      color: #ffb74d;
    }

    /* Category Chips */
    .category-chip-transactional {
      background: rgba(255, 89, 0, 0.2) !important;
      color: #ff7d3d !important;
    }

    .category-chip-marketing {
      background: rgba(156, 39, 176, 0.2) !important;
      color: #ce93d8 !important;
    }

    .category-chip-notification {
      background: rgba(33, 150, 243, 0.2) !important;
      color: #64b5f6 !important;
    }

    .category-chip-system {
      background: rgba(255, 152, 0, 0.2) !important;
      color: #ffb74d !important;
    }

    /* Template Content */
    .template-content {
      padding: 20px;
    }

    .template-content h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      margin: 0 0 8px;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    }

    .description {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.7);
      margin: 0 0 16px;
      line-height: 1.5;
    }

    .subject-preview {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 14px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      margin-bottom: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .subject-preview mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: rgba(255, 255, 255, 0.5);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .subject-preview span {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.85);
      font-style: italic;
    }

    /* Variables Section */
    .variables {
      margin-bottom: 16px;
    }

    .variables label {
      display: block;
      font-size: 0.8rem;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .variable-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .variable-chip {
      background: rgba(255, 255, 255, 0.1) !important;
      color: rgba(255, 255, 255, 0.85) !important;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
      font-size: 0.8rem !important;
      height: 28px !important;
    }

    /* Template Meta */
    .template-meta {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .meta-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.5);
    }

    .meta-item mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* Card Actions */
    .card-actions {
      padding: 16px 20px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.1);
    }

    .card-actions button {
      width: 100%;
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 64px 24px;
      color: rgba(255, 255, 255, 0.5);
    }

    .empty-state mat-icon {
      font-size: 64px;
      width: 64px;
      height: 64px;
      margin-bottom: 16px;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .templates-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 600px) {
      .email-template-list-container {
        padding: 16px;
      }

      .header-left h1 {
        font-size: 1.25rem;
      }

      .card-header-row {
        padding: 16px 16px 0;
      }

      .template-content {
        padding: 16px;
      }

      .card-actions {
        padding: 12px 16px 16px;
      }
    }

    /* ========================================
       LIGHT MODE OVERRIDES
       ======================================== */

    :host-context(html:not(.dark)) {
      .header-left h1 {
        color: #1e293b;
      }

      .subtitle {
        color: #64748b;
      }

      .loading-container {
        color: #64748b;
      }

      .template-card {
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%) !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
        border: 1px solid #e2e8f0;
      }

      .template-card:hover {
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12) !important;
      }

      .template-content h3 {
        color: #1e293b;
      }

      .description {
        color: #64748b;
      }

      .subject-preview {
        background: rgba(0, 0, 0, 0.03);
        border: 1px solid #e2e8f0;
      }

      .subject-preview mat-icon {
        color: #94a3b8;
      }

      .subject-preview span {
        color: #475569;
      }

      .variables label {
        color: #64748b;
      }

      .variable-chip {
        background: rgba(0, 0, 0, 0.06) !important;
        color: #475569 !important;
      }

      .template-meta {
        border-top: 1px solid #e2e8f0;
      }

      .meta-item {
        color: #94a3b8;
      }

      .card-actions {
        border-top: 1px solid #e2e8f0;
        background: rgba(0, 0, 0, 0.02);
      }

      .empty-state {
        color: #94a3b8;
      }
    }
  `],
})
export class EmailTemplateListComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);

  isLoading = signal(true);
  error = signal<string | null>(null);
  templates = signal<EmailTemplate[]>([]);

  ngOnInit(): void {
    this.loadTemplates();
  }

  refreshTemplates(): void {
    this.loadTemplates();
  }

  private loadTemplates(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.superAdminService.getEmailTemplates()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          // Map service response to component interface
          const templates: EmailTemplate[] = data.map((t) => ({
            id: t.id || t.name,
            name: t.name,
            description: this.getTemplateDescription(t.name),
            subject: t.subject,
            category: this.getCategoryFromName(t.name),
            variables: t.variables || [],
            last_updated: t.updated_at || '',
          }));
          this.templates.set(templates);
          this.isLoading.set(false);
        },
        error: (err: Error) => {
          this.logger.error('Failed to load email templates', err, 'EmailTemplateListComponent.loadTemplates');
          this.error.set('Failed to load email templates');
          this.isLoading.set(false);
        }
      });
  }

  private getTemplateDescription(name: string): string {
    const descriptions: Record<string, string> = {
      'welcome': 'Welcome email sent to new users',
      'payment_reminder': 'Payment reminder for overdue invoices',
      'trial_ending': 'Reminder that trial is expiring soon',
      'expense_approved': 'Notification when expense is approved',
      'expense_rejected': 'Notification when expense is rejected',
      'invitation': 'Invitation to join organization',
      'password_reset': 'Password reset request email',
    };
    return descriptions[name] || `Template: ${name}`;
  }

  private getCategoryFromName(name: string): EmailTemplate['category'] {
    if (['welcome', 'payment_reminder', 'invitation'].includes(name)) {
      return 'transactional';
    }
    if (['trial_ending'].includes(name)) {
      return 'marketing';
    }
    if (['expense_approved', 'expense_rejected'].includes(name)) {
      return 'notification';
    }
    return 'system';
  }

  getCategoryColor(category: EmailTemplate['category']): string {
    const colors: Record<EmailTemplate['category'], string> = {
      transactional: 'primary',
      marketing: 'accent',
      notification: 'info',
      system: 'warn',
    };
    return colors[category];
  }

  getCategoryIcon(category: EmailTemplate['category']): string {
    const icons: Record<EmailTemplate['category'], string> = {
      transactional: 'receipt_long',
      marketing: 'campaign',
      notification: 'notifications',
      system: 'settings',
    };
    return icons[category];
  }
}
