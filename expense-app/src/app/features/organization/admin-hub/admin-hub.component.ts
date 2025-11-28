import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

interface AdminCard {
  icon: string;
  title: string;
  description: string;
  route: string;
  color: string;
}

@Component({
  selector: 'app-admin-hub',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatIconModule,
    MatButtonModule,
  ],
  template: `
    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <h1 class="jensify-page-title">Admin</h1>
          <p class="jensify-page-subtitle">Manage your organization settings and users</p>
        </div>
      </div>

      <div class="admin-cards-grid">
        @for (card of adminCards; track card.route) {
          <mat-card class="jensify-card admin-card" (click)="navigate(card.route)">
            <div class="admin-card-icon" [style.background]="card.color">
              <mat-icon>{{ card.icon }}</mat-icon>
            </div>
            <div class="admin-card-content">
              <h3>{{ card.title }}</h3>
              <p>{{ card.description }}</p>
            </div>
            <mat-icon class="admin-card-arrow">chevron_right</mat-icon>
          </mat-card>
        }
      </div>
    </div>
  `,
  styles: [`
    .admin-cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--jensify-spacing-md, 1rem);
    }

    .admin-card {
      display: flex;
      align-items: center;
      gap: var(--jensify-spacing-md, 1rem);
      padding: var(--jensify-spacing-lg, 1.5rem);
      cursor: pointer;
      transition: all 0.2s ease;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }
    }

    .admin-card-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: var(--jensify-radius-md, 8px);
      flex-shrink: 0;

      mat-icon {
        color: white;
        font-size: 24px;
        width: 24px;
        height: 24px;
      }
    }

    .admin-card-content {
      flex: 1;
      min-width: 0;

      h3 {
        margin: 0 0 4px 0;
        font-size: 1rem;
        font-weight: 600;
        color: var(--jensify-text-strong, #1a1a1a);
      }

      p {
        margin: 0;
        font-size: 0.875rem;
        color: var(--jensify-text-muted, #666);
      }
    }

    .admin-card-arrow {
      color: var(--jensify-text-muted, #999);
      flex-shrink: 0;
    }

    :host-context(.dark) {
      .admin-card-content h3 {
        color: #fff;
      }
      .admin-card-content p {
        color: rgba(255, 255, 255, 0.6);
      }
    }

    @media (max-width: 767px) {
      .admin-cards-grid {
        grid-template-columns: 1fr;
      }

      .admin-card {
        padding: var(--jensify-spacing-md, 1rem);
      }

      .admin-card-icon {
        width: 40px;
        height: 40px;

        mat-icon {
          font-size: 20px;
          width: 20px;
          height: 20px;
        }
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminHubComponent {
  private router = inject(Router);

  adminCards: AdminCard[] = [
    {
      icon: 'business',
      title: 'Company Settings',
      description: 'Update company name, logo, and branding',
      route: '/organization/settings',
      color: '#f59e0b',
    },
    {
      icon: 'people',
      title: 'User Management',
      description: 'Invite users, manage roles, and organization members',
      route: '/organization/users',
      color: 'var(--jensify-primary, #ff5900)',
    },
    {
      icon: 'speed',
      title: 'Mileage Settings',
      description: 'Configure mileage reimbursement rates',
      route: '/organization/mileage-settings',
      color: '#3b82f6',
    },
    {
      icon: 'account_balance_wallet',
      title: 'Budgets',
      description: 'Set up and manage department budgets',
      route: '/organization/budgets',
      color: '#22c55e',
    },
    {
      icon: 'rule',
      title: 'Approval Settings',
      description: 'Configure approval workflows and thresholds',
      route: '/approvals/settings',
      color: '#8b5cf6',
    },
  ];

  navigate(route: string): void {
    this.router.navigate([route]);
  }
}
