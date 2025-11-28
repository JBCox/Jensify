import { Component, inject, OnInit, OnDestroy, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { OrganizationService } from '../../services/organization.service';
import { Organization, OrganizationMember } from '../../models/organization.model';

interface OrgWithMembership {
  organization: Organization;
  membership: OrganizationMember;
}

@Component({
  selector: 'app-org-switcher',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    MatTooltipModule,
  ],
  template: `
    <!-- Single Org Display (no switcher needed) -->
    @if (organizations().length <= 1) {
      <div class="org-display" [class.collapsed]="collapsed()">
        <div class="org-icon">
          <mat-icon>business</mat-icon>
        </div>
        @if (!collapsed()) {
          <div class="org-info">
            <span class="org-name">{{ currentOrg()?.name || 'No Organization' }}</span>
            <span class="org-role">{{ currentRole() | titlecase }}</span>
          </div>
        }
      </div>
    }

    <!-- Multi-Org Switcher -->
    @if (organizations().length > 1) {
      <button
        class="org-switcher-btn"
        [class.collapsed]="collapsed()"
        [matMenuTriggerFor]="orgMenu"
        [matTooltip]="collapsed() ? currentOrg()?.name || 'Switch Organization' : ''"
        matTooltipPosition="right"
      >
        <div class="org-icon">
          <mat-icon>business</mat-icon>
        </div>
        @if (!collapsed()) {
          <div class="org-info">
            <span class="org-name">{{ currentOrg()?.name || 'Select Org' }}</span>
            <span class="org-role">{{ currentRole() | titlecase }}</span>
          </div>
          <mat-icon class="dropdown-icon">expand_more</mat-icon>
        }
      </button>

      <mat-menu #orgMenu="matMenu" class="org-menu">
        <div class="menu-header">Switch Organization</div>
        @for (org of organizations(); track org.organization.id) {
          <button
            mat-menu-item
            [class.active]="org.organization.id === currentOrg()?.id"
            (click)="switchOrg(org)"
          >
            <mat-icon>{{ org.organization.id === currentOrg()?.id ? 'check_circle' : 'business' }}</mat-icon>
            <div class="menu-item-content">
              <span class="menu-org-name">{{ org.organization.name }}</span>
              <span class="menu-org-role">{{ org.membership.role | titlecase }}</span>
            </div>
          </button>
        }
      </mat-menu>
    }
  `,
  styles: [`
    :host {
      display: block;
      width: 100%;
    }

    .org-display, .org-switcher-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.5rem;
      border-radius: var(--jensify-radius-md, 6px);
      background: rgba(247, 88, 12, 0.08);
      border: 1px solid rgba(247, 88, 12, 0.15);
      transition: all 0.2s ease;

      &.collapsed {
        justify-content: center;
        padding: 0.5rem;
      }
    }

    .org-switcher-btn {
      cursor: pointer;
      text-align: left;

      &:hover {
        background: rgba(247, 88, 12, 0.15);
        border-color: rgba(247, 88, 12, 0.3);
      }
    }

    .org-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border-radius: var(--jensify-radius-sm, 4px);
      background: var(--jensify-primary, #ff5900);
      color: white;
      flex-shrink: 0;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    .org-info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .org-name {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--jensify-text-strong, #1a1a1a);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;

      :host-context(.dark) & {
        color: #fff;
      }
    }

    .org-role {
      font-size: 0.6875rem;
      color: var(--jensify-text-muted, #666);
      text-transform: uppercase;
      letter-spacing: 0.03em;

      :host-context(.dark) & {
        color: rgba(255, 255, 255, 0.6);
      }
    }

    .dropdown-icon {
      color: var(--jensify-text-muted, #666);
      transition: transform 0.2s ease;
    }

    .org-switcher-btn[aria-expanded="true"] .dropdown-icon {
      transform: rotate(180deg);
    }

    // Menu styles
    ::ng-deep .org-menu {
      min-width: 220px;

      .menu-header {
        padding: 0.75rem 1rem 0.5rem;
        font-size: 0.6875rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--jensify-text-muted, #666);
        border-bottom: 1px solid var(--jensify-border-subtle, #e5e5e5);
      }

      .mat-mdc-menu-item {
        height: auto;
        padding: 0.75rem 1rem;

        &.active {
          background: rgba(247, 88, 12, 0.08);

          mat-icon {
            color: var(--jensify-primary, #ff5900);
          }
        }
      }

      .menu-item-content {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-left: 0.5rem;
      }

      .menu-org-name {
        font-size: 0.875rem;
        font-weight: 500;
      }

      .menu-org-role {
        font-size: 0.6875rem;
        color: var(--jensify-text-muted, #666);
      }
    }
  `]
})
export class OrgSwitcher implements OnInit, OnDestroy {
  private organizationService = inject(OrganizationService);
  private router = inject(Router);
  private destroy$ = new Subject<void>();

  // Input for collapsed state (passed from sidebar)
  collapsed = signal(false);

  // Organization data
  organizations = signal<OrgWithMembership[]>([]);
  currentOrg = signal<Organization | null>(null);
  currentMembership = signal<OrganizationMember | null>(null);

  currentRole = computed(() => this.currentMembership()?.role || 'employee');

  ngOnInit(): void {
    // Subscribe to current organization changes
    this.organizationService.currentOrganization$
      .pipe(takeUntil(this.destroy$))
      .subscribe(org => this.currentOrg.set(org));

    this.organizationService.currentMembership$
      .pipe(takeUntil(this.destroy$))
      .subscribe(membership => this.currentMembership.set(membership));

    // Load all user organizations
    this.loadOrganizations();
  }

  private loadOrganizations(): void {
    this.organizationService.getUserOrganizations()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (orgs) => {
          // For each org, we need to get the membership
          // Since getUserOrganizations returns just orgs, we'll fetch memberships
          this.fetchMemberships(orgs);
        },
        error: (err) => {
          console.error('Failed to load organizations', err);
        }
      });
  }

  private fetchMemberships(orgs: Organization[]): void {
    const userId = this.organizationService['supabase'].userId;
    if (!userId) return;

    // For simplicity, we'll construct the org list with current membership info
    // In a real scenario, you might want to batch fetch all memberships
    const orgList: OrgWithMembership[] = [];

    orgs.forEach(org => {
      this.organizationService.getOrganizationMember(org.id, userId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: (membership) => {
            if (membership) {
              orgList.push({ organization: org, membership });
              this.organizations.set([...orgList]);
            }
          }
        });
    });
  }

  switchOrg(orgWithMembership: OrgWithMembership): void {
    const { organization, membership } = orgWithMembership;

    // Don't switch if already on this org
    if (organization.id === this.currentOrg()?.id) {
      return;
    }

    // Set the new organization context
    this.organizationService.setCurrentOrganization(organization, membership);

    // Navigate to home to refresh all data with new org context
    this.router.navigate(['/home']).then(() => {
      // Force page reload to ensure all data is refreshed
      window.location.reload();
    });
  }

  setCollapsed(value: boolean): void {
    this.collapsed.set(value);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
