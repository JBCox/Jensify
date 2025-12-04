import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, of, forkJoin, throwError } from 'rxjs';
import { map, switchMap, catchError, timeout } from 'rxjs/operators';
import { GeolocationService } from './geolocation.service';
import { GoogleMapsService } from './google-maps.service';

/**
 * Start/Stop Tracking State
 * Persisted to localStorage for resuming trips after app closure
 */
export interface StartStopState {
  isActive: boolean;
  startTime: string; // ISO timestamp
  startLat: number;
  startLng: number;
  startAddress: string;
}

/**
 * Start/Stop Tracking Result
 * Returned when trip is stopped
 */
export interface StartStopResult {
  startLat: number;
  startLng: number;
  startAddress: string;
  endLat: number;
  endLng: number;
  endAddress: string;
  distanceMiles: number;
  durationSeconds: number;
  startTime: string;
  endTime: string;
}

const STORAGE_KEY = 'jensify_start_stop_trip';

/**
 * Start/Stop Tracking Service
 *
 * Designed for Start/Stop verification mode:
 * - User clicks Start: captures GPS + timestamp, saves to localStorage
 * - User can close app and come back later
 * - User clicks Stop: captures end GPS, calculates route via Google Maps
 *
 * This is different from Full GPS tracking which requires continuous monitoring.
 */
@Injectable({
  providedIn: 'root'
})
export class StartStopTrackingService {
  private geolocationService = inject(GeolocationService);
  private googleMapsService = inject(GoogleMapsService);

  // Reactive signals for UI binding
  isActive = signal(false);
  startTime = signal<string | null>(null);
  startAddress = signal<string | null>(null);
  elapsedSeconds = signal(0);

  private timerInterval?: number;
  private currentState: StartStopState | null = null;

  constructor() {
    this.restoreState();
  }

  /**
   * Check if there's an active trip in progress
   */
  hasActiveTrip(): boolean {
    return this.currentState !== null && this.currentState.isActive;
  }

  /**
   * Get the current state (for UI display)
   */
  getState(): StartStopState | null {
    return this.currentState;
  }

  /**
   * Start a new trip
   * Captures current GPS location and saves to localStorage immediately
   */
  startTrip(): Observable<StartStopState> {
    return this.geolocationService.getCurrentPosition().pipe(
      switchMap(position => {
        // Reverse geocode to get address
        return this.googleMapsService.reverseGeocode(position.latitude, position.longitude).pipe(
          map(address => ({
            position,
            address: address || `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`
          })),
          catchError(() => of({
            position,
            address: `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`
          }))
        );
      }),
      map(({ position, address }) => {
        const state: StartStopState = {
          isActive: true,
          startTime: new Date().toISOString(),
          startLat: position.latitude,
          startLng: position.longitude,
          startAddress: address
        };

        this.currentState = state;
        this.saveState();
        this.updateSignals();
        this.startElapsedTimer();

        return state;
      })
    );
  }

