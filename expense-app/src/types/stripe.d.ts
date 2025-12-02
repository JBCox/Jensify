/**
 * Stripe.js Type Definitions
 *
 * Minimal type definitions for Stripe.js bank account tokenization.
 * For full types, install @stripe/stripe-js
 */

declare namespace stripe {
  interface Stripe {
    /**
     * Creates a token from bank account data
     */
    createToken(
      type: 'bank_account',
      data: BankAccountData
    ): Promise<TokenResult>;
  }

  interface BankAccountData {
    country: string;
    currency: string;
    routing_number: string;
    account_number: string;
    account_holder_name: string;
    account_holder_type: 'individual' | 'company';
  }

  interface TokenResult {
    token?: Token;
    error?: Error;
  }

  interface Token {
    id: string;
    object: 'token';
    bank_account?: BankAccount;
    created: number;
    livemode: boolean;
    type: string;
    used: boolean;
  }

  interface BankAccount {
    id: string;
    object: 'bank_account';
    account_holder_name: string;
    account_holder_type: 'individual' | 'company';
    bank_name: string;
    country: string;
    currency: string;
    fingerprint: string;
    last4: string;
    routing_number: string;
    status: 'new' | 'validated' | 'verified' | 'verification_failed' | 'errored';
  }

  interface Error {
    type: string;
    code?: string;
    message: string;
    param?: string;
  }
}

/**
 * Global Stripe constructor
 */
declare function Stripe(publishableKey: string, options?: {
  stripeAccount?: string;
  apiVersion?: string;
  locale?: string;
}): stripe.Stripe;
