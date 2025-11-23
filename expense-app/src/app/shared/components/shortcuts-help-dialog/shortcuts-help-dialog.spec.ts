import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';
import { ShortcutsHelpDialog } from './shortcuts-help-dialog';
import { KeyboardShortcutsService } from '../../../core/services/keyboard-shortcuts.service';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

describe('ShortcutsHelpDialog', () => {
  let component: ShortcutsHelpDialog;
  let fixture: ComponentFixture<ShortcutsHelpDialog>;
  let dialogRefSpy: jasmine.SpyObj<MatDialogRef<ShortcutsHelpDialog>>;
  let keyboardServiceSpy: jasmine.SpyObj<KeyboardShortcutsService>;

  beforeEach(async () => {
    dialogRefSpy = jasmine.createSpyObj('MatDialogRef', ['close']);
    keyboardServiceSpy = jasmine.createSpyObj('KeyboardShortcutsService', [
      'getShortcutsForHelp',
      'formatShortcut'
    ]);

    // Mock shortcuts data
    keyboardServiceSpy.getShortcutsForHelp.and.returnValue([
      {
        group: 'General',
        shortcuts: [
          {
            id: 'search',
            key: 'k',
            ctrl: true,
            description: 'Open search',
            callback: () => { /* Test callback */ }
          },
          {
            id: 'help',
            key: '?',
            shift: true,
            description: 'Show help',
            callback: () => { /* Test callback */ }
          }
        ]
      }
    ]);

    keyboardServiceSpy.formatShortcut.and.callFake((shortcut) => {
      if (shortcut.ctrl && shortcut.key === 'k') {
        return 'Ctrl+K';
      }
      if (shortcut.shift && shortcut.key === '?') {
        return 'Shift+?';
      }
      return shortcut.key.toUpperCase();
    });

    await TestBed.configureTestingModule({
      imports: [ShortcutsHelpDialog],
      providers: [
        { provide: MatDialogRef, useValue: dialogRefSpy },
        { provide: KeyboardShortcutsService, useValue: keyboardServiceSpy },
        provideNoopAnimations()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ShortcutsHelpDialog);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load shortcuts on init', () => {
    expect(keyboardServiceSpy.getShortcutsForHelp).toHaveBeenCalled();
    expect(component.shortcutGroups.length).toBe(1);
    expect(component.shortcutGroups[0].group).toBe('General');
    expect(component.shortcutGroups[0].shortcuts.length).toBe(2);
  });

  it('should format shortcuts correctly', () => {
    const groups = component.shortcutGroups;
    expect(groups[0].shortcuts[0].key).toBe('Ctrl+K');
    expect(groups[0].shortcuts[0].description).toBe('Open search');
    expect(groups[0].shortcuts[1].key).toBe('Shift+?');
    expect(groups[0].shortcuts[1].description).toBe('Show help');
  });

  it('should close dialog when close is called', () => {
    component.close();
    expect(dialogRefSpy.close).toHaveBeenCalled();
  });

  it('should display shortcut groups in template', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const groupTitle = compiled.querySelector('.group-title');
    expect(groupTitle?.textContent).toContain('General');
  });

  it('should display shortcuts in template', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const shortcutKeys = compiled.querySelectorAll('.shortcut-key');
    expect(shortcutKeys.length).toBe(2);
    expect(shortcutKeys[0].textContent).toContain('Ctrl+K');
    expect(shortcutKeys[1].textContent).toContain('Shift+?');
  });

  it('should display shortcut descriptions', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const descriptions = compiled.querySelectorAll('.shortcut-description');
    expect(descriptions.length).toBe(2);
    expect(descriptions[0].textContent).toContain('Open search');
    expect(descriptions[1].textContent).toContain('Show help');
  });

  it('should show empty state when no shortcuts', () => {
    keyboardServiceSpy.getShortcutsForHelp.and.returnValue([]);
    component.ngOnInit();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const emptyState = compiled.querySelector('.no-shortcuts');
    expect(emptyState).toBeTruthy();
  });

  it('should have close button', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const closeButton = compiled.querySelector('.close-button');
    expect(closeButton).toBeTruthy();
  });

  it('should have footer with hint', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    const footer = compiled.querySelector('.footer-hint');
    expect(footer?.textContent).toContain('Shift+?');
  });
});
