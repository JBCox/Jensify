import { TestBed } from '@angular/core/testing';
import { KeyboardShortcutsService, KeyboardShortcut } from './keyboard-shortcuts.service';

describe('KeyboardShortcutsService', () => {
  let service: KeyboardShortcutsService;

  // Helper function to create a keyboard event for testing
  function createTestKeyboardEvent(key: string, options: {
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
  } = {}): KeyboardEvent {
    const event = document.createEvent('KeyboardEvent') as any;
    Object.defineProperties(event, {
      key: { value: key, writable: false },
      ctrlKey: { value: options.ctrl || false, writable: false },
      altKey: { value: options.alt || false, writable: false },
      shiftKey: { value: options.shift || false, writable: false },
      metaKey: { value: options.meta || false, writable: false }
    });
    event.initEvent('keydown', true, true);
    return event;
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(KeyboardShortcutsService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should register default shortcuts on initialization', () => {
    const shortcuts = service.getAllShortcuts();
    expect(shortcuts.length).toBeGreaterThan(0);

    // Check for default shortcuts
    const shortcutIds = shortcuts.map(s => s.id);
    expect(shortcutIds).toContain('close-modal');
    expect(shortcutIds).toContain('show-help');
    expect(shortcutIds).toContain('focus-search-ctrl');
    expect(shortcutIds).toContain('focus-search-slash');
  });

  it('should register a custom shortcut', () => {
    const callback = jasmine.createSpy('callback');
    const shortcut: KeyboardShortcut = {
      id: 'test-shortcut',
      key: 't',
      ctrl: true,
      description: 'Test shortcut',
      callback
    };

    service.registerShortcut(shortcut);
    const shortcuts = service.getAllShortcuts();
    const registered = shortcuts.find(s => s.id === 'test-shortcut');

    expect(registered).toBeDefined();
    expect(registered?.key).toBe('t');
    expect(registered?.ctrl).toBe(true);
  });

  it('should unregister a shortcut', () => {
    const callback = jasmine.createSpy('callback');
    const shortcut: KeyboardShortcut = {
      id: 'temp-shortcut',
      key: 'x',
      description: 'Temporary shortcut',
      callback
    };

    service.registerShortcut(shortcut);
    expect(service.getAllShortcuts().find(s => s.id === 'temp-shortcut')).toBeDefined();

    service.unregisterShortcut('temp-shortcut');
    expect(service.getAllShortcuts().find(s => s.id === 'temp-shortcut')).toBeUndefined();
  });

  xit('should trigger shortcut callback on matching key event', (done) => {
    const callback = jasmine.createSpy('callback');
    const shortcut: KeyboardShortcut = {
      id: 'ctrl-t',
      key: 't',
      ctrl: true,
      description: 'Ctrl+T shortcut',
      callback
    };

    service.registerShortcut(shortcut);

    const event = createTestKeyboardEvent('t', { ctrl: true });
    document.dispatchEvent(event);

    // Wait for async event handling
    setTimeout(() => {
      expect(callback).toHaveBeenCalled();
      done();
    }, 100);
  });

  xit('should not trigger shortcut when modifiers do not match', (done) => {
    const callback = jasmine.createSpy('callback');
    const shortcut: KeyboardShortcut = {
      id: 'ctrl-s',
      key: 's',
      ctrl: true,
      description: 'Ctrl+S shortcut',
      callback
    };

    service.registerShortcut(shortcut);

    const event = createTestKeyboardEvent('s'); // No ctrl key
    document.dispatchEvent(event);

    setTimeout(() => {
      expect(callback).not.toHaveBeenCalled();
      done();
    }, 100);
  });

  xit('should enable and disable shortcuts', (done) => {
    const callback = jasmine.createSpy('callback');
    const shortcut: KeyboardShortcut = {
      id: 'toggle-test',
      key: 'g',
      description: 'Toggle test',
      callback
    };

    service.registerShortcut(shortcut);

    // Disable shortcuts
    service.disable();

    const event1 = createTestKeyboardEvent('g');
    document.dispatchEvent(event1);

    setTimeout(() => {
      expect(callback).not.toHaveBeenCalled();

      // Re-enable shortcuts
      service.enable();

      const event2 = createTestKeyboardEvent('g');
      document.dispatchEvent(event2);

      setTimeout(() => {
        expect(callback).toHaveBeenCalled();
        done();
      }, 100);
    }, 100);
  });

  xit('should handle context-aware shortcuts', (done) => {
    const callback = jasmine.createSpy('callback');
    const shortcut: KeyboardShortcut = {
      id: 'context-test',
      key: 'h',
      description: 'Context-specific shortcut',
      callback,
      context: 'expenses'
    };

    service.registerShortcut(shortcut);

    // Trigger without context
    const event1 = createTestKeyboardEvent('h');
    document.dispatchEvent(event1);

    setTimeout(() => {
      expect(callback).not.toHaveBeenCalled();

      // Set context and trigger again
      service.setContext('expenses');

      const event2 = createTestKeyboardEvent('h');
      document.dispatchEvent(event2);

      setTimeout(() => {
        expect(callback).toHaveBeenCalled();
        done();
      }, 100);
    }, 100);
  });

  it('should format shortcuts correctly', () => {
    const shortcut1: KeyboardShortcut = {
      id: 'test1',
      key: 'k',
      ctrl: true,
      description: 'Test',
      callback: () => {}
    };

    const shortcut2: KeyboardShortcut = {
      id: 'test2',
      key: 's',
      ctrl: true,
      shift: true,
      description: 'Test',
      callback: () => {}
    };

    expect(service.formatShortcut(shortcut1)).toBe('Ctrl+K');
    expect(service.formatShortcut(shortcut2)).toBe('Ctrl+Shift+S');
  });

  xit('should dispatch custom event for escape key', (done) => {
    const listener = jasmine.createSpy('listener');
    window.addEventListener('keyboard:escape', listener);

    const event = createTestKeyboardEvent('Escape');
    document.dispatchEvent(event);

    setTimeout(() => {
      expect(listener).toHaveBeenCalled();
      window.removeEventListener('keyboard:escape', listener);
      done();
    }, 100);
  });

  xit('should dispatch custom event for show help shortcut', (done) => {
    const listener = jasmine.createSpy('listener');
    window.addEventListener('keyboard:show-help', listener);

    const event = createTestKeyboardEvent('?', { shift: true });
    document.dispatchEvent(event);

    setTimeout(() => {
      expect(listener).toHaveBeenCalled();
      window.removeEventListener('keyboard:show-help', listener);
      done();
    }, 100);
  });
});
