import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
import OnboardingScreen from '../screens/onboarding/OnboardingScreen';
import {useAppStore} from '../store/useAppStore';

jest.mock('../services/monitoring/MonitoringService', () => ({
  copyToClipboard: jest.fn().mockResolvedValue(true),
}));

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  popToTop: jest.fn(),
} as any;

function findAction(renderer: ReactTestRenderer.ReactTestRenderer, label: string) {
  return renderer.root.findAll(node => typeof node.props.onPress === 'function').find(node =>
    node.props.accessibilityLabel === label || node.findAllByType(Text).some(text => text.props.children === label),
  );
}

function setupOnboardingState(overrides: Record<string, unknown> = {}) {
  useAppStore.setState({
    user: {id: 'u1', email: 'new@example.com', name: 'New User', photo: null},
    authProfile: {uid: 'u1', email: 'new@example.com', status: 'active', role: 'customer', businessId: 'b1'} as any,
    customer: {id: 'b1', businessId: 'b1', status: 'active', businessName: 'Business', allowedUserIds: {u1: true}} as any,
    sourceFolderId: null,
    sourceFolderName: null,
    archiveFolderId: null,
    archiveFolderName: null,
    driveAccessChecked: false,
    driveNeedsReauth: false,
    fcmRegistrationStatus: 'unregistered',
    onboardingStep: 0,
    monitoringEnabled: false,
    ...overrides,
  });
}

describe('guided onboarding', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await useAppStore.persist.rehydrate();
    ReactTestRenderer.act(() => setupOnboardingState());
  });

  it('shows progress and resumes at the first incomplete required setup step', async () => {
    ReactTestRenderer.act(() => setupOnboardingState({onboardingStep: 4}));
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<OnboardingScreen navigation={navigation} route={{key: 'Onboarding', name: 'Onboarding'} as any} />);
    });
    const renderedText = renderer.root.findAllByType(Text).map(node =>
      Array.isArray(node.props.children) ? node.props.children.join('') : String(node.props.children),
    );
    expect(renderedText).toContain('2 of 5');
    expect(renderer.root.findAll(node => node.type === Text && node.props.children === 'Choose where bills live')).toHaveLength(1);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  it('persists navigation progress and opens existing Drive folder selection', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<OnboardingScreen navigation={navigation} route={{key: 'Onboarding', name: 'Onboarding'} as any} />);
    });
    await ReactTestRenderer.act(async () => {
      const next = findAction(renderer, 'Continue to Drive');
      next?.props.onPress();
    });
    expect(useAppStore.getState().onboardingStep).toBe(1);
    await ReactTestRenderer.act(async () => {
      const openDrive = findAction(renderer, 'Choose or change folders');
      openDrive?.props.onPress();
    });
    expect(navigation.navigate).toHaveBeenCalledWith('Drive');
    await ReactTestRenderer.act(async () => renderer.unmount());
  });

  it('finishes without enabling monitoring', async () => {
    ReactTestRenderer.act(() => setupOnboardingState({
      onboardingStep: 4,
      sourceFolderId: 'incoming',
      archiveFolderId: 'printed',
      businessProfile: {identity: {businessName: 'Business'}} as any,
      driveAccessChecked: true,
      fcmRegistrationStatus: 'registered',
    }));
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<OnboardingScreen navigation={navigation} route={{key: 'Onboarding', name: 'Onboarding'} as any} />);
    });
    await ReactTestRenderer.act(async () => {
      const finish = findAction(renderer, 'Continue to Dashboard');
      finish?.props.onPress();
    });
    expect(navigation.popToTop).toHaveBeenCalled();
    expect(useAppStore.getState().monitoringEnabled).toBe(false);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
