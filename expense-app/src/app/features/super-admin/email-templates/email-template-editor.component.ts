import { Component, inject, signal, OnInit, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatTabsModule } from '@angular/material/tabs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SuperAdminService } from '../../../core/services/super-admin.service';

interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  html_body: string;
  text_body: string;
  category: 'transactional' | 'marketing' | 'notification' | 'system';
  variables: string[];
}

/**
 * Email Template Editor Component
 * Edit email templates with live preview
 */
@Component({
  selector: 'app-email-template-editor',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
    MatChipsModule,
    MatTooltipModule,
    MatTabsModule,
  ],
  templateUrl: './email-template-editor.component.html',
  styles: [`
    .email-editor-container {
      padding: 24px;
      max-width: 1600px;
      margin: 0 auto;
    }

    /* Header */
    .page-header {
      margin-bottom: 24px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 16px;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .header-left button {
      color: rgba(255, 255, 255, 0.7);
    }

    .header-left button:hover {
      color: #ff5900;
    }

    .header-left h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: rgba(255, 255, 255, 0.95);
      margin: 0 0 4px;
    }

    .header-left .subtitle {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.6);
      margin: 0;
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
    }

    .header-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .header-actions button {
      min-width: 120px;
    }

    .header-actions button mat-icon {
      margin-right: 6px;
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

    /* Editor Layout - Two Columns */
    .editor-layout {
      display: grid;
      grid-template-columns: 1fr 450px;
      gap: 24px;
      align-items: start;
    }

    /* Editor Section */
    .editor-section {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    /* Generic Card Styling */
    .variables-card,
    .form-card,
    .preview-card {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%) !important;
      border-radius: 12px !important;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2) !important;
      border: 1px solid rgba(255, 255, 255, 0.08);
      overflow: hidden;
    }

    /* Variables Card - Compact Header */
    .card-header-compact {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 16px 20px;
    }

    .card-header-compact mat-icon {
      color: #ff5900;
      font-size: 22px;
      width: 22px;
      height: 22px;
    }

    .card-header-compact h3 {
      font-size: 1rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      margin: 0;
    }

    .variables-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 16px 20px;
    }

    .variable-btn {
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
      font-size: 0.85rem !important;
      background: rgba(255, 89, 0, 0.1) !important;
      color: #ff7d3d !important;
      border-color: rgba(255, 89, 0, 0.3) !important;
    }

    .variable-btn:hover {
      background: rgba(255, 89, 0, 0.2) !important;
      border-color: #ff5900 !important;
    }

    .variable-btn-small {
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace !important;
      font-size: 0.75rem !important;
      padding: 0 10px !important;
      min-width: auto !important;
      height: 28px !important;
      background: rgba(255, 89, 0, 0.1) !important;
      color: #ff7d3d !important;
      border-color: rgba(255, 89, 0, 0.3) !important;
    }

    .variable-btn-small:hover {
      background: rgba(255, 89, 0, 0.2) !important;
    }

    /* Form Card Header */
    .card-header {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 20px;
    }

    .header-icon {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 89, 0, 0.15);
    }

    .header-icon mat-icon {
      color: #ff5900;
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .header-icon.preview {
      background: rgba(33, 150, 243, 0.15);
    }

    .header-icon.preview mat-icon {
      color: #64b5f6;
    }

    .card-header h2 {
      font-size: 1.1rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      margin: 0 0 4px;
    }

    .card-header p {
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.6);
      margin: 0;
    }

    .card-content {
      padding: 20px;
    }

    /* Form Fields */
    .full-width {
      width: 100%;
    }

    /* Tab Content */
    .tab-content {
      padding: 20px;
    }

    .toolbar {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 16px;
      padding: 12px 16px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .toolbar-label {
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.6);
      margin-right: 8px;
    }

    /* Code Textarea */
    .code-field textarea {
      font-family: 'SF Mono', 'Monaco', 'Consolas', 'Liberation Mono', monospace !important;
      font-size: 0.9rem !important;
      line-height: 1.5 !important;
      resize: vertical;
    }

    /* Form Field Text Color Fix */
    ::ng-deep .form-card .mdc-text-field--filled,
    ::ng-deep .variables-card .mdc-text-field--filled {
      background-color: rgba(255, 255, 255, 0.08) !important;
    }

    ::ng-deep .form-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-floating-label,
    ::ng-deep .variables-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-floating-label {
      color: rgba(255, 255, 255, 0.7) !important;
    }

    ::ng-deep .form-card .mat-mdc-input-element,
    ::ng-deep .variables-card .mat-mdc-input-element {
      color: rgba(255, 255, 255, 0.95) !important;
      caret-color: #ff5900 !important;
    }

    ::ng-deep .form-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-line-ripple::before,
    ::ng-deep .variables-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-line-ripple::before {
      border-bottom-color: rgba(255, 255, 255, 0.3) !important;
    }

    ::ng-deep .form-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-line-ripple::after,
    ::ng-deep .variables-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-line-ripple::after {
      border-bottom-color: #ff5900 !important;
    }

    ::ng-deep .form-card .mat-mdc-form-field-focus-overlay,
    ::ng-deep .variables-card .mat-mdc-form-field-focus-overlay {
      background-color: rgba(255, 255, 255, 0.05) !important;
    }

    ::ng-deep .form-card textarea.mat-mdc-input-element,
    ::ng-deep .variables-card textarea.mat-mdc-input-element {
      color: rgba(255, 255, 255, 0.95) !important;
    }

    /* Preview Section */
    .preview-section {
      position: relative;
    }

    .preview-card.sticky {
      position: sticky;
      top: 88px;
    }

    .preview-content {
      padding: 0;
    }

    /* Email Preview - Email Client Look */
    .email-preview {
      background: #ffffff;
      border-radius: 0 0 8px 8px;
      overflow: hidden;
    }

    .email-header {
      padding: 16px 20px;
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
    }

    .header-row {
      display: flex;
      gap: 10px;
      font-size: 0.9rem;
      color: #334155;
      margin-bottom: 6px;
    }

    .header-row:last-child {
      margin-bottom: 0;
    }

    .header-label {
      font-weight: 600;
      color: #64748b;
      min-width: 60px;
    }

    .header-row .subject {
      font-weight: 600;
      color: #1e293b;
    }

    /* Preview Tabs */
    .preview-tabs {
      background: #ffffff;
    }

    .html-preview {
      padding: 24px;
      min-height: 300px;
      color: #1e293b;
    }

    .text-preview {
      padding: 24px;
      min-height: 300px;
      background: #f8fafc;
    }

    .text-preview pre {
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      font-size: 0.9rem;
      line-height: 1.6;
      white-space: pre-wrap;
      word-wrap: break-word;
      margin: 0;
      color: #334155;
    }

    /* Sample Data Info */
    .sample-data-info {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 14px 20px;
      background: rgba(33, 150, 243, 0.1);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
    }

    .sample-data-info mat-icon {
      color: #64b5f6;
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .sample-data-info p {
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.7);
      margin: 0;
      line-height: 1.4;
    }

    /* Mat Divider */
    mat-divider {
      border-color: rgba(255, 255, 255, 0.08) !important;
    }

    /* Mat Tabs in Cards */
    ::ng-deep .form-card .mat-mdc-tab-header {
      background: rgba(0, 0, 0, 0.2);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }

    ::ng-deep .form-card .mat-mdc-tab:not(.mat-mdc-tab-disabled).mdc-tab--active .mdc-tab__text-label {
      color: #ff5900;
    }

    ::ng-deep .form-card .mat-mdc-tab-body-wrapper {
      background: transparent;
    }

    /* Preview Tabs Styling */
    ::ng-deep .preview-tabs .mat-mdc-tab-header {
      background: #f1f5f9;
    }

    ::ng-deep .preview-tabs .mat-mdc-tab .mdc-tab__text-label {
      color: #64748b;
    }

    ::ng-deep .preview-tabs .mat-mdc-tab:not(.mat-mdc-tab-disabled).mdc-tab--active .mdc-tab__text-label {
      color: #ff5900;
    }

    /* Responsive */
    @media (max-width: 1100px) {
      .editor-layout {
        grid-template-columns: 1fr;
      }

      .preview-card.sticky {
        position: static;
      }
    }

    @media (max-width: 768px) {
      .email-editor-container {
        padding: 16px;
      }

      .header-content {
        flex-direction: column;
        align-items: flex-start;
      }

      .header-actions {
        width: 100%;
      }

      .header-actions button {
        flex: 1;
        min-width: auto;
      }

      .variables-toolbar {
        padding: 12px 16px;
      }

      .tab-content {
        padding: 16px;
      }

      .card-header {
        padding: 16px;
      }

      .card-content {
        padding: 16px;
      }
    }

    @media (max-width: 480px) {
      .header-left h1 {
        font-size: 1.25rem;
      }

      .header-actions {
        flex-direction: column;
      }

      .header-actions button {
        width: 100%;
      }
    }

    /* ========================================
       LIGHT MODE OVERRIDES
       ======================================== */

    :host-context(html:not(.dark)) {
      .header-left button {
        color: #475569;
      }

      .header-left button:hover {
        color: #ff5900;
      }

      .header-left h1 {
        color: #1e293b;
      }

      .header-left .subtitle {
        color: #64748b;
      }

      .loading-container {
        color: #64748b;
      }

      .variables-card,
      .form-card,
      .preview-card {
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%) !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08) !important;
        border: 1px solid #e2e8f0;
      }

      .card-header-compact h3,
      .preview-header h2,
      .section-header h2 {
        color: #1e293b;
      }

      .section-header p,
      .preview-header p {
        color: #64748b;
      }

      .html-preview-container {
        background: #ffffff;
        border-color: #e2e8f0;
      }

      .text-preview {
        background: #f8fafc;
        border-color: #e2e8f0;
        color: #475569;
      }

      .preview-info {
        color: #64748b;
      }

      .preview-info mat-icon {
        color: #94a3b8;
      }
    }

    /* Light mode form fields */
    :host-context(html:not(.dark)) ::ng-deep .form-card .mdc-text-field--filled,
    :host-context(html:not(.dark)) ::ng-deep .variables-card .mdc-text-field--filled {
      background-color: rgba(0, 0, 0, 0.04) !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .form-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-floating-label,
    :host-context(html:not(.dark)) ::ng-deep .variables-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-floating-label {
      color: #64748b !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .form-card .mat-mdc-input-element,
    :host-context(html:not(.dark)) ::ng-deep .variables-card .mat-mdc-input-element {
      color: #1e293b !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .form-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-line-ripple::before,
    :host-context(html:not(.dark)) ::ng-deep .variables-card .mdc-text-field--filled:not(.mdc-text-field--disabled) .mdc-line-ripple::before {
      border-bottom-color: #cbd5e1 !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .form-card textarea.mat-mdc-input-element,
    :host-context(html:not(.dark)) ::ng-deep .variables-card textarea.mat-mdc-input-element {
      color: #1e293b !important;
    }

    :host-context(html:not(.dark)) ::ng-deep .form-card .mat-mdc-form-field-focus-overlay,
    :host-context(html:not(.dark)) ::ng-deep .variables-card .mat-mdc-form-field-focus-overlay {
      background-color: rgba(0, 0, 0, 0.02) !important;
    }
  `],
})
export class EmailTemplateEditorComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private superAdminService = inject(SuperAdminService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  private sanitizer = inject(DomSanitizer);

  isLoading = signal(true);
  isSaving = signal(false);
  isSendingTest = signal(false);
  templateId = signal<string | null>(null);
  template = signal<EmailTemplate | null>(null);

  templateForm = this.fb.group({
    subject: ['', Validators.required],
    html_body: ['', Validators.required],
    text_body: ['', Validators.required],
  });

  // Sample data for preview
  sampleData: Record<string, string> = {
    user_name: 'John Doe',
    organization_name: 'Acme Corp',
    expense_amount: '$125.50',
    expense_date: 'Dec 6, 2024',
    approver_name: 'Jane Smith',
    login_url: 'https://expensed.app/login',
    upgrade_url: 'https://expensed.app/billing',
    days_remaining: '7',
    invoice_number: 'INV-2024-001',
    payment_date: 'Dec 6, 2024',
    amount: '$199.00',
    reset_url: 'https://expensed.app/reset-password',
    expires_in: '1 hour',
    inviter_name: 'Sarah Johnson',
    role: 'Manager',
    invitation_url: 'https://expensed.app/invite/accept',
  };

  previewSubject = computed(() => {
    return this.replaceVariables(this.templateForm.get('subject')?.value || '');
  });

  /**
   * SECURITY: Sanitize HTML preview to prevent XSS attacks.
   * Even though this is admin-only, we follow defense-in-depth principles.
   * We strip dangerous elements like <script>, event handlers, and javascript: URLs.
   */
  previewHtml = computed((): SafeHtml => {
    const rawHtml = this.replaceVariables(this.templateForm.get('html_body')?.value || '');
    const sanitizedHtml = this.sanitizeEmailHtml(rawHtml);
    // Use bypassSecurityTrustHtml only after manual sanitization
    return this.sanitizer.bypassSecurityTrustHtml(sanitizedHtml);
  });

  previewText = computed(() => {
    return this.replaceVariables(this.templateForm.get('text_body')?.value || '');
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.templateId.set(id);

    if (id) {
      this.loadTemplate(id);
    } else {
      this.isLoading.set(false);
    }
  }

  private loadTemplate(name: string): void {
    this.isLoading.set(true);

    this.superAdminService.getEmailTemplate(name)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          const template: EmailTemplate = {
            id: data.id || name,
            name: data.name,
            description: this.getTemplateDescription(data.name),
            subject: data.subject,
            html_body: data.html_body || '',
            text_body: data.text_body || '',
            category: this.getCategoryFromName(data.name),
            variables: data.variables || [],
          };

          this.template.set(template);
          this.templateForm.patchValue({
            subject: template.subject,
            html_body: template.html_body,
            text_body: template.text_body,
          });

          this.isLoading.set(false);
        },
        error: (err) => {
          console.error('Failed to load email template:', err);
          this.snackBar.open('Failed to load email template', 'Close', { duration: 3000 });
          this.isLoading.set(false);
        }
      });
  }

  private getTemplateDescription(name: string): string {
    const descriptions: Record<string, string> = {
      welcome: 'Welcome email sent to new users',
      password_reset: 'Password reset request email',
      payment_reminder: 'Payment reminder for overdue invoices',
      trial_ending: 'Trial expiration warning email',
      invitation: 'Organization invitation email',
      expense_approved: 'Expense approval notification',
      expense_rejected: 'Expense rejection notification',
    };
    return descriptions[name] || 'Email template';
  }

  private getCategoryFromName(name: string): 'transactional' | 'marketing' | 'notification' | 'system' {
    if (['welcome', 'password_reset', 'invitation'].includes(name)) {
      return 'transactional';
    }
    if (['payment_reminder', 'trial_ending'].includes(name)) {
      return 'notification';
    }
    return 'system';
  }

  private replaceVariables(text: string): string {
    let result = text;
    for (const [key, value] of Object.entries(this.sampleData)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
    return result;
  }

  /**
   * SECURITY: Sanitize HTML to remove potentially dangerous elements.
   * Strips script tags, event handlers, javascript: URLs, and other XSS vectors.
   * This is defense-in-depth even for admin-only features.
   */
  private sanitizeEmailHtml(html: string): string {
    // Remove script tags and their content
    let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove all event handlers (onclick, onerror, onload, etc.)
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*[^\s>]*/gi, '');

    // Remove javascript: and data: URLs from href and src attributes
    sanitized = sanitized.replace(/\bhref\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, 'href="#"');
    sanitized = sanitized.replace(/\bsrc\s*=\s*["']?\s*javascript:[^"'\s>]*/gi, 'src=""');
    sanitized = sanitized.replace(/\bhref\s*=\s*["']?\s*data:[^"'\s>]*/gi, 'href="#"');
    sanitized = sanitized.replace(/\bsrc\s*=\s*["']?\s*data:(?!image\/)[^"'\s>]*/gi, 'src=""');

    // Remove vbscript: URLs
    sanitized = sanitized.replace(/\bhref\s*=\s*["']?\s*vbscript:[^"'\s>]*/gi, 'href="#"');

    // Remove style tags (can be used for CSS injection attacks)
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove expression() in inline styles (IE-specific XSS vector)
    sanitized = sanitized.replace(/expression\s*\([^)]*\)/gi, '');

    // Remove object, embed, iframe, and form tags
    sanitized = sanitized.replace(/<object\b[^>]*>.*?<\/object>/gi, '');
    sanitized = sanitized.replace(/<embed\b[^>]*\/?>/gi, '');
    sanitized = sanitized.replace(/<iframe\b[^>]*>.*?<\/iframe>/gi, '');
    sanitized = sanitized.replace(/<form\b[^>]*>.*?<\/form>/gi, '');

    // Remove base tags (can redirect relative URLs)
    sanitized = sanitized.replace(/<base\b[^>]*\/?>/gi, '');

    // Remove meta tags with http-equiv (can cause redirects)
    sanitized = sanitized.replace(/<meta\b[^>]*http-equiv[^>]*\/?>/gi, '');

    return sanitized;
  }

  insertVariable(variable: string): void {
    // Insert variable at cursor position
    const subjectControl = this.templateForm.get('subject');
    const currentValue = subjectControl?.value || '';
    subjectControl?.setValue(currentValue + `{{${variable}}}`);
  }

  insertVariableToHtml(variable: string): void {
    const htmlControl = this.templateForm.get('html_body');
    const currentValue = htmlControl?.value || '';
    htmlControl?.setValue(currentValue + `{{${variable}}}`);
  }

  insertVariableToText(variable: string): void {
    const textControl = this.templateForm.get('text_body');
    const currentValue = textControl?.value || '';
    textControl?.setValue(currentValue + `{{${variable}}}`);
  }

  save(): void {
    if (this.templateForm.invalid) {
      this.snackBar.open('Please fix validation errors', 'Close', {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });
      return;
    }

    const currentTemplate = this.template();
    if (!currentTemplate) {
      this.snackBar.open('No template loaded', 'Close', { duration: 3000 });
      return;
    }

    this.isSaving.set(true);

    const formValue = this.templateForm.value;
    const updateData = {
      subject: formValue.subject as string,
      html_body: formValue.html_body as string,
      text_body: formValue.text_body as string,
    };

    this.superAdminService.updateEmailTemplate(currentTemplate.name, updateData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.snackBar.open('Template saved successfully', 'Close', {
            duration: 2000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
          });
        },
        error: (err) => {
          console.error('Failed to save email template:', err);
          this.snackBar.open('Failed to save template', 'Close', {
            duration: 3000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
          });
          this.isSaving.set(false);
        }
      });
  }

  sendTestEmail(): void {
    if (this.templateForm.invalid) {
      this.snackBar.open('Please fix validation errors before sending test', 'Close', {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });
      return;
    }

    const currentTemplate = this.template();
    if (!currentTemplate) {
      this.snackBar.open('No template loaded', 'Close', { duration: 3000 });
      return;
    }

    this.isSendingTest.set(true);

    // Send test email to current admin using sample data for variable replacement
    this.superAdminService.sendTestEmail(currentTemplate.name, '', this.sampleData)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isSendingTest.set(false);
          this.snackBar.open('Test email sent successfully', 'Close', {
            duration: 2000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
          });
        },
        error: (err) => {
          console.error('Failed to send test email:', err);
          this.snackBar.open('Failed to send test email', 'Close', {
            duration: 3000,
            horizontalPosition: 'end',
            verticalPosition: 'top',
          });
          this.isSendingTest.set(false);
        }
      });
  }

  cancel(): void {
    this.router.navigate(['/super-admin/email-templates']);
  }
}
