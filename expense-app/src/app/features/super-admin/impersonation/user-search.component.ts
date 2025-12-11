import { Component, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { LoggerService } from '../../../core/services/logger.service';

interface UserSearchResult {
  id: string;
  email: string;
  full_name: string;
  organization_name: string;
  role: string;
}

@Component({
  selector: 'app-user-search',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatTableModule,
    MatChipsModule,
    MatIconModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  template: `
    <div class="p-6">
      <mat-card>
        <mat-card-header>
          <mat-card-title>Impersonate User</mat-card-title>
          <mat-card-subtitle>Search for a user to impersonate</mat-card-subtitle>
        </mat-card-header>

        <mat-card-content>
          <!-- Warning Banner -->
          <div class="bg-amber-50 border-l-4 border-amber-500 p-4 mb-6">
            <div class="flex">
              <mat-icon class="text-amber-500 mr-2">warning</mat-icon>
              <div>
                <h3 class="text-sm font-medium text-amber-800">Security Warning</h3>
                <p class="text-sm text-amber-700 mt-1">
                  All impersonation sessions are logged and audited. Only impersonate users when necessary for support purposes.
                </p>
              </div>
            </div>
          </div>

          <!-- Search Form -->
          <form [formGroup]="searchForm" (ngSubmit)="searchUsers()" class="mb-6">
            <div class="flex gap-4">
              <mat-form-field class="flex-1">
                <mat-label>Email Address</mat-label>
                <input matInput formControlName="email" placeholder="user@example.com" type="email">
                <mat-icon matPrefix>search</mat-icon>
              </mat-form-field>
              <button mat-raised-button color="primary" type="submit" [disabled]="searching() || !searchForm.valid">
                {{ searching() ? 'Searching...' : 'Search' }}
              </button>
            </div>
          </form>

          <!-- Results Table -->
          @if (searchResults().length > 0) {
            <div class="overflow-x-auto">
              <table mat-table [dataSource]="searchResults()" class="w-full">
                <!-- Email Column -->
                <ng-container matColumnDef="email">
                  <th mat-header-cell *matHeaderCellDef>Email</th>
                  <td mat-cell *matCellDef="let user">{{ user.email }}</td>
                </ng-container>

                <!-- Name Column -->
                <ng-container matColumnDef="name">
                  <th mat-header-cell *matHeaderCellDef>Name</th>
                  <td mat-cell *matCellDef="let user">{{ user.full_name }}</td>
                </ng-container>

                <!-- Organization Column -->
                <ng-container matColumnDef="organization">
                  <th mat-header-cell *matHeaderCellDef>Organization</th>
                  <td mat-cell *matCellDef="let user">{{ user.organization_name }}</td>
                </ng-container>

                <!-- Role Column -->
                <ng-container matColumnDef="role">
                  <th mat-header-cell *matHeaderCellDef>Role</th>
                  <td mat-cell *matCellDef="let user">
                    <mat-chip>{{ user.role }}</mat-chip>
                  </td>
                </ng-container>

                <!-- Actions Column -->
                <ng-container matColumnDef="actions">
                  <th mat-header-cell *matHeaderCellDef>Actions</th>
                  <td mat-cell *matCellDef="let user">
                    <button mat-raised-button color="accent" (click)="openImpersonateDialog(user)">
                      <mat-icon>person</mat-icon>
                      Impersonate
                    </button>
                  </td>
                </ng-container>

                <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
                <tr mat-row *matRowDef="let row; columns: displayedColumns;"></tr>
              </table>
            </div>
          }

          @if (searched() && searchResults().length === 0) {
            <div class="text-center py-8 text-gray-500">
              <mat-icon class="text-6xl mb-2">person_search</mat-icon>
              <p>No users found matching your search.</p>
            </div>
          }
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
export class UserSearchComponent {
  private fb = inject(FormBuilder);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private superAdminService = inject(SuperAdminService);
  private destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);

  searchForm: FormGroup;
  searching = signal(false);
  searched = signal(false);
  searchResults = signal<UserSearchResult[]>([]);
  displayedColumns = ['email', 'name', 'organization', 'role', 'actions'];

  constructor() {
    this.searchForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  searchUsers(): void {
    if (!this.searchForm.valid) return;

    const email = this.searchForm.get('email')?.value;
    this.searching.set(true);

    this.superAdminService.searchUsers(email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (results: Record<string, unknown>[]) => {
          // Map service response to component interface
          const users: UserSearchResult[] = results.map((u) => ({
            id: u['id'] as string,
            email: u['email'] as string,
            full_name: u['full_name'] as string || 'Unknown',
            organization_name: u['organization_name'] as string || 'No Organization',
            role: u['role'] as string || 'employee',
          }));
          this.searchResults.set(users);
          this.searched.set(true);
          this.searching.set(false);
        },
        error: (err: Error) => {
          this.logger.error('Error searching users', err, 'UserSearchComponent.searchUsers');
          this.snackBar.open('Failed to search users', 'Close', { duration: 3000 });
          this.searching.set(false);
        }
      });
  }

  async openImpersonateDialog(user: UserSearchResult): Promise<void> {
    const { ImpersonateDialogComponent } = await import('./impersonate-dialog.component');
    const dialogRef = this.dialog.open(ImpersonateDialogComponent, {
      width: '500px',
      data: user
    });

    dialogRef.afterClosed().subscribe((result) => {
      if (result) {
        this.startImpersonation(user, result.reason);
      }
    });
  }

  private startImpersonation(user: UserSearchResult, reason: string): void {
    this.superAdminService.startImpersonation({ target_user_id: user.id, reason })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.snackBar.open(`Now impersonating ${user.full_name}`, 'Close', { duration: 3000 });
          // Store session info and redirect to main app
          localStorage.setItem('impersonation_session', JSON.stringify(session));
          this.router.navigate(['/']);
        },
        error: (err) => {
          this.logger.error('Error starting impersonation', err as Error, 'UserSearchComponent.startImpersonation');
          this.snackBar.open('Failed to start impersonation', 'Close', { duration: 3000 });
        }
      });
  }
}
