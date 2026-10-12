export type AuthUser = {
  id: number | string;
  email?: string;
  exp?: number;
};

/**
 * Compare JWT subject id with a path/body target id.
 * Returns the numeric authenticated user id when they match.
 */
export function requireSelf(
  authUser: AuthUser | null | undefined,
  targetIdRaw: string | number
): { ok: true; userId: number } | { ok: false; status: 401 | 403; error: string } {
  if (!authUser || authUser.id === undefined || authUser.id === null) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const authId = Number(authUser.id);
  const targetId = Number(targetIdRaw);

  if (!Number.isInteger(authId) || authId <= 0) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  if (!Number.isInteger(targetId) || targetId <= 0) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  if (authId !== targetId) {
    return { ok: false, status: 403, error: 'Forbidden: cannot modify another user' };
  }

  return { ok: true, userId: authId };
}

export function getAuthUserId(authUser: AuthUser | null | undefined): number | null {
  if (!authUser || authUser.id === undefined || authUser.id === null) return null;
  const id = Number(authUser.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}
