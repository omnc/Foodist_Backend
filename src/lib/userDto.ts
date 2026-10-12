/** Fields that must never appear in API responses. */
export const SENSITIVE_USER_FIELDS = [
  'password',
  'resetToken',
  'resetTokenHash',
  'passwordResetToken',
] as const;

export type PublicUser = {
  id: number;
  email: string;
  username: string | null;
  pfpUrl: string | null;
  bio: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

const PUBLIC_SELECT = {
  id: true,
  email: true,
  username: true,
  pfpUrl: true,
  bio: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Prisma select clause for safe user serialization. */
export const publicUserSelect = PUBLIC_SELECT;

/**
 * Strip credentials from a user-like object.
 * Returns null if input is null/undefined.
 */
export function toPublicUser(user: Record<string, unknown> | null | undefined): PublicUser | null {
  if (!user) return null;

  return {
    id: Number(user.id),
    email: String(user.email ?? ''),
    username: (user.username as string | null | undefined) ?? null,
    pfpUrl: (user.pfpUrl as string | null | undefined) ?? null,
    bio: (user.bio as string | null | undefined) ?? null,
    createdAt: user.createdAt as Date | string,
    updatedAt: user.updatedAt as Date | string,
  };
}

/** Assert response body (or nested object) has no sensitive credential fields. */
export function assertNoSensitiveUserFields(payload: unknown, path = 'root'): string[] {
  const violations: string[] = [];

  const walk = (value: unknown, currentPath: string) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, `${currentPath}[${index}]`));
      return;
    }
    if (typeof value !== 'object') return;

    const obj = value as Record<string, unknown>;
    for (const field of SENSITIVE_USER_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(obj, field)) {
        violations.push(`${currentPath}.${field}`);
      }
    }
    for (const [key, child] of Object.entries(obj)) {
      if (typeof child === 'object' && child !== null) {
        walk(child, `${currentPath}.${key}`);
      }
    }
  };

  walk(payload, path);
  return violations;
}
