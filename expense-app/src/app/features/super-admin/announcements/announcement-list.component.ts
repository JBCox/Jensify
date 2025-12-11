import { Component, inject, signal, OnInit, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { ConfirmDialogComponent, ConfirmDialogData } from '../../../shared/components/confirm-dialog/confirm-dialog';

type AnnouncementType = 'info' | 'warning' | 'critical' | 'maintenance';
type TargetAudience = 'all' | 'paid' | 'free' | 'admins';
type DisplayLocation = 'banner' | 'modal' | 'toast';

interface Announcement {
  id: string;
  title: string;
  message: string;
  type: AnnouncementType;
  target_audience: TargetAudience;
  display_location: DisplayLocation;
  is_dismissible: boolean;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
  created_at: string;
}

/**
 * Announcement List Component
 * Manages platform-wide announcements for users
 */
@Component({
  selector: 'app-announcement-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatChipsModule,
    MatTooltipModule,
    MatMenuModule,
    MatSelectModule,
    MatFormFieldModule,
    MatDialogModule,
    MatSnackBarModule,
  ],
  templateUrl: './announcement-list.component.html',
})
export class AnnouncementListComponent implements OnInit {
  private superAdminService = inject(SuperAdminService);
  private dialog = inject(MatDialog);
  private snackBar = inject(MatSnackBar);
  private destroyRef = inject(DestroyRef);

  isLoading = signal(true);
  error = signal<string | null>(null);
  announcements = signal<Announcement[]>([]);
  filteredAnnouncements = signal<Announcement[]>([]);

  selectedType = signal<AnnouncementType | 'all'>('all');
  selectedStatus = signal<'active' | 'scheduled' | 'expired' | 'all'>('all');

  displayedColumns = ['title', 'type', 'audience', 'location', 'status', 'dates', 'actions'];

  ngOnInit(): void {
    this.loadAnnouncements();
  }

  private loadAnnouncements(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.superAdminService.getAnnouncements()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          // Map service response to component interface
          const announcements: Announcement[] = data.map((a) => ({
            id: a.id,
            title: a.title,
            message: a.message,
            type: a.type as AnnouncementType,
            target_audience: a.target_audience as TargetAudience,
            display_location: a.display_location as DisplayLocation,
            is_dismissible: a.is_dismissible,
            starts_at: a.starts_at,
            ends_at: a.ends_at || null,
            is_active: a.is_active,
            created_at: a.created_at,
          }));
          this.announcements.set(announcements);
          this.filteredAnnouncements.set(announcements);
          this.isLoading.set(false);
        },
        error: (err: Error) => {
          console.error('Failed to load announcements:', err);
          this.error.set('Failed to load announcements');
          this.isLoading.set(false);
        }
      });
  }

  refreshAnnouncements(): void {
    this.loadAnnouncements();
  }

  filterAnnouncements(): void {
    let filtered = this.announcements();

    if (this.selectedType() !== 'all') {
      filtered = filtered.filter((a) => a.type === this.selectedType());
    }

    if (this.selectedStatus() !== 'all') {
      const now = new Date();
      filtered = filtered.filter((a) => {
        const starts = new Date(a.starts_at);
        const ends = a.ends_at ? new Date(a.ends_at) : null;

        switch (this.selectedStatus()) {
          case 'active':
            return starts <= now && (!ends || ends > now);
          case 'scheduled':
            return starts > now;
          case 'expired':
            return ends && ends < now;
          default:
            return true;
        }
      });
    }

    this.filteredAnnouncements.set(filtered);
  }

  getStatus(announcement: Announcement): 'active' | 'scheduled' | 'expired' {
    const now = new Date();
    const starts = new Date(announcement.starts_at);
    const ends = announcement.ends_at ? new Date(announcement.ends_at) : null;

    if (starts > now) return 'scheduled';
    if (ends && ends < now) return 'expired';
    return 'active';
  }

  getTypeColor(type: AnnouncementType): string {
    const colors: Record<AnnouncementType, string> = {
      info: 'info',
      warning: 'warning',
      critical: 'critical',
      maintenance: 'maintenance',
    };
    return colors[type];
  }

  deleteAnnouncement(id: string): void {
    const dialogData: ConfirmDialogData = {
      title: 'Delete Announcement',
      message: 'Are you sure you want to delete this announcement?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      confirmColor: 'warn',
      icon: 'delete',
      iconColor: '#f44336',
    };

    const dialogRef = this.dialog.open(ConfirmDialogComponent, {
      data: dialogData,
      width: '400px',
    });

    dialogRef.afterClosed().subscribe((confirmed: boolean) => {
      if (!confirmed) return;

      this.superAdminService.deleteAnnouncement(id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            const updated = this.announcements().filter((a) => a.id !== id);
            this.announcements.set(updated);
            this.filterAnnouncements();
            this.snackBar.open('Announcement deleted', 'Close', {
              duration: 2000,
              horizontalPosition: 'end',
              verticalPosition: 'top',
            });
          },
          error: (err) => {
            console.error('Failed to delete announcement:', err);
            this.snackBar.open('Failed to delete announcement', 'Close', {
              duration: 3000,
              horizontalPosition: 'end',
              verticalPosition: 'top',
            });
          }
        });
    });
  }

  getAudienceIcon(audience: TargetAudience): string {
    const icons: Record<TargetAudience, string> = {
      all: 'public',
      paid: 'workspace_premium',
      free: 'people',
      admins: 'admin_panel_settings',
    };
    return icons[audience];
  }

  getAudienceLabel(audience: TargetAudience): string {
    const labels: Record<TargetAudience, string> = {
      all: 'All Users',
      paid: 'Paid Plans',
      free: 'Free Plan',
      admins: 'Admins Only',
    };
    return labels[audience];
  }
}
