import { Component, ChangeDetectionStrategy, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTableModule } from '@angular/material/table';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatSelectModule } from '@angular/material/select';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { CategoryService } from '../../../core/services/category.service';
import { GLCode, CustomExpenseCategory } from '../../../core/models/gl-code.model';
import { GLCodeDialogComponent } from './gl-code-dialog.component';
import { CategoryDialogComponent } from './category-dialog.component';
import { PullToRefresh } from '../../../shared/components/pull-to-refresh/pull-to-refresh';

@Component({
  selector: 'app-gl-code-settings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatCardModule,
    MatTabsModule,
    MatTableModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatSlideToggleModule,
    MatTooltipModule,
    MatSelectModule,
    MatDialogModule,
    MatMenuModule,
    MatDividerModule,
    PullToRefresh,
  ],
  template: `
    <app-pull-to-refresh
      [refreshing]="refreshing()"
      (refresh)="onRefresh()">
    </app-pull-to-refresh>

    <div class="jensify-container">
      <div class="jensify-page-header">
        <div class="jensify-header-content">
          <h1 class="jensify-page-title">GL Codes & Categories</h1>
          <p class="jensify-page-subtitle">Manage your accounting codes and expense categories</p>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="summary-cards">
        <div class="summary-card">
          <div class="summary-icon" style="background: #3b82f6;">
            <mat-icon>account_balance</mat-icon>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ glCodes().length }}</div>
            <div class="summary-label">GL Codes</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon" style="background: var(--jensify-primary, #ff5900);">
            <mat-icon>category</mat-icon>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ categories().length }}</div>
            <div class="summary-label">Categories</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon" style="background: #22c55e;">
            <mat-icon>check_circle</mat-icon>
          </div>
          <div class="summary-content">
            <div class="summary-value">{{ activeCategories() }}</div>
            <div class="summary-label">Active Categories</div>
          </div>
        </div>
      </div>

      <mat-card class="jensify-card">
        <mat-tab-group animationDuration="200ms">
          <!-- GL Codes Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">account_balance</mat-icon>
              GL Codes
            </ng-template>

            <div class="tab-content">
              <div class="tab-header">
                <p class="tab-description">
                  GL codes are your accounting codes. Create them here, then assign them to expense categories.
                </p>
                <button mat-raised-button color="primary" (click)="openGLCodeDialog()">
                  <mat-icon>add</mat-icon>
                  Add GL Code
                </button>
              </div>

              @if (loading()) {
                <div class="loading-container">
                  <mat-spinner diameter="40"></mat-spinner>
                </div>
              } @else if (glCodes().length === 0) {
                <div class="empty-state">
                  <mat-icon>account_balance</mat-icon>
                  <h3>No GL codes yet</h3>
                  <p>Create your first GL code to get started</p>
                  <button mat-stroked-button color="primary" (click)="openGLCodeDialog()">
                    <mat-icon>add</mat-icon>
                    Add GL Code
                  </button>
                </div>
              } @else {
                <div class="items-list">
                  @for (code of glCodes(); track code.id) {
                    <div class="list-item" [class.inactive]="!code.is_active">
                      <div class="item-main">
                        <div class="item-code">{{ code.code }}</div>
                        <div class="item-details">
                          <span class="item-name">{{ code.name }}</span>
                          @if (code.description) {
                            <span class="item-description">{{ code.description }}</span>
                          }
                        </div>
                      </div>
                      <div class="item-meta">
                        <span class="usage-badge" [matTooltip]="getCategoriesUsingCode(code.id).join(', ') || 'No categories'">
                          {{ getCategoriesUsingCode(code.id).length }} categories
                        </span>
                        @if (!code.is_active) {
                          <span class="inactive-badge">Inactive</span>
                        }
                      </div>
                      <div class="item-actions">
                        <button mat-icon-button [matMenuTriggerFor]="glCodeMenu">
                          <mat-icon>more_vert</mat-icon>
                        </button>
                        <mat-menu #glCodeMenu="matMenu">
                          <button mat-menu-item (click)="openGLCodeDialog(code)">
                            <mat-icon>edit</mat-icon>
                            <span>Edit</span>
                          </button>
                          <button mat-menu-item (click)="toggleGLCodeActive(code)">
                            <mat-icon>{{ code.is_active ? 'visibility_off' : 'visibility' }}</mat-icon>
                            <span>{{ code.is_active ? 'Deactivate' : 'Activate' }}</span>
                          </button>
                          <mat-divider></mat-divider>
                          <button mat-menu-item class="delete-action" (click)="deleteGLCode(code)"
                                  [disabled]="getCategoriesUsingCode(code.id).length > 0">
                            <mat-icon>delete</mat-icon>
                            <span>Delete</span>
                          </button>
                        </mat-menu>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </mat-tab>

          <!-- Categories Tab -->
          <mat-tab>
            <ng-template mat-tab-label>
              <mat-icon class="tab-icon">category</mat-icon>
              Categories
            </ng-template>

            <div class="tab-content">
              <div class="tab-header">
                <p class="tab-description">
                  Expense categories that employees can select. Each category maps to a GL code.
                </p>
                <button mat-raised-button color="primary" (click)="openCategoryDialog()"
                        [disabled]="glCodes().length === 0">
                  <mat-icon>add</mat-icon>
                  Add Category
                </button>
              </div>

              @if (glCodes().length === 0) {
                <div class="empty-state warning">
                  <mat-icon>warning</mat-icon>
                  <h3>Create GL codes first</h3>
                  <p>You need at least one GL code before creating categories</p>
                  <button mat-stroked-button color="primary" (click)="switchToGLCodesTab()">
                    Go to GL Codes
                  </button>
                </div>
              } @else if (loading()) {
                <div class="loading-container">
                  <mat-spinner diameter="40"></mat-spinner>
                </div>
              } @else if (categories().length === 0) {
                <div class="empty-state">
                  <mat-icon>category</mat-icon>
                  <h3>No categories yet</h3>
                  <p>Create expense categories for your team</p>
                  <button mat-stroked-button color="primary" (click)="openCategoryDialog()">
                    <mat-icon>add</mat-icon>
                    Add Category
                  </button>
                </div>
              } @else {
                <div class="items-list">
                  @for (cat of categories(); track cat.id) {
                    <div class="list-item category-item" [class.inactive]="!cat.is_active">
                      <div class="item-icon" [style.background]="cat.color || '#ff5900'">
                        <mat-icon>{{ cat.icon || 'receipt' }}</mat-icon>
                      </div>
                      <div class="item-main">
                        <div class="item-details">
                          <span class="item-name">{{ cat.name }}</span>
                          @if (cat.description) {
                            <span class="item-description">{{ cat.description }}</span>
                          }
                        </div>
                      </div>
                      <div class="item-meta">
                        @if (cat.gl_code) {
                          <span class="gl-code-badge">{{ cat.gl_code }}</span>
                        } @else {
                          <span class="gl-code-badge unmapped">No GL Code</span>
                        }
                        @if (cat.requires_description) {
                          <mat-icon class="requirement-icon" matTooltip="Requires description">description</mat-icon>
                        }
                        @if (!cat.is_active) {
                          <span class="inactive-badge">Inactive</span>
                        }
                      </div>
                      <div class="item-actions">
                        <button mat-icon-button [matMenuTriggerFor]="categoryMenu">
                          <mat-icon>more_vert</mat-icon>
                        </button>
                        <mat-menu #categoryMenu="matMenu">
                          <button mat-menu-item (click)="openCategoryDialog(cat)">
                            <mat-icon>edit</mat-icon>
                            <span>Edit</span>
                          </button>
                          <button mat-menu-item (click)="toggleCategoryActive(cat)">
                            <mat-icon>{{ cat.is_active ? 'visibility_off' : 'visibility' }}</mat-icon>
                            <span>{{ cat.is_active ? 'Deactivate' : 'Activate' }}</span>
                          </button>
                          <mat-divider></mat-divider>
                          <button mat-menu-item class="delete-action" (click)="deleteCategory(cat)">
                            <mat-icon>delete</mat-icon>
                            <span>Delete</span>
                          </button>
                        </mat-menu>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </mat-tab>
        </mat-tab-group>
      </mat-card>
    </div>
  `,
  styles: [`
    .summary-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 1rem;
      margin-bottom: 1.5rem;
    }

    .summary-card {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1.25rem;
      background: var(--jensify-card-bg, white);
      border-radius: var(--jensify-radius-lg, 12px);
      border: 1px solid var(--jensify-border-light, #e5e7eb);
    }

    .summary-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      flex-shrink: 0;

      mat-icon { color: white; }
    }

    .summary-content {
      .summary-value {
        font-size: 1.5rem;
        font-weight: 700;
        color: var(--jensify-text-strong, #1a1a1a);
      }
      .summary-label {
        font-size: 0.875rem;
        color: var(--jensify-text-muted, #666);
      }
    }

    .tab-icon {
      margin-right: 8px;
    }

    .tab-content {
      padding: 1.5rem;
    }

    .tab-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      margin-bottom: 1.5rem;

      .tab-description {
        margin: 0;
        color: var(--jensify-text-muted, #666);
        max-width: 500px;
      }
    }

    .loading-container {
      display: flex;
      justify-content: center;
      padding: 3rem;
    }

    .empty-state {
      text-align: center;
      padding: 3rem;
      color: var(--jensify-text-muted, #666);

      mat-icon {
        font-size: 48px;
        width: 48px;
        height: 48px;
        color: var(--jensify-primary, #ff5900);
        margin-bottom: 1rem;
      }

      h3 {
        margin: 0 0 0.5rem;
        color: var(--jensify-text-strong, #1a1a1a);
      }

      p {
        margin: 0 0 1.5rem;
      }

      &.warning mat-icon {
        color: #f59e0b;
      }
    }

    .items-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
    }

    .list-item {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 1rem;
      background: var(--jensify-bg-subtle, #f9fafb);
      border-radius: var(--jensify-radius-md, 8px);
      transition: all 0.2s ease;

      &:hover {
        background: var(--jensify-bg-hover, #f3f4f6);
      }

      &.inactive {
        opacity: 0.6;
      }
    }

    .item-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: 8px;
      flex-shrink: 0;

      mat-icon {
        color: white;
        font-size: 20px;
        width: 20px;
        height: 20px;
      }
    }

    .item-main {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .item-code {
      font-family: monospace;
      font-size: 0.875rem;
      font-weight: 600;
      padding: 0.25rem 0.5rem;
      background: var(--jensify-primary, #ff5900);
      color: white;
      border-radius: 4px;
      flex-shrink: 0;
    }

    .item-details {
      display: flex;
      flex-direction: column;
      min-width: 0;

      .item-name {
        font-weight: 600;
        color: var(--jensify-text-strong, #1a1a1a);
      }

      .item-description {
        font-size: 0.875rem;
        color: var(--jensify-text-muted, #666);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .item-meta {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex-shrink: 0;
    }

    .usage-badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: var(--jensify-bg-subtle, #e5e7eb);
      border-radius: 4px;
      color: var(--jensify-text-secondary, #4b5563);
    }

    .gl-code-badge {
      font-family: monospace;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: #3b82f6;
      color: white;
      border-radius: 4px;

      &.unmapped {
        background: #f59e0b;
      }
    }

    .inactive-badge {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      background: var(--jensify-text-muted, #999);
      color: white;
      border-radius: 4px;
    }

    .requirement-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: var(--jensify-text-muted, #666);
    }

    .item-actions {
      flex-shrink: 0;
    }

    .delete-action {
      color: #ef4444 !important;
    }

    :host-context(.dark) {
      .summary-card {
        background: var(--jensify-card-bg, #1f2937);
        border-color: rgba(255, 255, 255, 0.1);
      }

      .summary-content .summary-value {
        color: #fff;
      }

      .list-item {
        background: rgba(255, 255, 255, 0.05);

        &:hover {
          background: rgba(255, 255, 255, 0.08);
        }
      }

      .item-details .item-name {
        color: #fff;
      }

      .empty-state h3 {
        color: #fff;
      }
    }

    @media (max-width: 767px) {
      .tab-header {
        flex-direction: column;
      }

      .list-item {
        flex-wrap: wrap;
      }

      .item-meta {
        width: 100%;
        margin-top: 0.5rem;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class GlCodeSettingsComponent implements OnInit {
  private categoryService = inject(CategoryService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);

  loading = signal(true);
  glCodes = signal<GLCode[]>([]);
  categories = signal<CustomExpenseCategory[]>([]);
  refreshing = signal(false);

  activeCategories = computed(() => this.categories().filter(c => c.is_active).length);

  ngOnInit(): void {
    this.loadData();
  }

  onRefresh(): void {
    this.refreshing.set(true);
    this.loadData();
    setTimeout(() => this.refreshing.set(false), 1000);
  }

  private loadData(): void {
    this.loading.set(true);

    this.categoryService.getGLCodes().subscribe({
      next: (codes) => {
        this.glCodes.set(codes);
        this.categoryService.getCategories().subscribe({
          next: (cats) => {
            this.categories.set(cats);
            this.loading.set(false);
          },
          error: () => this.loading.set(false)
        });
      },
      error: () => this.loading.set(false)
    });
  }

  getCategoriesUsingCode(glCodeId: string): string[] {
    return this.categories()
      .filter(c => c.gl_code_id === glCodeId)
      .map(c => c.name);
  }

  // GL Code actions
  openGLCodeDialog(code?: GLCode): void {
    const dialogRef = this.dialog.open(GLCodeDialogComponent, {
      width: '500px',
      data: { code }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
      }
    });
  }

  toggleGLCodeActive(code: GLCode): void {
    this.categoryService.updateGLCode(code.id, { is_active: !code.is_active })
      .subscribe(() => this.loadData());
  }

  deleteGLCode(code: GLCode): void {
    if (this.getCategoriesUsingCode(code.id).length > 0) {
      this.snackBar.open('Cannot delete GL code that is assigned to categories', 'Close', { duration: 3000 });
      return;
    }

    if (confirm(`Delete GL code "${code.code}"?`)) {
      this.categoryService.deleteGLCode(code.id).subscribe(() => this.loadData());
    }
  }

  // Category actions
  openCategoryDialog(category?: CustomExpenseCategory): void {
    const dialogRef = this.dialog.open(CategoryDialogComponent, {
      width: '600px',
      data: { category, glCodes: this.glCodes() }
    });

    dialogRef.afterClosed().subscribe(result => {
      if (result) {
        this.loadData();
      }
    });
  }

  toggleCategoryActive(category: CustomExpenseCategory): void {
    this.categoryService.updateCategory(category.id, { is_active: !category.is_active })
      .subscribe(() => this.loadData());
  }

  deleteCategory(category: CustomExpenseCategory): void {
    if (confirm(`Delete category "${category.name}"?`)) {
      this.categoryService.deleteCategory(category.id).subscribe(() => this.loadData());
    }
  }

  switchToGLCodesTab(): void {
    // The tab group will handle this via user click
  }
}
