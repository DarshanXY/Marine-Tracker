/**
 * Authentication service — real JWTs, bcrypt, and TOTP 2FA.
 *
 * Works in DEMO_MODE against the in-memory user store (no database) and, when
 * a database is configured, against Prisma. Refresh tokens are tracked in an
 * in-memory allow-list (by jti) so they can be rotated and revoked.
 */
import { randomUUID } from 'crypto';
import bcrypt from 'bcrypt';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

import { env } from '../lib/env';
import { prisma } from '../lib/prisma';
import { isDemo } from '../lib/dataMode';
import { ApiError } from '../middleware/errorHandler';
import { ROLE_LEVEL, type AuthPayload, type PublicUser, type Role, type TokenPair } from '../types/auth';
import { demoUsers, findDemoUser, DEMO_PASSWORD, type UserRecord } from '../data/users';

// jti DENY-list of refresh tokens that have been rotated (one-time use) or revoked
// on logout. Deliberately a denylist, NOT an allowlist: an allowlist lives only in
// memory, so a backend restart (every `tsx watch` reload in dev) wiped it and made
// EVERY outstanding refresh token invalid — the whole app silently lost write
// access (AOI scans 401'd) until re-login. A denylist fails OPEN on restart: a
// refresh token stays valid by its signature + 7-day expiry unless it was
// explicitly rotated/revoked in the current process. Bounded in practice by the
// refresh-token lifetime; cleared on restart.
const revokedRefreshJtis = new Set<string>();

function levelOf(role: Role): number {
  return ROLE_LEVEL[role] ?? 1;
}

export function toPublic(u: UserRecord): PublicUser {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    level: levelOf(u.role),
    displayName: u.displayName,
    totpEnabled: u.totpEnabled,
  };
}

// ── Lookups ──────────────────────────────────────────────────────────────────
async function findByIdentifier(identifier: string): Promise<UserRecord | null> {
  if (isDemo()) return findDemoUser(identifier) ?? null;
  const id = identifier.trim().toLowerCase();
  const u = await prisma.user.findFirst({
    where: { OR: [{ username: id }, { email: id }] },
  });
  return u ? dbToRecord(u) : null;
}

export async function findById(id: string): Promise<UserRecord | null> {
  if (isDemo()) return demoUsers.find((u) => u.id === id) ?? null;
  const u = await prisma.user.findUnique({ where: { id } });
  return u ? dbToRecord(u) : null;
}

function dbToRecord(u: {
  id: string; username: string; email: string; passwordHash: string;
  role: string; totpSecret: string | null; totpEnabled: boolean;
}): UserRecord {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role as Role,
    passwordHash: u.passwordHash,
    totpSecret: u.totpSecret,
    totpEnabled: u.totpEnabled,
    displayName: u.username,
  };
}

// ── Credentials ──────────────────────────────────────────────────────────────
export async function validateCredentials(
  identifier: string,
  password: string,
): Promise<UserRecord | null> {
  const user = await findByIdentifier(identifier);
  if (!user) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function register(input: {
  username: string;
  email: string;
  password: string;
}): Promise<UserRecord> {
  const username = input.username.trim();
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, env.auth.bcryptRounds);

  if (isDemo()) {
    if (findDemoUser(username) || findDemoUser(email)) {
      throw new ApiError(409, 'Username or email already registered');
    }
    const record: UserRecord = {
      id: `usr_${randomUUID().slice(0, 8)}`,
      username,
      email,
      role: 'FIELD',
      passwordHash,
      totpSecret: null,
      totpEnabled: false,
      displayName: username,
    };
    demoUsers.push(record);
    return record;
  }

  const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
  if (existing) throw new ApiError(409, 'Username or email already registered');
  const created = await prisma.user.create({
    data: { username, email, passwordHash, role: 'FIELD' },
  });
  return dbToRecord(created);
}

// ── Tokens ───────────────────────────────────────────────────────────────────
export function issueTokens(user: UserRecord): TokenPair {
  const payload: AuthPayload = {
    sub: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    level: levelOf(user.role),
  };
  const accessToken = jwt.sign(payload, env.auth.jwtSecret, {
    expiresIn: env.auth.accessExpires,
  } as SignOptions);

  const jti = randomUUID();
  // No allowlist add — a freshly issued token is valid by signature+expiry until
  // it is rotated or revoked (denylisted). This is what survives a restart.
  const refreshToken = jwt.sign({ sub: user.id, jti }, env.auth.jwtRefreshSecret, {
    expiresIn: env.auth.refreshExpires,
  } as SignOptions);

  return { accessToken, refreshToken, expiresIn: env.auth.accessExpires };
}

export async function rotateRefresh(
  token: string,
): Promise<{ tokens: TokenPair; user: UserRecord } | null> {
  let decoded: { sub: string; jti: string };
  try {
    decoded = jwt.verify(token, env.auth.jwtRefreshSecret) as { sub: string; jti: string };
  } catch {
    return null;
  }
  if (revokedRefreshJtis.has(decoded.jti)) return null; // already rotated or revoked
  revokedRefreshJtis.add(decoded.jti); // one-time use → deny future reuse of this jti

  const user = await findById(decoded.sub);
  if (!user) return null;
  return { tokens: issueTokens(user), user };
}

export function revokeRefresh(token: string): void {
  try {
    const decoded = jwt.verify(token, env.auth.jwtRefreshSecret) as { jti?: string };
    if (decoded.jti) revokedRefreshJtis.add(decoded.jti);
  } catch {
    // already invalid — nothing to do
  }
}

// ── TOTP 2FA ─────────────────────────────────────────────────────────────────
export async function setupTotp(
  user: UserRecord,
): Promise<{ secret: string; otpauthUrl: string; qrDataUrl: string }> {
  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.email, env.auth.totpIssuer, secret);
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
  await persistTotpSecret(user, secret);
  return { secret, otpauthUrl, qrDataUrl };
}

export async function enableTotp(user: UserRecord, token: string): Promise<boolean> {
  if (!user.totpSecret) return false;
  const ok = authenticator.verify({ token, secret: user.totpSecret });
  if (ok) await persistTotpEnabled(user, true);
  return ok;
}

export async function disableTotp(user: UserRecord): Promise<void> {
  await persistTotpEnabled(user, false);
  await persistTotpSecret(user, null);
}

export function verifyTotp(user: UserRecord, token: string): boolean {
  if (!user.totpSecret) return false;
  return authenticator.verify({ token, secret: user.totpSecret });
}

async function persistTotpSecret(user: UserRecord, secret: string | null): Promise<void> {
  user.totpSecret = secret;
  if (!isDemo()) {
    await prisma.user.update({ where: { id: user.id }, data: { totpSecret: secret } });
  }
}

async function persistTotpEnabled(user: UserRecord, enabled: boolean): Promise<void> {
  user.totpEnabled = enabled;
  if (!isDemo()) {
    await prisma.user.update({ where: { id: user.id }, data: { totpEnabled: enabled } });
  }
}

export async function listUsers(): Promise<PublicUser[]> {
  if (isDemo()) return demoUsers.map(toPublic);
  const users = await prisma.user.findMany({ orderBy: { role: 'asc' } });
  return users.map((u) => toPublic(dbToRecord(u)));
}

export { DEMO_PASSWORD };
