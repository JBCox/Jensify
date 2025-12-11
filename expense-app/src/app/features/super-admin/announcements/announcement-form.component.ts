import { Component, inject, signal, OnInit, computed, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatNativeDateModule } from '@angular/material/core';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDividerModule } from '@angular/material/divider';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SuperAdminService } from '../../../core/services/super-admin.service';
import { LoggerService } from '../../../core/services/logger.service';

type AnnouncementType = 'info' | 'warning' | 'critical' | 'maintenance';
type TargetAudience = 'all' | 'paid' | 'free' | 'admins';
type DisplayLocation = 'banner' | 'modal' | 'toast';

/**
 * Announcement Form Component
 * Create or edit platform-wide announcements
 */
@Component({
  selector: 'app-announcement-form',
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
    MatSelectModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatNativeDateModule,
    MatSnackBarModule,
    MatProgressSpinnerModule,
    MatDividerModule,
  ],
  templateUrl: './announcement-form.component.html',
})
export class AnnouncementFormComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private superAdminService = inject(SuperAdminService);
  private snackBar = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  private destroyRef = inject(DestroyRef);
  private readonly logger = inject(LoggerService);

  isLoading = signal(true);
  isSaving = signal(false);
  announcementId = signal<string | null>(null);

  types: { value: AnnouncementType; label: string; icon: string; color: string }[] = [
    { value: 'info', label: 'Information', icon: 'info', color: '#2196f3' },
    { value: 'warning', label: 'Warning', icon: 'warning', color: '#ff9800' },
    { value: 'critical', label: 'Critical', icon: 'error', color: '#f44336' },
    { value: 'maintenance', label: 'Maintenance', icon: 'engineering', color: '#9c27b0' },
  ];

  audiences: { value: TargetAudience; label: string; icon: string }[] = [
    { value: 'all', label: 'All Users', icon: 'public' },
    { value: 'paid', label: 'Paid Plans', icon: 'workspace_premium' },
    { value: 'free', label: 'Free Plan', icon: 'people' },
    { value: 'admins', label: 'Admins Only', icon: 'admin_panel_settings' },
  ];

  locations: { value: DisplayLocation; label: string; description: string }[] = [
    { value: 'banner', label: 'Banner', description: 'Top of page banner' },
    { value: 'modal', label: 'Modal', description: 'Pop-up dialog' },
    { value: 'toast', label: 'Toast', description: 'Bottom notification' },
  ];

  announcementForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(100)]],
    message: ['', [Validators.required, Validators.maxLength(500)]],
    type: ['info' as AnnouncementType, Validators.required],
    target_audience: ['all' as TargetAudience, Validators.required],
    display_location: ['banner' as DisplayLocation, Validators.required],
    is_dismissible: [true],
    starts_at: [new Date(), Validators.required],
    has_end_date: [false],
    ends_at: [null as Date | null],
  });

  selectedType = computed(() => {
    const typeValue = this.announcementForm.get('type')?.value;
    return this.types.find((t) => t.value === typeValue);
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    this.announcementId.set(id);

    if (id && id !== 'new') {
      this.loadAnnouncement(id);
    } else {
      this.isLoading.set(false);
    }

    // Handle end date toggle
    this.announcementForm.get('has_end_date')?.valueChanges.subscribe((hasEnd) => {
      const endsAtControl = this.announcementForm.get('ends_at');
      if (hasEnd) {
        endsAtControl?.setValidators([Validators.required]);
        endsAtControl?.enable();
      } else {
        endsAtControl?.clearValidators();
        endsAtControl?.setValue(null);
        endsAtControl?.disable();
      }
      endsAtControl?.updateValueAndValidity();
    });
  }

  private loadAnnouncement(id: string): void {
    this.isLoading.set(true);

    this.superAdminService.getAnnouncements()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (announcements) => {
          const announcement = announcements.find((a) => a.id === id);
          if (announcement) {
            this.announcementForm.patchValue({
              title: announcement.title,
              message: announcement.message,
              type: announcement.type as AnnouncementType,
              target_audience: announcement.target_audience as TargetAudience,
              display_location: announcement.display_location as DisplayLocation,
              is_dismissible: announcement.is_dismissible,
              starts_at: announcement.starts_at ? new Date(announcement.starts_at) : new Date(),
              has_end_date: announcement.ends_at !== null && announcement.ends_at !== undefined,
              ends_at: announcement.ends_at ? new Date(announcement.ends_at) : null,
            });
          }
          this.isLoading.set(false);
        },
        error: (err: Error) => {
          this.logger.error('Failed to load announcement', err, 'AnnouncementFormComponent.loadAnnouncement', { announcementId: id });
          this.snackBar.open('Failed to load announcement', 'Close', { duration: 3000 });
          this.isLoading.set(false);
        }
      });
  }

  save(): void {
    if (this.announcementForm.invalid) {
      this.snackBar.open('Please fix validation errors', 'Close', {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });
      return;
    }

    this.isSaving.set(true);

    const formValue = this.announcementForm.value;
    const startsAt = formValue.starts_at instanceof Date
      ? formValue.starts_at.toISOString()
      : (formValue.starts_at || new Date().toISOString());
    const endsAt = formValue.has_end_date && formValue.ends_at
      ? (formValue.ends_at instanceof Date ? formValue.ends_at.toISOString() : formValue.ends_at)
      : undefined;

    const announcementData = {
      title: formValue.title || '',
      message: formValue.message || '',
      type: (formValue.type || 'info') as AnnouncementType,
      target_audience: (formValue.target_audience || 'all') as TargetAudience,
      display_location: (formValue.display_location || 'banner') as DisplayLocation,
      is_dismissible: formValue.is_dismissible ?? true,
      starts_at: startsAt,
      ends_at: endsAt,
    };

    const id = this.announcementId();
    const isUpdate = id && id !== 'new';

    const onSuccess = (): void => {
      this.isSaving.set(false);
      this.router.navigate(['/super-admin/announcements']);
    };

    const onError = (err: Error): void => {
      this.logger.error('Failed to save announcement', err, 'AnnouncementFormComponent.save', { isUpdate, announcementId: id });
      this.snackBar.open('Failed to save announcement', 'Close', {
        duration: 3000,
        horizontalPosition: 'end',
        verticalPosition: 'top',
      });
      this.isSaving.set(false);
    };

    if (isUpdate) {
      this.superAdminService.updateAnnouncement(id, announcementData)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: onSuccess, error: onError });
    } else {
      this.superAdminService.createAnnouncement(announcementData)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({ next: onSuccess, error: onError });
    }
  }

  cancel(): void {
    this.router.navigate(['/super-admin/announcements']);
  }

  getAudienceLabel(): string {
    const audience = this.announcementForm.get('target_audience')?.value;
    const found = this.audiences.find((a) => a.value === audience);
    return found?.label || 'All Users';
  }
}
