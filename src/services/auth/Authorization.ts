import type { Customer, UserProfile } from './FirebaseAuthService';

export function shouldShowAuthLoading(
  hasHydrated: boolean,
  restoreSessionLoading: boolean,
  sameFirebaseSession: boolean,
): boolean {
  return !hasHydrated || (restoreSessionLoading && !sameFirebaseSession);
}

/** The authorization rule used by AuthGate for access to the application. */
export function isAuthorizedAppSession(
  profile: UserProfile | null | undefined,
  customer: Customer | null | undefined,
): boolean {
  if (profile?.status !== 'active') return false;
  if (profile.role === 'admin') return true;
  return isAuthorizedBusinessSession(profile, customer);
}

/** Monitoring is business-scoped, including for admins. */
export function isAuthorizedBusinessSession(
  profile: UserProfile | null | undefined,
  customer: Customer | null | undefined,
): boolean {
  if (profile?.status !== 'active' || !profile.businessId) return false;
  if (!customer || customer.status !== 'active' || customer.businessId !== profile.businessId) return false;
  return profile.role === 'admin' || customer.allowedUserIds?.[profile.uid] === true;
}
