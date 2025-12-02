import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { PerDiemService } from './per-diem.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import { LoggerService } from './logger.service';
import {
  PerDiemRate,
  TravelTrip,
  TravelTripDay,
  CreateTravelTripDto,
  UpdateTravelTripDto,
  UpdateTripDayDto,
  PerDiemLookupResult,
  TripPerDiemCalculation,
  GSA_MEAL_DEDUCTION_PERCENTAGES,
  TRAVEL_DAY_MIE_PERCENTAGE
} from '../models/per-diem.model';

describe('PerDiemService', () => {
  let service: PerDiemService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let loggerServiceSpy: jasmine.SpyObj<LoggerService>;

  const mockOrgId = 'test-org-id';
  const mockUserId = 'test-user-id';
  const mockRateId = 'rate-1';
  const mockTripId = 'trip-1';
  const mockDayId = 'day-1';

  const mockPerDiemRate: PerDiemRate = {
    id: mockRateId,
    organization_id: mockOrgId,
    location: 'New York, NY',
    country_code: 'US',
    lodging_rate: 282,
    mie_rate: 79,
    total_rate: 361,
    fiscal_year: 2024,
    effective_from: '2023-10-01',
    effective_until: null,
    is_standard_rate: false,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockPerDiemRates: PerDiemRate[] = [
    mockPerDiemRate,
    {
      ...mockPerDiemRate,
      id: 'rate-2',
      location: 'Standard CONUS',
      lodging_rate: 107,
      mie_rate: 59,
      total_rate: 166,
      is_standard_rate: true
    }
  ];

  const mockTripDay: TravelTripDay = {
    id: mockDayId,
    trip_id: mockTripId,
    travel_date: '2024-03-15',
    day_number: 1,
    lodging_allowance: 282,
    mie_allowance: 79,
    is_first_day: true,
    is_last_day: false,
    breakfast_provided: false,
    lunch_provided: false,
    dinner_provided: false,
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z'
  };

  const mockTravelTrip: TravelTrip = {
    id: mockTripId,
    organization_id: mockOrgId,
    user_id: mockUserId,
    trip_name: 'NYC Business Trip',
    description: 'Client meetings',
    destination_city: 'New York',
    destination_state: 'NY',
    destination_country: 'US',
    start_date: '2024-03-15',
    end_date: '2024-03-18',
    total_days: 4,
    total_lodging_allowance: 846,
    total_mie_allowance: 316,
    total_per_diem: 1162,
    status: 'planned',
    created_at: '2024-01-01T10:00:00Z',
    updated_at: '2024-01-01T10:00:00Z',
    travel_trip_days: [mockTripDay]
  };

  const mockTrips: TravelTrip[] = [
    mockTravelTrip,
    {
      ...mockTravelTrip,
      id: 'trip-2',
      trip_name: 'Chicago Conference',
      destination_city: 'Chicago',
      destination_state: 'IL',
      status: 'in_progress'
    }
  ];

  // Helper to create smart mock that handles getMyTrips refresh
  function createSmartFromMock(
    mainOperation: 'insert' | 'update' | 'delete',
    mainResponse: any
  ) {
    // Mock for getMyTrips refresh
    const tripsOrderSpy = jasmine.createSpy('tripsOrder').and.resolveTo({ data: mockTrips, error: null });
    const tripsEqSpy = jasmine.createSpy('tripsEq').and.returnValue({ order: tripsOrderSpy });
    const tripsSelectSpy = jasmine.createSpy('tripsSelect').and.returnValue({ eq: tripsEqSpy });

    let mainChain: any = {};
    if (mainOperation === 'insert') {
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mainResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      mainChain = { insert: insertSpy };
    } else if (mainOperation === 'update') {
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mainResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      mainChain = { update: updateSpy };
    } else if (mainOperation === 'delete') {
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mainResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });
      mainChain = { delete: deleteSpy };
    }

    return jasmine.createSpy('from').and.callFake((table: string) => {
      if (table === 'travel_trips') {
        return { ...mainChain, select: tripsSelectSpy };
      }
      return { ...mainChain, select: tripsSelectSpy };
    });
  }

  beforeEach(() => {
    const supabaseSpy = jasmine.createSpyObj('SupabaseService', [], {
      client: {
        from: jasmine.createSpy('from'),
        rpc: jasmine.createSpy('rpc')
      },
      userId: mockUserId
    });

    const organizationSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrgId
    });

    const loggerSpy = jasmine.createSpyObj('LoggerService', [
      'info',
      'warn',
      'error'
    ]);

    TestBed.configureTestingModule({
      providers: [
        PerDiemService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: organizationSpy },
        { provide: LoggerService, useValue: loggerSpy }
      ]
    });

    service = TestBed.inject(PerDiemService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
    loggerServiceSpy = TestBed.inject(LoggerService) as jasmine.SpyObj<LoggerService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should initialize with empty trips', () => {
    expect(service.userTrips()).toEqual([]);
    expect(service.activeTrips().length).toBe(0);
    expect(service.totalActivePerDiem()).toBe(0);
  });

  // =============================================================================
  // PER DIEM RATES TESTS
  // =============================================================================

  describe('getPerDiemRates', () => {
    it('should return per diem rates for the organization', (done) => {
      const mockResponse = { data: mockPerDiemRates, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getPerDiemRates().subscribe({
        next: (rates) => {
          expect(rates).toEqual(mockPerDiemRates);
          expect(selectSpy).toHaveBeenCalledWith('*');
          expect(eqSpy).toHaveBeenCalledWith('organization_id', mockOrgId);
          expect(orderSpy).toHaveBeenCalledWith('location', { ascending: true });
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.getPerDiemRates().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('lookupRate', () => {
    it('should look up per diem rate for a location', (done) => {
      const mockResult: PerDiemLookupResult = {
        location: 'New York, NY',
        lodging_rate: 282,
        mie_rate: 79,
        total_rate: 361,
        fiscal_year: 2024,
        is_standard_rate: false
      };
      const mockResponse = { data: mockResult, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.lookupRate('New York, NY', 'US').subscribe({
        next: (result) => {
          expect(result).toEqual(mockResult);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('get_per_diem_rate', {
            p_organization_id: mockOrgId,
            p_location: 'New York, NY',
            p_country_code: 'US'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return null for unknown location', (done) => {
      const mockResponse = { data: null, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.lookupRate('Unknown City').subscribe({
        next: (result) => {
          expect(result).toBeNull();
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.lookupRate('New York, NY').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('createRate', () => {
    const newRate = {
      location: 'San Francisco, CA',
      country_code: 'US',
      lodging_rate: 350,
      mie_rate: 79,
      total_rate: 429,
      fiscal_year: 2024,
      effective_from: '2023-10-01',
      is_standard_rate: false
    };

    it('should create a new per diem rate', (done) => {
      const mockResponse = { data: { ...mockPerDiemRate, ...newRate, id: 'rate-new' }, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const insertSpy = jasmine.createSpy('insert').and.returnValue({ select: selectSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        insert: insertSpy
      }) as any;

      service.createRate(newRate).subscribe({
        next: (rate) => {
          expect(rate.location).toBe(newRate.location);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.createRate(newRate).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateRate', () => {
    it('should update a per diem rate', (done) => {
      const updates = { lodging_rate: 300, mie_rate: 85 };
      const mockResponse = { data: { ...mockPerDiemRate, ...updates }, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.updateRate(mockRateId, updates).subscribe({
        next: (rate) => {
          expect(rate.lodging_rate).toBe(updates.lodging_rate);
          expect(rate.mie_rate).toBe(updates.mie_rate);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteRate', () => {
    it('should delete a per diem rate', (done) => {
      const mockResponse = { error: null };
      const eqSpy = jasmine.createSpy('eq').and.resolveTo(mockResponse);
      const deleteSpy = jasmine.createSpy('delete').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        delete: deleteSpy
      }) as any;

      service.deleteRate(mockRateId).subscribe({
        next: () => {
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // TRAVEL TRIPS TESTS
  // =============================================================================

  describe('getMyTrips', () => {
    it('should return user trips and update signals', (done) => {
      const mockResponse = { data: mockTrips, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getMyTrips().subscribe({
        next: (trips) => {
          expect(trips).toEqual(mockTrips);
          expect(service.userTrips()).toEqual(mockTrips);
          expect(service.activeTrips().length).toBe(2); // planned + in_progress
          done();
        },
        error: done.fail
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.getMyTrips().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('getAllTrips', () => {
    it('should return all organization trips', (done) => {
      const mockResponse = { data: mockTrips, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy, eq: jasmine.createSpy('eq2').and.returnValue({ order: orderSpy }) });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getAllTrips().subscribe({
        next: (trips) => {
          expect(trips).toEqual(mockTrips);
          done();
        },
        error: done.fail
      });
    });

    it('should apply status filter', (done) => {
      const filteredTrips = mockTrips.filter(t => t.status === 'planned');
      const mockResponse = { data: filteredTrips, error: null };
      // Create a thenable object that also has eq() method for chaining
      const createThenable = () => {
        const thenable: any = {
          then: (fn: (r: any) => void) => Promise.resolve(mockResponse).then(fn),
          eq: jasmine.createSpy('filterEq').and.callFake(() => createThenable())
        };
        return thenable;
      };
      const orderSpy = jasmine.createSpy('order').and.callFake(() => createThenable());
      const orgEqSpy = jasmine.createSpy('orgEq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: orgEqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getAllTrips({ status: 'planned' }).subscribe({
        next: (trips) => {
          expect(trips.length).toBe(1);
          expect(trips[0].status).toBe('planned');
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.getAllTrips().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getTrip', () => {
    it('should return a single trip by ID', (done) => {
      const mockResponse = { data: mockTravelTrip, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ single: singleSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getTrip(mockTripId).subscribe({
        next: (trip) => {
          expect(trip).toEqual(mockTravelTrip);
          expect(eqSpy).toHaveBeenCalledWith('id', mockTripId);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('createTrip', () => {
    const newTrip: CreateTravelTripDto = {
      trip_name: 'Seattle Meeting',
      destination_city: 'Seattle',
      destination_state: 'WA',
      destination_country: 'US',
      start_date: '2024-04-01',
      end_date: '2024-04-03'
    };

    it('should create a new travel trip', (done) => {
      const mockResponse = { data: { ...mockTravelTrip, ...newTrip, id: 'trip-new' }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('insert', mockResponse) as any;

      service.createTrip(newTrip).subscribe({
        next: (trip) => {
          expect(trip.trip_name).toBe(newTrip.trip_name);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });

    it('should reject if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', {
        get: () => null,
        configurable: true
      });

      service.createTrip(newTrip).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });

    it('should reject if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', {
        get: () => null,
        configurable: true
      });

      service.createTrip(newTrip).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('updateTrip', () => {
    it('should update a travel trip', (done) => {
      const updates: UpdateTravelTripDto = { id: mockTripId, trip_name: 'Updated NYC Trip' };
      const mockResponse = { data: { ...mockTravelTrip, ...updates }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.updateTrip(updates).subscribe({
        next: (trip) => {
          expect(trip.trip_name).toBe('Updated NYC Trip');
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteTrip', () => {
    it('should delete a travel trip', (done) => {
      const mockResponse = { error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('delete', mockResponse) as any;

      service.deleteTrip(mockTripId).subscribe({
        next: () => {
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('trip status methods', () => {
    beforeEach(() => {
      const mockResponse = { data: mockTravelTrip, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;
    });

    it('startTrip should set status to in_progress', (done) => {
      const mockResponse = { data: { ...mockTravelTrip, status: 'in_progress' }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.startTrip(mockTripId).subscribe({
        next: (trip) => {
          expect(trip.status).toBe('in_progress');
          done();
        },
        error: done.fail
      });
    });

    it('completeTrip should set status to completed with expenses', (done) => {
      const mockResponse = { data: { ...mockTravelTrip, status: 'completed', actual_lodging_expense: 800, actual_meal_expense: 200 }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.completeTrip(mockTripId, { lodging: 800, meals: 200 }).subscribe({
        next: (trip) => {
          expect(trip.status).toBe('completed');
          expect(trip.actual_lodging_expense).toBe(800);
          expect(trip.actual_meal_expense).toBe(200);
          done();
        },
        error: done.fail
      });
    });

    it('cancelTrip should set status to cancelled', (done) => {
      const mockResponse = { data: { ...mockTravelTrip, status: 'cancelled' }, error: null };
      supabaseServiceSpy.client.from = createSmartFromMock('update', mockResponse) as any;

      service.cancelTrip(mockTripId).subscribe({
        next: (trip) => {
          expect(trip.status).toBe('cancelled');
          done();
        },
        error: done.fail
      });
    });
  });

  // =============================================================================
  // TRIP DAYS TESTS
  // =============================================================================

  describe('updateTripDay', () => {
    it('should update a trip day', (done) => {
      const updates: UpdateTripDayDto = { id: mockDayId, breakfast_provided: true };
      const mockResponse = { data: { ...mockTripDay, ...updates }, error: null };
      const singleSpy = jasmine.createSpy('single').and.resolveTo(mockResponse);
      const selectSpy = jasmine.createSpy('select').and.returnValue({ single: singleSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ select: selectSpy });
      const updateSpy = jasmine.createSpy('update').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        update: updateSpy
      }) as any;

      service.updateTripDay(updates).subscribe({
        next: (day) => {
          expect(day.breakfast_provided).toBe(true);
          expect(loggerServiceSpy.info).toHaveBeenCalled();
          done();
        },
        error: done.fail
      });
    });
  });

  describe('updateTripDays', () => {
    it('should batch update multiple trip days', (done) => {
      const days: UpdateTripDayDto[] = [
        { id: 'day-1', breakfast_provided: true },
        { id: 'day-2', lunch_provided: true }
      ];
      const mockResponses = days.map((d) => ({
        data: { ...mockTripDay, ...d },
        error: null
      }));

      const singleSpies = mockResponses.map(r => jasmine.createSpy('single').and.resolveTo(r));
      const selectSpies = singleSpies.map(s => jasmine.createSpy('select').and.returnValue({ single: s }));
      const eqSpies = selectSpies.map(s => jasmine.createSpy('eq').and.returnValue({ select: s }));
      const updateSpies = eqSpies.map(e => jasmine.createSpy('update').and.returnValue({ eq: e }));

      let callCount = 0;
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake(() => ({
        update: updateSpies[callCount++]
      })) as any;

      service.updateTripDays(days).subscribe({
        next: (updatedDays) => {
          expect(updatedDays.length).toBe(2);
          done();
        },
        error: done.fail
      });
    });

    it('should handle partial failures', (done) => {
      const days: UpdateTripDayDto[] = [
        { id: 'day-1', breakfast_provided: true },
        { id: 'day-2', lunch_provided: true }
      ];

      const singleSpies = [
        jasmine.createSpy('single').and.resolveTo({ data: mockTripDay, error: null }),
        jasmine.createSpy('single').and.resolveTo({ data: null, error: { message: 'Update failed' } })
      ];
      const selectSpies = singleSpies.map(s => jasmine.createSpy('select').and.returnValue({ single: s }));
      const eqSpies = selectSpies.map(s => jasmine.createSpy('eq').and.returnValue({ select: s }));
      const updateSpies = eqSpies.map(e => jasmine.createSpy('update').and.returnValue({ eq: e }));

      let callCount = 0;
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.callFake(() => ({
        update: updateSpies[callCount++]
      })) as any;

      service.updateTripDays(days).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toContain('Failed to update 1 trip days');
          done();
        }
      });
    });
  });

  // =============================================================================
  // CALCULATIONS TESTS
  // =============================================================================

  describe('calculateTripPerDiem', () => {
    it('should calculate trip per diem using RPC', (done) => {
      const mockCalc: TripPerDiemCalculation = {
        total_days: 4,
        total_lodging: 846,
        total_mie: 316,
        total_per_diem: 1162,
        daily_breakdown: []
      };
      const mockResponse = { data: mockCalc, error: null };
      (supabaseServiceSpy.client.rpc as jasmine.Spy).and.resolveTo(mockResponse);

      service.calculateTripPerDiem(mockTripId).subscribe({
        next: (calc) => {
          expect(calc).toEqual(mockCalc);
          expect(supabaseServiceSpy.client.rpc).toHaveBeenCalledWith('calculate_trip_per_diem', {
            p_trip_id: mockTripId
          });
          done();
        },
        error: done.fail
      });
    });
  });

  describe('calculateMealDeduction', () => {
    it('should calculate breakfast deduction (20%)', () => {
      const mieRate = 79;
      const deduction = service.calculateMealDeduction(mieRate, 'breakfast');
      expect(deduction).toBe(mieRate * GSA_MEAL_DEDUCTION_PERCENTAGES.breakfast);
      expect(deduction).toBeCloseTo(15.8);
    });

    it('should calculate lunch deduction (30%)', () => {
      const mieRate = 79;
      const deduction = service.calculateMealDeduction(mieRate, 'lunch');
      expect(deduction).toBe(mieRate * GSA_MEAL_DEDUCTION_PERCENTAGES.lunch);
      expect(deduction).toBeCloseTo(23.7);
    });

    it('should calculate dinner deduction (50%)', () => {
      const mieRate = 79;
      const deduction = service.calculateMealDeduction(mieRate, 'dinner');
      expect(deduction).toBe(mieRate * GSA_MEAL_DEDUCTION_PERCENTAGES.dinner);
      expect(deduction).toBeCloseTo(39.5);
    });
  });

  describe('calculateTravelDayMie', () => {
    it('should calculate 75% for first/last day', () => {
      const fullRate = 79;
      const travelDayRate = service.calculateTravelDayMie(fullRate);
      expect(travelDayRate).toBe(fullRate * TRAVEL_DAY_MIE_PERCENTAGE);
      expect(travelDayRate).toBeCloseTo(59.25);
    });
  });

  describe('calculateAdjustedMie', () => {
    const mieRate = 79;

    it('should return full rate for full day with no meals provided', () => {
      const adjusted = service.calculateAdjustedMie(mieRate, {});
      expect(adjusted).toBe(mieRate);
    });

    it('should apply first/last day reduction', () => {
      const adjusted = service.calculateAdjustedMie(mieRate, { isFirstOrLastDay: true });
      expect(adjusted).toBeCloseTo(59.25);
    });

    it('should deduct breakfast when provided', () => {
      const adjusted = service.calculateAdjustedMie(mieRate, { breakfastProvided: true });
      expect(adjusted).toBeCloseTo(79 - 15.8);
    });

    it('should deduct lunch when provided', () => {
      const adjusted = service.calculateAdjustedMie(mieRate, { lunchProvided: true });
      expect(adjusted).toBeCloseTo(79 - 23.7);
    });

    it('should deduct dinner when provided', () => {
      const adjusted = service.calculateAdjustedMie(mieRate, { dinnerProvided: true });
      expect(adjusted).toBeCloseTo(79 - 39.5);
    });

    it('should deduct all meals when all provided', () => {
      const adjusted = service.calculateAdjustedMie(mieRate, {
        breakfastProvided: true,
        lunchProvided: true,
        dinnerProvided: true
      });
      // 79 - (15.8 + 23.7 + 39.5) = 0
      expect(adjusted).toBe(0);
    });

    it('should not go below zero', () => {
      // First/last day (75%) + all meals provided
      const adjusted = service.calculateAdjustedMie(mieRate, {
        isFirstOrLastDay: true,
        breakfastProvided: true,
        lunchProvided: true,
        dinnerProvided: true
      });
      expect(adjusted).toBe(0);
    });

    it('should apply first/last day reduction with partial meals', () => {
      const adjusted = service.calculateAdjustedMie(mieRate, {
        isFirstOrLastDay: true,
        lunchProvided: true
      });
      // 75% of 79 = 59.25, minus lunch deduction (23.7) = 35.55
      expect(adjusted).toBeCloseTo(59.25 - 23.7);
    });
  });

  // =============================================================================
  // INITIALIZATION TESTS
  // =============================================================================

  describe('initialize', () => {
    it('should load user trips on init', () => {
      const mockResponse = { data: mockTrips, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.initialize();

      expect(supabaseServiceSpy.client.from).toHaveBeenCalledWith('travel_trips');
    });

    it('should log warning on failure', fakeAsync(() => {
      const mockError = { message: 'Load failed' };
      const mockResponse = { data: null, error: mockError };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.initialize();

      // Allow async to complete
      tick(100);
      expect(loggerServiceSpy.warn).toHaveBeenCalled();
    }));
  });

  // =============================================================================
  // COMPUTED SIGNALS TESTS
  // =============================================================================

  describe('computed signals', () => {
    beforeEach((done) => {
      const mockResponse = { data: mockTrips, error: null };
      const orderSpy = jasmine.createSpy('order').and.resolveTo(mockResponse);
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ order: orderSpy });
      const selectSpy = jasmine.createSpy('select').and.returnValue({ eq: eqSpy });
      supabaseServiceSpy.client.from = jasmine.createSpy('from').and.returnValue({
        select: selectSpy
      }) as any;

      service.getMyTrips().subscribe({
        next: () => done(),
        error: done.fail
      });
    });

    it('activeTrips should filter planned and in_progress', () => {
      const active = service.activeTrips();
      expect(active.length).toBe(2);
      expect(active.every(t => t.status === 'planned' || t.status === 'in_progress')).toBe(true);
    });

    it('totalActivePerDiem should sum active trip per diems', () => {
      const total = service.totalActivePerDiem();
      const expectedTotal = mockTrips
        .filter(t => t.status === 'planned' || t.status === 'in_progress')
        .reduce((sum, t) => sum + t.total_per_diem, 0);
      expect(total).toBe(expectedTotal);
    });
  });
});
