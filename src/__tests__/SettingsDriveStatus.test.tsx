import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import {Text} from 'react-native';
import type {SettingsScreenProps} from '../navigation/types';
import {useAppStore} from '../store/useAppStore';
import SettingsScreen from '../screens/settings/SettingsScreen';

describe('Settings Google Drive status', () => {
  it('renders one Drive status and one reconnect action, without claiming unverified access', async () => {
    useAppStore.setState({
      user: {id: 'firebase-user', email: 'user@example.com', name: 'User', photo: null},
      driveNeedsReauth: true,
      driveAccessChecked: true,
    });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SettingsScreen {...({navigation: {}, route: {}} as unknown as SettingsScreenProps)} />);
    });

    const labels = renderer.root.findAll(node => node.type === Text && node.props.children === 'Google Drive');
    const reconnect = renderer.root.findAll(node => node.type === Text && node.props.children === 'Reconnect Google Drive');
    // One section header plus one status row; no duplicated status/reconnect block.
    expect(labels).toHaveLength(2);
    expect(reconnect).toHaveLength(1);

    await ReactTestRenderer.act(async () => renderer.unmount());
    useAppStore.setState({user: null, driveNeedsReauth: false, driveAccessChecked: false});

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SettingsScreen {...({navigation: {}, route: {}} as unknown as SettingsScreenProps)} />);
    });
    expect(renderer.root.findAll(node => node.type === Text && node.props.children === 'Not checked yet')).toHaveLength(1);
    await ReactTestRenderer.act(async () => renderer.unmount());
  });
});
