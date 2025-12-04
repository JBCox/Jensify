import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable, from, of, throwError, timer, firstValueFrom } from 'rxjs';
import { map, switchMap, filter, take, timeout, catchError } from 'rxjs/operators';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  distance: number; // in miles
  duration: number; // in minutes
  origin: LatLng;
  destination: LatLng;
  polyline: string;
}

/**
 * Google Maps Service
 * Handles all Google Maps API interactions
 */
@Injectable({
  providedIn: 'root'
})
export class GoogleMapsService {
  private loaderSubject = new BehaviorSubject<boolean>(false);
  private googleMaps?: any;

  constructor() {
    this.initLoader();
  }

  /**
   * Initialize Google Maps loader
   */
  private async initLoader(): Promise<void> {
    try {
      // Check if already loaded
      if ((window as any).google?.maps) {
        this.googleMaps = (window as any).google.maps;
        this.loaderSubject.next(true);
        return;
      }

      // Load Google Maps script
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${environment.googleMaps.apiKey}&libraries=places,geometry`;
      script.async = true;
      script.defer = true;

      script.onload = () => {
        this.googleMaps = (window as any).google?.maps;
        this.loaderSubject.next(true);
      };

      script.onerror = () => {
        console.error('Error loading Google Maps');
        this.loaderSubject.next(false);
      };

      document.head.appendChild(script);
    } catch (error) {
      console.error('Error loading Google Maps', error);
      this.loaderSubject.next(false);
    }
  }

  /**
   * Wait for Google Maps to be loaded (with timeout)
   */
  private waitForMaps(): Observable<any> {
    return this.loaderSubject.pipe(
      filter(loaded => loaded === true),
      take(1),
      timeout(10000), // 10 second timeout
      map(() => {
        if (!this.googleMaps) {
          throw new Error('Google Maps not loaded');
        }
        return this.googleMaps;
      }),
      catchError(err => {
        console.error('Google Maps loading error:', err);
        return throwError(() => new Error('Google Maps failed to load'));
      })
    );
  }

  /**
   * Geocode an address to coordinates
   */
  geocodeAddress(address: string): Observable<LatLng> {
    return this.waitForMaps().pipe(
      switchMap(maps => {
        const geocoder = new maps.Geocoder();
        return from(geocoder.geocode({ address }));
      }),
      map((result: any) => {
        if (!result.results || result.results.length === 0) {
          throw new Error(`No results found for address: ${address}`);
        }
        const location = result.results[0].geometry.location;
        return {
          lat: location.lat(),
          lng: location.lng()
        };
      })
    );
  }

  /**
   * Reverse geocode coordinates to address
   */
  reverseGeocode(lat: number, lng: number): Observable<string> {
    return this.waitForMaps().pipe(
      switchMap(maps => {
        const geocoder = new maps.Geocoder();
        return from(geocoder.geocode({ location: { lat, lng } }));
      }),
      timeout(10000), // 10 second timeout for geocoding
      map((result: any) => {
        if (!result.results || result.results.length === 0) {
          throw new Error('No address found for coordinates');
        }
        return result.results[0].formatted_address;
      }),
      catchError(err => {
        console.error('Reverse geocode error:', err);
        // Return coordinates as fallback
        return of(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      })
    );
  }

  /**
   * Calculate distance and route between two addresses
   */
  calculateRoute(origin: string, destination: string): Observable<RouteResult> {
    return this.waitForMaps().pipe(
      switchMap(maps => {
        const service = new maps.DistanceMatrixService();
        return from(
          service.getDistanceMatrix({
            origins: [origin],
            destinations: [destination],
            travelMode: maps.TravelMode.DRIVING,
            unitSystem: maps.UnitSystem.IMPERIAL // Miles
          })
        );
      }),
      switchMap((result: any) => {
        if (!result.rows || !result.rows[0] || !result.rows[0].elements[0]) {
          throw new Error('Unable to calculate route');
        }

        const element = result.rows[0].elements[0];
        if (element.status !== 'OK') {
          throw new Error(`Route calculation failed: ${element.status}`);
        }

        // Get coordinates for both addresses
        return from(Promise.all([
          firstValueFrom(this.geocodeAddress(origin)),
          firstValueFrom(this.geocodeAddress(destination))
        ])).pipe(
          map(([originCoords, destCoords]) => {
            if (!originCoords || !destCoords) {
              throw new Error('Failed to geocode addresses');
            }

            return {
              distance: element.distance.value / 1609.34, // meters to miles
              duration: element.duration.value / 60, // seconds to minutes
              origin: originCoords,
              destination: destCoords,
              polyline: '' // TODO: Get from Directions API if needed
            };
          })
        );
      })
    );
  }

  /**
   * Calculate driving distance between two coordinate points
   * Used by Start/Stop tracking mode
   *
   * Returns actual driving distance from Google Distance Matrix API.
   * If API fails, returns 0 distance - user must fill in manually.
   *
   * If Distance Matrix API fails, check Google Cloud Console:
   * 1. Distance Matrix API must be ENABLED (separate from Maps JavaScript API)
   * 2. Billing must be enabled on the project
   * 3. API key must not have restrictions excluding Distance Matrix API
   */
  getRouteByCoords(origin: LatLng, destination: LatLng): Observable<{ distanceMiles: number; durationMinutes: number; apiSuccess: boolean }> {
    // Check if start and end are essentially the same location (within ~100 meters)
    const latDiff = Math.abs(origin.lat - destination.lat);
    const lngDiff = Math.abs(origin.lng - destination.lng);
    if (latDiff < 0.001 && lngDiff < 0.001) {
      console.log('[GoogleMapsService] Start/End locations are the same, returning 0 distance');
      return of({ distanceMiles: 0, durationMinutes: 0, apiSuccess: true });
    }

    return this.waitForMaps().pipe(
      switchMap(maps => {
        console.log('[GoogleMapsService] Calling Distance Matrix API with coords:', origin, destination);
        const service = new maps.DistanceMatrixService();
        return from(
          service.getDistanceMatrix({
            origins: [new maps.LatLng(origin.lat, origin.lng)],
            destinations: [new maps.LatLng(destination.lat, destination.lng)],
            travelMode: maps.TravelMode.DRIVING,
            unitSystem: maps.UnitSystem.IMPERIAL
          })
        );
      }),
      timeout(15000),
      map((result: any) => {
        console.log('[GoogleMapsService] Distance Matrix API response:', result);

        if (!result.rows || !result.rows[0] || !result.rows[0].elements[0]) {
          console.warn('[GoogleMapsService] Distance Matrix API returned invalid structure');
          console.warn('[GoogleMapsService] User will need to enter distance manually');
          return { distanceMiles: 0, durationMinutes: 0, apiSuccess: false };
        }

        const element = result.rows[0].elements[0];
        console.log('[GoogleMapsService] Distance Matrix element status:', element.status);

        // Handle various API error statuses - return 0 so user fills in manually
        if (element.status === 'ZERO_RESULTS' || element.status === 'NOT_FOUND') {
          console.warn('[GoogleMapsService] Distance Matrix: no route found');
          console.warn('[GoogleMapsService] User will need to enter distance manually');
          return { distanceMiles: 0, durationMinutes: 0, apiSuccess: false };
        }
        if (element.status === 'REQUEST_DENIED') {
          console.error('[GoogleMapsService] Distance Matrix API REQUEST_DENIED!');
          console.error('[GoogleMapsService] DIAGNOSTIC: Enable "Distance Matrix API" in Google Cloud Console');
          console.error('[GoogleMapsService] DIAGNOSTIC: API Key may be restricted - check API restrictions');
          return { distanceMiles: 0, durationMinutes: 0, apiSuccess: false };
        }
        if (element.status === 'OVER_QUERY_LIMIT') {
          console.error('[GoogleMapsService] Distance Matrix API OVER_QUERY_LIMIT - billing may need attention');
          return { distanceMiles: 0, durationMinutes: 0, apiSuccess: false };
        }
        if (element.status !== 'OK') {
          console.warn(`[GoogleMapsService] Distance Matrix status: ${element.status}`);
          console.warn('[GoogleMapsService] User will need to enter distance manually');
          return { distanceMiles: 0, durationMinutes: 0, apiSuccess: false };
        }

        const distanceMiles = Math.round((element.distance.value / 1609.34) * 100) / 100;
        const durationMinutes = Math.round(element.duration.value / 60);
        console.log(`[GoogleMapsService] Distance Matrix SUCCESS: ${distanceMiles} miles, ${durationMinutes} min`);

        return { distanceMiles, durationMinutes, apiSuccess: true };
      }),
      catchError(err => {
        // This catches network errors, timeouts, and API load failures
        console.error('[GoogleMapsService] Distance Matrix API error:', err?.message || err);
        console.warn('[GoogleMapsService] TIP: Check if Distance Matrix API is enabled in Google Cloud Console');
        console.warn('[GoogleMapsService] User will need to enter distance manually');
        return of({ distanceMiles: 0, durationMinutes: 0, apiSuccess: false });
      })
    );
  }

  /**
   * Calculate distance between two coordinates (straight line)
   */
  calculateDistance(from: LatLng, to: LatLng): number {
    if (!this.googleMaps) {
      throw new Error('Google Maps not loaded');
    }

    const fromLatLng = new this.googleMaps.LatLng(from.lat, from.lng);
    const toLatLng = new this.googleMaps.LatLng(to.lat, to.lng);

    // Returns distance in meters, convert to miles
    const distanceMeters = this.googleMaps.geometry.spherical.computeDistanceBetween(
      fromLatLng,
      toLatLng
    );

    return distanceMeters / 1609.34; // meters to miles
  }

  /**
   * Check if Google Maps is loaded
   */
  get isLoaded(): boolean {
    return this.loaderSubject.value;
  }
}
