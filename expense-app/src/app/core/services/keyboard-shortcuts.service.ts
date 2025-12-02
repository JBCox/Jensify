import { Injectable, OnDestroy } from '@angular/core';
import { fromEvent, Subject } from 'rxjs';
import { takeUntil, filter } from 'rxjs/operators';

/**
 * Keyboard Shortcut Configuration
 */
export interface KeyboardShortcut {
  /** Unique identifier for the shortcut */
  id: string;
  /** Key(s) to trigger the shortcut (e.g., 'k', 'Escape', '/') */
  key: string;
  /** Ctrl key required */
  ctrl?: boolean;
  /** Alt key required */
  alt?: boolean;
  /** Shift key required */
  shift?: boolean;
  /** Meta (Cmd on Mac, Win on Windows) key required */
  meta?: boolean;
  /** Description of what the shortcut does */
  description: string;
  /** Callback function to execute */
  callback: () => void;
  /** Optional: Only trigger in specific context */
  context?: string;
  /** Optional: Prevent default browser behavior */
  preventDefault?: boolean;
  /** Optional: Stop event propagation */
  stopPropagation?: boolean;
}

/**
 * Keyboard Shortcuts Service
 * Global keyboard shortcut management for the application
 *
 * Features:
 * - Global shortcut registration
 * - Context-aware shortcuts
 * - Modifier key support (Ctrl, Alt, Shift, Meta)
 * - Automatic cleanup
 * - Help dialog integration
 *
 * @example
 * ```typescript
 * keyboardService.registerShortcut({
 *   id: 'search',
 *   key: 'k',
 *   ctrl: true,
 *   description: 'Open search',
 *   callback: () => this.openSearch()
 * });
 * ```
 */
@Injectable({
  providedIn: 'root'
})
export class KeyboardShortcutsService implements OnDestroy {
  private shortcuts = new Map<string, KeyboardShortcut>();
  private destroy$ = new Subject<void>();
  private enabled = true;
  private currentContext: string | null = null;

  constructor() {
    this.initializeGlobalListener();
    this.registerDefaultShortcuts();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize global keyboard event listener
   */
  private initializeGlobalListener(): void {
    fromEvent<KeyboardEvent>(document, 'keydown')
      .pipe(
        takeUntil(this.destroy$),
        filter(() => this.enabled)
      )
      .subscribe((event) => {
        this.handleKeyboardEvent(event);
      });
  }

  /**
   * Register default application shortcuts
   */
  private registerDefaultShortcuts(): void {
    // ESC - Close modals/dialogs
    this.registerShortcut({
      id: 'close-modal',
      key: 'Escape',
      description: 'Close modal or dialog',
      callback: () => {
        // Emit event for components to listen to
        window.dispatchEvent(new CustomEvent('keyboard:escape'));
      },
      preventDefault: false
    });

    // ? - Show shortcuts help
    this.registerShortcut({
      id: 'show-help',
      key: '?',
      shift: true,
      description: 'Show keyboard shortcuts',
      callback: () => {
        window.dispatchEvent(new CustomEvent('keyboard:show-help'));
      },
      preventDefault: true
    });

    // Ctrl+K or / - Focus search
    this.registerShortcut({
      id: 'focus-search-ctrl',
      key: 'k',
      ctrl: true,
      description: 'Focus search',
      callback: () => {
        this.focusSearch();
      },
      preventDefault: true
    });

    this.registerShortcut({
      id: 'focus-search-slash',
      key: '/',
      description: 'Focus search (alternative)',
      callback: () => {
        this.focusSearch();
      },
      preventDefault: true
    });
  }

  /**
   * Handle keyboard event and trigger matching shortcuts
   */
  private handleKeyboardEvent(event: KeyboardEvent): void {
    // Don't trigger shortcuts when typing in input fields (except for special keys)
    if (this.isTypingInInput(event)) {
      // Allow Escape even in input fields
      if (event.key !== 'Escape') {
        return;
      }
    }

    // Find matching shortcut
    for (const shortcut of this.shortcuts.values()) {
      if (this.matchesShortcut(event, shortcut)) {
        // Check context if specified
        if (shortcut.context && shortcut.context !== this.currentContext) {
          continue;
        }

        // Execute callback
        shortcut.callback();

        // Prevent default if specified
        if (shortcut.preventDefault) {
          event.preventDefault();
        }

        // Stop propagation if specified
        if (shortcut.stopPropagation) {
          event.stopPropagation();
        }

        // Only trigger first matching shortcut
        break;
      }
    }
  }

  /**
   * Check if user is typing in an input field
   */
  private isTypingInInput(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    if (!target || !target.tagName) {
      return false;
    }
    const tagName = target.tagName.toLowerCase();
    const isContentEditable = target.isContentEditable;

    return (
      tagName === 'input' ||
      tagName === 'textarea' ||
      tagName === 'select' ||
      isContentEditable
    );
  }

  /**
   * Check if keyboard event matches shortcut configuration
   */
  private matchesShortcut(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
    // Check key match
    if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) {
      return false;
    }

    // Check modifier keys
    if (shortcut.ctrl && !event.ctrlKey) return false;
    if (!shortcut.ctrl && event.ctrlKey) return false;

    if (shortcut.alt && !event.altKey) return false;
    if (!shortcut.alt && event.altKey) return false;

    if (shortcut.shift && !event.shiftKey) return false;
    if (!shortcut.shift && event.shiftKey) return false;

    if (shortcut.meta && !event.metaKey) return false;
    if (!shortcut.meta && event.metaKey) return false;

    return true;
  }

  /**
   * Focus search input (global search)
   */
  private focusSearch(): void {
    // Try to find search input
    const searchInput = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="Search" i], input[placeholder*="search" i]');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    } else {
      // Emit event for components to handle
      window.dispatchEvent(new CustomEvent('keyboard:focus-search'));
    }
  }

  /**
   * Register a new keyboard shortcut
   */
  registerShortcut(shortcut: KeyboardShortcut): void {
    this.shortcuts.set(shortcut.id, shortcut);
  }

  /**
   * Unregister a keyboard shortcut
   */
  unregisterShortcut(id: string): void {
    this.shortcuts.delete(id);
  }

  /**
   * Enable keyboard shortcuts
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disable keyboard shortcuts (e.g., when modal is open)
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Set current context for context-aware shortcuts
   */
  setContext(context: string | null): void {
    this.currentContext = context;
  }

  /**
   * Get all registered shortcuts
   */
  getAllShortcuts(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Get shortcuts for help dialog
   */
  getShortcutsForHelp(): { group: string; shortcuts: KeyboardShortcut[] }[] {
    const allShortcuts = this.getAllShortcuts();

    return [
      {
        group: 'General',
        shortcuts: allShortcuts.filter(s =>
          ['close-modal', 'show-help', 'focus-search-ctrl', 'focus-search-slash'].includes(s.id)
        )
      }
    ];
  }

  /**
   * Format shortcut for display (e.g., "Ctrl+K")
   */
  formatShortcut(shortcut: KeyboardShortcut): string {
    const parts: string[] = [];

    if (shortcut.ctrl) parts.push('Ctrl');
    if (shortcut.alt) parts.push('Alt');
    if (shortcut.shift) parts.push('Shift');
    if (shortcut.meta) parts.push('⌘');

    parts.push(shortcut.key.toUpperCase());

    return parts.join('+');
  }
}
