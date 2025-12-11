import { Injectable, OnDestroy, inject } from '@angular/core';
import { BehaviorSubject, Observable, from, of, throwError, Subject } from 'rxjs';
import { map, switchMap, timeout, catchError } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';

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

interface ProxyGeocodeResponse {
  lat: number;
  lng: number;
  formatted_address: string;
}

interface ProxyReverseGeocodeResponse {
  formatted_address: string;
  lat?: number;
  lng?: number;
  status?: string;
}

interface ProxyDistanceMatrixResponse {
  distanceMiles: number;
  durationMinutes: number;
  apiSuccess: boolean;
  status?: string;
}

/**
 * Google Maps Service
 *
 * SECURITY: All Google Maps API calls are proxied through Supabase Edge Function
 * to avoid exposing the API key in client-side code.
 *
 * The API key is stored as a Supabase secret (GOOGLE_MAPS_API_KEY) and never
 * exposed to the browser.
 */
@Injectable({
  providedIn: 'root'
})
export class GoogleMapsService implements OnDestroy {
  private readySubject = new BehaviorSubject<boolean>(true); // Always ready since we use Edge Function
  private destroy$ = new Subject<void>();
  private readonly supabase = inject(SupabaseService);

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Make authenticated request to Google Maps proxy Edge Function
   */
  private async callProxy<T>(action: string, params: Record<string, unknown>): Promise<T> {
    const session = await this.supabase.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(
      `${this.supabase.supabaseUrl}/functions/v1/google-maps-proxy`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': this.supabase.supabaseAnonKey
        },
        body: JSON.stringify({ action, ...params })
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Geocode an address to coordinates
   */
  geocodeAddress(address: string): Observable<LatLng> {
    return from(this.callProxy<ProxyGeocodeResponse>('geocode', { address })).pipe(
      map((result) => ({
        lat: result.lat,
        lng: result.lng
      })),
      catchError((error) => {
        return throwError(() => new Error(`Geocoding failed: ${error.message}`));
      })
    );
  }

  /**
   * Reverse geocode coordinates to address
   */
  reverseGeocode(lat: number, lng: number): Observable<string> {
    return from(this.callProxy<ProxyReverseGeocodeResponse>('reverse-geocode', { lat, lng })).pipe(
      timeout(15000),
      map((result) => result.formatted_address),
      catchError(() => {
        // Return coordinates as fallback
        return of(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
      })
    );
  }

  /**
   * Calculate distance and route between two addresses
   */
  calculateRoute(origin: string, destination: string): Observable<RouteResult> {
    // First geocode both addresses, then calculate distance
    return from(Promise.all([
      this.callProxy<ProxyGeocodeResponse>('geocode', { address: origin }),
      this.callProxy<ProxyGeocodeResponse>('geocode', { address: destination })
    ])).pipe(
      switchMap(([originResult, destResult]) => {
        return from(this.callProxy<ProxyDistanceMatrixResponse>('distance-matrix', {
          origin: { lat: originResult.lat, lng: originResult.lng },
          destination: { lat: destResult.lat, lng: destResult.lng }
        })).pipe(
          map((distanceResult) => ({
            distance: distanceResult.distanceMiles,
            duration: distanceResult.durationMinutes,
            origin: { lat: originResult.lat, lng: originResult.lng },
            destination: { lat: destResult.lat, lng: destResult.lng },
            polyline: '' // Not available from Distance Matrix API
          }))
        );
      }),
      catchError((error) => {
        return throwError(() => new Error(`Route calculation failed: ${error.message}`));
      })
    );
  }

  /**
   * Calculate driving distance between two coordinate points
   * Used by Start/Stop tracking mode
   *
   * Returns actual driving distance from Google Distance Matrix API via Edge Function.
   * If API fails, returns 0 distance - user must fill in manually.
   */
  getRouteByCoords(origin: LatLng, destination: LatLng): Observable<{ distanceMiles: number; durationMinutes: number; apiSuccess: boolean }> {
    // Check if start and end are essentially the same location (within ~100 meters)
    const latDiff = Math.abs(origin.lat - destination.lat);
    const lngDiff = Math.abs(origin.lng - destination.lng);
    if (latDiff < 0.001 && lngDiff < 0.001) {
      return of({ distanceMiles: 0, durationMinutes: 0, apiSuccess: true });
    }

    return from(this.callProxy<ProxyDistanceMatrixResponse>('distance-matrix', { origin, destination })).pipe(
      timeout(15000),
      map((result) => ({
        distanceMiles: result.distanceMiles,
        durationMinutes: result.durationMinutes,
        apiSuccess: result.apiSuccess
      })),
      catchError(() => {
        // Network errors, timeouts, etc.
        return of({ distanceMiles: 0, durationMinutes: 0, apiSuccess: false });
      })
    );
  }

  /**
   * Calculate distance between two coordinates (straight line)
   * Uses Haversine formula - no API call required
   */
  calculateDistance(from: LatLng, to: LatLng): number {
    const R = 3958.8; // Earth's radius in miles
    const dLat = this.toRad(to.lat - from.lat);
    const dLng = this.toRad(to.lng - from.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(from.lat)) * Math.cos(this.toRad(to.lat)) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  /**
   * Check if service is ready
   */
  get isLoaded(): boolean {
    return this.readySubject.value;
  }
}
