export type BackgroundTask = () => Promise<void> | void;

export class TaskQueueService {
  private queue: BackgroundTask[] = [];
  private isProcessing = false;

  /**
   * Enqueue a background task to be processed asynchronously.
   */
  enqueue(task: BackgroundTask): void {
    this.queue.push(task);
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift();

    if (task) {
      try {
        await task();
      } catch (err: any) {
        console.error('[TaskQueue] Error executing background task:', err.message || err);
      }
    }

    this.isProcessing = false;
    // Execute next item asynchronously to clear stack depth
    setTimeout(() => this.processNext(), 0);
  }

  /**
   * Get the current depth/length of the queue.
   */
  getQueueLength(): number {
    return this.queue.length;
  }
}

export const taskQueueService = new TaskQueueService();
