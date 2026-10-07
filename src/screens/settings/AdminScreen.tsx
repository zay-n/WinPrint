/**
 * AdminScreen.tsx — Winsoft Print Station Admin Console
 *
 * Complete admin dashboard with:
 *  A. Dashboard — real-time stats from Firestore
 *  B. User Management — search, filter, approve/suspend/assign
 *  C. Business Management — create, edit, activate/suspend
 *  D. Device Management — view, revoke, restore
 *  E. Audit Log — recent admin actions
 *
 * Access guard: only users with role === 'admin' may reach this screen.
 * The navigation-level guard is in SettingsScreen (role check before navigate).
 * This screen adds a runtime check as defense-in-depth.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '../../theme';
import Icon from '../../components/Icon';
import { useAppStore } from '../../store/useAppStore';
import * as FirebaseAuthService from '../../services/auth/FirebaseAuthService';
import type {
  UserProfile,
  Customer,
  DeviceRecord,
  AuditLogEntry,
  AdminStats,
} from '../../services/auth/FirebaseAuthService';

// ---------------------------------------------------------------------------
// Tab definitions
// ---------------------------------------------------------------------------

type AdminTab = 'dashboard' | 'users' | 'businesses' | 'devices' | 'audit';

const TABS: { id: AdminTab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: 'view-dashboard-outline' },
  { id: 'users', label: 'Users', icon: 'account-group-outline' },
  { id: 'businesses', label: 'Businesses', icon: 'office-building-outline' },
  { id: 'devices', label: 'Devices', icon: 'cellphone-wireless' },
  { id: 'audit', label: 'Audit', icon: 'clipboard-list-outline' },
];

// ---------------------------------------------------------------------------
// Chip component
// ---------------------------------------------------------------------------

type ChipVariant = 'active' | 'pending' | 'suspended' | 'admin' | 'user' | 'neutral';

const CHIP_STYLES: Record<ChipVariant, { bg: string; text: string }> = {
  active: { bg: Colors.activeDim, text: Colors.active },
  pending: { bg: Colors.warningDim, text: Colors.warning },
  suspended: { bg: Colors.errorDim, text: Colors.error },
  admin: { bg: `${Colors.primary}22`, text: Colors.primaryLight },
  user: { bg: Colors.inactiveDim, text: Colors.textSecondary },
  neutral: { bg: Colors.inactiveDim, text: Colors.textSecondary },
};

function Chip({ label, variant = 'neutral' }: { label: string; variant?: ChipVariant }) {
  const s = CHIP_STYLES[variant];
  return (
    <View style={[chipStyles.chip, { backgroundColor: s.bg }]}>
      <Text style={[chipStyles.text, { color: s.text }]}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  text: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3 },
});

// ---------------------------------------------------------------------------
// Metric card
// ---------------------------------------------------------------------------

function MetricCard({ label, value, icon, color }: { label: string; value: number | string; icon: string; color: string }) {
  return (
    <View style={[metricStyles.card, { borderColor: `${color}30` }]}>
      <View style={[metricStyles.iconWrap, { backgroundColor: `${color}18` }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <Text style={metricStyles.value}>{value}</Text>
      <Text style={metricStyles.label}>{label}</Text>
    </View>
  );
}

const metricStyles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: 140,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    padding: Spacing.md,
    alignItems: 'center',
    gap: 4,
    ...Shadow.sm,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  value: { ...Typography.headline, color: Colors.textPrimary, fontWeight: '700' },
  label: { ...Typography.caption, color: Colors.textSecondary, textAlign: 'center' },
});

// ---------------------------------------------------------------------------
// Confirmation dialog helper
// ---------------------------------------------------------------------------

function confirmAction(title: string, message: string, onConfirm: () => void) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Confirm', style: 'destructive', onPress: onConfirm },
  ]);
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function AdminScreen() {
  const authProfile = useAppStore(s => s.authProfile);

  // Runtime admin check (defense-in-depth — navigation already guards)
  if (authProfile?.role !== 'admin') {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={styles.accessDenied}>
          <Icon name="shield-lock-outline" size={48} color={Colors.error} />
          <Text style={styles.accessDeniedTitle}>Access Denied</Text>
          <Text style={styles.accessDeniedText}>You do not have admin privileges.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return <AdminConsole actorUid={authProfile.uid} actorEmail={authProfile.email} />;
}

// ---------------------------------------------------------------------------
// AdminConsole — main shell
// ---------------------------------------------------------------------------

function AdminConsole({ actorUid, actorEmail }: { actorUid: string; actorEmail: string }) {
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const stats: AdminStats = useMemo(
    () => FirebaseAuthService.computeAdminStats(users, customers, devices),
    [users, customers, devices],
  );

  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) { setRefreshing(true); } else { setLoading(true); }
    try {
      const [fetchedUsers, fetchedCustomers, fetchedDevices, fetchedAudit] = await Promise.all([
        FirebaseAuthService.fetchAllUsers(),
        FirebaseAuthService.fetchAllCustomers(),
        FirebaseAuthService.fetchAllDevices(),
        FirebaseAuthService.fetchAuditLog(30),
      ]);
      setUsers(fetchedUsers);
      setCustomers(fetchedCustomers);
      setDevices(fetchedDevices);
      setAuditLog(fetchedAudit);
    } catch (e) {
      Alert.alert('Load Error', String(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const onRefresh = useCallback(() => loadAll(true), [loadAll]);

  const sharedProps = { actorUid, actorEmail, customers, reload: () => loadAll() };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      {/* Tab bar */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab.id}
            style={[styles.tab, activeTab === tab.id && styles.tabActive]}
            onPress={() => setActiveTab(tab.id)}>
            <Icon
              name={tab.icon}
              size={16}
              color={activeTab === tab.id ? Colors.primary : Colors.textSecondary}
            />
            <Text style={[styles.tabLabel, activeTab === tab.id && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {tab.id === 'users' && stats.pendingUsers > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{stats.pendingUsers}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.primary} size="large" />
          <Text style={styles.loadingText}>Loading admin data...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>

          {activeTab === 'dashboard' && <DashboardTab stats={stats} users={users} />}

          {activeTab === 'users' && (
            <UsersTab
              users={users}
              actorUid={actorUid}
              actorEmail={actorEmail}
              customers={customers}
              reload={() => loadAll()}
            />
          )}

          {activeTab === 'businesses' && (
            <BusinessesTab
              customers={customers}
              users={users}
              actorUid={actorUid}
              actorEmail={actorEmail}
              reload={() => loadAll()}
            />
          )}

          {activeTab === 'devices' && (
            <DevicesTab
              devices={devices}
              users={users}
              customers={customers}
              actorUid={actorUid}
              actorEmail={actorEmail}
              reload={() => loadAll()}
            />
          )}

          {activeTab === 'audit' && <AuditTab entries={auditLog} />}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Dashboard Tab
// ---------------------------------------------------------------------------

function DashboardTab({ stats, users }: { stats: AdminStats; users: UserProfile[] }) {
  const recentUsers = [...users]
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 5);

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionTitle}>Overview</Text>

      <View style={styles.metricsGrid}>
        <MetricCard label="Total Users" value={stats.totalUsers} icon="account-group-outline" color={Colors.primary} />
        <MetricCard label="Pending" value={stats.pendingUsers} icon="clock-outline" color={Colors.warning} />
      </View>
      <View style={styles.metricsGrid}>
        <MetricCard label="Active" value={stats.activeUsers} icon="account-check-outline" color={Colors.active} />
        <MetricCard label="Suspended" value={stats.suspendedUsers} icon="account-cancel-outline" color={Colors.error} />
      </View>

      <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Businesses</Text>
      <View style={styles.metricsGrid}>
        <MetricCard label="Total" value={stats.totalBusinesses} icon="office-building-outline" color={Colors.primary} />
        <MetricCard label="Active" value={stats.activeBusinesses} icon="office-building-check-outline" color={Colors.active} />
      </View>
      {stats.suspendedBusinesses > 0 && (
        <View style={styles.metricsGrid}>
          <MetricCard label="Suspended" value={stats.suspendedBusinesses} icon="office-building-remove-outline" color={Colors.error} />
        </View>
      )}

      <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Monitoring</Text>
      <View style={styles.metricsGrid}>
        <MetricCard label="Devices" value={stats.totalDevices} icon="cellphone-wireless" color={Colors.primary} />
        <MetricCard label="Active" value={stats.monitoringActiveDevices} icon="radar" color={Colors.active} />
      </View>

      {recentUsers.length > 0 && (
        <>
          <Text style={[styles.sectionTitle, { marginTop: Spacing.xl }]}>Recently Registered</Text>
          {recentUsers.map(u => (
            <View key={u.uid} style={styles.recentUserRow}>
              <Icon name="account-outline" size={16} color={Colors.textSecondary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.recentUserName}>{u.displayName}</Text>
                <Text style={styles.recentUserEmail}>{u.email}</Text>
              </View>
              <Chip
                label={u.status}
                variant={u.status as any}
              />
            </View>
          ))}
        </>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Users Tab
// ---------------------------------------------------------------------------

function UsersTab({
  users,
  actorUid,
  actorEmail,
  customers,
  reload,
}: {
  users: UserProfile[];
  actorUid: string;
  actorEmail: string;
  customers: Customer[];
  reload: () => void;
}) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'suspended'>('all');
  const [assigningUser, setAssigningUser] = useState<UserProfile | null>(null);
  const [editingRole, setEditingRole] = useState<UserProfile | null>(null);

  const filtered = useMemo(() => {
    return users.filter(u => {
      const matchSearch =
        !search ||
        u.displayName.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'all' || u.status === filter;
      return matchSearch && matchFilter;
    });
  }, [users, search, filter]);

  const handleUpdateStatus = async (user: UserProfile, status: FirebaseAuthService.AuthStatus) => {
    // Prevent self-suspension or self-demotion
    if (user.uid === actorUid && status === 'suspended') {
      Alert.alert('Not Allowed', 'You cannot suspend your own account.');
      return;
    }
    const actionLabel = status === 'active' ? 'approve' : status === 'suspended' ? 'suspend' : 'set as pending';
    confirmAction(
      `${actionLabel.charAt(0).toUpperCase() + actionLabel.slice(1)} User`,
      `Are you sure you want to ${actionLabel} ${user.displayName}?`,
      async () => {
        try {
          await FirebaseAuthService.adminUpdateUser(user.uid, { status }, actorUid, actorEmail);
          reload();
        } catch (e) {
          Alert.alert('Error', String(e));
        }
      },
    );
  };

  const handleToggleRole = async (user: UserProfile) => {
    if (user.uid === actorUid) {
      Alert.alert('Not Allowed', 'You cannot change your own admin role.');
      return;
    }
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    const label = newRole === 'admin' ? 'promote to admin' : 'remove admin role from';
    confirmAction(
      `Change Role`,
      `Are you sure you want to ${label} ${user.displayName}?`,
      async () => {
        try {
          await FirebaseAuthService.adminUpdateUser(user.uid, { role: newRole }, actorUid, actorEmail);
          setEditingRole(null);
          reload();
        } catch (e) {
          Alert.alert('Error', String(e));
        }
      },
    );
  };

  const handleRemoveBusiness = async (user: UserProfile) => {
    if (!user.businessId) return;
    confirmAction(
      'Remove Business',
      `Remove ${user.displayName} from ${user.businessId}?`,
      async () => {
        try {
          await FirebaseAuthService.adminRemoveBusiness(user.uid, user.businessId!, actorUid, actorEmail);
          reload();
        } catch (e) {
          Alert.alert('Error', String(e));
        }
      },
    );
  };

  const handleAssignBusiness = async (businessId: string) => {
    if (!assigningUser) return;
    try {
      await FirebaseAuthService.adminAssignBusiness(assigningUser.uid, businessId, actorUid, actorEmail);
      setAssigningUser(null);
      reload();
    } catch (e) {
      Alert.alert('Error', String(e));
    }
  };

  const FILTER_OPTIONS: Array<typeof filter> = ['all', 'pending', 'active', 'suspended'];

  return (
    <View style={styles.tabContent}>
      {/* Search */}
      <View style={styles.searchBar}>
        <Icon name="magnify" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search name or email…"
          placeholderTextColor={Colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
        {search ? (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Icon name="close" size={16} color={Colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterRow}>
        {FILTER_OPTIONS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}>
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.countLabel}>{filtered.length} user{filtered.length !== 1 ? 's' : ''}</Text>

      {filtered.length === 0 ? (
        <EmptyState icon="account-search-outline" message="No users match your search." />
      ) : (
        filtered.map(u => (
          <UserCard
            key={u.uid}
            user={u}
            isSelf={u.uid === actorUid}
            onApprove={() => handleUpdateStatus(u, 'active')}
            onSuspend={() => handleUpdateStatus(u, 'suspended')}
            onSetPending={() => handleUpdateStatus(u, 'pending')}
            onAssignBusiness={() => setAssigningUser(u)}
            onRemoveBusiness={() => handleRemoveBusiness(u)}
            onToggleRole={() => handleToggleRole(u)}
          />
        ))
      )}

      {/* Assign Business Modal */}
      <Modal visible={!!assigningUser} transparent animationType="slide" onRequestClose={() => setAssigningUser(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Assign to Business</Text>
            <Text style={styles.modalSubtitle}>{assigningUser?.displayName}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {customers.filter(c => c.status === 'active').length === 0 ? (
                <Text style={styles.emptyLabel}>No active businesses available.</Text>
              ) : (
                customers
                  .filter(c => c.status === 'active')
                  .map(c => (
                    <TouchableOpacity
                      key={c.businessId}
                      style={styles.listOption}
                      onPress={() => handleAssignBusiness(c.businessId)}>
                      <View>
                        <Text style={styles.listOptionTitle}>{c.businessName}</Text>
                        <Text style={styles.listOptionSub}>{c.businessId}</Text>
                      </View>
                      <Icon name="chevron-right" size={18} color={Colors.textTertiary} />
                    </TouchableOpacity>
                  ))
              )}
            </ScrollView>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setAssigningUser(null)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// User Card
// ---------------------------------------------------------------------------

function UserCard({
  user,
  isSelf,
  onApprove,
  onSuspend,
  onSetPending,
  onAssignBusiness,
  onRemoveBusiness,
  onToggleRole,
}: {
  user: UserProfile;
  isSelf: boolean;
  onApprove: () => void;
  onSuspend: () => void;
  onSetPending: () => void;
  onAssignBusiness: () => void;
  onRemoveBusiness: () => void;
  onToggleRole: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardHeader} onPress={() => setExpanded(v => !v)} activeOpacity={0.8}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.avatarWrap}>
            <Icon name="account" size={20} color={Colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle}>{user.displayName}</Text>
              {isSelf && <Text style={styles.selfBadge}> (you)</Text>}
            </View>
            <Text style={styles.cardSub}>{user.email}</Text>
          </View>
        </View>
        <View style={styles.cardChips}>
          <Chip label={user.status} variant={user.status as any} />
          <Chip label={user.role} variant={user.role as any} />
        </View>
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textTertiary} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardBody}>
          <Text style={styles.cardDetail}>
            Business: {user.businessId || 'Not assigned'}
          </Text>

          {/* Status actions */}
          <Text style={styles.actionGroupLabel}>Status</Text>
          <View style={styles.actionRow}>
            {user.status !== 'active' && (
              <ActionButton label="Approve" icon="check-circle-outline" color={Colors.active} onPress={onApprove} />
            )}
            {user.status !== 'suspended' && !isSelf && (
              <ActionButton label="Suspend" icon="account-cancel-outline" color={Colors.error} onPress={onSuspend} />
            )}
            {user.status !== 'pending' && (
              <ActionButton label="Set Pending" icon="clock-outline" color={Colors.warning} onPress={onSetPending} />
            )}
          </View>

          {/* Business actions */}
          <Text style={styles.actionGroupLabel}>Business</Text>
          <View style={styles.actionRow}>
            {!user.businessId && (
              <ActionButton label="Assign" icon="briefcase-plus-outline" color={Colors.primary} onPress={onAssignBusiness} />
            )}
            {user.businessId && (
              <ActionButton label="Remove Business" icon="briefcase-minus-outline" color={Colors.error} onPress={onRemoveBusiness} />
            )}
          </View>

          {/* Role actions (only for non-self) */}
          {!isSelf && (
            <>
              <Text style={styles.actionGroupLabel}>Role</Text>
              <View style={styles.actionRow}>
                <ActionButton
                  label={user.role === 'admin' ? 'Remove Admin' : 'Make Admin'}
                  icon={user.role === 'admin' ? 'shield-remove-outline' : 'shield-plus-outline'}
                  color={user.role === 'admin' ? Colors.error : Colors.primary}
                  onPress={onToggleRole}
                />
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Businesses Tab
// ---------------------------------------------------------------------------

function BusinessesTab({
  customers,
  users,
  actorUid,
  actorEmail,
  reload,
}: {
  customers: Customer[];
  users: UserProfile[];
  actorUid: string;
  actorEmail: string;
  reload: () => void;
}) {
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [newBizId, setNewBizId] = useState('');
  const [newBizName, setNewBizName] = useState('');
  const [newBizStatus, setNewBizStatus] = useState<FirebaseAuthService.AuthStatus>('active');

  const filtered = useMemo(() =>
    customers.filter(c =>
      !search ||
      c.businessName.toLowerCase().includes(search.toLowerCase()) ||
      c.businessId.toLowerCase().includes(search.toLowerCase())
    ), [customers, search]);

  const handleCreate = async () => {
    const bId = newBizId.trim().toUpperCase();
    const bName = newBizName.trim();
    if (!bId || !bName) { Alert.alert('Error', 'Both fields are required.'); return; }
    if (!/^[A-Z0-9_-]+$/.test(bId)) { Alert.alert('Error', 'Business ID must be uppercase letters, numbers, _ or -.'); return; }
    if (customers.some(c => c.businessId === bId)) { Alert.alert('Error', 'Business ID already exists.'); return; }
    try {
      await FirebaseAuthService.adminSaveCustomer(
        bId,
        { businessId: bId, businessName: bName, status: newBizStatus, allowedUserIds: {}, createdAt: Date.now() },
        actorUid, actorEmail, true,
      );
      setCreating(false);
      setNewBizId('');
      setNewBizName('');
      setNewBizStatus('active');
      reload();
    } catch (e) { Alert.alert('Error', String(e)); }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    try {
      await FirebaseAuthService.adminSaveCustomer(
        editing.businessId,
        { businessName: editing.businessName, status: editing.status },
        actorUid, actorEmail, false,
      );
      setEditing(null);
      reload();
    } catch (e) { Alert.alert('Error', String(e)); }
  };

  const handleToggleStatus = async (customer: Customer) => {
    const newStatus = customer.status === 'active' ? 'suspended' : 'active';
    confirmAction(
      `${newStatus === 'active' ? 'Activate' : 'Suspend'} Business`,
      `${newStatus === 'active' ? 'Activate' : 'Suspend'} ${customer.businessName}?`,
      async () => {
        try {
          await FirebaseAuthService.adminSaveCustomer(
            customer.businessId,
            { status: newStatus },
            actorUid, actorEmail, false,
          );
          reload();
        } catch (e) { Alert.alert('Error', String(e)); }
      },
    );
  };

  return (
    <View style={styles.tabContent}>
      <View style={styles.searchBar}>
        <Icon name="magnify" size={18} color={Colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search businesses…"
          placeholderTextColor={Colors.textTertiary}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <TouchableOpacity style={styles.createBtn} onPress={() => setCreating(true)}>
        <Icon name="plus" size={18} color="#fff" />
        <Text style={styles.createBtnText}>Create Business</Text>
      </TouchableOpacity>

      <Text style={styles.countLabel}>{filtered.length} business{filtered.length !== 1 ? 'es' : ''}</Text>

      {filtered.length === 0 ? (
        <EmptyState icon="office-building-outline" message="No businesses found." />
      ) : (
        filtered.map(c => {
          const assignedUsers = users.filter(u => u.businessId === c.businessId);
          return (
            <BusinessCard
              key={c.businessId}
              customer={c}
              assignedUsers={assignedUsers}
              onEdit={() => setEditing({ ...c })}
              onToggleStatus={() => handleToggleStatus(c)}
            />
          );
        })
      )}

      {/* Create Business Modal */}
      <Modal visible={creating} transparent animationType="slide" onRequestClose={() => setCreating(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create Business</Text>
            <Text style={styles.inputLabel}>Business ID (e.g. WINSOFT-001)</Text>
            <TextInput
              style={styles.input}
              value={newBizId}
              onChangeText={setNewBizId}
              autoCapitalize="characters"
              placeholder="COMPANY-001"
              placeholderTextColor={Colors.textTertiary}
            />
            <Text style={styles.inputLabel}>Business Name</Text>
            <TextInput
              style={styles.input}
              value={newBizName}
              onChangeText={setNewBizName}
              placeholder="Company Name"
              placeholderTextColor={Colors.textTertiary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreating(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleCreate}>
                <Text style={styles.saveBtnText}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Edit Business Modal */}
      <Modal visible={!!editing} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Edit Business</Text>
            <Text style={styles.inputLabel}>Business ID</Text>
            <View style={styles.inputDisabled}>
              <Text style={styles.inputDisabledText}>{editing?.businessId}</Text>
            </View>
            <Text style={styles.inputLabel}>Business Name</Text>
            <TextInput
              style={styles.input}
              value={editing?.businessName ?? ''}
              onChangeText={v => setEditing(e => e ? { ...e, businessName: v } : e)}
              placeholderTextColor={Colors.textTertiary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveEdit}>
                <Text style={styles.saveBtnText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Business Card
// ---------------------------------------------------------------------------

function BusinessCard({
  customer,
  assignedUsers,
  onEdit,
  onToggleStatus,
}: {
  customer: Customer;
  assignedUsers: UserProfile[];
  onEdit: () => void;
  onToggleStatus: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const allowedCount = Object.keys(customer.allowedUserIds ?? {}).length;

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.cardHeader} onPress={() => setExpanded(v => !v)} activeOpacity={0.8}>
        <View style={styles.cardHeaderLeft}>
          <View style={styles.avatarWrap}>
            <Icon name="office-building-outline" size={20} color={Colors.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{customer.businessName}</Text>
            <Text style={styles.cardSub}>{customer.businessId}</Text>
          </View>
        </View>
        <Chip label={customer.status} variant={customer.status as any} />
        <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textTertiary} />
      </TouchableOpacity>

      {expanded && (
        <View style={styles.cardBody}>
          <Text style={styles.cardDetail}>Allowed users: {allowedCount}</Text>
          <Text style={styles.cardDetail}>Assigned app users: {assignedUsers.length}</Text>
          {assignedUsers.map(u => (
            <Text key={u.uid} style={styles.cardSub}>  · {u.displayName} ({u.email})</Text>
          ))}

          <Text style={styles.actionGroupLabel}>Actions</Text>
          <View style={styles.actionRow}>
            <ActionButton label="Edit" icon="pencil-outline" color={Colors.primary} onPress={onEdit} />
            <ActionButton
              label={customer.status === 'active' ? 'Suspend' : 'Activate'}
              icon={customer.status === 'active' ? 'store-off-outline' : 'store-check-outline'}
              color={customer.status === 'active' ? Colors.error : Colors.active}
              onPress={onToggleStatus}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Devices Tab
// ---------------------------------------------------------------------------

function DevicesTab({
  devices,
  users,
  customers,
  actorUid,
  actorEmail,
  reload,
}: {
  devices: DeviceRecord[];
  users: UserProfile[];
  customers: Customer[];
  actorUid: string;
  actorEmail: string;
  reload: () => void;
}) {
  const getUserName = (uid: string) => {
    const u = users.find(x => x.uid === uid);
    return u ? `${u.displayName} (${u.email})` : uid;
  };
  const getBusinessName = (businessId?: string) => {
    if (!businessId) return 'Unassigned';
    const c = customers.find(x => x.businessId === businessId);
    return c ? c.businessName : businessId;
  };

  const handleRevoke = (device: DeviceRecord) => {
    confirmAction(
      'Revoke Device',
      `Disable monitoring registration for ${getUserName(device.uid)}? This will stop their push notifications.`,
      async () => {
        try {
          await FirebaseAuthService.adminUpdateDevice(device.uid, { disabled: true }, actorUid, actorEmail);
          reload();
        } catch (e) { Alert.alert('Error', String(e)); }
      },
    );
  };

  const handleRestore = async (device: DeviceRecord) => {
    try {
      await FirebaseAuthService.adminUpdateDevice(device.uid, { disabled: false }, actorUid, actorEmail);
      reload();
    } catch (e) { Alert.alert('Error', String(e)); }
  };

  if (devices.length === 0) {
    return (
      <View style={styles.tabContent}>
        <EmptyState icon="cellphone-wireless" message="No devices registered for monitoring yet." />
      </View>
    );
  }

  return (
    <View style={styles.tabContent}>
      <Text style={styles.countLabel}>{devices.length} device{devices.length !== 1 ? 's' : ''}</Text>
      {devices.map(d => {
        const formatTs = (val?: any) => {
          if (!val) return 'Never';
          const ms = typeof val === 'number' ? val : typeof val?.toMillis === 'function' ? val.toMillis() : null;
          return ms ? new Date(ms).toLocaleString() : 'Never';
        };

        const isConnected = d.monitoringStatus === 'connected' || d.fcmRegistrationStatus === 'registered';
        const hasChannel = Boolean(d.channelId);
        const channelExpired = d.expiration ? Date.now() > d.expiration : false;

        let statusLabel = 'not connected';
        let statusVariant: 'active' | 'suspended' | 'pending' | 'neutral' = 'neutral';
        if (d.disabled) {
          statusLabel = 'disabled';
          statusVariant = 'suspended';
        } else if (isConnected && hasChannel && !channelExpired) {
          statusLabel = 'connected';
          statusVariant = 'active';
        } else if (d.monitoringStatus === 'error' || channelExpired) {
          statusLabel = channelExpired ? 'watch expired' : 'watch error';
          statusVariant = 'suspended';
        } else if (isConnected) {
          statusLabel = 'push active';
          statusVariant = 'pending';
        }

        return (
          <View key={d.uid} style={[styles.card, d.disabled && styles.cardDisabled]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardHeaderLeft}>
                <View style={styles.avatarWrap}>
                  <Icon name="cellphone" size={20} color={d.disabled ? Colors.textTertiary : Colors.textSecondary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{getUserName(d.uid)}</Text>
                  <Text style={styles.cardSub}>{getBusinessName(d.businessId)} · {d.platform ?? 'Android'} v{d.appVersion ?? '1.0'}</Text>
                </View>
              </View>
              <Chip
                label={statusLabel}
                variant={statusVariant}
              />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardDetail}>
                Monitored Folder: {d.folderName ? `${d.folderName} (${d.folderId?.slice(0, 10)}…)` : (d.folderId ?? 'None')}
              </Text>
              <Text style={styles.cardDetail}>
                Drive Watch: {d.channelId ? `Active (ID: ${d.channelId.slice(0, 8)}…)` : 'No active channel'}
              </Text>
              {d.expiration ? (
                <Text style={styles.cardDetail}>
                  Watch Expiration: {channelExpired ? '⚠ Expired' : 'Expires'} ({new Date(d.expiration).toLocaleString()})
                </Text>
              ) : null}
              {d.lastErrorReason ? (
                <Text style={[styles.cardDetail, { color: Colors.error }]}>
                  Issue: {d.lastErrorReason}
                </Text>
              ) : null}
              <Text style={styles.cardDetail}>Last seen: {formatTs(d.lastSeenAt)}</Text>
              <Text style={styles.cardDetail}>Registered: {formatTs(d.registeredAt)}</Text>
              {d.lastMonitoringEvent ? (
                <Text style={styles.cardDetail}>Last event: {d.lastMonitoringEvent}</Text>
              ) : null}
              <View style={styles.actionRow}>
                {!d.disabled ? (
                  <ActionButton label="Revoke" icon="cellphone-off" color={Colors.error} onPress={() => handleRevoke(d)} />
                ) : (
                  <ActionButton label="Restore" icon="cellphone-check" color={Colors.active} onPress={() => handleRestore(d)} />
                )}
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Audit Log Tab
// ---------------------------------------------------------------------------

function AuditTab({ entries }: { entries: AuditLogEntry[] }) {
  if (entries.length === 0) {
    return (
      <View style={styles.tabContent}>
        <EmptyState icon="clipboard-list-outline" message="No audit log entries yet." />
      </View>
    );
  }

  const getActionLabel = (action: string) => action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const getActionColor = (action: string) => {
    if (action.includes('approve') || action.includes('activate') || action.includes('restore')) return Colors.active;
    if (action.includes('suspend') || action.includes('revoke') || action.includes('demote')) return Colors.error;
    if (action.includes('promote') || action.includes('create') || action.includes('assign')) return Colors.primary;
    return Colors.warning;
  };

  return (
    <View style={styles.tabContent}>
      <Text style={styles.countLabel}>{entries.length} recent entries</Text>
      {entries.map((entry, i) => (
        <View key={i} style={styles.auditEntry}>
          <View style={[styles.auditDot, { backgroundColor: getActionColor(entry.action) }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.auditAction}>{getActionLabel(entry.action)}</Text>
            <Text style={styles.auditTarget}>{entry.targetType}: {entry.targetId}</Text>
            {entry.actorEmail && <Text style={styles.auditActor}>by {entry.actorEmail}</Text>}
          </View>
        </View>
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function ActionButton({ label, icon, color, onPress }: { label: string; icon: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.actionButton, { borderColor: `${color}44`, backgroundColor: `${color}14` }]}
      onPress={onPress}
      activeOpacity={0.7}>
      <Icon name={icon} size={14} color={color} />
      <Text style={[styles.actionButtonText, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <View style={styles.emptyState}>
      <Icon name={icon} size={40} color={Colors.textTertiary} />
      <Text style={styles.emptyStateText}>{message}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },

  accessDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xxl },
  accessDeniedTitle: { ...Typography.headline, color: Colors.error, fontWeight: '700' },
  accessDeniedText: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },

  // Tabs
  tabBar: { borderBottomWidth: 1, borderBottomColor: Colors.border, backgroundColor: Colors.surface, maxHeight: 50 },
  tabBarContent: { flexDirection: 'row', paddingHorizontal: Spacing.sm },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    minWidth: 80,
  },
  tabActive: { borderBottomColor: Colors.primary },
  tabLabel: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
  tabLabelActive: { color: Colors.primary },
  badge: {
    backgroundColor: Colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  // Scroll
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: Spacing.xxl },
  tabContent: { padding: Spacing.md, gap: Spacing.md },

  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  loadingText: { ...Typography.body, color: Colors.textSecondary },

  // Section
  sectionTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, fontWeight: '700', marginTop: Spacing.sm },

  // Metrics
  metricsGrid: { flexDirection: 'row', gap: Spacing.sm },

  // Recent users
  recentUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recentUserName: { ...Typography.caption, color: Colors.textPrimary, fontWeight: '600' },
  recentUserEmail: { ...Typography.caption, color: Colors.textSecondary },

  // Search
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, ...Typography.body, color: Colors.textPrimary, padding: 0 },

  // Filter chips
  filterRow: { maxHeight: 40 },
  filterChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.sm,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipActive: { backgroundColor: `${Colors.primary}22`, borderColor: Colors.primary },
  filterChipText: { ...Typography.caption, color: Colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: Colors.primary },

  countLabel: { ...Typography.caption, color: Colors.textTertiary },

  // Cards
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    ...Shadow.sm,
  },
  cardDisabled: { opacity: 0.6, borderColor: Colors.errorDim },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardHeaderLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center' },
  cardTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, fontWeight: '600' },
  selfBadge: { ...Typography.caption, color: Colors.primary, fontWeight: '600' },
  cardSub: { ...Typography.caption, color: Colors.textSecondary, marginTop: 2 },
  cardDetail: { ...Typography.caption, color: Colors.textSecondary, marginBottom: 4 },
  cardChips: { flexDirection: 'row', gap: 4 },
  cardBody: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    gap: Spacing.xs,
  },

  // Avatar
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Action rows
  actionGroupLabel: { ...Typography.caption, color: Colors.textTertiary, marginTop: Spacing.sm, fontWeight: '600' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 4 },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
  },
  actionButtonText: { ...Typography.caption, fontWeight: '700' },

  // Create btn
  createBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
  },
  createBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.xl,
    gap: Spacing.sm,
    ...Shadow.lg,
  },
  modalTitle: { ...Typography.headline, color: Colors.textPrimary, fontWeight: '700' },
  modalSubtitle: { ...Typography.body, color: Colors.textSecondary },
  listOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  listOptionTitle: { ...Typography.bodyMedium, color: Colors.textPrimary, fontWeight: '600' },
  listOptionSub: { ...Typography.caption, color: Colors.textSecondary },
  emptyLabel: { ...Typography.body, color: Colors.textSecondary, padding: Spacing.md, textAlign: 'center' },

  modalActions: { flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm },
  cancelBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelBtnText: { ...Typography.bodyMedium, color: Colors.textSecondary, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.primary,
  },
  saveBtnText: { ...Typography.bodyMedium, color: '#fff', fontWeight: '700' },

  // Input
  inputLabel: { ...Typography.caption, color: Colors.textSecondary, marginTop: Spacing.sm },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    color: Colors.textPrimary,
    backgroundColor: Colors.cardElevated,
  },
  inputDisabled: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    backgroundColor: Colors.card,
  },
  inputDisabledText: { ...Typography.body, color: Colors.textTertiary },

  // Empty state
  emptyState: { alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl, gap: Spacing.md },
  emptyStateText: { ...Typography.body, color: Colors.textSecondary, textAlign: 'center' },

  // Audit log
  auditEntry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  auditDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5 },
  auditAction: { ...Typography.bodyMedium, color: Colors.textPrimary, fontWeight: '600' },
  auditTarget: { ...Typography.caption, color: Colors.textSecondary },
  auditActor: { ...Typography.caption, color: Colors.textTertiary, fontStyle: 'italic' },
});
