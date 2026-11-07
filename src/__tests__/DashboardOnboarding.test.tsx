import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
import {useAppStore} from '../store/useAppStore';
import DashboardScreen from '../screens/dashboard/DashboardScreen';

jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({navigate: jest.fn()}),
}));
jest.mock('../services/monitoring/MonitoringService', () => ({
  getNotificationPermissionStatus: jest.fn().mockResolvedValue('granted'),
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

describe('Dashboard first-time setup guide', () => {
  afterEach(() => {
    useAppStore.setState({user: null, authProfile: null, customer: null, sourceFolderId: null, archiveFolderId: null, fcmRegistrationStatus: 'unregistered', serviceAccountEmail: null});
  });

  it('shows setup guidance to an authorized user with incomplete configuration', async () => {
    useAppStore.setState({
      user: {id: 'u1', email: 'new@example.com', name: 'New User', photo: null},
      authProfile: {uid: 'u1', email: 'new@example.com', status: 'active', role: 'customer', businessId: 'b1'} as any,
      customer: {id: 'b1', status: 'active', businessName: 'Business'} as any,
      sourceFolderId: null,
      archiveFolderId: null,
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<DashboardScreen />);
    });
    expect(renderer.root.findAll(node => node.type === Text && node.props.children === 'Finish setting up Print Station')).toHaveLength(1);
    expect(renderer.root.findAll(node => node.type === Text && node.props.children === 'Continue setup')).toHaveLength(1);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  it('does not show the setup guide for a fully configured existing user', async () => {
    useAppStore.setState({
      user: {id: 'u1', email: 'existing@example.com', name: 'Existing User', photo: null},
      authProfile: {uid: 'u1', email: 'existing@example.com', status: 'active', role: 'customer', businessId: 'b1'} as any,
      customer: {id: 'b1', status: 'active', businessName: 'Business'} as any,
      sourceFolderId: 'incoming', sourceFolderName: 'Incoming',
      archiveFolderId: 'printed', archiveFolderName: 'Printed',
      fcmRegistrationStatus: 'registered', serviceAccountEmail: 'monitor@project.iam.gserviceaccount.com',
      businessProfile: {identity: {businessName: 'Business'}, contact: {addressLine1: 'Address', phone: '+1'}, tax: {}, branding: {}, receiptDefaults: {}, footer: {}} as any,
      selectedPrinterType: 'office',
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<DashboardScreen />);
    });
    expect(renderer.root.findAll(node => node.type === Text && node.props.children === 'Welcome — finish your setup')).toHaveLength(0);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
