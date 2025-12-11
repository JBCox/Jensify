import { Component, Input, ChangeDetectionStrategy, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { OrganizationService } from '../../../core/services/organization.service';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * Brand logo component that displays the Expensed logo with dynamic organization colors
 * and optionally shows the organization's custom logo alongside it.
 *
 * The Expensed logo color adapts to the organization's primary brand color.
 * If the organization has a custom logo, it displays both logos.
 */
@Component({
  selector: 'app-brand-logo',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="brand-logo-container" [class.show-org-logo]="showOrgLogo() && orgLogoUrl()">
      <!-- Expensed Logo (dynamically colored via CSS variable) -->
      <div class="expensed-logo" [style.height.px]="size">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          [attr.viewBox]="'0 0 260 64'"
          [attr.height]="size"
          class="logo-svg"
        >
          <!-- Receipt/Document Icon -->
          <g transform="translate(0, 4)" fill="var(--jensify-primary, #F7580C)">
            <!-- Main receipt body -->
            <path d="M8 0h32c2.2 0 4 1.8 4 4v44c0 1.1-.45 2.1-1.17 2.83l-6 6c-.73.72-1.73 1.17-2.83 1.17H8c-2.2 0-4-1.8-4-4V4c0-2.2 1.8-4 4-4z"/>
            <!-- Folded corner -->
            <path d="M44 44v8l-8-8h8z" fill-opacity="0.7"/>
            <!-- Receipt lines (white) -->
            <rect x="12" y="12" width="24" height="3" rx="1.5" fill="#fff"/>
            <rect x="12" y="20" width="20" height="3" rx="1.5" fill="#fff"/>
            <rect x="12" y="28" width="16" height="3" rx="1.5" fill="#fff"/>
            <rect x="12" y="36" width="22" height="3" rx="1.5" fill="#fff"/>
            <!-- Dollar sign circle on receipt -->
            <circle cx="36" cy="20" r="8" fill="#fff"/>
          </g>
          <!-- Dollar sign in circle (uses primary color) -->
          <text
            x="36"
            y="28"
            font-family="Arial, sans-serif"
            font-size="12"
            font-weight="bold"
            text-anchor="middle"
            fill="var(--jensify-primary, #F7580C)"
          >$</text>

          <!-- "Expen$ed" Text -->
          <text
            x="60"
            y="44"
            font-family="'Segoe UI', Arial, sans-serif"
            [attr.font-size]="fontSize"
            font-weight="600"
            letter-spacing="-0.5"
            fill="var(--jensify-text-strong, #1a1a2e)"
          >
            Expen<tspan font-weight="700" fill="var(--jensify-primary, #F7580C)">$</tspan>ed
          </text>
        </svg>
      </div>

      <!-- Organization Logo (if available and showOrgLogo is true) -->
      @if (showOrgLogo() && orgLogoUrl()) {
        <div class="org-logo-divider"></div>
        <div class="org-logo" [style.height.px]="orgLogoSize()">
          <img
            [src]="orgLogoUrl()"
            [alt]="orgName() + ' logo'"
            class="org-logo-img"
            (error)="onOrgLogoError($event)"
          />
        </div>
      }
    </div>
  `,
  styles: [`
    .brand-logo-container {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .expensed-logo {
      display: flex;
      align-items: center;
    }

    .logo-svg {
      width: auto;
      display: block;
    }

    .org-logo-divider {
      width: 1px;
      height: 32px;
      background: var(--jensify-border-subtle, rgba(255, 255, 255, 0.1));
    }

    .org-logo {
      display: flex;
      align-items: center;
    }

    .org-logo-img {
      height: 100%;
      width: auto;
      max-width: 120px;
      object-fit: contain;
    }

    /* When showing org logo, reduce Expensed logo size slightly */
    .brand-logo-container.show-org-logo .expensed-logo {
      transform: scale(0.85);
      transform-origin: left center;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class BrandLogoComponent {
  private organizationService = inject(OrganizationService);

  /** Height of the Expensed logo in pixels */
  @Input() size = 56;

  /** Whether to show the organization's custom logo alongside Expensed logo */
  @Input() showOrgLogoInput = true;

  // Get organization data as signals
  private currentOrg = toSignal(this.organizationService.currentOrganization$);

  /** Computed font size based on logo size */
  get fontSize(): number {
    return Math.round(this.size * 0.56); // ~36px at 64px height
  }

  /** Whether to show org logo (input + has logo) */
  showOrgLogo = computed(() => this.showOrgLogoInput);

  /** Organization logo URL */
  orgLogoUrl = computed(() => this.currentOrg()?.logo_url || null);

  /** Organization name for alt text */
  orgName = computed(() => this.currentOrg()?.name || 'Organization');

  /** Organization logo size (slightly smaller than main logo) */
  orgLogoSize = computed(() => Math.round(this.size * 0.75));

  /** Handle org logo load error - hide the broken image */
  onOrgLogoError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.style.display = 'none';
  }
}
