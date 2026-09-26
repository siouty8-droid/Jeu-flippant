import type { GameState } from "../Game";

/** Tous les événements échangés entre systèmes, typés. */
export interface GameEvents {
  "state:change": { from: GameState; to: GameState };
  "clock:minute": { minutes: number };
  "clock:dawn": Record<string, never>;
  "zone:enter": { zoneId: string; previousZoneId: string | null };
  "debug:toggle": { visible: boolean };
  "store:reshuffle": { slots: number[]; cause: "detour" | "stagnation" | "rayon9" | "debug" };
  "plan:photo": { minutes: number };
  "shopper:caught": Record<string, never>;
  "night:loop": { count: number };
  "cameras:witnessed": { id: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object = GameEvents> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(event: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => set.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) (handler as Handler<E[K]>)(payload);
  }
}
