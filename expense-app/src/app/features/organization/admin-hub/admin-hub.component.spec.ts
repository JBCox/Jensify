import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { AdminHubComponent } from './admin-hub.component';

describe('AdminHubComponent', () => {
  let component: AdminHubComponent;
  let fixture: ComponentFixture<AdminHubComponent>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    await TestBed.configureTestingModule({
      imports: [AdminHubComponent, NoopAnimationsModule],
      providers: [{ provide: Router, useValue: mockRouter }]
    }).compileComponents();

    fixture = TestBed.createComponent(AdminHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should render the page title', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const title = compiled.querySelector('.jensify-page-title');
    expect(title?.textContent).toContain('Admin');
  });

  it('should initialize with admin cards', () => {
    expect(component.adminCards).toBeDefined();
    expect(component.adminCards.length).toBeGreaterThan(0);
  });

  it('should have correct admin card structure', () => {
    const firstCard = component.adminCards[0];
    expect(firstCard.icon).toBeDefined();
    expect(firstCard.title).toBeDefined();
    expect(firstCard.description).toBeDefined();
    expect(firstCard.route).toBeDefined();
    expect(firstCard.color).toBeDefined();
  });

  it('should include User Management card', () => {
    const card = component.adminCards.find(c => c.title === 'User Management');
    expect(card).toBeDefined();
    expect(card?.route).toBe('/organization/users');
  });

  it('should navigate to correct route', () => {
    component.navigate('/organization/settings');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/organization/settings']);
  });

  it('should render all admin cards', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const cards = compiled.querySelectorAll('.admin-card');
    expect(cards.length).toBe(component.adminCards.length);
  });

  it('should use OnPush change detection', () => {
    expect(fixture.componentRef.changeDetectorRef).toBeDefined();
  });
});
