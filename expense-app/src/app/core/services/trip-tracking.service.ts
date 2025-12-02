import { Injectable, signal } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { GeolocationService, GeolocationPosition } from './geolocation.service';
import { SupabaseService } from './supabase.service';

export interface TripCoordinate {
  latitude: number;
  longitude: number;
  accuracy: number;
  recorded_at: string;
}

export interface TrackingState {
  isTracking: boolean;
  startTime: Date | null;
  currentLocation: string | null;
  distance: number; // in miles
  duration: number; // in seconds
  coordinates: TripCoordinate[];
}

const STORAGE_KEY = 'jensify_trip_tracking';

/**
 * Trip Tracking Service
 * Manages real-time GPS tracking for mileage trips
 */
@Injectable({
  providedIn: 'root'
})
export class TripTrackingService {
  private trackingState = new BehaviorSubject<TrackingState>({
    isTracking: false,
    startTime: null,
    currentLocation: null,
    distance: 0,
    duration: 0,
    coordinates: []
  });

  private watchSubscription?: Subscription;
  private timerInterval?: number;
  private lastCoordinate?: TripCoordinate;

  // Public signals for reactive UI
  isTracking = signal(false);
  distance = signal(0);
  duration = signal(0);
  currentLocation = signal<string | null>(null);

  constructor(
    private geolocation: GeolocationService,
    private supabase: SupabaseService
  ) {
    this.restoreTrackingState();
  }

  /**
   * Start GPS tracking
   */
  startTracking(): Observable<void> {
    return new Observable(observer => {
      if (this.isTracking()) {
        observer.error(new Error('Tracking already in progress'));
        return;
      }

      const startTime = new Date();

      this.trackingState.next({
        isTracking: true,
        startTime,
        currentLocation: null,
        distance: 0,
        duration: 0,
        coordinates: []
      });

      this.isTracking.set(true);
      this.saveTrackingState();

      // Start timer for duration
      this.startTimer();

      // Start watching GPS position
      this.watchSubscription = this.geolocation.watchPosition().subscribe({
        next: (position) => {
          this.handlePositionUpdate(position);
        },
        error: (error) => {
          observer.error(error);
          this.stopTracking();
        }
      });

      observer.next();
      observer.complete();
    });
  }

  /**
   * Stop GPS tracking
   */
  stopTracking(): TrackingState {
    if (this.watchSubscription) {
      this.watchSubscription.unsubscribe();
      this.watchSubscription = undefined;
    }

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }

    const finalState = this.trackingState.value;

    this.trackingState.next({
      isTracking: false,
      startTime: null,
      currentLocation: null,
      distance: 0,
      duration: 0,
      coordinates: []
    });

    this.isTracking.set(false);
    this.distance.set(0);
    this.duration.set(0);
    this.currentLocation.set(null);
    this.lastCoordinate = undefined;

    this.clearTrackingState();

    return finalState;
  }

  /**
   * Get current tracking state
   */
  getTrackingState(): TrackingState {
    return this.trackingState.value;
  }

  /**
   * Save trip coordinates to database
   */
  async saveCoordinatesToDatabase(tripId: string, coordinates: TripCoordinate[]): Promise<void> {
    if (coordinates.length === 0) {
      return;
    }

    const coordinatesToSave = coordinates.map(coord => ({
      trip_id: tripId,
      latitude: coord.latitude,
      longitude: coord.longitude,
      accuracy: coord.accuracy,
      recorded_at: coord.recorded_at
    }));

    const { error } = await this.supabase.client
      .from('trip_coordinates')
      .insert(coordinatesToSave);

    if (error) {
      throw new Error(`Failed to save coordinates: ${error.message}`);
    }
  }

  /**
   * Calculate distance from stored coordinates
   */
  calculateDistanceFromCoordinates(coordinates: TripCoordinate[]): number {
    if (coordinates.length < 2) {
      return 0;
    }

    let totalDistance = 0;

    for (let i = 1; i < coordinates.length; i++) {
      const prev = coordinates[i - 1];
      const curr = coordinates[i];

      totalDistance += this.haversineDistance(
        prev.latitude,
        prev.longitude,
        curr.latitude,
        curr.longitude
      );
    }

    return totalDistance;
  }

  /**
   * Handle GPS position update
   */
  private handlePositionUpdate(position: GeolocationPosition): void {
    const coordinate: TripCoordinate = {
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      recorded_at: new Date(position.timestamp).toISOString()
    };

    const state = this.trackingState.value;
    const coordinates = [...state.coordinates, coordinate];

    // Calculate distance if we have a previous coordinate
    let distance = state.distance;
    if (this.lastCoordinate) {
      const segmentDistance = this.haversineDistance(
        this.lastCoordinate.latitude,
        this.lastCoordinate.longitude,
        coordinate.latitude,
        coordinate.longitude
      );
      distance += segmentDistance;
    }

    this.lastCoordinate = coordinate;

    this.trackingState.next({
      ...state,
      distance,
      coordinates
    });

    this.distance.set(distance);
    this.saveTrackingState();
  }

  /**
   * Start duration timer
   */
  private startTimer(): void {
    this.timerInterval = window.setInterval(() => {
      const state = this.trackingState.value;
      if (state.startTime && state.isTracking) {
        const duration = Math.floor((Date.now() - state.startTime.getTime()) / 1000);
        this.trackingState.next({ ...state, duration });
        this.duration.set(duration);
      }
    }, 1000);
  }

  /**
   * Calculate distance between two GPS coordinates using Haversine formula
   */
  private haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const earthRadiusMiles = 3958.8;

    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusMiles * c;
  }

  /**
   * Convert degrees to radians
   */
  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Save tracking state to localStorage
   */
  private saveTrackingState(): void {
    const state = this.trackingState.value;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      startTime: state.startTime?.toISOString()
    }));
  }

  /**
   * Restore tracking state from localStorage
   */
  private restoreTrackingState(): void {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved);
        if (state.isTracking) {
          // Restore tracking state
          this.trackingState.next({
            ...state,
            startTime: state.startTime ? new Date(state.startTime) : null
          });

          this.isTracking.set(true);
          this.distance.set(state.distance);
          this.duration.set(state.duration);

          if (state.coordinates.length > 0) {
            this.lastCoordinate = state.coordinates[state.coordinates.length - 1];
          }

          // Resume tracking
          this.startTimer();
          this.watchSubscription = this.geolocation.watchPosition().subscribe({
            next: (position) => {
              this.handlePositionUpdate(position);
            }
          });
        }
      } catch (error) {
        console.error('Failed to restore tracking state:', error);
        this.clearTrackingState();
      }
    }
  }

  /**
   * Clear tracking state from localStorage
   */
  private clearTrackingState(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
}
