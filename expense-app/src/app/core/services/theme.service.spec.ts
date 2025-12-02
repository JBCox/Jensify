import { TestBed } from '@angular/core/testing';
import { ThemeService, Theme, ColorVariants } from './theme.service';

describe('ThemeService', () => {
  let service: ThemeService;
  let localStorageSpy: jasmine.SpyObj<Storage>;
  let matchMediaSpy: jasmine.Spy;
  let documentElementSpy: jasmine.SpyObj<HTMLElement>;

  beforeEach(() => {
    // Mock localStorage
    localStorageSpy = jasmine.createSpyObj('localStorage', ['getItem', 'setItem', 'removeItem']);
    Object.defineProperty(window, 'localStorage', {
      value: localStorageSpy,
      writable: true
    });

    // Mock document.documentElement
    documentElementSpy = jasmine.createSpyObj('documentElement', ['classList'], {
      classList: jasmine.createSpyObj('classList', ['add', 'remove']),
      style: jasmine.createSpyObj('style', ['setProperty'])
    });
    Object.defineProperty(document, 'documentElement', {
      value: documentElementSpy,
      writable: true,
      configurable: true
    });

    // Mock window.matchMedia
    const mockMediaQueryList = {
      matches: false,
      media: '(prefers-color-scheme: dark)',
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
      addListener: jasmine.createSpy('addListener'),
      removeListener: jasmine.createSpy('removeListener'),
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      onchange: null
    };
    matchMediaSpy = jasmine.createSpy('matchMedia').and.returnValue(mockMediaQueryList);
    Object.defineProperty(window, 'matchMedia', {
      value: matchMediaSpy,
      writable: true,
      configurable: true
    });

    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    // Clean up
    localStorageSpy.getItem.calls.reset();
    localStorageSpy.setItem.calls.reset();
  });

  describe('constructor', () => {
    it('should be created', () => {
      service = TestBed.inject(ThemeService);
      expect(service).toBeTruthy();
    });

    it('should load saved theme from localStorage', () => {
      localStorageSpy.getItem.and.returnValue('light');
      service = TestBed.inject(ThemeService);
      expect(localStorageSpy.getItem).toHaveBeenCalledWith('jensify-theme-preference');
      expect(service.theme()).toBe('light');
    });

    it('should default to dark theme when no saved preference exists', () => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
      expect(service.theme()).toBe('dark');
    });

    it('should set up matchMedia listener for system theme changes', () => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
      expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
    });

    it('should save theme to localStorage on initialization', (done) => {
      localStorageSpy.getItem.and.returnValue('dark');
      service = TestBed.inject(ThemeService);

      // Wait for effect to execute
      setTimeout(() => {
        expect(localStorageSpy.setItem).toHaveBeenCalledWith('jensify-theme-preference', 'dark');
        done();
      }, 100);
    });
  });

  describe('setTheme', () => {
    beforeEach(() => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
    });

    it('should set theme to light', (done) => {
      service.setTheme('light');
      expect(service.theme()).toBe('light');

      setTimeout(() => {
        expect(localStorageSpy.setItem).toHaveBeenCalledWith('jensify-theme-preference', 'light');
        done();
      }, 100);
    });

    it('should set theme to dark', (done) => {
      service.setTheme('dark');
      expect(service.theme()).toBe('dark');

      setTimeout(() => {
        expect(localStorageSpy.setItem).toHaveBeenCalledWith('jensify-theme-preference', 'dark');
        done();
      }, 100);
    });

    it('should set theme to system', (done) => {
      service.setTheme('system');
      expect(service.theme()).toBe('system');

      setTimeout(() => {
        expect(localStorageSpy.setItem).toHaveBeenCalledWith('jensify-theme-preference', 'system');
        done();
      }, 100);
    });

    it('should apply theme when changed', (done) => {
      service.setTheme('light');

      setTimeout(() => {
        expect(documentElementSpy.classList.remove).toHaveBeenCalledWith('dark');
        done();
      }, 100);
    });
  });

  describe('toggleTheme', () => {
    beforeEach(() => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
    });

    it('should toggle from light to dark', () => {
      service.setTheme('light');
      service.toggleTheme();
      expect(service.theme()).toBe('dark');
    });

    it('should toggle from dark to light', () => {
      service.setTheme('dark');
      service.toggleTheme();
      expect(service.theme()).toBe('light');
    });

    it('should toggle from system to light', () => {
      service.setTheme('system');
      service.toggleTheme();
      expect(service.theme()).toBe('light');
    });
  });

  describe('applyTheme (private method via side effects)', () => {
    beforeEach(() => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
    });

    it('should add dark class for dark theme', (done) => {
      service.setTheme('dark');

      setTimeout(() => {
        expect(documentElementSpy.classList.add).toHaveBeenCalledWith('dark');
        done();
      }, 100);
    });

    it('should remove dark class for light theme', (done) => {
      service.setTheme('light');

      setTimeout(() => {
        expect(documentElementSpy.classList.remove).toHaveBeenCalledWith('dark');
        done();
      }, 100);
    });

    it('should apply dark class for system theme when system prefers dark', (done) => {
      // Mock system preference to dark
      const mockMediaQueryList = {
        matches: true,
        media: '(prefers-color-scheme: dark)',
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
        addListener: jasmine.createSpy('addListener'),
        removeListener: jasmine.createSpy('removeListener'),
        dispatchEvent: jasmine.createSpy('dispatchEvent'),
        onchange: null
      };
      matchMediaSpy.and.returnValue(mockMediaQueryList);

      service.setTheme('system');

      setTimeout(() => {
        expect(documentElementSpy.classList.add).toHaveBeenCalledWith('dark');
        done();
      }, 100);
    });

    it('should remove dark class for system theme when system prefers light', (done) => {
      // Mock system preference to light
      const mockMediaQueryList = {
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
        addListener: jasmine.createSpy('addListener'),
        removeListener: jasmine.createSpy('removeListener'),
        dispatchEvent: jasmine.createSpy('dispatchEvent'),
        onchange: null
      };
      matchMediaSpy.and.returnValue(mockMediaQueryList);

      service.setTheme('system');

      setTimeout(() => {
        expect(documentElementSpy.classList.remove).toHaveBeenCalledWith('dark');
        done();
      }, 100);
    });
  });

  describe('applyBrandColor', () => {
    beforeEach(() => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
    });

    it('should apply brand color CSS variables to document root', () => {
      const brandColor = '#FF5900';
      service.applyBrandColor(brandColor);

      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-primary',
        jasmine.any(String)
      );
      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-primary-hover',
        jasmine.any(String)
      );
      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-primary-strong',
        jasmine.any(String)
      );
      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-primary-light',
        jasmine.any(String)
      );
      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-primary-soft',
        jasmine.any(String)
      );
      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-primary-border',
        jasmine.any(String)
      );
      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-focus-ring',
        jasmine.any(String)
      );
      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-primary-background-active',
        jasmine.any(String)
      );
      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-accent',
        jasmine.any(String)
      );
    });

    it('should apply primary color exactly as provided', () => {
      const brandColor = '#FF5900';
      service.applyBrandColor(brandColor);

      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-primary',
        brandColor
      );
    });

    it('should handle hex colors without # prefix', () => {
      const brandColor = 'FF5900';
      service.applyBrandColor(brandColor);

      expect(documentElementSpy.style.setProperty).toHaveBeenCalled();
    });

    it('should handle different color formats', () => {
      const colors = ['#F00', '#FF0000', 'FF0000'];
      colors.forEach(color => {
        service.applyBrandColor(color);
        expect(documentElementSpy.style.setProperty).toHaveBeenCalled();
      });
    });
  });

  describe('resetBrandColor', () => {
    beforeEach(() => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
    });

    it('should reset brand color to default Jensify orange', () => {
      service.resetBrandColor();

      expect(documentElementSpy.style.setProperty).toHaveBeenCalledWith(
        '--jensify-primary',
        '#F7580C'
      );
    });

    it('should apply all color variants for default color', () => {
      service.resetBrandColor();

      expect(documentElementSpy.style.setProperty).toHaveBeenCalledTimes(9);
    });
  });

  describe('generateColorVariants', () => {
    beforeEach(() => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
    });

    it('should generate color variants from hex color', () => {
      const variants = service.generateColorVariants('#FF5900');

      expect(variants).toBeDefined();
      expect(variants.primary).toBe('#FF5900');
      expect(variants.hover).toBeTruthy();
      expect(variants.strong).toBeTruthy();
      expect(variants.light).toBeTruthy();
      expect(variants.soft).toBeTruthy();
      expect(variants.border).toBeTruthy();
      expect(variants.focusRing).toBeTruthy();
      expect(variants.backgroundActive).toBeTruthy();
    });

    it('should return all variant properties', () => {
      const variants = service.generateColorVariants('#FF5900');

      expect(variants).toEqual(jasmine.objectContaining({
        primary: jasmine.any(String),
        hover: jasmine.any(String),
        strong: jasmine.any(String),
        light: jasmine.any(String),
        soft: jasmine.any(String),
        border: jasmine.any(String),
        focusRing: jasmine.any(String),
        backgroundActive: jasmine.any(String)
      }));
    });

    it('should generate valid hex colors for all variants', () => {
      const variants = service.generateColorVariants('#FF5900');
      const hexPattern = /^#[0-9A-F]{6}$/i;

      expect(variants.primary).toMatch(hexPattern);
      expect(variants.hover).toMatch(hexPattern);
      expect(variants.strong).toMatch(hexPattern);
      expect(variants.light).toMatch(hexPattern);
      expect(variants.soft).toMatch(hexPattern);
      expect(variants.border).toMatch(hexPattern);
      expect(variants.focusRing).toMatch(hexPattern);
      expect(variants.backgroundActive).toMatch(hexPattern);
    });

    it('should handle different hex color formats', () => {
      const colors = ['#FF5900', 'FF5900', '#f7580c', 'F7580C'];

      colors.forEach(color => {
        const variants = service.generateColorVariants(color);
        expect(variants).toBeDefined();
        expect(variants.primary).toBeTruthy();
      });
    });

    it('should generate lighter hover color', () => {
      const variants = service.generateColorVariants('#FF5900');

      // Hover should be a valid hex color
      expect(variants.hover).toMatch(/^#[0-9A-F]{6}$/i);
      // Primary should be preserved
      expect(variants.primary).toBe('#FF5900');
    });

    it('should generate darker strong color', () => {
      const variants = service.generateColorVariants('#FF5900');

      expect(variants.strong).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should handle edge case colors (black)', () => {
      const variants = service.generateColorVariants('#000000');

      expect(variants.primary).toBe('#000000');
      expect(variants.hover).toMatch(/^#[0-9A-F]{6}$/i);
      expect(variants.strong).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should handle edge case colors (white)', () => {
      const variants = service.generateColorVariants('#FFFFFF');

      expect(variants.primary).toBe('#FFFFFF');
      expect(variants.hover).toMatch(/^#[0-9A-F]{6}$/i);
      expect(variants.strong).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should handle mid-tone colors', () => {
      const variants = service.generateColorVariants('#808080');

      expect(variants.primary).toBe('#808080');
      expect(variants.hover).toMatch(/^#[0-9A-F]{6}$/i);
      expect(variants.strong).toMatch(/^#[0-9A-F]{6}$/i);
    });
  });

  describe('color conversion methods (via generateColorVariants)', () => {
    beforeEach(() => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
    });

    it('should convert red color correctly', () => {
      const variants = service.generateColorVariants('#FF0000');
      expect(variants.primary).toBe('#FF0000');
      expect(variants.hover).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should convert green color correctly', () => {
      const variants = service.generateColorVariants('#00FF00');
      expect(variants.primary).toBe('#00FF00');
      expect(variants.hover).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should convert blue color correctly', () => {
      const variants = service.generateColorVariants('#0000FF');
      expect(variants.primary).toBe('#0000FF');
      expect(variants.hover).toMatch(/^#[0-9A-F]{6}$/i);
    });

    it('should handle lowercase hex colors', () => {
      const variants = service.generateColorVariants('#ff5900');
      expect(variants.primary).toBe('#ff5900');
    });

    it('should produce consistent results for same input', () => {
      const variants1 = service.generateColorVariants('#FF5900');
      const variants2 = service.generateColorVariants('#FF5900');

      expect(variants1).toEqual(variants2);
    });

    it('should handle various saturation levels', () => {
      const colors = ['#FF0000', '#CC0000', '#990000', '#660000'];

      colors.forEach(color => {
        const variants = service.generateColorVariants(color);
        expect(variants.primary).toBe(color);
        expect(variants.hover).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });

    it('should handle various lightness levels', () => {
      const colors = ['#FFCCCC', '#FF9999', '#FF6666', '#FF3333'];

      colors.forEach(color => {
        const variants = service.generateColorVariants(color);
        expect(variants.primary).toBe(color);
        expect(variants.hover).toMatch(/^#[0-9A-F]{6}$/i);
      });
    });
  });

  describe('localStorage persistence', () => {
    beforeEach(() => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
    });

    it('should persist theme changes to localStorage', (done) => {
      service.setTheme('light');

      setTimeout(() => {
        expect(localStorageSpy.setItem).toHaveBeenCalledWith(
          'jensify-theme-preference',
          'light'
        );
        done();
      }, 100);
    });

    it('should update localStorage when toggling theme', (done) => {
      service.setTheme('light');

      setTimeout(() => {
        localStorageSpy.setItem.calls.reset();
        service.toggleTheme();

        setTimeout(() => {
          expect(localStorageSpy.setItem).toHaveBeenCalledWith(
            'jensify-theme-preference',
            'dark'
          );
          done();
        }, 100);
      }, 100);
    });
  });

  describe('system theme integration', () => {
    it('should respond to system theme changes when in system mode', (done) => {
      localStorageSpy.getItem.and.returnValue('system');

      // Create a mock that we can trigger
      let listener: ((e: MediaQueryListEvent) => void) | null = null;
      const mockMediaQueryList = {
        matches: false,
        media: '(prefers-color-scheme: dark)',
        addEventListener: jasmine.createSpy('addEventListener').and.callFake((event: string, cb: (e: MediaQueryListEvent) => void) => {
          listener = cb;
        }),
        removeEventListener: jasmine.createSpy('removeEventListener'),
        addListener: jasmine.createSpy('addListener'),
        removeListener: jasmine.createSpy('removeListener'),
        dispatchEvent: jasmine.createSpy('dispatchEvent'),
        onchange: null
      };
      matchMediaSpy.and.returnValue(mockMediaQueryList);

      service = TestBed.inject(ThemeService);

      setTimeout(() => {
        expect(mockMediaQueryList.addEventListener).toHaveBeenCalled();
        expect(listener).toBeTruthy();
        done();
      }, 100);
    });
  });

  describe('edge cases and error handling', () => {
    beforeEach(() => {
      localStorageSpy.getItem.and.returnValue(null);
      service = TestBed.inject(ThemeService);
    });

    it('should handle invalid hex colors gracefully', () => {
      // Service should not throw error, even with invalid input
      expect(() => {
        service.generateColorVariants('invalid');
      }).not.toThrow();
    });

    it('should handle short hex colors (3 characters)', () => {
      // Short hex like #F00 should still work
      const variants = service.generateColorVariants('#F00');
      expect(variants).toBeDefined();
    });

    it('should handle hex colors without hash', () => {
      const variants = service.generateColorVariants('FF5900');
      expect(variants).toBeDefined();
      expect(variants.primary).toBe('FF5900');
    });

    it('should handle rapid theme changes', (done) => {
      service.setTheme('light');
      service.setTheme('dark');
      service.setTheme('system');

      setTimeout(() => {
        expect(service.theme()).toBe('system');
        done();
      }, 100);
    });

    it('should handle multiple brand color changes', () => {
      service.applyBrandColor('#FF0000');
      service.applyBrandColor('#00FF00');
      service.applyBrandColor('#0000FF');

      expect(documentElementSpy.style.setProperty).toHaveBeenCalled();
    });
  });
});
