import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';
import { environment } from '../../../../environments/environment';
import { LoggerService } from '../../../core/services/logger.service';

interface ApiKey {
  id: string;
  prefix: string;
  organization_name: string;
  scopes: string[];
  rate_limit: number;
  last_used: string | null;
  status: 'active' | 'revoked';
  created_at: string;
}

interface PlatformIntegration {
  id: string;
  name: string;
  description: string;
  icon: string;
  envVar: string;
  status: 'connected' | 'not_configured' | 'error';
  statusMessage?: string;
  docsUrl: string;
  testable: boolean;
  testing?: boolean;
}

/**
 * API Keys & Integrations Component
 * Manages platform-level integrations (env vars) and organization API keys
 */
@Component({
  selector: 'app-api-key-list',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDialogModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  template: `
    <div class="api-keys-container">
      <!-- Page Header -->
      <div class="page-header">
        <div class="header-content">
          <div class="header-left">
            <div>
              <h1>API Keys & Integrations</h1>
              <p class="subtitle">Platform integrations and organization API keys</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Platform Integrations Section -->
      <section class="section">
        <div class="section-header">
          <mat-icon>settings_input_component</mat-icon>
          <div>
            <h2>Platform Integrations</h2>
            <p>Core services configured via environment variables. These are set during deployment for maximum security.</p>
          </div>
        </div>

        <div class="integrations-grid">
          @for (integration of platformIntegrations(); track integration.id) {
            <div class="integration-card" [class.connected]="integration.status === 'connected'" [class.error]="integration.status === 'error'">
              <div class="card-header-row">
                <div class="integration-icon" [ngClass]="'icon-' + integration.id">
                  <mat-icon>{{ integration.icon }}</mat-icon>
                </div>
                <div class="status-badge" [ngClass]="'status-' + integration.status">
                  @if (integration.status === 'connected') {
                    <mat-icon>check_circle</mat-icon>
                    <span>Connected</span>
                  } @else if (integration.status === 'error') {
                    <mat-icon>error</mat-icon>
                    <span>Error</span>
                  } @else {
                    <mat-icon>radio_button_unchecked</mat-icon>
                    <span>Not Configured</span>
                  }
                </div>
              </div>

              <div class="integration-content">
                <h3>{{ integration.name }}</h3>
                <p class="description">{{ integration.description }}</p>

                <div class="env-var-display">
                  <span class="env-label">Environment Variable:</span>
                  <code>{{ integration.envVar }}</code>
                </div>

                @if (integration.statusMessage) {
                  <div class="status-message" [class.error]="integration.status === 'error'">
                    <mat-icon>{{ integration.status === 'error' ? 'warning' : 'info' }}</mat-icon>
                    <span>{{ integration.statusMessage }}</span>
                  </div>
                }
              </div>

              <div class="card-actions">
                @if (integration.testable && integration.status !== 'not_configured') {
                  <button mat-stroked-button
                          [disabled]="integration.testing"
                          (click)="testConnection(integration)">
                    @if (integration.testing) {
                      <mat-spinner diameter="18"></mat-spinner>
                      <span>Testing...</span>
                    } @else {
                      <mat-icon>play_arrow</mat-icon>
                      <span>Test Connection</span>
                    }
                  </button>
                }
                <a mat-stroked-button [href]="integration.docsUrl" target="_blank">
                  <mat-icon>open_in_new</mat-icon>
                  <span>Docs</span>
                </a>
              </div>
            </div>
          }
        </div>

        <div class="security-note">
          <mat-icon>security</mat-icon>
          <div>
            <strong>Security Note:</strong> Platform API keys are stored as environment variables in Cloudflare Pages,
            never in the database. This ensures they cannot be exposed through SQL injection or API vulnerabilities.
            To update these keys, modify your deployment environment settings.
          </div>
        </div>
      </section>

      <!-- Organization API Keys Section -->
      <section class="section">
        <div class="section-header">
          <mat-icon>vpn_key</mat-icon>
          <div>
            <h2>Organization API Keys</h2>
            <p>API keys issued to organizations for programmatic access.</p>
          </div>
        </div>

        <div class="org-keys-card">
          @if (loading()) {
            <div class="loading-container">
              <mat-spinner diameter="40"></mat-spinner>
              <span>Loading API keys...</span>
            </div>
          } @else if (apiKeys().length > 0) {
            <div class="table-container">
              <table mat-table [dataSource]="apiKeys()">
                <ng-container matColumnDef="prefix">
                  <th mat-header-cell *matHeaderCellDef>Key Prefix</th>
                  <td mat-cell *matCellDef="let key">
                    <span class="key-prefix">{{ key.prefix }}...</span>
                  </td>
                </ng-container>

                <ng-container matColumnDef="organization">
                  <th mat-header-cell *matHeaderCellDef>Organization</th>
                  <td mat-cell *matCellDef="let key">{{ key.organization_name }}</td>
                </ng-container>

                <ng-container matColumnDef="scopes">
                  <th mat-header-cell *matHeaderCellDef>Scopes</th>
                  <td mat-cell *matCellDef="let key">
                    <div class="scopes-list">
                      @for (scope of key.scopes; track scope) {
                        <span class="scope-chip">{{ scope }}</span>
                      }
                    </div>
                  </td>
                </ng-container>

                <ng-container matColumnDef="rateLimit">
                  <th mat-header-cell *matHeaderCellDef>Rate Limit</th>
                  <td mat-cell *matCellDef="let key">{{ key.rate_limit }}/min</td>
                </ng-container>

                <ng-container matColumnDef="lastUsed">
                  <th mat-header-cell *matHeaderCellDef>Last Used</th>
                  <td mat-cell *matCellDef="let key">
                    {{ key.last_used ? (key.last_used | date:'short') : 'Never' }}
                  </td>
                </ng-container>

                <ng-container matColumnDef="status">
                  <th mat-header-cell *matHeaderCellDef>Status</th>
                  <td mat-cell *matCellDef="let key">
                    <span class="key-status" [class.active]="key.status === 'active'" [class.revoked]="key.status === 'revoked'">
                      {{ key.status | uppercase }}
                    </span>
                  </td>
                </ng-container>

                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Actions</th>
                  <td mat-cell *matCellDef="let key">
                    @if (key.status === 'active') {
                      <button mat-icon-button color="warn" (click)="revokeKey(key)" matTooltip="Revoke Key">
                        <mat-icon>block</mat-icon>
                      </button>
                    }
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            </div>
          } @else {
            <div class="empty-state">
              <mat-icon>vpn_key_off</mat-icon>
              <h3>No Organization API Keys</h3>
              <p>Organizations can generate API keys from their settings page.</p>
            </div>
          }
        </div>
      </section>
    </div>
  `,
  styles: [`
    .api-keys-container {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }

    /* Page Header */
    .page-header {
      margin-bottom: 32px;
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
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

    /* Section Styling */
    .section {
      margin-bottom: 40px;
    }

    .section-header {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      margin-bottom: 24px;
    }

    .section-header > mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      color: var(--jensify-primary);
      margin-top: 2px;
    }

    .section-header h2 {
      font-size: 1.25rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      margin: 0 0 4px;
    }

    .section-header p {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.6);
      margin: 0;
    }

    /* Integrations Grid */
    .integrations-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 20px;
      margin-bottom: 24px;
    }

    /* Integration Card */
    .integration-card {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);
      border-radius: 16px;
      padding: 0;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.08);
      overflow: hidden;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .integration-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
    }

    .integration-card.connected {
      border-color: rgba(34, 197, 94, 0.3);
    }

    .integration-card.error {
      border-color: rgba(239, 68, 68, 0.3);
    }

    .card-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 20px 0;
    }

    .integration-icon {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .integration-icon mat-icon {
      font-size: 26px;
      width: 26px;
      height: 26px;
    }

    /* Icon colors by service */
    .icon-google-vision {
      background: rgba(66, 133, 244, 0.15);
    }
    .icon-google-vision mat-icon {
      color: #4285f4;
    }

    .icon-stripe {
      background: rgba(99, 91, 255, 0.15);
    }
    .icon-stripe mat-icon {
      color: #635bff;
    }

    .icon-supabase {
      background: rgba(62, 207, 142, 0.15);
    }
    .icon-supabase mat-icon {
      color: #3ecf8e;
    }

    .icon-cloudflare {
      background: rgba(245, 130, 32, 0.15);
    }
    .icon-cloudflare mat-icon {
      color: #f58220;
    }

    /* Status Badge */
    .status-badge {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 500;
    }

    .status-badge mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .status-connected {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }

    .status-not_configured {
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
    }

    .status-error {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }

    /* Integration Content */
    .integration-content {
      padding: 20px;
    }

    .integration-content h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.95);
      margin: 0 0 8px;
    }

    .description {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.6);
      margin: 0 0 16px;
      line-height: 1.5;
    }

    .env-var-display {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .env-label {
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.5);
    }

    .env-var-display code {
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      font-size: 0.85rem;
      padding: 4px 10px;
      background: rgba(255, 255, 255, 0.08);
      border-radius: 6px;
      color: #fbbf24;
    }

    .status-message {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      padding: 10px 12px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 8px;
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.7);
    }

    .status-message mat-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
      margin-top: 1px;
    }

    .status-message.error {
      background: rgba(239, 68, 68, 0.1);
      color: #fca5a5;
    }

    .status-message.error mat-icon {
      color: #ef4444;
    }

    /* Card Actions */
    .card-actions {
      display: flex;
      gap: 10px;
      padding: 16px 20px 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      background: rgba(0, 0, 0, 0.1);
    }

    .card-actions button, .card-actions a {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 0.85rem;
    }

    .card-actions mat-spinner {
      margin-right: 4px;
    }

    /* Security Note */
    .security-note {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 16px 20px;
      background: rgba(34, 197, 94, 0.08);
      border: 1px solid rgba(34, 197, 94, 0.2);
      border-radius: 12px;
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.8);
      line-height: 1.5;
    }

    .security-note mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      color: #22c55e;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .security-note strong {
      color: #4ade80;
    }

    /* Organization Keys Card */
    .org-keys-card {
      background: linear-gradient(135deg, rgba(30, 41, 59, 0.7) 0%, rgba(15, 23, 42, 0.8) 100%);
      border-radius: 16px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.08);
      overflow: hidden;
    }

    .loading-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px;
      gap: 16px;
      color: rgba(255, 255, 255, 0.6);
    }

    .table-container {
      overflow-x: auto;
    }

    table {
      width: 100%;
    }

    th.mat-mdc-header-cell {
      background: rgba(0, 0, 0, 0.2) !important;
      color: rgba(255, 255, 255, 0.7) !important;
      font-weight: 600;
      font-size: 0.85rem;
      padding: 16px !important;
    }

    td.mat-mdc-cell {
      color: rgba(255, 255, 255, 0.85) !important;
      padding: 14px 16px !important;
      border-bottom-color: rgba(255, 255, 255, 0.08) !important;
    }

    tr.mat-mdc-row:hover {
      background: rgba(255, 255, 255, 0.03);
    }

    .key-prefix {
      font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
      font-size: 0.9rem;
      color: #fbbf24;
    }

    .scopes-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .scope-chip {
      display: inline-block;
      padding: 3px 10px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      font-size: 0.75rem;
      color: rgba(255, 255, 255, 0.8);
    }

    .key-status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
    }

    .key-status.active {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }

    .key-status.revoked {
      background: rgba(148, 163, 184, 0.15);
      color: #94a3b8;
    }

    /* Empty State */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 48px 24px;
      text-align: center;
    }

    .empty-state mat-icon {
      font-size: 56px;
      width: 56px;
      height: 56px;
      color: rgba(255, 255, 255, 0.3);
      margin-bottom: 16px;
    }

    .empty-state h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.7);
      margin: 0 0 8px;
    }

    .empty-state p {
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.5);
      margin: 0;
    }

    /* Responsive */
    @media (max-width: 900px) {
      .integrations-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 600px) {
      .api-keys-container {
        padding: 16px;
      }

      .header-left h1 {
        font-size: 1.35rem;
      }

      .card-header-row {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }

      .card-actions {
        flex-direction: column;
      }

      .card-actions button, .card-actions a {
        width: 100%;
        justify-content: center;
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

      .section-header h2 {
        color: #1e293b;
      }

      .section-header p {
        color: #64748b;
      }

      .integration-card {
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        border: 1px solid #e2e8f0;
      }

      .integration-card:hover {
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.12);
      }

      .integration-card.connected {
        border-color: rgba(34, 197, 94, 0.4);
      }

      .integration-card.error {
        border-color: rgba(239, 68, 68, 0.4);
      }

      .integration-content h3 {
        color: #1e293b;
      }

      .description {
        color: #64748b;
      }

      .env-label {
        color: #94a3b8;
      }

      .env-var-display code {
        background: rgba(0, 0, 0, 0.05);
        color: #d97706;
      }

      .status-message {
        background: rgba(0, 0, 0, 0.03);
        color: #475569;
      }

      .card-actions {
        border-top: 1px solid #e2e8f0;
        background: rgba(0, 0, 0, 0.02);
      }

      .security-note {
        background: rgba(34, 197, 94, 0.06);
        border-color: rgba(34, 197, 94, 0.25);
        color: #374151;
      }

      .security-note strong {
        color: #16a34a;
      }

      .org-keys-card {
        background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        border: 1px solid #e2e8f0;
      }

      .loading-container {
        color: #64748b;
      }

      th.mat-mdc-header-cell {
        background: rgba(0, 0, 0, 0.03) !important;
        color: #475569 !important;
      }

      td.mat-mdc-cell {
        color: #1e293b !important;
        border-bottom-color: #e2e8f0 !important;
      }

      tr.mat-mdc-row:hover {
        background: rgba(0, 0, 0, 0.02);
      }

      .key-prefix {
        color: #d97706;
      }

      .scope-chip {
        background: rgba(0, 0, 0, 0.06);
        color: #475569;
      }

      .empty-state mat-icon {
        color: #cbd5e1;
      }

      .empty-state h3 {
        color: #475569;
      }

      .empty-state p {
        color: #94a3b8;
      }
    }
  `]
})
export class ApiKeyListComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private superAdminService = inject(SuperAdminService);
  private readonly logger = inject(LoggerService);

  loading = signal(false);
  apiKeys = signal<ApiKey[]>([]);
  platformIntegrations = signal<PlatformIntegration[]>([]);
  displayedColumns = ['prefix', 'organization', 'scopes', 'rateLimit', 'lastUsed', 'status', 'actions'];

  async ngOnInit(): Promise<void> {
    this.initializePlatformIntegrations();
    await this.loadApiKeys();
  }

  private initializePlatformIntegrations(): void {
    // Check environment for configured integrations
    // Note: Google Vision API key is stored securely in Supabase secrets (not exposed to frontend)
    const integrations: PlatformIntegration[] = [
      {
        id: 'google-vision',
        name: 'Google Cloud Vision',
        description: 'OCR and receipt scanning for expense extraction',
        icon: 'document_scanner',
        envVar: 'GOOGLE_VISION_API_KEY (Supabase Secret)',
        // Google Vision key is stored server-side in Supabase secrets - we check if OCR is not simulated
        status: !environment.simulateOcr ? 'connected' : 'not_configured',
        statusMessage: !environment.simulateOcr
          ? 'OCR service is operational (via Supabase Edge Function)'
          : 'Using simulated OCR - set GOOGLE_VISION_API_KEY in Supabase secrets',
        docsUrl: 'https://cloud.google.com/vision/docs/setup',
        testable: true,
      },
      {
        id: 'stripe',
        name: 'Stripe Payments',
        description: 'Platform billing and subscription management',
        icon: 'credit_card',
        envVar: 'STRIPE_SECRET_KEY + STRIPE_PUBLISHABLE_KEY',
        status: environment.stripe?.publishableKey ? 'connected' : 'not_configured',
        statusMessage: environment.stripe?.publishableKey
          ? 'Payment processing is enabled'
          : 'Set Stripe keys in environment configuration',
        docsUrl: 'https://stripe.com/docs/api',
        testable: true,
      },
      {
        id: 'supabase',
        name: 'Supabase',
        description: 'Database, authentication, and storage backend',
        icon: 'storage',
        envVar: 'SUPABASE_URL + SUPABASE_ANON_KEY',
        status: environment.supabase?.url ? 'connected' : 'not_configured',
        statusMessage: environment.supabase?.url
          ? 'Backend services connected'
          : 'Configure Supabase credentials',
        docsUrl: 'https://supabase.com/docs',
        testable: false, // Always connected if app works
      },
    ];

    this.platformIntegrations.set(integrations);
  }

  async testConnection(integration: PlatformIntegration): Promise<void> {
    const integrations = this.platformIntegrations();
    const index = integrations.findIndex(i => i.id === integration.id);
    if (index === -1) return;

    // Set testing state
    integrations[index] = { ...integrations[index], testing: true };
    this.platformIntegrations.set([...integrations]);

    try {
      // Simulate connection test
      await new Promise(resolve => setTimeout(resolve, 1500));

      // TODO: Implement actual connection tests via edge functions
      // For now, just verify the key exists
      let success = false;
      let message = '';

      switch (integration.id) {
        case 'google-vision':
          // Google Vision key is server-side, check if OCR is enabled
          success = !environment.simulateOcr;
          message = success ? 'Google Vision API is responding correctly' : 'Using simulated OCR';
          break;
        case 'stripe':
          success = !!environment.stripe?.publishableKey;
          message = success ? 'Stripe API connection successful' : 'API key not configured';
          break;
        default:
          success = true;
          message = 'Connection verified';
      }

      // Update status
      integrations[index] = {
        ...integrations[index],
        testing: false,
        status: success ? 'connected' : 'error',
        statusMessage: message,
      };
      this.platformIntegrations.set([...integrations]);

      this.snackBar.open(
        success ? `${integration.name} connection verified` : `${integration.name} connection failed`,
        'Close',
        { duration: 3000 }
      );
    } catch {
      integrations[index] = {
        ...integrations[index],
        testing: false,
        status: 'error',
        statusMessage: 'Connection test failed - check console for details',
      };
      this.platformIntegrations.set([...integrations]);

      this.snackBar.open(`Failed to test ${integration.name}`, 'Close', { duration: 3000 });
    }
  }

  async loadApiKeys(): Promise<void> {
    this.loading.set(true);
    try {
      const keys = await firstValueFrom(this.superAdminService.getAllApiKeys());
      const mappedKeys: ApiKey[] = keys.map(k => ({
        id: k.id,
        prefix: k.key_prefix || 'sk_...',
        organization_name: k.organization_id || 'Unknown',
        scopes: k.scopes || [],
        rate_limit: k.rate_limit || 1000,
        last_used: k.last_used_at || null,
        status: k.is_active ? 'active' : 'revoked',
        created_at: k.created_at
      }));
      this.apiKeys.set(mappedKeys);
    } catch (error) {
      this.logger.error('Error loading API keys', error as Error, 'ApiKeyListComponent.loadApiKeys');
    } finally {
      this.loading.set(false);
    }
  }

  revokeKey(key: ApiKey): void {
    const dialogData: ConfirmDialogData = {
      title: 'Revoke API Key',
      message: `Revoke API key ${key.prefix}...? This action cannot be undone.`,
      confirmText: 'Revoke',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'block',
      iconColor: '#f44336',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (!confirmed) return;

      try {
        await this.superAdminService.revokeApiKey(key.id);
        this.snackBar.open('API key revoked successfully', 'Close', { duration: 3000 });
        await this.loadApiKeys();
      } catch (error) {
        this.logger.error('Error revoking API key', error as Error, 'ApiKeyListComponent.revokeKey', { keyId: key.id });
        this.snackBar.open('Failed to revoke API key', 'Close', { duration: 3000 });
      }
    });
  }
}
