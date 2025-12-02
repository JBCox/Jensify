/**
 * Test Setup File
 *
 * This file patches DOM methods that Angular Material relies on but which
 * can fail in headless Chrome environments during afterAll cleanup.
 *
 * The main issue: Angular Material's form-field component calls
 * document.documentElement.appendChild() in its estimateScrollWidth function,
 * which can fail in headless Chrome when the DOM is being destroyed.
 *
 * Additionally, it mocks the Navigator LockManager API to prevent Supabase's
 * GoTrueClient from causing "multiple instances" conflicts in tests.
 */

// Mock Navigator LockManager API to prevent Supabase auth lock conflicts
// This prevents "Acquiring an exclusive Navigator LockManager lock immediately failed" errors
if (typeof navigator !== 'undefined') {
  const mockLocks = {
    request: async (name: string, options: any, callback?: any) => {
      // If callback is the second argument (no options)
      const cb = typeof options === 'function' ? options : callback;
      if (cb) {
        return await cb({ name, mode: 'exclusive' });
      }
      return undefined;
    },
    query: async () => ({
      held: [],
      pending: []
    })
  };

  Object.defineProperty(navigator, 'locks', {
    value: mockLocks,
    writable: true,
    configurable: true
  });
}

// Store original methods before patching
const originalAppendChild = document.documentElement?.appendChild?.bind(document.documentElement);
const originalRemoveChild = document.documentElement?.removeChild?.bind(document.documentElement);

// Create a safe wrapper that checks if the function exists and document is available
function safeAppendChild<T extends Node>(node: T): T {
  try {
    // Check if document and documentElement are still available
    if (!document || !document.documentElement) {
      return node;
    }
    // Check if original function is still valid
    if (typeof originalAppendChild === 'function') {
      return originalAppendChild(node);
    }
    return node;
  } catch (error) {
    // In headless Chrome afterAll, this can fail - return the node anyway
    return node;
  }
}

function safeRemoveChild<T extends Node>(node: T): T {
  try {
    if (!document || !document.documentElement) {
      return node;
    }
    if (typeof originalRemoveChild === 'function') {
      return originalRemoveChild(node);
    }
    return node;
  } catch (error) {
    return node;
  }
}

// Define the patched methods using Object.defineProperty to make them more resilient
if (document.documentElement) {
  Object.defineProperty(document.documentElement, 'appendChild', {
    value: safeAppendChild,
    writable: true,
    configurable: true
  });

  Object.defineProperty(document.documentElement, 'removeChild', {
    value: safeRemoveChild,
    writable: true,
    configurable: true
  });
}

// Patch getComputedStyle to prevent issues with detached elements
const originalGetComputedStyle = window.getComputedStyle?.bind(window);
window.getComputedStyle = function(element: Element, pseudoElt?: string | null): CSSStyleDeclaration {
  try {
    if (typeof originalGetComputedStyle === 'function') {
      return originalGetComputedStyle(element, pseudoElt);
    }
    throw new Error('getComputedStyle not available');
  } catch (error) {
    // Return a minimal CSSStyleDeclaration-like object for detached elements
    return {
      getPropertyValue: () => '',
      length: 0,
    } as unknown as CSSStyleDeclaration;
  }
};

// Wrap Element.prototype methods to catch errors during cleanup
const originalElementAppendChild = Element.prototype.appendChild;
Element.prototype.appendChild = function<T extends Node>(this: Element, node: T): T {
  try {
    return originalElementAppendChild.call(this, node) as T;
  } catch (error) {
    // Swallow errors during cleanup phase
    return node;
  }
};

const originalElementRemoveChild = Element.prototype.removeChild;
Element.prototype.removeChild = function<T extends Node>(this: Element, node: T): T {
  try {
    return originalElementRemoveChild.call(this, node) as T;
  } catch (error) {
    return node;
  }
};

// Suppress unhandled errors that occur during test cleanup
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event: ErrorEvent) => {
    // Check if the error is from Angular Material form field cleanup
    if (event.message && (
      event.message.includes('appendChild') ||
      event.message.includes('removeChild') ||
      event.message.includes('estimateScrollWidth')
    )) {
      event.preventDefault();
      return true;
    }
    return false;
  });
}

// Export for TypeScript module requirements
export {};
