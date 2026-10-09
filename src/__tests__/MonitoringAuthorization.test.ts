import {isAuthorizedAppSession, isAuthorizedBusinessSession, shouldShowAuthLoading} from '../services/auth/Authorization';
import type {Customer, UserProfile} from '../services/auth/FirebaseAuthService';

const profile = (overrides: Partial<UserProfile> = {}): UserProfile => ({
  uid: 'user-1', email: 'user@example.com', displayName: 'User', status: 'active', role: 'user', businessId: 'business-1', ...overrides,
});
const customer = (overrides: Partial<Customer> = {}): Customer => ({
  businessId: 'business-1', businessName: 'Business', status: 'active', allowedUserIds: {'user-1': true}, ...overrides,
});

describe('shared authorization predicates', () => {
  it('keeps a known same-user session on screen during background authorization refresh', () => {
    expect(shouldShowAuthLoading(true, true, true)).toBe(false);
    expect(shouldShowAuthLoading(true, true, false)).toBe(true);
    expect(shouldShowAuthLoading(false, false, true)).toBe(true);
  });
  it.each(['pending', 'suspended'] as const)('rejects %s profiles for app and monitoring', status => {
    expect(isAuthorizedAppSession(profile({status}), customer())).toBe(false);
    expect(isAuthorizedBusinessSession(profile({status}), customer())).toBe(false);
  });
  it('rejects active users without a business assignment', () => {
    expect(isAuthorizedAppSession(profile({businessId: undefined}), null)).toBe(false);
    expect(isAuthorizedBusinessSession(profile({businessId: undefined}), null)).toBe(false);
  });
  it('requires an active matching business and allowedUserIds membership', () => {
    expect(isAuthorizedBusinessSession(profile(), customer())).toBe(true);
    expect(isAuthorizedBusinessSession(profile(), customer({status: 'suspended'}))).toBe(false);
    expect(isAuthorizedBusinessSession(profile(), customer({businessId: 'other'}))).toBe(false);
    expect(isAuthorizedBusinessSession(profile(), customer({allowedUserIds: {}}))).toBe(false);
  });
  it('preserves active admin app access while requiring an assigned active business for monitoring', () => {
    const admin = profile({role: 'admin', businessId: undefined});
    expect(isAuthorizedAppSession(admin, null)).toBe(true);
    expect(isAuthorizedBusinessSession(admin, null)).toBe(false);
    expect(isAuthorizedBusinessSession(profile({role: 'admin'}), customer({allowedUserIds: {}}))).toBe(true);
  });
});
