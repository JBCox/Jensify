import {
  Component,
  Input,
  OnChanges,
  SimpleChanges,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { GoogleMapsService } from '../../../core/services/google-maps.service';
import { TripCoordinate } from '../../../core/models/mileage.model';

export interface TripMapData {
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  coordinates?: TripCoordinate[]; // GPS tracking coordinates
}

/**
 * Trip Map Component
 * Displays Google Map with route visualization
 */
@Component({
  selector: 'app-trip-map',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="map-container">
      @if (loading()) {
        <div class="map-loading">Loading map...</div>
      }
      <div #mapElement class="map"></div>
    </div>
  `,
  styles: [`
    .map-container {
      position: relative;
      width: 100%;
      height: 100%;
      min-height: 400px;
    }

    .map {
      width: 100%;
      height: 100%;
      border-radius: 8px;
    }

    .map-loading {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: rgba(0, 0, 0, 0.6);
      font-size: 16px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TripMap implements OnChanges {
  @Input() tripData?: TripMapData;
  @ViewChild('mapElement', { static: true }) mapElement!: ElementRef<HTMLDivElement>;

  loading = signal(true);
  private map?: any;
  private directionsService?: any;
  private directionsRenderer?: any;

  constructor(private googleMapsService: GoogleMapsService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tripData'] && this.tripData) {
      this.initMap();
    }
  }

  /**
   * Initialize Google Map
   */
  private async initMap(): Promise<void> {
    if (!this.tripData) return;

    try {
      // Wait for Google Maps to load
      await new Promise<void>((resolve) => {
        const checkInterval = setInterval(() => {
          if (this.googleMapsService.isLoaded) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);
      });

      const { origin, destination, coordinates } = this.tripData;

      // Create map centered between origin and destination
      const center = {
        lat: (origin.lat + destination.lat) / 2,
        lng: (origin.lng + destination.lng) / 2
      };

      const google = (window as any).google;

      this.map = new google.maps.Map(this.mapElement.nativeElement, {
        center,
        zoom: 10,
        mapTypeControl: true,
        streetViewControl: false,
        fullscreenControl: true
      });

      // If GPS coordinates exist, render actual tracked path
      if (coordinates && coordinates.length > 0) {
        this.renderGPSPath(coordinates);
      } else {
        // Use Directions API for estimated route
        this.renderEstimatedRoute();
      }

      this.loading.set(false);
    } catch (error) {
      console.error('Error initializing map:', error);
      this.loading.set(false);
    }
  }

  /**
   * Render actual GPS tracking path as polyline
   */
  private renderGPSPath(coordinates: TripCoordinate[]): void {
    if (!this.map || !this.tripData) return;

    const google = (window as any).google;
    const { origin, destination } = this.tripData;

    // Convert coordinates to LatLng array
    const path = coordinates.map(coord => ({
      lat: coord.latitude,
      lng: coord.longitude
    }));

    // Create polyline for actual GPS path
    const polyline = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: '#FF5900', // Jensify orange
      strokeOpacity: 0.8,
      strokeWeight: 4,
      map: this.map
    });

    // Add markers for origin and destination
    new google.maps.Marker({
      position: { lat: origin.lat, lng: origin.lng },
      map: this.map,
      title: 'Start',
      label: { text: 'A', color: 'white' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#4CAF50',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2
      }
    });

    new google.maps.Marker({
      position: { lat: destination.lat, lng: destination.lng },
      map: this.map,
      title: 'End',
      label: { text: 'B', color: 'white' },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#F44336',
        fillOpacity: 1,
        strokeColor: 'white',
        strokeWeight: 2
      }
    });

    // Fit bounds to show entire path
    const bounds = new google.maps.LatLngBounds();
    path.forEach(point => bounds.extend(point));
    this.map.fitBounds(bounds);
  }

  /**
   * Render estimated route using Directions API
   */
  private renderEstimatedRoute(): void {
    if (!this.map || !this.tripData) return;

    const { origin, destination } = this.tripData;
    const google = (window as any).google;

    // Initialize directions service and renderer
    this.directionsService = new google.maps.DirectionsService();
    this.directionsRenderer = new google.maps.DirectionsRenderer({
      map: this.map,
      suppressMarkers: false
    });

    // Calculate and display route
    const request = {
      origin: new google.maps.LatLng(origin.lat, origin.lng),
      destination: new google.maps.LatLng(destination.lat, destination.lng),
      travelMode: google.maps.TravelMode.DRIVING
    };

    this.directionsService.route(request, (result: any, status: any) => {
      if (status === google.maps.DirectionsStatus.OK && result) {
        this.directionsRenderer?.setDirections(result);
      } else {
        console.error('Directions request failed:', status);
        // Fallback: Show markers without route
        this.showMarkers();
      }
    });
  }

  /**
   * Show origin and destination markers (fallback if directions fail)
   */
  private showMarkers(): void {
    if (!this.map || !this.tripData) return;

    const { origin, destination } = this.tripData;
    const google = (window as any).google;

    new google.maps.Marker({
      position: { lat: origin.lat, lng: origin.lng },
      map: this.map,
      title: 'Origin',
      label: 'A'
    });

    new google.maps.Marker({
      position: { lat: destination.lat, lng: destination.lng },
      map: this.map,
      title: 'Destination',
      label: 'B'
    });

    // Fit bounds to show both markers
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: origin.lat, lng: origin.lng });
    bounds.extend({ lat: destination.lat, lng: destination.lng });
    this.map.fitBounds(bounds);
  }
}