  /**
   * Stop the current trip
   * Captures end GPS location and calculates driving distance via Google Maps
   */
  stopTrip(): Observable<StartStopResult> {
    if (!this.currentState || !this.currentState.isActive) {
      return throwError(() => new Error('No active trip to stop'));
    }

    const startState = this.currentState;
    const endTime = new Date().toISOString();

    return this.geolocationService.getCurrentPosition().pipe(
      timeout(15000), // 15 second timeout for GPS
      switchMap(position => {
        // Get end address and calculate route distance in parallel
        // If Distance Matrix API fails, distance will be 0 and user must fill in manually
        return forkJoin({
          endAddress: this.googleMapsService.reverseGeocode(position.latitude, position.longitude).pipe(
            timeout(10000), // 10 second timeout
            catchError(() => of(`${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`))
          ),
          route: this.googleMapsService.getRouteByCoords(
            { lat: startState.startLat, lng: startState.startLng },
            { lat: position.latitude, lng: position.longitude }
          )
        }).pipe(
          timeout(20000), // 20 second timeout for the forkJoin
          map(({ endAddress, route }) => {
            if (!route.apiSuccess) {
              console.log('[StartStopTracking] Distance Matrix API failed - user must enter distance manually');
            } else {
              console.log('[StartStopTracking] Distance calculated:', route.distanceMiles, 'miles');
            }
            return {
              position,
              endAddress: endAddress || `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
              route,
              apiSuccess: route.apiSuccess
            };
          }),
          catchError(() => {
            // If forkJoin times out, return 0 distance - user must fill in manually
            console.log('[StartStopTracking] forkJoin timeout - user must enter distance manually');
            return of({
              position,
              endAddress: `${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`,
              route: { distanceMiles: 0, durationMinutes: 0, apiSuccess: false },
              apiSuccess: false
            });
          })
        );
      }),
      map(({ position, endAddress, route }) => {
        // Calculate duration from timestamps
        const startDate = new Date(startState.startTime);
        const endDate = new Date(endTime);
        const durationSeconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);

        const result: StartStopResult = {
          startLat: startState.startLat,
          startLng: startState.startLng,
          startAddress: startState.startAddress,
          endLat: position.latitude,
          endLng: position.longitude,
          endAddress: endAddress,
          distanceMiles: route.distanceMiles,
          durationSeconds: durationSeconds,
          startTime: startState.startTime,
          endTime: endTime
        };

        // Clear the tracking state
        this.clearState();

        return result;
      }),
      timeout(30000), // 30 second master timeout for entire operation
      catchError(err => {
        console.error('Stop trip error:', err);
        // Return a fallback result even on error to prevent UI from hanging
        const endDate = new Date(endTime);
        const startDate = new Date(startState.startTime);
        const durationSeconds = Math.floor((endDate.getTime() - startDate.getTime()) / 1000);

        // Clear the state even on error
        this.clearState();

        // Return a minimal result with 0 distance - user can edit if needed
        return of({
          startLat: startState.startLat,
          startLng: startState.startLng,
          startAddress: startState.startAddress,
          endLat: startState.startLat, // Use start as end on error
          endLng: startState.startLng,
          endAddress: 'Unable to determine location',
          distanceMiles: 0,
          durationSeconds: durationSeconds,
          startTime: startState.startTime,
          endTime: endTime
        } as StartStopResult);
      })
    );
  }

  /**
   * Cancel the current trip without saving
   */
  cancelTrip(): void {
    this.clearState();
  }

  /**
   * Format elapsed time as "Xh Ym" or "Ym Zs"
   */
  formatElapsed(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  }

  /**
   * Save state to localStorage
   */
  private saveState(): void {
    if (this.currentState) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.currentState));
    }
  }

  /**
   * Restore state from localStorage
   */
  private restoreState(): void {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const state = JSON.parse(saved) as StartStopState;
        if (state.isActive) {
          this.currentState = state;
          this.updateSignals();
          this.startElapsedTimer();
        }
      } catch (error) {
        console.error('Failed to restore start/stop tracking state:', error);
        this.clearState();
      }
    }
  }

  /**
   * Clear state from memory and localStorage
   */
  private clearState(): void {
    this.currentState = null;
    localStorage.removeItem(STORAGE_KEY);
    this.stopElapsedTimer();
    this.isActive.set(false);
    this.startTime.set(null);
    this.startAddress.set(null);
    this.elapsedSeconds.set(0);
  }

  /**
   * Update reactive signals from current state
   */
  private updateSignals(): void {
    if (this.currentState) {
      this.isActive.set(this.currentState.isActive);
      this.startTime.set(this.currentState.startTime);
      this.startAddress.set(this.currentState.startAddress);
      this.updateElapsedTime();
    }
  }

  /**
   * Start the elapsed time timer
   */
  private startElapsedTimer(): void {
    this.stopElapsedTimer();
    this.updateElapsedTime();
    this.timerInterval = window.setInterval(() => {
      this.updateElapsedTime();
    }, 1000);
  }

  /**
   * Stop the elapsed time timer
   */
  private stopElapsedTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = undefined;
    }
  }

  /**
   * Update the elapsed seconds from start time
   */
  private updateElapsedTime(): void {
    if (this.currentState && this.currentState.startTime) {
      const startDate = new Date(this.currentState.startTime);
      const now = new Date();
      const elapsed = Math.floor((now.getTime() - startDate.getTime()) / 1000);
      this.elapsedSeconds.set(Math.max(0, elapsed));
    }
  }
}
