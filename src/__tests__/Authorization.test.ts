import { useAppStore } from '../store/useAppStore';

// Note: Real Firestore rules are tested in a separate environment or evaluated server-side.
// We replicate the rule logic here for unit-testing the expected boundaries.
function canReadCustomer(uid: string, userProfile: any, customer: any) {
  if (!userProfile) return false;
  if (userProfile.role === 'admin') return true;
  return (
    userProfile.status === 'active' &&
    userProfile.businessId === customer.businessId &&
    customer.allowedUserIds?.[uid] === true &&
    customer.status === 'active'
  );
}

describe('Authorization & Monitoring Initialization', () => {
  beforeEach(() => {
    useAppStore.setState({
      authProfile: null,
      customer: null,
    });
  });

  it('1. pending user -> blocked (AuthGate condition)', () => {
    useAppStore.setState({ authProfile: { uid: '1', email: 'a@a.com', displayName: 'A', status: 'pending', role: 'user' } });
    const s = useAppStore.getState();
    const canPass = s.authProfile?.status === 'active' && (s.authProfile.role === 'admin' || (s.authProfile.businessId && s.customer?.status === 'active'));
    expect(canPass).toBe(false);
  });

  it('active user with matching businessId + allowedUserIds -> customer read allowed', () => {
    const user = { uid: '1', status: 'active', role: 'user', businessId: 'WINSOFT-001' };
    const customer = { businessId: 'WINSOFT-001', status: 'active', allowedUserIds: { '1': true } };
    expect(canReadCustomer('1', user, customer)).toBe(true);
  });

  it('active user with different businessId -> customer read denied', () => {
    const user = { uid: '1', status: 'active', role: 'user', businessId: 'WINSOFT-002' };
    const customer = { businessId: 'WINSOFT-001', status: 'active', allowedUserIds: { '1': true } };
    expect(canReadCustomer('1', user, customer)).toBe(false);
  });

  it('pending user -> customer read denied', () => {
    const user = { uid: '1', status: 'pending', role: 'user', businessId: 'WINSOFT-001' };
    const customer = { businessId: 'WINSOFT-001', status: 'active', allowedUserIds: { '1': true } };
    expect(canReadCustomer('1', user, customer)).toBe(false);
  });

  it('suspended user -> customer read denied', () => {
    const user = { uid: '1', status: 'suspended', role: 'user', businessId: 'WINSOFT-001' };
    const customer = { businessId: 'WINSOFT-001', status: 'active', allowedUserIds: { '1': true } };
    expect(canReadCustomer('1', user, customer)).toBe(false);
  });

  it('suspended customer -> customer read denied', () => {
    const user = { uid: '1', status: 'active', role: 'user', businessId: 'WINSOFT-001' };
    const customer = { businessId: 'WINSOFT-001', status: 'suspended', allowedUserIds: { '1': true } };
    expect(canReadCustomer('1', user, customer)).toBe(false);
  });

  it('user not in allowedUserIds -> customer read denied', () => {
    const user = { uid: '1', status: 'active', role: 'user', businessId: 'WINSOFT-001' };
    const customer = { businessId: 'WINSOFT-001', status: 'active', allowedUserIds: { '2': true } };
    expect(canReadCustomer('1', user, customer)).toBe(false);
  });

  it('admin -> customer read allowed', () => {
    const user = { uid: '1', status: 'active', role: 'admin' }; // Admin can lack businessId
    const customer = { businessId: 'WINSOFT-001', status: 'suspended', allowedUserIds: {} };
    expect(canReadCustomer('1', user, customer)).toBe(true);
  });
});
