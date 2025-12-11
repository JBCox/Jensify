import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { SuperAdminService } from '../../../core/services/super-admin.service';

interface Integration {
  name: string;
  displayName: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown' | 'checking';
  lastCheck: string;
  responseTime: number;
  errorMessage?: string;
  icon: string;
}

interface Incident {
  id: string;
  integration: string;
  message: string;
  timestamp: string;
  resolved: boolean;
}

@Component({
  selector: 'app-integration-health',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="p-6">
      <div class="mb-6 flex justify-between items-center">
        <div>
          <h1 class="text-2xl font-bold">Integration Health</h1>
          <p class="text-gray-600">Monitor external service status</p>
        </div>
        <button mat-raised-button color="primary" (click)="checkAllIntegrations()" [disabled]="checking()">
          <mat-icon>refresh</mat-icon>
          {{ checking() ? 'Checking...' : 'Check All' }}
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        @for (integration of integrations(); track integration.name) {
          <mat-card [class]="getCardClass(integration.status)">
            <mat-card-header>
              <div class="flex items-center w-full">
                <mat-icon [class]="getIconClass(integration.status)" class="mr-3 text-4xl">
                  {{ integration.icon }}
                </mat-icon>
                <div class="flex-1">
                  <mat-card-title>{{ integration.displayName }}</mat-card-title>
                  <mat-card-subtitle>
                    <div class="flex items-center">
                      <span [class]="getStatusDotClass(integration.status)"
                            class="w-2 h-2 rounded-full mr-2"></span>
                      {{ getStatusText(integration.status) }}
                    </div>
                  </mat-card-subtitle>
                </div>
              </div>
            </mat-card-header>

            <mat-card-content>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between">
                  <span class="text-gray-600">Response Time:</span>
                  <span [class]="getResponseTimeClass(integration.responseTime)">
                    {{ integration.responseTime }}ms
                  </span>
                </div>
                <div class="flex justify-between">
                  <span class="text-gray-600">Last Check:</span>
                  <span>{{ integration.lastCheck | date:'short' }}</span>
                </div>
                @if (integration.errorMessage) {
                  <div class="mt-2 p-2 bg-red-50 rounded text-xs text-red-800">
                    {{ integration.errorMessage }}
                  </div>
                }
              </div>
            </mat-card-content>

            <mat-card-actions>
              <button mat-button color="primary" (click)="checkIntegration(integration.name)">
                <mat-icon>refresh</mat-icon>
                Check Now
              </button>
            </mat-card-actions>
          </mat-card>
        }
      </div>

      <!-- Historical Data -->
      <mat-card class="mt-6">
        <mat-card-header>
          <mat-card-title>Recent Incidents</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          @if (incidents().length > 0) {
            <div class="space-y-3">
              @for (incident of incidents(); track incident.id) {
                <div class="flex items-start p-3 bg-gray-50 rounded">
                  <mat-icon class="text-orange-500 mr-3">warning</mat-icon>
                  <div class="flex-1">
                    <div class="font-medium">{{ incident.integration }}</div>
                    <div class="text-sm text-gray-600">{{ incident.message }}</div>
                    <div class="text-xs text-gray-500 mt-1">
                      {{ incident.timestamp | date:'medium' }}
                      @if (incident.resolved) {
                        <span class="text-green-600 ml-2">✓ Resolved</span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          } @else {
            <p class="text-center text-gray-500 py-4">No recent incidents</p>
          }
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class IntegrationHealthComponent implements OnInit {
  private snackBar = inject(MatSnackBar);
  private superAdminService = inject(SuperAdminService);

  integrations = signal<Integration[]>([]);
  incidents = signal<Incident[]>([]);
  checking = signal(false);

  async ngOnInit(): Promise<void> {
    await this.loadIntegrationHealth();
  }

  async loadIntegrationHealth(): Promise<void> {
    try {
      const healthData = await firstValueFrom(this.superAdminService.getIntegrationHealth());
      // Map from service type to component interface
      const integrations: Integration[] = healthData.map(h => ({
        name: h.service_name,
        displayName: h.service_name.charAt(0).toUpperCase() + h.service_name.slice(1).replace(/_/g, ' '),
        status: h.status as 'healthy' | 'degraded' | 'down',
        lastCheck: h.last_check_at || new Date().toISOString(),
        responseTime: h.response_time_ms || 0,
        icon: this.getIntegrationIcon(h.service_name)
      }));
      this.integrations.set(integrations);
      this.incidents.set([]);
    } catch (error) {
      console.error('Error loading integration health:', error);
    }
  }

  private getIntegrationIcon(name: string): string {
    const icons: Record<string, string> = {
      stripe: 'payment',
      supabase: 'cloud',
      google_vision: 'visibility',
      google_maps: 'map',
      sendgrid: 'email'
    };
    return icons[name] || 'settings';
  }

  async checkAllIntegrations(): Promise<void> {
    this.checking.set(true);
    try {
      // Run health check for each integration
      for (const integration of this.integrations()) {
        await firstValueFrom(this.superAdminService.runHealthCheck(integration.name));
      }
      this.snackBar.open('Health checks completed', 'Close', { duration: 3000 });
      await this.loadIntegrationHealth();
    } catch (error) {
      console.error('Error checking integrations:', error);
      this.snackBar.open('Failed to check integrations', 'Close', { duration: 3000 });
    } finally {
      this.checking.set(false);
    }
  }

  async checkIntegration(name: string): Promise<void> {
    try {
      await firstValueFrom(this.superAdminService.runHealthCheck(name));
      this.snackBar.open(`${name} check completed`, 'Close', { duration: 2000 });
      await this.loadIntegrationHealth();
    } catch (error) {
      console.error(`Error checking ${name}:`, error);
      this.snackBar.open(`Failed to check ${name}`, 'Close', { duration: 3000 });
    }
  }

  getCardClass(status: string): string {
    const classes: Record<string, string> = {
      healthy: 'border-l-4 border-green-500',
      degraded: 'border-l-4 border-yellow-500',
      down: 'border-l-4 border-red-500',
      unknown: 'border-l-4 border-gray-400',
      checking: 'border-l-4 border-blue-400'
    };
    return classes[status] || 'border-l-4 border-gray-400';
  }

  getIconClass(status: string): string {
    const classes: Record<string, string> = {
      healthy: 'text-green-500',
      degraded: 'text-yellow-500',
      down: 'text-red-500',
      unknown: 'text-gray-400',
      checking: 'text-blue-400'
    };
    return classes[status] || 'text-gray-400';
  }

  getStatusDotClass(status: string): string {
    const classes: Record<string, string> = {
      healthy: 'bg-green-500',
      degraded: 'bg-yellow-500',
      down: 'bg-red-500',
      unknown: 'bg-gray-400',
      checking: 'bg-blue-400 animate-pulse'
    };
    return classes[status] || 'bg-gray-400';
  }

  getStatusText(status: string): string {
    const text: Record<string, string> = {
      healthy: 'Healthy',
      degraded: 'Degraded',
      down: 'Down',
      unknown: 'Not Checked',
      checking: 'Checking...'
    };
    return text[status] || status;
  }

  getResponseTimeClass(time: number): string {
    if (time < 200) return 'text-green-600';
    if (time < 500) return 'text-yellow-600';
    return 'text-red-600';
  }
}
