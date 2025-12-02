import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { GoogleMapsService, LatLng } from './google-maps.service';

describe('GoogleMapsService', () => {
  let service: GoogleMapsService;
  let originalGoogle: any;

  // Mock Google Maps objects
  const mockGeocoder = {
    geocode: jasmine.createSpy('geocode')
  };

  const mockDistanceMatrixService = {
    getDistanceMatrix: jasmine.createSpy('getDistanceMatrix')
  };

  // Mock LatLng constructor
  function MockLatLng(lat: number, lng: number) {
    return {
      lat: () => lat,
      lng: () => lng
    };
  }
  const mockLatLngSpy = jasmine.createSpy('LatLng').and.callFake(MockLatLng);

  const mockComputeDistanceBetween = jasmine.createSpy('computeDistanceBetween').and.returnValue(1609.34);

  const mockGoogleMaps = {
    Geocoder: function() { return mockGeocoder; },
    DistanceMatrixService: function() { return mockDistanceMatrixService; },
    LatLng: mockLatLngSpy,
    TravelMode: { DRIVING: 'DRIVING' },
    UnitSystem: { IMPERIAL: 'IMPERIAL' },
    geometry: {
      spherical: {
        computeDistanceBetween: mockComputeDistanceBetween
      }
    }
  };

  beforeEach(() => {
    originalGoogle = (window as any).google;
    (window as any).google = { maps: mockGoogleMaps };

    mockGeocoder.geocode.calls.reset();
    mockDistanceMatrixService.getDistanceMatrix.calls.reset();
    mockLatLngSpy.calls.reset();
    mockComputeDistanceBetween.calls.reset();

    TestBed.configureTestingModule({
      providers: [GoogleMapsService]
    });

    service = TestBed.inject(GoogleMapsService);
  });

  afterEach(() => {
    (window as any).google = originalGoogle;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('when Google Maps is already loaded', () => {
    it('should report isLoaded as true when Google Maps is already loaded', fakeAsync(() => {
      tick();
      expect(service.isLoaded).toBe(true);
    }));
  });

  describe('geocodeAddress', () => {
    it('should geocode an address successfully', fakeAsync(() => {
      const mockResult = {
        results: [
          {
            geometry: {
              location: {
                lat: () => 32.7767,
                lng: () => -96.7970
              }
            }
          }
        ]
      };

      mockGeocoder.geocode.and.resolveTo(mockResult);

      let result: LatLng | undefined;
      tick();

      service.geocodeAddress('123 Main St, Dallas, TX').subscribe(r => {
        result = r;
      });

      tick();

      expect(result).toEqual({ lat: 32.7767, lng: -96.7970 });
      expect(mockGeocoder.geocode).toHaveBeenCalledWith({ address: '123 Main St, Dallas, TX' });
    }));

    it('should throw error when no results found', fakeAsync(() => {
      mockGeocoder.geocode.and.resolveTo({ results: [] });

      let error: Error | undefined;
      tick();

      service.geocodeAddress('Invalid Address').subscribe({
        error: (e) => { error = e; }
      });

      tick();

      expect(error?.message).toContain('No results found for address');
    }));

    it('should throw error when results is undefined', fakeAsync(() => {
      mockGeocoder.geocode.and.resolveTo({});

      let error: Error | undefined;
      tick();

      service.geocodeAddress('Invalid Address').subscribe({
        error: (e) => { error = e; }
      });

      tick();

      expect(error?.message).toContain('No results found for address');
    }));
  });

  describe('reverseGeocode', () => {
    it('should reverse geocode coordinates successfully', fakeAsync(() => {
      const mockResult = {
        results: [
          { formatted_address: '123 Main St, Dallas, TX 75201' }
        ]
      };

      mockGeocoder.geocode.and.resolveTo(mockResult);

      let result: string | undefined;
      tick();

      service.reverseGeocode(32.7767, -96.7970).subscribe(r => {
        result = r;
      });

      tick();

      expect(result).toBe('123 Main St, Dallas, TX 75201');
      expect(mockGeocoder.geocode).toHaveBeenCalledWith({ location: { lat: 32.7767, lng: -96.7970 } });
    }));

    it('should throw error when no address found', fakeAsync(() => {
      mockGeocoder.geocode.and.resolveTo({ results: [] });

      let error: Error | undefined;
      tick();

      service.reverseGeocode(0, 0).subscribe({
        error: (e) => { error = e; }
      });

      tick();

      expect(error?.message).toBe('No address found for coordinates');
    }));
  });

  describe('calculateDistance', () => {
    it('should calculate distance between two coordinates', fakeAsync(() => {
      tick();

      const from: LatLng = { lat: 32.7767, lng: -96.7970 };
      const to: LatLng = { lat: 32.7555, lng: -97.3308 };

      const distance = service.calculateDistance(from, to);

      expect(distance).toBeCloseTo(1, 2);
      expect(mockLatLngSpy).toHaveBeenCalledWith(from.lat, from.lng);
      expect(mockLatLngSpy).toHaveBeenCalledWith(to.lat, to.lng);
      expect(mockComputeDistanceBetween).toHaveBeenCalled();
    }));
  });

  describe('calculateRoute', () => {
    it('should throw error when route calculation returns non-OK status', fakeAsync(() => {
      const mockDistanceResult = {
        rows: [
          {
            elements: [
              {
                status: 'ZERO_RESULTS'
              }
            ]
          }
        ]
      };

      mockDistanceMatrixService.getDistanceMatrix.and.resolveTo(mockDistanceResult);

      let error: Error | undefined;
      tick();

      service.calculateRoute('Invalid Origin', 'Invalid Destination').subscribe({
        error: (e) => { error = e; }
      });

      tick();

      expect(error?.message).toContain('Route calculation failed');
    }));

    it('should throw error when no route data available', fakeAsync(() => {
      mockDistanceMatrixService.getDistanceMatrix.and.resolveTo({ rows: [] });

      let error: Error | undefined;
      tick();

      service.calculateRoute('Dallas, TX', 'Fort Worth, TX').subscribe({
        error: (e) => { error = e; }
      });

      tick();

      expect(error?.message).toBe('Unable to calculate route');
    }));
  });
});
