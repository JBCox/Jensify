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
      <!-- Expensed Logo -->
      <div class="expensed-logo" [style.height.px]="size">
        <!-- Logo Icon (PNG image) -->
        <img
          src="assets/images/logo-64.png"
          alt="Expensed"
          class="logo-icon"
          [style.height.px]="size"
        />
        <!-- "Expen$ed" Text (SVG for styling control) -->
        <svg
          xmlns="http://www.w3.org/2000/svg"
          [attr.viewBox]="'0 0 160 64'"
          [attr.height]="size"
          class="logo-text-svg"
        >
          <text
            x="4"
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
      gap: 8px;
    }

    .logo-icon {
      width: auto;
      object-fit: contain;
    }

    .logo-text-svg {
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
