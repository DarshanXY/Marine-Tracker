/**
 * In-memory user store for DEMO_MODE (mirrors the seeded users). Real bcrypt
 * hashes are computed once at boot with hashSync. In DB mode the auth service
 * uses Prisma instead; this is the no-database fallback.
 */
import bcrypt from 'bcrypt';
import { env } from '../lib/env';
import { ROLE_LEVEL, type Role } from '../types/auth';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  role: Role;
  passwordHash: string;
  totpSecret: string | null;
  totpEnabled: boolean;
  displayName: string;
}

export const DEMO_PASSWORD = 'Demo@1234!';

// One shared hash — every demo user uses the same demo password.
const demoHash = bcrypt.hashSync(DEMO_PASSWORD, env.auth.bcryptRounds);

export const demoUsers: UserRecord[] = [
  { id: 'usr_admin',      username: 'admin',         email: 'admin@marine-tracker.local',      role: 'ADMIN',      displayName: 'System Administrator', passwordHash: demoHash, totpSecret: null, totpEnabled: false },
  { id: 'usr_coastguard', username: 'cg_officer',    email: 'coastguard@marine-tracker.local', role: 'COASTGUARD', displayName: 'Coast Guard Command',  passwordHash: demoHash, totpSecret: null, totpEnabled: false },
  { id: 'usr_field',      username: 'field_analyst', email: 'field@marine-tracker.local',      role: 'FIELD',      displayName: 'Field Analyst',        passwordHash: demoHash, totpSecret: null, totpEnabled: false },
];

export function findDemoUser(identifier: string): UserRecord | undefined {
  const id = identifier.trim().toLowerCase();
  return demoUsers.find((u) => u.username.toLowerCase() === id || u.email.toLowerCase() === id);
}

export function levelOf(role: Role): number {
  return ROLE_LEVEL[role];
}
