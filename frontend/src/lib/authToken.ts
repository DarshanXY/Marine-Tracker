/**
 * Standalone token holder. The auth store writes to it; the API client reads
 * from it to attach the Authorization header — this avoids a circular import
 * between the store and the API client.
 */
let access: string | null = null;
let refresh: string | null = null;

export const authToken = {
  get access(): string | null { return access; },
  get refresh(): string | null { return refresh; },
  set(a: string | null, r: string | null): void { access = a; refresh = r; },
  clear(): void { access = null; refresh = null; },
};
