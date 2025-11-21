import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent, merge, of } from 'rxjs';
import { map, distinctUntilChanged } from 'rxjs/operators';

export interface QueuedAction {
  id: string;
  type: 'expense' | 'mileage' | 'receipt';
  action: 'create' | 'update' | 'delete';
  data: any;
  timestamp: string;
}

/**
 * Offline Queue Service
 * Manages actions queued while offline for later sync
 */
@Injectable({
  providedIn: 'root'
})
export class OfflineQueueService {
  private readonly STORAGE_KEY = 'jensify_offline_queue';
  private queueSubject = new BehaviorSubject<QueuedAction[]>(this.loadQueue());
  private onlineSubject = new BehaviorSubject<boolean>(navigator.onLine);

  queue$ = this.queueSubject.asObservable();
  isOnline$ = this.onlineSubject.asObservable();

  constructor() {
    this.initOnlineListener();
  }

  /**
   * Initialize online/offline listener
   */
  private initOnlineListener(): void {
    merge(
      of(navigator.onLine),
      fromEvent(window, 'online').pipe(map(() => true)),
      fromEvent(window, 'offline').pipe(map(() => false))
    )
      .pipe(distinctUntilChanged())
      .subscribe(online => {
        this.onlineSubject.next(online);
        if (online) {
          this.processQueue();
        }
      });
  }

  /**
   * Add action to offline queue
   */
  enqueue(action: Omit<QueuedAction, 'id' | 'timestamp'>): void {
    const queuedAction: QueuedAction = {
      ...action,
      id: this.generateId(),
      timestamp: new Date().toISOString()
    };

    const queue = [...this.queueSubject.value, queuedAction];
    this.saveQueue(queue);
    this.queueSubject.next(queue);
  }

  /**
   * Remove action from queue
   */
  dequeue(id: string): void {
    const queue = this.queueSubject.value.filter(action => action.id !== id);
    this.saveQueue(queue);
    this.queueSubject.next(queue);
  }

  /**
   * Get current queue count
   */
  get queueCount(): number {
    return this.queueSubject.value.length;
  }

  /**
   * Check if currently online
   */
  get isOnline(): boolean {
    return this.onlineSubject.value;
  }

  /**
   * Process queued actions (called when coming back online)
   */
  private async processQueue(): Promise<void> {
    const queue = this.queueSubject.value;
    if (queue.length === 0) return;

    console.log(`Processing ${queue.length} queued actions...`);

    for (const action of queue) {
      try {
        // TODO: Implement actual sync logic per action type
        // For now, just remove from queue
        console.log('Processing action:', action);
        this.dequeue(action.id);
      } catch (error) {
        console.error('Failed to process action:', action, error);
        // Leave in queue to retry later
      }
    }
  }

  /**
   * Load queue from localStorage
   */
  private loadQueue(): QueuedAction[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * Save queue to localStorage
   */
  private saveQueue(queue: QueuedAction[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queue));
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
}
