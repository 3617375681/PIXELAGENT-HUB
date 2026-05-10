export class RunQueue {
  private readonly maxConcurrency: number;
  private readonly maxQueueSize: number;
  private running = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrency: number, maxQueueSize: number) {
    this.maxConcurrency = Math.max(1, maxConcurrency);
    this.maxQueueSize = Math.max(1, maxQueueSize);
  }

  getRunningCount(): number {
    return this.running;
  }

  getQueuedCount(): number {
    return this.queue.length;
  }

  async push<T>(work: () => Promise<T>): Promise<T> {
    if (this.running >= this.maxConcurrency && this.queue.length >= this.maxQueueSize) {
      throw new Error(`QUEUE_FULL_limit_${this.maxQueueSize}`);
    }

    return new Promise<T>((resolve, reject) => {
      const task = async () => {
        this.running += 1;
        try {
          const result = await work();
          resolve(result);
        } catch (err) {
          reject(err);
        } finally {
          this.running = Math.max(0, this.running - 1);
          this.drain();
        }
      };

      if (this.running < this.maxConcurrency) {
        void task();
        return;
      }

      this.queue.push(() => {
        void task();
      });
    });
  }

  private drain(): void {
    while (this.running < this.maxConcurrency && this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }
}
