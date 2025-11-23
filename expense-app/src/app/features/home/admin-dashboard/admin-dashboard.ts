import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Observable, map } from 'rxjs';
import { ExpenseService } from '../../../core/services/expense.service';
import { OrganizationService } from '../../../core/services/organization.service';
import { MetricCard } from '../../../shared/components/metric-card/metric-card';

interface AdminMetrics {
  totalUsers: number;
  activeUsers: number;
  pendingInvitations: number;
  totalExpenses: number;
  monthlySpend: number;
  systemHealth: string;
}

@Component({
  selector: 'app-admin-dashboard',
  imports: [
    CommonModule,
    MatButtonModule,
    MatIconModule,
    MetricCard
  ],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AdminDashboard implements OnInit {
  private expenseService = inject(ExpenseService);
  private organizationService = inject(OrganizationService);
  private router = inject(Router);

  metrics$!: Observable<AdminMetrics>;
  loading = true;

  ngOnInit(): void {
    this.loadDashboardData();
  }

  private loadDashboardData(): void {
    const now = new Date();
    const _startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Get organization context first
    const orgId$ = this.organizationService.currentOrganization$.pipe(
      map(org => org?.id)
    );

    // Calculate metrics
    this.metrics$ = orgId$.pipe(
      map(orgId => {
        if (!orgId) {
          return {
            totalUsers: 0,
            activeUsers: 0,
            pendingInvitations: 0,
            totalExpenses: 0,
            monthlySpend: 0,
            systemHealth: 'Unknown'
          };
        }

        // For now, show placeholder metrics
        // TODO: Implement proper metrics aggregation
        return {
          totalUsers: 0,
          activeUsers: 0,
          pendingInvitations: 0,
          totalExpenses: 0,
          monthlySpend: 0,
          systemHealth: 'Excellent'
        };
      })
    );

    this.loading = false;
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  onManageUsers(): void {
    this.router.navigate(['/organization/users']);
  }

  onViewFinance(): void {
    this.router.navigate(['/finance']);
  }

  onViewApprovals(): void {
    this.router.navigate(['/approvals']);
  }
}
