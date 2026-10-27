interface AttemptState {
  failures: number;
  windowStartedAt: number;
  lockedUntil: number;
}

// Số khóa tối đa lưu trong bộ nhớ trước khi dọn các bản ghi đã hết hiệu lực
const PRUNE_THRESHOLD = 1000;

// Bộ đếm lần nhập sai lưu trong bộ nhớ: đủ số lần sai trong một khoảng thời gian thì khóa theo khóa định danh
export class PickupAttemptLimiter {
  private readonly states = new Map<string, AttemptState>();

  constructor(
    private readonly maxFailures: number,
    private readonly windowMs: number,
    private readonly lockMs: number,
  ) {}

  // Trả về số giây còn bị khóa, bằng 0 nếu khóa định danh đang được phép thử
  getRemainingLockSeconds(key: string, now = Date.now()): number {
    const state = this.states.get(key);
    if (!state || state.lockedUntil <= now) return 0;
    return Math.ceil((state.lockedUntil - now) / 1000);
  }

  // Ghi nhận một lần sai và bật khóa khi vượt số lần cho phép trong cửa sổ thời gian
  recordFailure(key: string, now = Date.now()): void {
    this.pruneExpired(now);

    const current = this.states.get(key);
    const isWindowActive = current && now - current.windowStartedAt < this.windowMs;
    const state: AttemptState = isWindowActive
      ? current
      : { failures: 0, windowStartedAt: now, lockedUntil: 0 };

    state.failures += 1;
    if (state.failures >= this.maxFailures) {
      state.lockedUntil = now + this.lockMs;
      state.failures = 0;
      state.windowStartedAt = now;
    }
    this.states.set(key, state);
  }

  // Xóa bộ đếm khi thao tác thành công
  reset(key: string): void {
    this.states.delete(key);
  }

  // Dọn các bản ghi đã hết cửa sổ đếm và hết thời gian khóa để bộ nhớ không phình mãi
  private pruneExpired(now: number): void {
    if (this.states.size < PRUNE_THRESHOLD) return;
    for (const [key, state] of this.states) {
      const isWindowExpired = now - state.windowStartedAt >= this.windowMs;
      if (isWindowExpired && state.lockedUntil <= now) {
        this.states.delete(key);
      }
    }
  }
}
