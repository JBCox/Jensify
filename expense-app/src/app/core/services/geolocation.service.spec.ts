import { TestBed } from '@angular/core/testing';
import { GeolocationService, GeolocationPosition as ServiceGeolocationPosition } from './geolocation.service';

describe('GeolocationService', () => {
  let service: GeolocationService;
  let originalGeolocation: Geolocation | undefined;
  let originalPermissions: Permissions | undefined;

  // Mock geolocation
  let mockGetCurrentPosition: jasmine.Spy;
  let mockWatchPosition: jasmine.Spy;
  let mockClearWatch: jasmine.Spy;

  // Use the browser's GeolocationCoordinates interface
  const mockCoords = {
    latitude: 32.7767,
    longitude: -96.7970,
    accuracy: 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
    toJSON: () => ({})
  };

  const mockBrowserPosition = {
    coords: mockCoords,
    timestamp: Date.now(),
    toJSON: () => ({})
  };

  beforeEach(() => {
    // Save original navigator properties
    originalGeolocation = navigator.geolocation;
    originalPermissions = navigator.permissions;

    // Create mock functions
    mockGetCurrentPosition = jasmine.createSpy('getCurrentPosition');
    mockWatchPosition = jasmine.createSpy('watchPosition').and.returnValue(1);
    mockClearWatch = jasmine.createSpy('clearWatch');

    // Mock geolocation
    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: mockGetCurrentPosition,
        watchPosition: mockWatchPosition,
        clearWatch: mockClearWatch
      },
      writable: true,
      configurable: true
    });

    TestBed.configureTestingModule({
      providers: [GeolocationService]
    });

    service = TestBed.inject(GeolocationService);
  });

  afterEach(() => {
    // Restore original navigator properties
    Object.defineProperty(navigator, 'geolocation', {
      value: originalGeolocation,
      writable: true,
      configurable: true
    });
    Object.defineProperty(navigator, 'permissions', {
      value: originalPermissions,
      writable: true,
      configurable: true
    });
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // =============================================================================
  // isAvailable TESTS
  // =============================================================================

  describe('isAvailable', () => {
    it('should return true when geolocation is available', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('should check if geolocation property exists in navigator', () => {
      // The isAvailable method checks 'geolocation' in navigator
      // In a browser environment, this always returns true
      // This test verifies the method correctly uses the 'in' operator
      const result = service.isAvailable();

      // In test environment, geolocation is available
      expect(result).toBe(true);
      expect('geolocation' in navigator).toBe(true);
    });
  });

  // =============================================================================
  // getCurrentPosition TESTS
  // =============================================================================

  describe('getCurrentPosition', () => {
    it('should get current position successfully', (done) => {
      mockGetCurrentPosition.and.callFake((success: PositionCallback) => {
        success(mockBrowserPosition as unknown as GeolocationPosition);
      });

      service.getCurrentPosition().subscribe({
        next: (position) => {
          expect(position.latitude).toBe(32.7767);
          expect(position.longitude).toBe(-96.7970);
          expect(position.accuracy).toBe(10);
          done();
        },
        error: done.fail
      });
    });

    it('should call geolocation with correct options', () => {
      mockGetCurrentPosition.and.callFake((success: PositionCallback) => {
        success(mockBrowserPosition as unknown as GeolocationPosition);
      });

      service.getCurrentPosition().subscribe();

      expect(mockGetCurrentPosition).toHaveBeenCalledWith(
        jasmine.any(Function),
        jasmine.any(Function),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });

    it('should handle permission denied error', (done) => {
      const permissionError = {
        code: 1,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'User denied geolocation'
      } as GeolocationPositionError;

      mockGetCurrentPosition.and.callFake((_success: PositionCallback, error: PositionErrorCallback) => {
        error(permissionError);
      });

      service.getCurrentPosition().subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('Location permission denied');
          done();
        }
      });
    });

    it('should handle position unavailable error', (done) => {
      const positionError = {
        code: 2,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'Position unavailable'
      } as GeolocationPositionError;

      mockGetCurrentPosition.and.callFake((_success: PositionCallback, error: PositionErrorCallback) => {
        error(positionError);
      });

      service.getCurrentPosition().subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('Location information unavailable');
          done();
        }
      });
    });

    it('should handle timeout error', (done) => {
      const timeoutError = {
        code: 3,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'Timeout'
      } as GeolocationPositionError;

      mockGetCurrentPosition.and.callFake((_success: PositionCallback, error: PositionErrorCallback) => {
        error(timeoutError);
      });

      service.getCurrentPosition().subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('Location request timed out');
          done();
        }
      });
    });

    it('should handle unknown error', (done) => {
      const unknownError = {
        code: 999,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'Unknown'
      } as GeolocationPositionError;

      mockGetCurrentPosition.and.callFake((_success: PositionCallback, error: PositionErrorCallback) => {
        error(unknownError);
      });

      service.getCurrentPosition().subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('Unknown geolocation error');
          done();
        }
      });
    });

    it('should error when geolocation not supported', (done) => {
      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        writable: true,
        configurable: true
      });

      service.getCurrentPosition().subscribe({
        error: (err: Error) => {
          expect(err.message).toBe('Geolocation not supported');
          done();
        }
      });
    });
  });

  // =============================================================================
  // watchPosition TESTS
  // =============================================================================

  describe('watchPosition', () => {
    it('should watch position successfully', (done) => {
      mockWatchPosition.and.callFake((success: PositionCallback) => {
        success(mockBrowserPosition as unknown as GeolocationPosition);
        return 1;
      });

      service.watchPosition().subscribe({
        next: (position) => {
          expect(position.latitude).toBe(32.7767);
          expect(position.longitude).toBe(-96.7970);
          done();
        },
        error: done.fail
      });
    });

    it('should call watchPosition with correct options', () => {
      mockWatchPosition.and.returnValue(1);

      service.watchPosition().subscribe();

      expect(mockWatchPosition).toHaveBeenCalledWith(
        jasmine.any(Function),
        jasmine.any(Function),
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });

    it('should emit multiple positions', (done) => {
      let callCount = 0;
      const positions: ServiceGeolocationPosition[] = [];

      const secondMockPosition = {
        coords: { ...mockCoords, latitude: 32.7800 },
        timestamp: Date.now(),
        toJSON: () => ({})
      };

      mockWatchPosition.and.callFake((success: PositionCallback) => {
        // Emit first position immediately
        success(mockBrowserPosition as unknown as GeolocationPosition);
        // Emit second position after delay
        setTimeout(() => {
          success(secondMockPosition as unknown as GeolocationPosition);
        }, 10);
        return 1;
      });

      const subscription = service.watchPosition().subscribe({
        next: (position) => {
          positions.push(position);
          callCount++;
          if (callCount === 2) {
            expect(positions[0].latitude).toBe(32.7767);
            expect(positions[1].latitude).toBe(32.7800);
            subscription.unsubscribe();
            done();
          }
        }
      });
    });

    it('should clear watch on unsubscribe', () => {
      mockWatchPosition.and.returnValue(42);

      const subscription = service.watchPosition().subscribe();
      subscription.unsubscribe();

      expect(mockClearWatch).toHaveBeenCalledWith(42);
    });

    it('should handle watch error', (done) => {
      const watchError = {
        code: 1,
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3,
        message: 'Permission denied'
      } as GeolocationPositionError;

      mockWatchPosition.and.callFake((_success: PositionCallback, error: PositionErrorCallback) => {
        error(watchError);
        return 1;
      });

      service.watchPosition().subscribe({
        error: (err: Error) => {
          expect(err.message).toContain('Location permission denied');
          done();
        }
      });
    });

    it('should error when geolocation not supported', (done) => {
      Object.defineProperty(navigator, 'geolocation', {
        value: undefined,
        writable: true,
        configurable: true
      });

      service.watchPosition().subscribe({
        error: (err: Error) => {
          expect(err.message).toBe('Geolocation not supported');
          done();
        }
      });
    });
  });

  // =============================================================================
  // requestPermission TESTS
  // =============================================================================

  describe('requestPermission', () => {
    it('should return null when permissions API not available', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: undefined,
        writable: true,
        configurable: true
      });

      const result = await service.requestPermission();
      expect(result).toBeNull();
    });

    it('should query geolocation permission', async () => {
      const mockPermissionStatus = {
        state: 'granted',
        onchange: null
      } as PermissionStatus;

      const mockQuery = jasmine.createSpy('query').and.resolveTo(mockPermissionStatus);

      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        writable: true,
        configurable: true
      });

      const result = await service.requestPermission();

      expect(mockQuery).toHaveBeenCalledWith({ name: 'geolocation' });
      expect(result).toBe(mockPermissionStatus);
    });

    it('should return null on permission query error', async () => {
      const mockQuery = jasmine.createSpy('query').and.rejectWith(new Error('Permission error'));

      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        writable: true,
        configurable: true
      });

      const result = await service.requestPermission();
      expect(result).toBeNull();
    });

    it('should handle denied permission state', async () => {
      const mockPermissionStatus = {
        state: 'denied',
        onchange: null
      } as PermissionStatus;

      const mockQuery = jasmine.createSpy('query').and.resolveTo(mockPermissionStatus);

      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        writable: true,
        configurable: true
      });

      const result = await service.requestPermission();
      expect(result?.state).toBe('denied');
    });

    it('should handle prompt permission state', async () => {
      const mockPermissionStatus = {
        state: 'prompt',
        onchange: null
      } as PermissionStatus;

      const mockQuery = jasmine.createSpy('query').and.resolveTo(mockPermissionStatus);

      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        writable: true,
        configurable: true
      });

      const result = await service.requestPermission();
      expect(result?.state).toBe('prompt');
    });
  });
});
