import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatChipsModule } from '@angular/material/chips';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

interface Organization {
  id: string;
  name: string;
  plan_name: string;
  status: string;
}

interface BulkOperationResult {
  success: number;
  failed: number;
  total: number;
  errors: { org_id: string; error: string }[];
}

@Component({
  selector: 'app-bulk-operations',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatSnackBarModule,
    MatDialogModule,
    MatChipsModule,
  ],
  template: `
    <div class="p-6">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Bulk Operations</mat-card-title>
          <mat-card-subtitle>Perform actions on multiple organizations at once</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <form [formGroup]="bulkForm" class="space-y-6">
            <!-- Organization Selection -->
            <div>
              <h3 class="text-lg font-medium mb-3">1. Select Organizations</h3>
              <mat-form-field class="w-full">
                <mat-label>Organizations</mat-label>
                <mat-select formControlName="organizationIds" multiple>
                  <mat-option>
                    <ngx-mat-select-search
                      [formControl]="orgSearchCtrl"
                      placeholderLabel="Search organizations..."
                      noEntriesFoundLabel="No organizations found"
                    ></ngx-mat-select-search>
                  </mat-option>
                  @for (org of filteredOrganizations(); track org.id) {
                    <mat-option [value]="org.id">
                      {{ org.name }} ({{ org.plan_name }} - {{ org.status }})
                    </mat-option>
                  }
                </mat-select>
                <mat-hint>{{ bulkForm.value.organizationIds?.length || 0 }} organizations selected</mat-hint>
              </mat-form-field>

              @if (bulkForm.value.organizationIds?.length > 0) {
                <div class="mt-2 flex flex-wrap gap-2">
                  @for (orgId of bulkForm.value.organizationIds; track orgId) {
                    <mat-chip (removed)="removeOrg(orgId)">
                      {{ getOrgName(orgId) }}
                      <button matChipRemove>
                        <mat-icon>cancel</mat-icon>
                      </button>
                    </mat-chip>
                  }
                </div>
              }
            </div>

            <!-- Action Selection -->
            <div>
              <h3 class="text-lg font-medium mb-3">2. Select Action</h3>
              <mat-form-field class="w-full">
                <mat-label>Action</mat-label>
                <mat-select formControlName="action">
                  <mat-option value="extend_trial">Extend Trial Period</mat-option>
                  <mat-option value="apply_discount">Apply Discount</mat-option>
                  <mat-option value="send_notification">Send Notification</mat-option>
                  <mat-option value="upgrade_plan">Upgrade Plan</mat-option>
                  <mat-option value="downgrade_plan">Downgrade Plan</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <!-- Action Parameters -->
            <div>
              <h3 class="text-lg font-medium mb-3">3. Configure Parameters</h3>

              @switch (bulkForm.value.action) {
                @case ('extend_trial') {
                  <mat-form-field class="w-full">
                    <mat-label>Additional Days</mat-label>
                    <input matInput type="number" formControlName="days" min="1" max="90">
                    <mat-hint>Number of days to extend the trial (1-90)</mat-hint>
                  </mat-form-field>
                }
                @case ('apply_discount') {
                  <div class="space-y-4">
                    <mat-form-field class="w-full">
                      <mat-label>Discount Percentage</mat-label>
                      <input matInput type="number" formControlName="discountPercent" min="1" max="100">
                      <span matSuffix>%</span>
                      <mat-hint>Discount percentage (1-100%)</mat-hint>
                    </mat-form-field>
                    <mat-form-field class="w-full">
                      <mat-label>Duration (months)</mat-label>
                      <input matInput type="number" formControlName="durationMonths" min="1" max="12">
                      <mat-hint>How many months the discount applies (1-12)</mat-hint>
                    </mat-form-field>
                  </div>
                }
                @case ('send_notification') {
                  <div class="space-y-4">
                    <mat-form-field class="w-full">
                      <mat-label>Subject</mat-label>
                      <input matInput formControlName="subject">
                    </mat-form-field>
                    <mat-form-field class="w-full">
                      <mat-label>Message</mat-label>
                      <textarea matInput formControlName="message" rows="5"></textarea>
                      <mat-hint>This message will be sent to all admins in selected organizations</mat-hint>
                    </mat-form-field>
                  </div>
                }
                @case ('upgrade_plan') {
                  <mat-form-field class="w-full">
                    <mat-label>Target Plan</mat-label>
                    <mat-select formControlName="targetPlan">
                      <mat-option value="pro">Pro</mat-option>
                      <mat-option value="enterprise">Enterprise</mat-option>
                    </mat-select>
                  </mat-form-field>
                }
                @case ('downgrade_plan') {
                  <mat-form-field class="w-full">
                    <mat-label>Target Plan</mat-label>
                    <mat-select formControlName="targetPlan">
                      <mat-option value="free">Free</mat-option>
                      <mat-option value="starter">Starter</mat-option>
                    </mat-select>
                  </mat-form-field>
                }
              }
            </div>

            <!-- Confirmation Summary -->
            @if (bulkForm.valid && bulkForm.value.organizationIds?.length > 0) {
              <div class="bg-blue-50 border-l-4 border-blue-500 p-4">
                <h4 class="font-medium text-blue-900 mb-2">
                  <mat-icon class="align-middle mr-1">info</mat-icon>
                  Confirmation
                </h4>
                <p class="text-sm text-blue-800">
                  You are about to <strong>{{ getActionLabel(bulkForm.value.action) }}</strong>
                  for <strong>{{ bulkForm.value.organizationIds.length }}</strong> organization(s).
                  {{ getActionSummary() }}
                </p>
              </div>
            }

            <!-- Progress Bar -->
            @if (executing()) {
              <mat-progress-bar mode="indeterminate" color="accent"></mat-progress-bar>
            }

            <!-- Results -->
            @if (result()) {
              <div [class]="result()!.failed === 0 ? 'bg-green-50 border-green-500' : 'bg-amber-50 border-amber-500'"
                   class="border-l-4 p-4">
                <h4 class="font-medium mb-2"
                    [class]="result()!.failed === 0 ? 'text-green-900' : 'text-amber-900'">
                  <mat-icon class="align-middle mr-1">
                    {{ result()!.failed === 0 ? 'check_circle' : 'warning' }}
                  </mat-icon>
                  Operation Complete
                </h4>
                <div class="text-sm"
                     [class]="result()!.failed === 0 ? 'text-green-800' : 'text-amber-800'">
                  <p>Success: {{ result()!.success }} / {{ result()!.total }}</p>
                  @if (result()!.failed > 0) {
                    <p>Failed: {{ result()!.failed }}</p>
                    <details class="mt-2">
                      <summary class="cursor-pointer">View Errors</summary>
                      <ul class="list-disc ml-5 mt-2">
                        @for (error of result()!.errors; track error.org_id) {
                          <li>{{ getOrgName(error.org_id) }}: {{ error.error }}</li>
                        }
                      </ul>
                    </details>
                  }
                </div>
              </div>
            }

            <!-- Actions -->
            <div class="flex gap-2">
              <button
                mat-raised-button
                color="accent"
                type="button"
                [disabled]="!bulkForm.valid || executing()"
                (click)="confirmAndExecute()"
              >
                <mat-icon>play_arrow</mat-icon>
                {{ executing() ? 'Executing...' : 'Execute Bulk Operation' }}
              </button>
              <button mat-button type="button" (click)="reset()" [disabled]="executing()">
                <mat-icon>refresh</mat-icon>
                Reset
              </button>
            </div>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
  `]
})
export class BulkOperationsComponent {
  private fb = inject(FormBuilder);
  private snackBar = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private superAdminService = inject(SuperAdminService);

