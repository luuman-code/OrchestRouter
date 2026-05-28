/**
 * ConcurrencyController - 并发控制器
 * 控制并发执行任务的数量
 */
class ConcurrencyController {
  constructor(maxConcurrency = 5) {
    this.maxConcurrency = maxConcurrency;
    this.running = 0;
    this.queue = [];
  }

  async execute(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this.processNext();
    });
  }

  async executeAll(tasks) {
    const results = [];
    const promises = tasks.map(task => this.execute(task));
    for (const promise of promises) {
      try {
        results.push(await promise);
      } catch (error) {
        results.push(Promise.reject(error));
      }
    }
    return results;
  }

  async processNext() {
    if (this.running >= this.maxConcurrency || this.queue.length === 0) return;
    this.running++;
    const { task, resolve, reject } = this.queue.shift();
    try {
      const result = await task();
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.running--;
      this.processNext();
    }
  }
}

/**
 * Semaphore - 信号量实现
 * 用于控制资源的并发访问
 */
class Semaphore {
  constructor(maxConcurrency = 5) {
    this.maxConcurrency = maxConcurrency;
    this.current = 0;
    this.queue = [];
  }

  async acquire() {
    return new Promise((resolve) => {
      if (this.current < this.maxConcurrency) {
        this.current++;
        resolve();
      }
      else {
        this.queue.push(resolve);
      }
    });
  }

  release() {
    this.current--;
    if (this.queue.length > 0) {
      this.current++;
      const resolve = this.queue.shift();
      resolve();
    }
  }

  async execute(fn) {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

module.exports = { ConcurrencyController, Semaphore };