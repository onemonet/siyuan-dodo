import { databaseViewHost } from "./view-host";
import type { ViewMode } from "../view-config-schema";

export interface ViewMountEntry {
  viewId: string;
  host: HTMLElement;
}

/** A renderer supplies only its DOM strategy; attachment ownership, adoption,
 * host registration and disposal follow the same path for every view. */
export interface MountStrategy<T extends ViewMountEntry> {
  viewId: string;
  kind: ViewMode;
  reusable(entry: T): boolean;
  update(entry: T): void;
  create(): T | undefined;
  frame(entry: T): HTMLIFrameElement;
  adopt?(entries: Map<HTMLElement, T>): [HTMLElement, T] | undefined;
  adopted?(oldAv: HTMLElement): void;
}

export class ViewMountLifecycle<T extends ViewMountEntry> {
  readonly entries = new Map<HTMLElement, T>();

  constructor(
    private readonly frameOf: (entry: T) => HTMLIFrameElement,
    private readonly cleanup: (av: HTMLElement, entry: T | undefined) => void,
  ) {}

  reconcile(av: HTMLElement, strategy: MountStrategy<T>): T | undefined {
    let existing = this.entries.get(av);
    if (!existing && strategy.adopt) {
      const adopted = strategy.adopt(this.entries);
      if (adopted) {
        const [oldAv, entry] = adopted;
        this.entries.delete(oldAv);
        this.entries.set(av, entry);
        strategy.adopted?.(oldAv);
        existing = entry;
      }
    }
    if (existing && strategy.reusable(existing)) {
      strategy.update(existing);
      databaseViewHost.track(av, strategy.viewId, strategy.kind,
        existing.host, strategy.frame(existing));
      return existing;
    }
    this.detach(av);
    const created = strategy.create();
    if (!created) return;
    this.entries.set(av, created);
    databaseViewHost.track(av, strategy.viewId, strategy.kind,
      created.host, strategy.frame(created));
    return created;
  }

  detach(av: HTMLElement): void {
    const entry = this.entries.get(av);
    this.cleanup(av, entry);
    if (!entry) return;
    databaseViewHost.untrack(this.frameOf(entry));
    entry.host.remove();
    this.entries.delete(av);
  }

  stop(): void {
    for (const av of Array.from(this.entries.keys())) this.detach(av);
  }
}
