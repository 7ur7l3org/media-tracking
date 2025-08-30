/* Minimal public types – expand later */
export interface BackendDB { media: Record<string, any>; }

declare module 'core/store/backend.js' {
  export function read(): Promise<BackendDB>;
  export function mutate(fn: (db: BackendDB) => void): Promise<void>;
  export function reload(): Promise<void>;
}

declare module 'core/sync/service.js' {
  export function scheduleSync(): void;
}
