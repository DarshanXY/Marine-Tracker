/** Shared auth types + role hierarchy. */

export type Role = 'ADMIN' | 'COASTGUARD' | 'FIELD';

/** Clearance level per role (higher = more privileged).
 *  Focused 3-role operational model: field crews → coast guard → admin. */
export const ROLE_LEVEL: Record<Role, number> = {
  ADMIN: 3,
  COASTGUARD: 2,
  FIELD: 1,
};

/** Decoded access-token payload attached to req.user. */
export interface AuthPayload {
  sub: string;       // user id
  username: string;
  email: string;
  role: Role;
  level: number;
}

/** Safe user projection returned to clients (never includes the hash). */
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  role: Role;
  level: number;
  displayName: string;
  totpEnabled: boolean;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}
