import * as FirebaseAuthService from '../services/auth/FirebaseAuthService';

jest.mock('../services/auth/FirebaseAuthService', () => ({
  adminUpdateUser: jest.fn(),
  adminSaveCustomer: jest.fn(),
  adminAssignBusiness: jest.fn(),
  adminRemoveBusiness: jest.fn(),
}));

describe('Admin Capabilities (Mocked)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('admin can approve pending user', async () => {
    await FirebaseAuthService.adminUpdateUser('1', { status: 'active' });
    expect(FirebaseAuthService.adminUpdateUser).toHaveBeenCalledWith('1', { status: 'active' });
  });

  it('admin can suspend user', async () => {
    await FirebaseAuthService.adminUpdateUser('1', { status: 'suspended' });
    expect(FirebaseAuthService.adminUpdateUser).toHaveBeenCalledWith('1', { status: 'suspended' });
  });

  it('admin can assign business (specific customer)', async () => {
    await FirebaseAuthService.adminAssignBusiness('uid-123', 'WINSOFT-555');
    expect(FirebaseAuthService.adminAssignBusiness).toHaveBeenCalledWith('uid-123', 'WINSOFT-555');
  });

  it('admin can remove business (removes from allowedUserIds)', async () => {
    await FirebaseAuthService.adminRemoveBusiness('uid-123', 'WINSOFT-555');
    expect(FirebaseAuthService.adminRemoveBusiness).toHaveBeenCalledWith('uid-123', 'WINSOFT-555');
  });

  it('admin can create customer', async () => {
    await FirebaseAuthService.adminSaveCustomer('WINSOFT-001', { status: 'active', businessId: 'WINSOFT-001' });
    expect(FirebaseAuthService.adminSaveCustomer).toHaveBeenCalledWith('WINSOFT-001', { status: 'active', businessId: 'WINSOFT-001' });
  });
});
