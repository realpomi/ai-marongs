/**
 * KIS API 호출 간격 제한 (500ms)
 */
class RateLimiter {
  private lastRequestTime = 0;
  private readonly minDelay: number;

  constructor(delayMs: number = 500) {
    this.minDelay = delayMs;
  }

  async waitIfNeeded(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;

    if (elapsed < this.minDelay) {
      await this.sleep(this.minDelay - elapsed);
    }

    this.lastRequestTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 싱글톤 인스턴스
export const rateLimiter = new RateLimiter(500);
