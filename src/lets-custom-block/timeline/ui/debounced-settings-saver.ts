/** Serialized, debounced persistence for native database timeline settings.
 * Each change gets an immutable snapshot; an in-flight older save cannot
 * overwrite a newer save, and closing the panel flushes the final change. */
export type SaveState = "pending" | "saving" | "saved" | "error";
export type SaveResult = { success: boolean; message?: string };

export class DebouncedSettingsSaver<T> {
  private pending: T | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running: Promise<boolean> | null = null;

  constructor(
    private readonly apply: (snapshot: T) => Promise<SaveResult>,
    private readonly onState: (state: SaveState, message?: string) => void,
    private readonly delay = 300,
  ) {}

  schedule(snapshot: T): void {
    this.pending = snapshot;
    this.onState("pending");
    this.clearTimer();
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, this.delay);
  }

  async flush(): Promise<boolean> {
    this.clearTimer();
    if (this.running) return this.running;
    if (!this.pending) return true;
    this.running = this.drain().finally(() => { this.running = null; });
    return this.running;
  }

  private async drain(): Promise<boolean> {
    while (this.pending !== null) {
      const snapshot = this.pending;
      this.pending = null;
      this.onState("saving");
      let result: SaveResult;
      try { result = await this.apply(snapshot); }
      catch (error) { result = { success: false, message: error instanceof Error ? error.message : String(error) }; }
      if (!result.success) {
        // A newer draft may already fix an invalid field. Process it next;
        // if this is the newest draft, retain the error instead of retry-looping.
        if (this.pending === null) {
          this.onState("error", result.message || "自动保存时间线设置失败");
          return false;
        }
      }
    }
    this.clearTimer();
    this.onState("saved");
    return true;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
