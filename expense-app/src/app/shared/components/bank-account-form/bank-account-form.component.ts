import { Component, OnInit, OnDestroy, output, input, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../../environments/environment';

// Stripe.js is loaded dynamically from https://js.stripe.com/v3/
// The global `Stripe` function creates a Stripe instance
declare const Stripe: (publishableKey: string, options?: { stripeAccount?: string }) => stripe.Stripe;

/**
 * Secure Bank Account Form Component
 *
 * This component uses Stripe.js to securely collect bank account information.
 * Raw bank account/routing numbers NEVER touch our servers - only Stripe tokens.
 *
 * SECURITY:
 * - Uses Stripe.js for PCI-compliant data collection
 * - Only emits Stripe tokens (btok_xxx), never raw account numbers
 * - Supports micro-deposit verification for account ownership
 *
 * @example
 * ```html
 * <app-bank-account-form
 *   [accountHolderName]="user.fullName"
 *   (tokenCreated)="handleToken($event)"
 *   (error)="handleError($event)">
 * </app-bank-account-form>
 * ```
 */
@Component({
  selector: 'app-bank-account-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatCardModule,
    MatCheckboxModule,
  ],
  templateUrl: './bank-account-form.component.html',
  styleUrls: ['./bank-account-form.component.scss']
})
export class BankAccountFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly destroy$ = new Subject<void>();

  /** Pre-fill account holder name */
  accountHolderName = input<string>('');

  /** Emitted when a bank account token is successfully created */
  tokenCreated = output<string>();

  /** Emitted when an error occurs */
  error = output<string>();

  /** Emitted when form is cancelled */
  cancelled = output<void>();

  /** Form for account holder details */
  form!: FormGroup;

  /** Stripe instance */
  private stripe: stripe.Stripe | null = null;

  /** Loading state */
  isLoading = signal(false);

  /** Stripe loaded state */
  stripeLoaded = signal(false);

  /** Error message to display */
  errorMessage = signal<string | null>(null);

  /** Success state */
  showSuccess = signal(false);

  /** Account type options */
  readonly accountTypes = [
    { value: 'checking', label: 'Checking' },
    { value: 'savings', label: 'Savings' }
  ];

  /** Account holder type options */
  readonly holderTypes = [
    { value: 'individual', label: 'Individual' },
    { value: 'company', label: 'Business' }
  ];

  ngOnInit(): void {
    this.initForm();
    this.loadStripe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initForm(): void {
    this.form = this.fb.group({
      accountHolderName: [this.accountHolderName(), [Validators.required, Validators.minLength(2)]],
      accountHolderType: ['individual', Validators.required],
      routingNumber: ['', [Validators.required, Validators.pattern(/^\d{9}$/)]],
      accountNumber: ['', [Validators.required, Validators.pattern(/^\d{4,17}$/)]],
      accountNumberConfirm: ['', Validators.required],
      accountType: ['checking', Validators.required],
      acceptTerms: [false, Validators.requiredTrue]
    }, {
      validators: this.accountNumberMatchValidator
    });
  }

  /**
   * Custom validator to ensure account numbers match
   */
  private accountNumberMatchValidator(group: FormGroup): { [key: string]: boolean } | null {
    const accountNumber = group.get('accountNumber')?.value;
    const confirmNumber = group.get('accountNumberConfirm')?.value;

    if (accountNumber && confirmNumber && accountNumber !== confirmNumber) {
      return { accountNumberMismatch: true };
    }
    return null;
  }

  /**
   * Load Stripe.js dynamically
   */
  private loadStripe(): void {
    // Check if Stripe is already loaded
    if (typeof Stripe !== 'undefined') {
      this.initializeStripe();
      return;
    }

    // Load Stripe.js script
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/';
    script.async = true;
    script.onload = () => this.initializeStripe();
    script.onerror = () => {
      this.errorMessage.set('Failed to load payment processor. Please refresh and try again.');
    };
    document.head.appendChild(script);
  }

  /**
   * Initialize Stripe with publishable key
   */
  private initializeStripe(): void {
    try {
      // Get publishable key from environment
      const publishableKey = environment.stripe?.publishableKey;

      if (!publishableKey) {
        this.errorMessage.set('Payment configuration is missing. Please contact support.');
        return;
      }

      this.stripe = Stripe(publishableKey);
      this.stripeLoaded.set(true);
    } catch (err) {
      console.error('Failed to initialize Stripe:', err);
      this.errorMessage.set('Failed to initialize payment processor.');
    }
  }

  /**
   * Create bank account token via Stripe
   */
  async createToken(): Promise<void> {
    if (!this.stripe) {
      this.errorMessage.set('Payment processor not initialized. Please refresh the page.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    try {
      const formValue = this.form.value;

      // Create bank account token using Stripe.js
      // This sends bank details directly to Stripe - they never touch our server
      const result = await this.stripe.createToken('bank_account', {
        country: 'US',
        currency: 'usd',
        routing_number: formValue.routingNumber,
        account_number: formValue.accountNumber,
        account_holder_name: formValue.accountHolderName,
        account_holder_type: formValue.accountHolderType,
      });

      if (result.error) {
        this.handleStripeError(result.error);
        return;
      }

      if (result.token) {
        // Clear sensitive data from form
        this.form.patchValue({
          routingNumber: '',
          accountNumber: '',
          accountNumberConfirm: ''
        });

        this.showSuccess.set(true);

        // Emit the token ID - this is safe to send to our server
        this.tokenCreated.emit(result.token.id);
      }
    } catch (err) {
      console.error('Token creation failed:', err);
      this.errorMessage.set('An unexpected error occurred. Please try again.');
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Handle Stripe-specific errors
   */
  private handleStripeError(error: stripe.Error): void {
    switch (error.code) {
      case 'invalid_routing_number':
        this.errorMessage.set('Invalid routing number. Please check and try again.');
        break;
      case 'invalid_account_number':
        this.errorMessage.set('Invalid account number. Please check and try again.');
        break;
      case 'routing_number_invalid':
        this.errorMessage.set('The routing number is not valid.');
        break;
      case 'account_number_invalid':
        this.errorMessage.set('The account number is not valid.');
        break;
      default:
        this.errorMessage.set(error.message || 'An error occurred processing your bank account.');
    }

    this.error.emit(this.errorMessage() || 'Unknown error');
  }

  /**
   * Cancel form
   */
  cancel(): void {
    this.form.reset();
    this.cancelled.emit();
  }

  /**
   * Get error message for a form field
   */
  getFieldError(fieldName: string): string {
    const control = this.form.get(fieldName);
    if (!control?.errors || !control.touched) return '';

    if (control.errors['required']) return 'This field is required';
    if (control.errors['minlength']) return 'Name is too short';
    if (control.errors['pattern']) {
      if (fieldName === 'routingNumber') return 'Routing number must be 9 digits';
      if (fieldName === 'accountNumber') return 'Account number must be 4-17 digits';
    }

    return '';
  }

  /**
   * Check if account numbers match
   */
  get accountNumberMismatch(): boolean {
    return this.form.hasError('accountNumberMismatch') &&
      this.form.get('accountNumberConfirm')?.touched === true;
  }
}
