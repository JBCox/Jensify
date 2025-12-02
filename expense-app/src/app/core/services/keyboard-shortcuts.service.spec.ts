import { TestBed, fakeAsync, tick } from '@angular/core/testing';
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
    return new KeyboardEvent('keydown', {
      key: key,
      ctrlKey: options.ctrl || false,
      altKey: options.alt || false,
      shiftKey: options.shift || false,
      metaKey: options.meta || false,
      bubbles: true,
      cancelable: true
    });
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

  it('should trigger shortcut callback on matching key event', fakeAsync(() => {
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
    tick(100);
    expect(callback).toHaveBeenCalled();
  }));

  it('should not trigger shortcut when modifiers do not match', fakeAsync(() => {
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

    tick(100);
    expect(callback).not.toHaveBeenCalled();
  }));

  it('should enable and disable shortcuts', fakeAsync(() => {
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

    tick(100);
    expect(callback).not.toHaveBeenCalled();

    // Re-enable shortcuts
    service.enable();

    const event2 = createTestKeyboardEvent('g');
    document.dispatchEvent(event2);

    tick(100);
    expect(callback).toHaveBeenCalled();
  }));

  it('should handle context-aware shortcuts', fakeAsync(() => {
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

    tick(100);
    expect(callback).not.toHaveBeenCalled();

    // Set context and trigger again
    service.setContext('expenses');

    const event2 = createTestKeyboardEvent('h');
    document.dispatchEvent(event2);

    tick(100);
    expect(callback).toHaveBeenCalled();
  }));

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

  it('should dispatch custom event for escape key', fakeAsync(() => {
    const listener = jasmine.createSpy('listener');
    window.addEventListener('keyboard:escape', listener);

    const event = createTestKeyboardEvent('Escape');
    document.dispatchEvent(event);

    tick(100);
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('keyboard:escape', listener);
  }));

  it('should dispatch custom event for show help shortcut', fakeAsync(() => {
    const listener = jasmine.createSpy('listener');
    window.addEventListener('keyboard:show-help', listener);

    const event = createTestKeyboardEvent('?', { shift: true });
    document.dispatchEvent(event);

    tick(100);
    expect(listener).toHaveBeenCalled();
    window.removeEventListener('keyboard:show-help', listener);
  }));
});