  bulkForm: FormGroup;
  orgSearchCtrl = this.fb.control('');
  organizations = signal<Organization[]>([]);
  filteredOrganizations = signal<Organization[]>([]);
  executing = signal(false);
  result = signal<BulkOperationResult | null>(null);

  constructor() {
    this.bulkForm = this.fb.group({
      organizationIds: [[], Validators.required],
      action: ['', Validators.required],
      days: [30],
      discountPercent: [20],
      durationMonths: [3],
      subject: [''],
      message: [''],
      targetPlan: ['']
    });

    this.loadOrganizations();
    this.setupSearch();
  }

  private async loadOrganizations(): Promise<void> {
    try {
      const result = await firstValueFrom(this.superAdminService.getAllOrganizations({ limit: 1000 }));
      const orgs: Organization[] = result.organizations.map(o => ({
        id: o.organization_id,
        name: o.organization_name,
        plan_name: o.plan_name || 'free',
        status: o.subscription_status || 'active'
      }));
      this.organizations.set(orgs);
      this.filteredOrganizations.set(orgs);
    } catch (error) {
      console.error('Error loading organizations:', error);
      this.snackBar.open('Failed to load organizations', 'Close', { duration: 3000 });
    }
  }

  private setupSearch(): void {
    this.orgSearchCtrl.valueChanges.subscribe(search => {
      if (!search) {
        this.filteredOrganizations.set(this.organizations());
        return;
      }
      const filtered = this.organizations().filter(org =>
        org.name.toLowerCase().includes(search.toLowerCase())
      );
      this.filteredOrganizations.set(filtered);
    });
  }

