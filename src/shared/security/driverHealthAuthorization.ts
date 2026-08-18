export type DriverHealthAction = 'VIEW_DRIVER_HEALTH' | 'EDIT_DRIVER_HEALTH';

export interface DriverHealthUserContext {
  userId: string;
  role: string;
  active: boolean;
  companyId: string;
  permissions?: string[];
}

const CANONICAL_ROLES = [
  'ADMIN',
  'MANAGER',
  'OPERATIONAL_MANAGER',
  'FINANCIAL',
  'OPERATIONAL',
  'READONLY',
] as const;

export function hasDriverHealthPermission(
  action: DriverHealthAction,
  userContext?: DriverHealthUserContext
): boolean {
  if (!userContext?.userId || userContext.active === false) return false;

  const roleUpper = String(userContext.role).toUpperCase();
  if (!CANONICAL_ROLES.includes(roleUpper as (typeof CANONICAL_ROLES)[number])) {
    return false;
  }

  const permissions = userContext.permissions || [];
  if (permissions.includes(action)) return true;

  return roleUpper === 'ADMIN' || roleUpper === 'MANAGER' || roleUpper === 'OPERATIONAL_MANAGER';
}

export function isDriverHealthAuthorized(
  action: DriverHealthAction,
  driverCompanyId: string,
  userContext?: DriverHealthUserContext
): boolean {
  return Boolean(
    hasDriverHealthPermission(action, userContext) &&
    userContext &&
    driverCompanyId === userContext.companyId
  );
}
