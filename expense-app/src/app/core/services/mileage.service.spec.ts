import { TestBed } from '@angular/core/testing';
import { MileageService } from './mileage.service';
import { SupabaseService } from './supabase.service';
import { OrganizationService } from './organization.service';
import {
  MileageTrip,
  IRSMileageRate,
  CreateMileageTripDto,
  UpdateMileageTripDto,
  MileageFilterOptions,
  MileageStats,
  MileageRateCalculation,
  MileageCategory,
  MileageStatus,
  TripCoordinate
} from '../models/mileage.model';

describe('MileageService', () => {
  let service: MileageService;
  let supabaseServiceSpy: jasmine.SpyObj<SupabaseService>;
  let organizationServiceSpy: jasmine.SpyObj<OrganizationService>;
  let mockSupabaseClient: any;

  const mockOrganizationId = 'org-123';
  const mockUserId = 'user-123';

  const mockTrip: MileageTrip = {
    id: 'trip-1',
    organization_id: mockOrganizationId,
    user_id: mockUserId,
    trip_date: '2025-11-20',
    origin_address: '123 Main St',
    destination_address: '456 Oak Ave',
    origin_lat: 32.7555,
    origin_lng: -97.3308,
    destination_lat: 32.7767,
    destination_lng: -97.2945,
    distance_miles: 10.5,
    is_round_trip: true,
    total_miles: 21.0,
    irs_rate: 0.67,
    reimbursement_amount: 14.07,
    category: 'business',
    purpose: 'Client meeting',
    status: 'draft',
    tracking_method: 'manual',
    created_at: '2025-11-20T00:00:00Z',
    updated_at: '2025-11-20T00:00:00Z'
  };

  const mockIRSRate: IRSMileageRate = {
    id: 'rate-1',
    category: 'business',
    rate: 0.67,
    effective_date: '2024-01-01',
    end_date: undefined,
    created_at: '2024-01-01T00:00:00Z'
  };

  const mockCoordinate: TripCoordinate = {
    id: 'coord-1',
    trip_id: 'trip-1',
    latitude: 32.7555,
    longitude: -97.3308,
    accuracy: 10,
    recorded_at: '2025-11-20T10:00:00Z'
  };

  beforeEach(() => {
    // Create mock Supabase client
    mockSupabaseClient = {
      from: jasmine.createSpy('from').and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null })),
            single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null })),
            gte: jasmine.createSpy('gte').and.returnValue({
              lte: jasmine.createSpy('lte').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
              }),
              order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
            }),
            lte: jasmine.createSpy('lte').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
            }),
            in: jasmine.createSpy('in').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null }))
            })
          }),
          order: jasmine.createSpy('order').and.returnValue(Promise.resolve({ data: [], error: null })),
          lte: jasmine.createSpy('lte').and.returnValue({
            or: jasmine.createSpy('or').and.returnValue({
              order: jasmine.createSpy('order').and.returnValue({
                limit: jasmine.createSpy('limit').and.returnValue({
                  single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null }))
                })
              })
            })
          })
        }),
        insert: jasmine.createSpy('insert').and.returnValue({
          select: jasmine.createSpy('select').and.returnValue({
            single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null }))
          })
        }),
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: jasmine.createSpy('single').and.returnValue(Promise.resolve({ data: null, error: null }))
            })
          })
        }),
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue(Promise.resolve({ data: null, error: null }))
        })
      }),
      rpc: jasmine.createSpy('rpc').and.returnValue(Promise.resolve({ data: null, error: null }))
    };

    const supabaseSpy = jasmine.createSpyObj('SupabaseService', ['client', 'userId'], {
      client: mockSupabaseClient,
      userId: mockUserId
    });
    Object.defineProperty(supabaseSpy, 'client', { get: () => mockSupabaseClient });
    Object.defineProperty(supabaseSpy, 'userId', { get: () => mockUserId });

    const orgServiceSpy = jasmine.createSpyObj('OrganizationService', [], {
      currentOrganizationId: mockOrganizationId
    });
    Object.defineProperty(orgServiceSpy, 'currentOrganizationId', { get: () => mockOrganizationId });

    TestBed.configureTestingModule({
      providers: [
        MileageService,
        { provide: SupabaseService, useValue: supabaseSpy },
        { provide: OrganizationService, useValue: orgServiceSpy }
      ]
    });

    service = TestBed.inject(MileageService);
    supabaseServiceSpy = TestBed.inject(SupabaseService) as jasmine.SpyObj<SupabaseService>;
    organizationServiceSpy = TestBed.inject(OrganizationService) as jasmine.SpyObj<OrganizationService>;
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ============================================================================
  // CRUD OPERATIONS TESTS
  // ============================================================================

  describe('getMyTrips', () => {
    it('should fetch trips for current user', (done) => {
      const mockTrips = [mockTrip];
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockTrips, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getMyTrips().subscribe({
        next: (trips) => {
          expect(trips).toEqual(mockTrips);
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('mileage_trips');
          done();
        },
        error: done.fail
      });
    });

    it('should apply filters when provided', (done) => {
      const filters: MileageFilterOptions = {
        startDate: '2025-11-01',
        endDate: '2025-11-30',
        status: 'approved',
        category: 'business'
      };

      const mockTrips = [mockTrip];

      // Build a flexible mock chain that returns itself for all chainable methods
      // The chain must be thenable (have a then method) for the await to work
      const chainMock: any = {
        eq: jasmine.createSpy('eq').and.callFake(() => chainMock),
        gte: jasmine.createSpy('gte').and.callFake(() => chainMock),
        lte: jasmine.createSpy('lte').and.callFake(() => chainMock),
        in: jasmine.createSpy('in').and.callFake(() => chainMock),
        not: jasmine.createSpy('not').and.callFake(() => chainMock),
        is: jasmine.createSpy('is').and.callFake(() => chainMock),
        or: jasmine.createSpy('or').and.callFake(() => chainMock),
        order: jasmine.createSpy('order').and.callFake(() => chainMock),
        // Make the chain thenable for async/await
        then: jasmine.createSpy('then').and.callFake((resolve: any) => {
          return Promise.resolve({ data: mockTrips, error: null }).then(resolve);
        })
      };

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue(chainMock)
      });

      service.getMyTrips(filters).subscribe({
        next: (trips) => {
          // Verify query was executed and returned results
          expect(trips).toEqual(mockTrips);
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('mileage_trips');

          // Verify filters were applied
          expect(chainMock.eq).toHaveBeenCalledWith('user_id', mockUserId);
          expect(chainMock.gte).toHaveBeenCalledWith('trip_date', '2025-11-01');
          expect(chainMock.lte).toHaveBeenCalledWith('trip_date', '2025-11-30');
          expect(chainMock.eq).toHaveBeenCalledWith('status', 'approved');
          expect(chainMock.eq).toHaveBeenCalledWith('category', 'business');
          expect(chainMock.order).toHaveBeenCalledWith('trip_date', { ascending: false });

          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.getMyTrips().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should handle Supabase errors', (done) => {
      const mockError = { message: 'Database error' };
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getMyTrips().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error).toEqual(mockError);
          done();
        }
      });
    });
  });

  describe('getAllTrips', () => {
    it('should fetch trips for current organization', (done) => {
      const mockTrips = [mockTrip];
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockTrips, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getAllTrips().subscribe({
        next: (trips) => {
          expect(trips).toEqual(mockTrips);
          done();
        },
        error: done.fail
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      service.getAllTrips().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('getTripById', () => {
    it('should fetch a single trip by ID', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockTrip, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.getTripById('trip-1').subscribe({
        next: (trip) => {
          expect(trip).toEqual(mockTrip);
          done();
        },
        error: done.fail
      });
    });

    it('should handle not found error', (done) => {
      const mockError = { message: 'Trip not found' };
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            single: singleSpy
          })
        })
      });

      service.getTripById('trip-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error).toEqual(mockError);
          done();
        }
      });
    });
  });

  describe('createTrip', () => {
    it('should create a new trip with IRS rate lookup', (done) => {
      const dto: CreateMileageTripDto = {
        trip_date: '2025-11-20',
        origin_address: '123 Main St',
        destination_address: '456 Oak Ave',
        distance_miles: 10.5,
        purpose: 'Client meeting'
      };

      // Mock IRS rate lookup
      const rateSingleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: { rate: 0.67 }, error: null })
      );

      // Mock trip insert
      const tripSingleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockTrip, error: null })
      );

      let callCount = 0;
      mockSupabaseClient.from.and.callFake((table: string) => {
        callCount++;
        if (callCount === 1) {
          // First call: IRS rate lookup
          return {
            select: jasmine.createSpy('select').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue({
                lte: jasmine.createSpy('lte').and.returnValue({
                  or: jasmine.createSpy('or').and.returnValue({
                    order: jasmine.createSpy('order').and.returnValue({
                      limit: jasmine.createSpy('limit').and.returnValue({
                        single: rateSingleSpy
                      })
                    })
                  })
                })
              })
            })
          };
        } else {
          // Second call: Insert trip
          return {
            insert: jasmine.createSpy('insert').and.returnValue({
              select: jasmine.createSpy('select').and.returnValue({
                single: tripSingleSpy
              })
            })
          };
        }
      });

      service.createTrip(dto).subscribe({
        next: (trip) => {
          expect(trip).toEqual(mockTrip);
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      const dto: CreateMileageTripDto = {
        trip_date: '2025-11-20',
        origin_address: '123 Main St',
        destination_address: '456 Oak Ave',
        distance_miles: 10.5,
        purpose: 'Business travel'
      };

      service.createTrip(dto).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      const dto: CreateMileageTripDto = {
        trip_date: '2025-11-20',
        origin_address: '123 Main St',
        destination_address: '456 Oak Ave',
        distance_miles: 10.5,
        purpose: 'Business travel'
      };

      service.createTrip(dto).subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  describe('updateTrip', () => {
    it('should update trip without changing rate', (done) => {
      const updates: UpdateMileageTripDto = {
        purpose: 'Updated purpose'
      };

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: { ...mockTrip, ...updates }, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: singleSpy
            })
          })
        })
      });

      service.updateTrip('trip-1', updates).subscribe({
        next: (trip) => {
          expect(trip.purpose).toBe('Updated purpose');
          done();
        },
        error: done.fail
      });
    });

    it('should update IRS rate when trip date changes', (done) => {
      const updates: UpdateMileageTripDto = {
        trip_date: '2025-12-01'
      };

      // Mock fetching current trip
      const currentTripSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: { trip_date: '2025-11-20', category: 'business' }, error: null })
      );

      // Mock IRS rate lookup
      const rateSingleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: { rate: 0.70 }, error: null })
      );

      // Mock update
      const updateSingleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: { ...mockTrip, ...updates, irs_rate: 0.70 }, error: null })
      );

      let callCount = 0;
      mockSupabaseClient.from.and.callFake((table: string) => {
        callCount++;
        if (callCount === 1) {
          // Fetch current trip
          return {
            select: jasmine.createSpy('select').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue({
                single: currentTripSpy
              })
            })
          };
        } else if (callCount === 2) {
          // Fetch new IRS rate
          return {
            select: jasmine.createSpy('select').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue({
                lte: jasmine.createSpy('lte').and.returnValue({
                  or: jasmine.createSpy('or').and.returnValue({
                    order: jasmine.createSpy('order').and.returnValue({
                      limit: jasmine.createSpy('limit').and.returnValue({
                        single: rateSingleSpy
                      })
                    })
                  })
                })
              })
            })
          };
        } else {
          // Update trip
          return {
            update: jasmine.createSpy('update').and.returnValue({
              eq: jasmine.createSpy('eq').and.returnValue({
                select: jasmine.createSpy('select').and.returnValue({
                  single: updateSingleSpy
                })
              })
            })
          };
        }
      });

      service.updateTrip('trip-1', updates).subscribe({
        next: (trip) => {
          expect(trip.trip_date).toBe('2025-12-01');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('deleteTrip', () => {
    it('should delete a trip', (done) => {
      const deleteSpy = jasmine.createSpy('eq').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: deleteSpy
        })
      });

      service.deleteTrip('trip-1').subscribe({
        next: () => {
          expect(deleteSpy).toHaveBeenCalledWith('id', 'trip-1');
          done();
        },
        error: done.fail
      });
    });

    it('should handle deletion errors', (done) => {
      const mockError = { message: 'Deletion failed' };
      const deleteSpy = jasmine.createSpy('eq').and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      mockSupabaseClient.from.and.returnValue({
        delete: jasmine.createSpy('delete').and.returnValue({
          eq: deleteSpy
        })
      });

      service.deleteTrip('trip-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error).toEqual(mockError);
          done();
        }
      });
    });
  });

  describe('getTripCoordinates', () => {
    it('should fetch GPS coordinates for a trip', (done) => {
      const mockCoordinates = [mockCoordinate];
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: mockCoordinates, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getTripCoordinates('trip-1').subscribe({
        next: (coordinates) => {
          expect(coordinates).toEqual(mockCoordinates);
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('trip_coordinates');
          done();
        },
        error: done.fail
      });
    });

    it('should return empty array when no coordinates found', (done) => {
      const orderSpy = jasmine.createSpy('order').and.returnValue(
        Promise.resolve({ data: null, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            order: orderSpy
          })
        })
      });

      service.getTripCoordinates('trip-1').subscribe({
        next: (coordinates) => {
          expect(coordinates).toEqual([]);
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // WORKFLOW OPERATIONS TESTS
  // ============================================================================

  describe('submitTrip', () => {
    it('should submit a trip', (done) => {
      const submittedTrip = { ...mockTrip, status: 'submitted' as MileageStatus, submitted_at: '2025-11-20T10:00:00Z' };
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: submittedTrip, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: singleSpy
            })
          })
        })
      });

      service.submitTrip('trip-1').subscribe({
        next: (trip) => {
          expect(trip.status).toBe('submitted');
          done();
        },
        error: done.fail
      });
    });
  });

  describe('approveTrip', () => {
    it('should approve a trip', (done) => {
      const approvedTrip = {
        ...mockTrip,
        status: 'approved' as MileageStatus,
        approved_at: '2025-11-20T10:00:00Z',
        approved_by: mockUserId
      };

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: approvedTrip, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: singleSpy
            })
          })
        })
      });

      service.approveTrip('trip-1').subscribe({
        next: (trip) => {
          expect(trip.status).toBe('approved');
          expect(trip.approved_by).toBe(mockUserId);
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.approveTrip('trip-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('rejectTrip', () => {
    it('should reject a trip with reason', (done) => {
      const rejectedTrip = {
        ...mockTrip,
        status: 'rejected' as MileageStatus,
        rejected_at: '2025-11-20T10:00:00Z',
        rejected_by: mockUserId,
        rejection_reason: 'Invalid route'
      };

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: rejectedTrip, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: singleSpy
            })
          })
        })
      });

      service.rejectTrip('trip-1', 'Invalid route').subscribe({
        next: (trip) => {
          expect(trip.status).toBe('rejected');
          expect(trip.rejection_reason).toBe('Invalid route');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.rejectTrip('trip-1', 'Invalid').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('markAsReimbursed', () => {
    it('should mark trip as reimbursed', (done) => {
      const reimbursedTrip = {
        ...mockTrip,
        status: 'reimbursed' as MileageStatus,
        reimbursed_at: '2025-11-20T10:00:00Z'
      };

      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: reimbursedTrip, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        update: jasmine.createSpy('update').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            select: jasmine.createSpy('select').and.returnValue({
              single: singleSpy
            })
          })
        })
      });

      service.markAsReimbursed('trip-1').subscribe({
        next: (trip) => {
          expect(trip.status).toBe('reimbursed');
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // IRS RATE OPERATIONS TESTS
  // ============================================================================

  describe('getCurrentRate', () => {
    it('should fetch current IRS rate for business category', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockIRSRate, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            lte: jasmine.createSpy('lte').and.returnValue({
              or: jasmine.createSpy('or').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue({
                  limit: jasmine.createSpy('limit').and.returnValue({
                    single: singleSpy
                  })
                })
              })
            })
          })
        })
      });

      service.getCurrentRate('business').subscribe({
        next: (rate) => {
          expect(rate).toEqual(mockIRSRate);
          done();
        },
        error: done.fail
      });
    });
  });

  describe('getRate', () => {
    it('should fetch IRS rate for specific date and category', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockIRSRate, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            lte: jasmine.createSpy('lte').and.returnValue({
              or: jasmine.createSpy('or').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue({
                  limit: jasmine.createSpy('limit').and.returnValue({
                    single: singleSpy
                  })
                })
              })
            })
          })
        })
      });

      service.getRate('business', '2025-11-20').subscribe({
        next: (rate) => {
          expect(rate).toEqual(mockIRSRate);
          expect(mockSupabaseClient.from).toHaveBeenCalledWith('irs_mileage_rates');
          done();
        },
        error: done.fail
      });
    });

    it('should handle rate not found error', (done) => {
      const mockError = { message: 'Rate not found' };
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: null, error: mockError })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            lte: jasmine.createSpy('lte').and.returnValue({
              or: jasmine.createSpy('or').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue({
                  limit: jasmine.createSpy('limit').and.returnValue({
                    single: singleSpy
                  })
                })
              })
            })
          })
        })
      });

      service.getRate('business', '2025-11-20').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error).toEqual(mockError);
          done();
        }
      });
    });
  });

  describe('calculateReimbursement', () => {
    it('should calculate reimbursement for one-way trip', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockIRSRate, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            lte: jasmine.createSpy('lte').and.returnValue({
              or: jasmine.createSpy('or').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue({
                  limit: jasmine.createSpy('limit').and.returnValue({
                    single: singleSpy
                  })
                })
              })
            })
          })
        })
      });

      service.calculateReimbursement(10, false, 'business', '2025-11-20').subscribe({
        next: (calc) => {
          expect(calc.totalMiles).toBe(10);
          expect(calc.rate).toBe(0.67);
          expect(calc.reimbursementAmount).toBe(6.70);
          expect(calc.category).toBe('business');
          done();
        },
        error: done.fail
      });
    });

    it('should calculate reimbursement for round trip', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockIRSRate, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            lte: jasmine.createSpy('lte').and.returnValue({
              or: jasmine.createSpy('or').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue({
                  limit: jasmine.createSpy('limit').and.returnValue({
                    single: singleSpy
                  })
                })
              })
            })
          })
        })
      });

      service.calculateReimbursement(10, true, 'business', '2025-11-20').subscribe({
        next: (calc) => {
          expect(calc.totalMiles).toBe(20);
          expect(calc.reimbursementAmount).toBe(13.40);
          done();
        },
        error: done.fail
      });
    });

    it('should use current date when trip date not provided', (done) => {
      const singleSpy = jasmine.createSpy('single').and.returnValue(
        Promise.resolve({ data: mockIRSRate, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: jasmine.createSpy('eq').and.returnValue({
            lte: jasmine.createSpy('lte').and.returnValue({
              or: jasmine.createSpy('or').and.returnValue({
                order: jasmine.createSpy('order').and.returnValue({
                  limit: jasmine.createSpy('limit').and.returnValue({
                    single: singleSpy
                  })
                })
              })
            })
          })
        })
      });

      service.calculateReimbursement(10, false, 'business').subscribe({
        next: (calc) => {
          expect(calc.totalMiles).toBe(10);
          done();
        },
        error: done.fail
      });
    });
  });

  // ============================================================================
  // EXPENSE INTEGRATION TESTS
  // ============================================================================

  describe('convertTripToExpense', () => {
    it('should convert trip to expense via RPC', (done) => {
      const expenseId = 'expense-123';
      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: expenseId, error: null })
      );

      service.convertTripToExpense('trip-1').subscribe({
        next: (id) => {
          expect(id).toBe(expenseId);
          expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('convert_trip_to_expense', {
            p_trip_id: 'trip-1',
            p_user_id: mockUserId
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.convertTripToExpense('trip-1').subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });

  describe('getOrganizationMileageRate', () => {
    it('should fetch organization mileage rate via RPC', (done) => {
      const rateData = { rate: 0.70, source: 'custom' as const, irs_rate: 0.67 };
      mockSupabaseClient.rpc.and.returnValue(
        Promise.resolve({ data: rateData, error: null })
      );

      service.getOrganizationMileageRate('2025-11-20').subscribe({
        next: (result) => {
          expect(result).toEqual(rateData);
          expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('get_org_mileage_rate', {
            p_organization_id: mockOrganizationId,
            p_trip_date: '2025-11-20',
            p_category: 'business'
          });
          done();
        },
        error: done.fail
      });
    });

    it('should return error if no organization selected', (done) => {
      Object.defineProperty(organizationServiceSpy, 'currentOrganizationId', { get: () => null });

      service.getOrganizationMileageRate().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('No organization selected');
          done();
        }
      });
    });
  });

  // ============================================================================
  // STATISTICS TESTS
  // ============================================================================

  describe('getStats', () => {
    it('should calculate mileage statistics', (done) => {
      const mockTrips: MileageTrip[] = [
        { ...mockTrip, status: 'draft', category: 'business', total_miles: 10, reimbursement_amount: 6.70 },
        { ...mockTrip, id: 'trip-2', status: 'approved', category: 'business', total_miles: 20, reimbursement_amount: 13.40 },
        { ...mockTrip, id: 'trip-3', status: 'rejected', category: 'medical', total_miles: 5, reimbursement_amount: 1.25 }
      ];

      const querySpy = jasmine.createSpy('eq').and.returnValue(
        Promise.resolve({ data: mockTrips, error: null })
      );

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: querySpy
        })
      });

      service.getStats().subscribe({
        next: (stats) => {
          expect(stats.totalTrips).toBe(3);
          expect(stats.totalMiles).toBe(35);
          expect(stats.totalReimbursement).toBe(21.35);
          expect(stats.tripsByStatus.draft).toBe(1);
          expect(stats.tripsByStatus.approved).toBe(1);
          expect(stats.tripsByStatus.rejected).toBe(1);
          expect(stats.tripsByCategory.business).toBe(2);
          expect(stats.tripsByCategory.medical).toBe(1);
          done();
        },
        error: done.fail
      });
    });

    it('should apply date filters to stats query', (done) => {
      const lteSpy = jasmine.createSpy('lte').and.returnValue(
        Promise.resolve({ data: [], error: null })
      );
      const gteSpy = jasmine.createSpy('gte').and.returnValue({ lte: lteSpy });
      const eqSpy = jasmine.createSpy('eq').and.returnValue({ gte: gteSpy });

      mockSupabaseClient.from.and.returnValue({
        select: jasmine.createSpy('select').and.returnValue({
          eq: eqSpy
        })
      });

      service.getStats('2025-11-01', '2025-11-30').subscribe({
        next: () => {
          expect(gteSpy).toHaveBeenCalledWith('trip_date', '2025-11-01');
          expect(lteSpy).toHaveBeenCalledWith('trip_date', '2025-11-30');
          done();
        },
        error: done.fail
      });
    });

    it('should return error if user not authenticated', (done) => {
      Object.defineProperty(supabaseServiceSpy, 'userId', { get: () => null });

      service.getStats().subscribe({
        next: () => done.fail('Should have thrown error'),
        error: (error) => {
          expect(error.message).toBe('User not authenticated');
          done();
        }
      });
    });
  });
});
