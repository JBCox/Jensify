import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { TripTrackingService, TripCoordinate, TrackingState } from './trip-tracking.service';
import { GeolocationService, GeolocationPosition } from './geolocation.service';
import { SupabaseService } from './supabase.service';
import { Subject } from 'rxjs';

describe('TripTrackingService', () => {
  let service: TripTrackingService;
  let geolocationServiceSpy: jasmine.SpyObj<GeolocationService>;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let positionSubject: Subject<GeolocationPosition>;

  const STORAGE_KEY = 'jensify_trip_tracking';

  const mockPosition1: GeolocationPosition = {
    latitude: 32.7767,
    longitude: -96.7970,
    accuracy: 10,
    timestamp: Date.now()
  };

  const mockPosition2: GeolocationPosition = {
    latitude: 32.7800,
    longitude: -96.8000,
    accuracy: 8,
    timestamp: Date.now() + 60000
  };

  beforeEach(() => {
    // Reset TestBed to clear any previous singleton instances
    TestBed.resetTestingModule();

    // Clear ALL localStorage FIRST to prevent cross-contamination from other test files
    localStorage.clear();

    positionSubject = new Subject<GeolocationPosition>();

    const geolocationSpy = jasmine.createSpyObj('GeolocationService', ['watchPosition', 'getCurrentPosition']);
    geolocationSpy.watchPosition.and.returnValue(positionSubject.asObservable());

    // Create a mutable client object that can be modified in tests
    const mockClient = {
      from: jasmine.createSpy('from')
    };
    const supabaseSpy = {
      client: mockClient
    } as unknown as jasmine.SpyObj<SupabaseService>;

    TestBed.configureTestingModule({
      providers: [
        TripTrackingService,
        { provide: GeolocationService, useValue: geolocationSpy },
        { provide: SupabaseService, useValue: supabaseSpy }
      ]
    });

    service = TestBed.inject(TripTrackingService);
    geolocationServiceSpy = TestBed.inject(GeolocationService) as jasmine.SpyObj<GeolocationService>;
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
  });

  afterEach(() => {
    // Clean up any subscriptions
    service.stopTracking();
    // Clear ALL localStorage to prevent cross-contamination
    localStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // =============================================================================
  // INITIAL STATE TESTS
  // =============================================================================

  describe('initial state', () => {
    it('should have isTracking as false initially', () => {
      expect(service.isTracking()).toBe(false);
    });

    it('should have distance as 0 initially', () => {
      expect(service.distance()).toBe(0);
    });

    it('should have duration as 0 initially', () => {
      expect(service.duration()).toBe(0);
    });

    it('should have currentLocation as null initially', () => {
      expect(service.currentLocation()).toBeNull();
    });
  });

  // =============================================================================
  // START TRACKING TESTS
  // =============================================================================

  describe('startTracking', () => {
    it('should start tracking successfully', fakeAsync(() => {
      let completed = false;

      service.startTracking().subscribe({
        next: () => {
          completed = true;
        }
      });

      tick();

      expect(completed).toBe(true);
      expect(service.isTracking()).toBe(true);
      expect(geolocationServiceSpy.watchPosition).toHaveBeenCalled();

      discardPeriodicTasks();
    }));

    it('should error if already tracking', fakeAsync(() => {
      let error: Error | undefined;

      service.startTracking().subscribe();
      tick();

      service.startTracking().subscribe({
        error: (e: Error) => {
          error = e;
        }
      });

      tick();

      expect(error).toBeTruthy();
      expect(error!.message).toBe('Tracking already in progress');

      discardPeriodicTasks();
    }));

    it('should save tracking state to localStorage', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      const saved = localStorage.getItem(STORAGE_KEY);
      expect(saved).toBeTruthy();

      const state = JSON.parse(saved!);
      expect(state.isTracking).toBe(true);

      discardPeriodicTasks();
    }));

    it('should handle position errors', fakeAsync(() => {
      let errorReceived: Error | null = null;

      service.startTracking().subscribe({
        error: (e) => {
          errorReceived = e;
        }
      });

      tick();

      // Emit error from geolocation
      positionSubject.error(new Error('GPS unavailable'));

      tick();

      expect(service.isTracking()).toBe(false);

      discardPeriodicTasks();
    }));
  });

  // =============================================================================
  // STOP TRACKING TESTS
  // =============================================================================

  describe('stopTracking', () => {
    it('should stop tracking and return final state', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      positionSubject.next(mockPosition1);
      tick();

      const finalState = service.stopTracking();

      expect(service.isTracking()).toBe(false);
      expect(service.distance()).toBe(0);
      expect(service.duration()).toBe(0);
      expect(finalState.isTracking).toBe(true); // Previous state
      expect(finalState.coordinates.length).toBe(1);

      discardPeriodicTasks();
    }));

    it('should clear localStorage on stop', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

      service.stopTracking();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      discardPeriodicTasks();
    }));
  });

  // =============================================================================
  // GET TRACKING STATE TESTS
  // =============================================================================

  describe('getTrackingState', () => {
    it('should return current tracking state', fakeAsync(() => {
      const initialState = service.getTrackingState();
      expect(initialState.isTracking).toBe(false);
      expect(initialState.coordinates).toEqual([]);

      service.startTracking().subscribe();
      tick();

      const trackingState = service.getTrackingState();
      expect(trackingState.isTracking).toBe(true);
      expect(trackingState.startTime).toBeTruthy();

      discardPeriodicTasks();
    }));
  });

  // =============================================================================
  // POSITION UPDATE TESTS
  // =============================================================================

  describe('position updates', () => {
    it('should track positions and update distance', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      positionSubject.next(mockPosition1);
      tick();

      expect(service.distance()).toBe(0); // First position, no distance yet

      positionSubject.next(mockPosition2);
      tick();

      expect(service.distance()).toBeGreaterThan(0);

      discardPeriodicTasks();
    }));

    it('should accumulate coordinates', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      positionSubject.next(mockPosition1);
      tick();

      positionSubject.next(mockPosition2);
      tick();

      const state = service.getTrackingState();
      expect(state.coordinates.length).toBe(2);

      discardPeriodicTasks();
    }));
  });

  // =============================================================================
  // DURATION TIMER TESTS
  // =============================================================================

  describe('duration timer', () => {
    it('should update duration every second', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      expect(service.duration()).toBe(0);

      tick(1000);
      expect(service.duration()).toBeGreaterThanOrEqual(1);

      tick(2000);
      expect(service.duration()).toBeGreaterThanOrEqual(3);

      discardPeriodicTasks();
    }));

    it('should stop timer on stopTracking', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      tick(2000);
      const durationBefore = service.duration();

      service.stopTracking();

      // Duration should be reset to 0
      expect(service.duration()).toBe(0);

      discardPeriodicTasks();
    }));
  });

  // =============================================================================
  // SAVE COORDINATES TESTS
  // =============================================================================

  describe('saveCoordinatesToDatabase', () => {
    const mockCoordinates: TripCoordinate[] = [
      { latitude: 32.7767, longitude: -96.7970, accuracy: 10, recorded_at: '2024-01-01T10:00:00Z' },
      { latitude: 32.7800, longitude: -96.8000, accuracy: 8, recorded_at: '2024-01-01T10:01:00Z' }
    ];

    it('should save coordinates to database', async () => {
      const insertSpy = jasmine.createSpy('insert').and.resolveTo({ error: null });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      await service.saveCoordinatesToDatabase('trip-123', mockCoordinates);

      expect(supabaseServiceSpy.client.from).toHaveBeenCalledWith('trip_coordinates');
      expect(insertSpy).toHaveBeenCalled();
    });

    it('should not insert empty coordinates', async () => {
      const insertSpy = jasmine.createSpy('insert');
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      await service.saveCoordinatesToDatabase('trip-123', []);

      expect(supabaseServiceSpy.client.from).not.toHaveBeenCalled();
    });

    it('should throw error on database failure', async () => {
      const mockError = { message: 'Database error' };
      const insertSpy = jasmine.createSpy('insert').and.resolveTo({ error: mockError });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as unknown as typeof supabaseServiceSpy.client.from;

      await expectAsync(service.saveCoordinatesToDatabase('trip-123', mockCoordinates))
        .toBeRejectedWithError('Failed to save coordinates: Database error');
    });
  });

  // =============================================================================
  // CALCULATE DISTANCE TESTS
  // =============================================================================

  describe('calculateDistanceFromCoordinates', () => {
    it('should return 0 for empty coordinates', () => {
      expect(service.calculateDistanceFromCoordinates([])).toBe(0);
    });

    it('should return 0 for single coordinate', () => {
      const coords = [{ latitude: 32.7767, longitude: -96.7970, accuracy: 10, recorded_at: '2024-01-01T10:00:00Z' }];
      expect(service.calculateDistanceFromCoordinates(coords)).toBe(0);
    });

    it('should calculate distance for multiple coordinates', () => {
      const coords: TripCoordinate[] = [
        { latitude: 32.7767, longitude: -96.7970, accuracy: 10, recorded_at: '2024-01-01T10:00:00Z' },
        { latitude: 32.7800, longitude: -96.8000, accuracy: 8, recorded_at: '2024-01-01T10:01:00Z' }
      ];

      const distance = service.calculateDistanceFromCoordinates(coords);
      expect(distance).toBeGreaterThan(0);
      expect(distance).toBeLessThan(1); // Should be less than 1 mile for these coords
    });

    it('should accumulate distance for multiple segments', () => {
      const coords: TripCoordinate[] = [
        { latitude: 32.7767, longitude: -96.7970, accuracy: 10, recorded_at: '2024-01-01T10:00:00Z' },
        { latitude: 32.7800, longitude: -96.8000, accuracy: 8, recorded_at: '2024-01-01T10:01:00Z' },
        { latitude: 32.7850, longitude: -96.8050, accuracy: 8, recorded_at: '2024-01-01T10:02:00Z' }
      ];

      const distance = service.calculateDistanceFromCoordinates(coords);
      expect(distance).toBeGreaterThan(0);
    });

    it('should handle known distance correctly', () => {
      // Distance from 0,0 to 0,1 degree longitude at equator is ~69 miles
      const coords: TripCoordinate[] = [
        { latitude: 0, longitude: 0, accuracy: 10, recorded_at: '2024-01-01T10:00:00Z' },
        { latitude: 0, longitude: 1, accuracy: 10, recorded_at: '2024-01-01T10:01:00Z' }
      ];

      const distance = service.calculateDistanceFromCoordinates(coords);
      expect(distance).toBeGreaterThan(68);
      expect(distance).toBeLessThan(70);
    });
  });

  // =============================================================================
  // STATE PERSISTENCE TESTS
  // =============================================================================

  describe('state persistence', () => {
    it('should save state to localStorage when tracking starts', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      const saved = localStorage.getItem(STORAGE_KEY);
      expect(saved).toBeTruthy();

      const state = JSON.parse(saved!);
      expect(state.isTracking).toBe(true);
      expect(state.startTime).toBeTruthy();
      expect(state.coordinates).toEqual([]);

      discardPeriodicTasks();
    }));

    it('should update localStorage when position changes', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      positionSubject.next(mockPosition1);
      tick();

      const saved = localStorage.getItem(STORAGE_KEY);
      const state = JSON.parse(saved!);
      expect(state.coordinates.length).toBe(1);

      discardPeriodicTasks();
    }));

    it('should clear localStorage when tracking stops', fakeAsync(() => {
      service.startTracking().subscribe();
      tick();

      expect(localStorage.getItem(STORAGE_KEY)).toBeTruthy();

      service.stopTracking();

      expect(localStorage.getItem(STORAGE_KEY)).toBeNull();

      discardPeriodicTasks();
    }));
  });

  // =============================================================================
  // HAVERSINE DISTANCE TESTS
  // =============================================================================

  describe('haversine distance calculation', () => {
    it('should calculate correct distance between Dallas and Fort Worth', () => {
      // Dallas: 32.7767° N, 96.7970° W
      // Fort Worth: 32.7555° N, 97.3308° W
      // Distance: approximately 30 miles
      const coords: TripCoordinate[] = [
        { latitude: 32.7767, longitude: -96.7970, accuracy: 10, recorded_at: '2024-01-01T10:00:00Z' },
        { latitude: 32.7555, longitude: -97.3308, accuracy: 10, recorded_at: '2024-01-01T10:30:00Z' }
      ];

      const distance = service.calculateDistanceFromCoordinates(coords);
      expect(distance).toBeGreaterThan(25);
      expect(distance).toBeLessThan(35);
    });

    it('should return 0 for same coordinates', () => {
      const coords: TripCoordinate[] = [
        { latitude: 32.7767, longitude: -96.7970, accuracy: 10, recorded_at: '2024-01-01T10:00:00Z' },
        { latitude: 32.7767, longitude: -96.7970, accuracy: 10, recorded_at: '2024-01-01T10:01:00Z' }
      ];

      const distance = service.calculateDistanceFromCoordinates(coords);
      expect(distance).toBe(0);
    });
  });
});
