import { Component, EventEmitter, Input, Output, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface PresetColor {
  name: string;
  hex: string;
}

@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatTooltipModule,
  ],
  template: `
    <div class="color-picker">
      <label class="picker-label">{{ label }}</label>

      <!-- Preset Colors Grid -->
      <div class="presets-grid">
        @for (color of presetColors; track color.hex) {
          <button
            type="button"
            class="color-swatch"
            [class.selected]="selectedColor() === color.hex"
            [style.backgroundColor]="color.hex"
            [matTooltip]="color.name"
            (click)="selectColor(color.hex)"
          >
            @if (selectedColor() === color.hex) {
              <mat-icon class="check-icon">check</mat-icon>
            }
          </button>
        }

        <!-- Custom Color Button -->
        <button
          type="button"
          class="color-swatch custom-swatch"
          [class.selected]="showCustomInput()"
          [matTooltip]="'Custom color'"
          (click)="toggleCustomInput()"
        >
          <mat-icon>colorize</mat-icon>
        </button>
      </div>

      <!-- Custom Color Input -->
      @if (showCustomInput()) {
        <div class="custom-input-row">
          <mat-form-field appearance="outline" class="hex-input">
            <mat-label>Hex Color</mat-label>
            <input
              matInput
              [ngModel]="customHex()"
              (ngModelChange)="onCustomHexChange($event)"
              placeholder="#3B82F6"
              maxlength="7"
            >
            <span matPrefix class="color-preview" [style.backgroundColor]="customHex()"></span>
          </mat-form-field>
          <button
            mat-raised-button
            color="primary"
            type="button"
            [disabled]="!isValidHex(customHex())"
            (click)="applyCustomColor()"
          >
            Apply
          </button>
        </div>
      }

      <!-- Current Selection Preview -->
      @if (selectedColor()) {
        <div class="selection-preview">
          <span class="preview-swatch" [style.backgroundColor]="selectedColor()"></span>
          <span class="preview-text">{{ selectedColor() }}</span>
        </div>
      }
    </div>
  `,
  styles: [`
    .color-picker {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .picker-label {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--jensify-text-secondary, #666);
    }

    .presets-grid {
      display: grid;
      grid-template-columns: repeat(6, 1fr);
      gap: 0.5rem;
    }

    .color-swatch {
      width: 40px;
      height: 40px;
      border-radius: 8px;
      border: 2px solid transparent;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);

      &:hover {
        transform: scale(1.1);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
      }

      &.selected {
        border-color: var(--jensify-text-primary, #333);
        box-shadow: 0 0 0 2px white, 0 0 0 4px var(--jensify-text-primary, #333);
      }

      .check-icon {
        color: white;
        font-size: 20px;
        width: 20px;
        height: 20px;
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
      }
    }

    .custom-swatch {
      background: linear-gradient(135deg, #f0f0f0 25%, #e0e0e0 25%, #e0e0e0 50%, #f0f0f0 50%, #f0f0f0 75%, #e0e0e0 75%);
      background-size: 8px 8px;
      border: 2px dashed var(--jensify-border-medium, #ddd);

      mat-icon {
        color: var(--jensify-text-secondary, #666);
      }

      &:hover {
        border-color: var(--jensify-primary, #ff5900);

        mat-icon {
          color: var(--jensify-primary, #ff5900);
        }
      }

      &.selected {
        border-style: solid;
        border-color: var(--jensify-primary, #ff5900);
      }
    }

    .custom-input-row {
      display: flex;
      gap: 0.5rem;
      align-items: flex-start;
      margin-top: 0.5rem;

      .hex-input {
        flex: 1;
      }

      button {
        margin-top: 4px;
      }
    }

    .color-preview {
      display: inline-block;
      width: 20px;
      height: 20px;
      border-radius: 4px;
      margin-right: 8px;
      border: 1px solid var(--jensify-border-light, #eee);
    }

    .selection-preview {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem;
      background: var(--jensify-bg-subtle, #fafafa);
      border-radius: 6px;
      margin-top: 0.25rem;
    }

    .preview-swatch {
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: 1px solid var(--jensify-border-light, #eee);
    }

    .preview-text {
      font-family: monospace;
      font-size: 0.875rem;
      color: var(--jensify-text-secondary, #666);
    }

    :host-context(.dark) {
      .color-swatch.selected {
        border-color: white;
        box-shadow: 0 0 0 2px var(--jensify-bg-primary, #1e293b), 0 0 0 4px white;
      }

      .custom-swatch {
        background: linear-gradient(135deg, #374151 25%, #4b5563 25%, #4b5563 50%, #374151 50%, #374151 75%, #4b5563 75%);
        border-color: var(--jensify-border-medium, #4b5563);
      }

      .selection-preview {
        background: var(--jensify-bg-secondary, #1e293b);
      }
    }

    @media (max-width: 480px) {
      .presets-grid {
        grid-template-columns: repeat(5, 1fr);
      }

      .color-swatch {
        width: 36px;
        height: 36px;
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColorPickerComponent {
  @Input() label = 'Brand Color';
  @Input() set value(val: string | undefined) {
    if (val) {
      this.selectedColor.set(val);
      // Check if it's a preset or custom
      const isPreset = this.presetColors.some(c => c.hex.toUpperCase() === val.toUpperCase());
      if (!isPreset) {
        this.customHex.set(val);
        this.showCustomInput.set(true);
      }
    }
  }
  @Output() colorChange = new EventEmitter<string>();

  selectedColor = signal<string>('#F7580C');
  showCustomInput = signal(false);
  customHex = signal('#');

  readonly presetColors: PresetColor[] = [
    { name: 'Orange (Default)', hex: '#F7580C' },
    { name: 'Blue', hex: '#3B82F6' },
    { name: 'Emerald', hex: '#10B981' },
    { name: 'Purple', hex: '#8B5CF6' },
    { name: 'Rose', hex: '#F43F5E' },
    { name: 'Amber', hex: '#F59E0B' },
    { name: 'Cyan', hex: '#06B6D4' },
    { name: 'Indigo', hex: '#6366F1' },
    { name: 'Slate', hex: '#64748B' },
    { name: 'Teal', hex: '#14B8A6' },
    { name: 'Pink', hex: '#EC4899' },
  ];

  selectColor(hex: string): void {
    this.selectedColor.set(hex);
    this.showCustomInput.set(false);
    this.colorChange.emit(hex);
  }

  toggleCustomInput(): void {
    this.showCustomInput.update(v => !v);
    if (this.showCustomInput() && !this.customHex().startsWith('#')) {
      this.customHex.set('#');
    }
  }

  onCustomHexChange(value: string): void {
    // Ensure it starts with #
    if (!value.startsWith('#')) {
      value = '#' + value;
    }
    // Only allow valid hex characters
    value = '#' + value.slice(1).replace(/[^0-9A-Fa-f]/g, '').slice(0, 6);
    this.customHex.set(value.toUpperCase());
  }

  applyCustomColor(): void {
    const hex = this.customHex();
    if (this.isValidHex(hex)) {
      this.selectedColor.set(hex);
      this.colorChange.emit(hex);
    }
  }

  isValidHex(hex: string): boolean {
    return /^#[0-9A-Fa-f]{6}$/.test(hex);
  }
}