  removeOrg(orgId: string): void {
    const current = this.bulkForm.value.organizationIds as string[];
    this.bulkForm.patchValue({
      organizationIds: current.filter(id => id !== orgId)
    });
  }

  getOrgName(orgId: string): string {
    return this.organizations().find(org => org.id === orgId)?.name || orgId;
  }

  getActionLabel(action: string): string {
    const labels: Record<string, string> = {
      extend_trial: 'Extend Trial Period',
      apply_discount: 'Apply Discount',
      send_notification: 'Send Notification',
      upgrade_plan: 'Upgrade Plan',
      downgrade_plan: 'Downgrade Plan'
    };
    return labels[action] || action;
  }

  getActionSummary(): string {
    const action = this.bulkForm.value.action;
    switch (action) {
      case 'extend_trial':
        return `Trials will be extended by ${this.bulkForm.value.days} days.`;
      case 'apply_discount':
        return `A ${this.bulkForm.value.discountPercent}% discount will be applied for ${this.bulkForm.value.durationMonths} months.`;
      case 'send_notification':
        return `A notification will be sent to all admins.`;
      case 'upgrade_plan':
      case 'downgrade_plan':
        return `Plans will be changed to ${this.bulkForm.value.targetPlan}.`;
      default:
        return '';
    }
  }

  confirmAndExecute(): void {
    const count = this.bulkForm.value.organizationIds.length;
    const action = this.getActionLabel(this.bulkForm.value.action);

    const dialogData: ConfirmDialogData = {
      title: 'Confirm Bulk Operation',
      message: `Are you sure you want to ${action.toLowerCase()} for ${count} organization(s)? This action cannot be undone.`,
      confirmText: 'Execute',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'warning',
      iconColor: '#f57c00',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe(async (confirmed: boolean) => {
      if (confirmed) {
        await this.execute();
      }
    });
  }

  private async execute(): Promise<void> {
    this.executing.set(true);
    this.result.set(null);

    try {
      const params = this.bulkForm.value;
      let successCount = 0;
      const failedCount = 0;
      const errors: { org_id: string; error: string }[] = [];

      // Execute based on action type
      if (params.action === 'extend_trial') {
        await firstValueFrom(this.superAdminService.bulkExtendTrials(
          params.organizationIds,
          params.days,
          'Bulk trial extension from admin panel'
        ));
        successCount = params.organizationIds.length;
      } else if (params.action === 'apply_discount') {
        await firstValueFrom(this.superAdminService.bulkApplyDiscount(
          params.organizationIds,
          params.discountPercent,
          'Bulk discount from admin panel'
        ));
        successCount = params.organizationIds.length;
      } else {
        // Placeholder for other bulk actions
        this.snackBar.open('This bulk action is not yet implemented', 'Close', { duration: 3000 });
        this.executing.set(false);
        return;
      }

      const result: BulkOperationResult = {
        success: successCount,
        failed: failedCount,
        total: params.organizationIds.length,
        errors
      };
      this.result.set(result);

      if (result.failed === 0) {
        this.snackBar.open('Bulk operation completed successfully', 'Close', { duration: 3000 });
      } else {
        this.snackBar.open(
          `Operation completed with ${result.failed} error(s)`,
          'Close',
          { duration: 5000 }
        );
      }
    } catch (error) {
      console.error('Error executing bulk operation:', error);
      this.snackBar.open('Failed to execute bulk operation', 'Close', { duration: 3000 });
    } finally {
      this.executing.set(false);
    }
  }

  reset(): void {
    this.bulkForm.reset({
      organizationIds: [],
      action: '',
      days: 30,
      discountPercent: 20,
      durationMonths: 3
    });
    this.result.set(null);
  }
}
