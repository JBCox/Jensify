import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

export interface GeolocationPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

/**
 * Geolocation Service
 * Handles GPS location capture using browser Geolocation API
 */
@Injectable({
  providedIn: 'root'
})
export class GeolocationService {

  /**
   * Get current position
   */
  getCurrentPosition(): Observable<GeolocationPosition> {
    return new Observable(observer => {
      if (!navigator.geolocation) {
        observer.error(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          observer.next({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          });
          observer.complete();
        },
        (error) => {
          observer.error(this.handleGeolocationError(error));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    });
  }

  /**
   * Watch position (for tracking)
   */
  watchPosition(): Observable<GeolocationPosition> {
    return new Observable(observer => {
      if (!navigator.geolocation) {
        observer.error(new Error('Geolocation not supported'));
        return;
      }

      const watchId = navigator.geolocation.watchPosition(
        (position) => {
          observer.next({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            timestamp: position.timestamp
          });
        },
        (error) => {
          observer.error(this.handleGeolocationError(error));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );

      // Cleanup function
      return () => {
        navigator.geolocation.clearWatch(watchId);
      };
    });
  }

  /**
   * Check if geolocation is available
   */
  isAvailable(): boolean {
    return 'geolocation' in navigator;
  }

  /**
   * Request permission (for browsers that require explicit prompt)
   */
  async requestPermission(): Promise<PermissionStatus | null> {
    if (!('permissions' in navigator)) {
      return null;
    }

    try {
      return await navigator.permissions.query({ name: 'geolocation' });
    } catch {
      return null;
    }
  }

  /**
   * Handle geolocation errors
   */
  private handleGeolocationError(error: GeolocationPositionError): Error {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        return new Error('Location permission denied. Please enable location access in your browser settings.');
      case error.POSITION_UNAVAILABLE:
        return new Error('Location information unavailable. Please try again.');
      case error.TIMEOUT:
        return new Error('Location request timed out. Please try again.');
      default:
        return new Error('Unknown geolocation error.');
    }
  }
}
