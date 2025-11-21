import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';

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
   * Wait for Google Maps to be loaded
   */
  private waitForMaps(): Observable<any> {
    return this.loaderSubject.pipe(
      map(loaded => {
        if (!loaded || !this.googleMaps) {
          throw new Error('Google Maps not loaded');
        }
        return this.googleMaps;
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
      map((result: any) => {
        if (!result.results || result.results.length === 0) {
          throw new Error('No address found for coordinates');
        }
        return result.results[0].formatted_address;
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
          this.geocodeAddress(origin).toPromise(),
          this.geocodeAddress(destination).toPromise()
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
