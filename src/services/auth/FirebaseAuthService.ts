// @react-native-firebase/auth + firestore v26 — modular API
//
// RNFB v26 modular Firestore note:
//  - collection(), doc(), setDoc(), updateDoc(), writeBatch() ARE exported from modular.js
//  - getDoc() / getDocs() are NOT — reads use docRef.get() / collectionRef.get() (instance methods)
//  - deleteField() is NOT exported — use FieldValue.delete() (static method)
//  - writeBatch() returns firestore.batch() which is the RNFB WriteBatch instance
//  - serverTimestamp() IS exported from RNFB v26 modular

import {
  getAuth,
  GoogleAuthProvider,
  signInWithCredential as firebaseSignInWithCredential,
  signOut as firebaseSignOut,
} from '@react-native-firebase/auth';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  writeBatch,
  FieldValue,
} from '@react-native-firebase/firestore';

export type AuthRole = 'admin' | 'user';
export type AuthStatus = 'active' | 'pending' | 'suspended';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  status: AuthStatus;
  role: AuthRole;
  businessId?: string;
  createdAt?: number;
  lastSeenAt?: number;
}

export interface CustomerConfiguration {
  drive?: {
    incomingFolderId?: string;
    archiveFolderId?: string;
  };
}

export interface Customer {
  businessId: string;
  businessName: string;
  status: AuthStatus;
  allowedUserIds: Record<string, boolean>;
  configuration?: CustomerConfiguration;
  createdAt?: number;
}

// Device registration record
export interface DeviceRecord {
  uid: string;
  userEmail?: string;
  businessId?: string;
  deviceId?: string;
  platform: string;
  appVersion?: string;
  fcmToken?: string;
  fcmRegistrationStatus?: string;
  folderId?: string;
  folderName?: string;
  channelId?: string;
  resourceId?: string;
  pageToken?: string;
  expiration?: number;
  monitoringStatus?: string;
  monitoringEnabled?: boolean;
  lastSeenAt?: number | { toMillis?: () => number };
  registeredAt?: number | { toMillis?: () => number };
  updatedAt?: number | { toMillis?: () => number };
  lastMonitoringEvent?: string;
  lastKnownStatus?: string;
  lastErrorReason?: string;
  disabled?: boolean;
}

// Audit log entry
export interface AuditLogEntry {
  actorUid: string;
  actorEmail?: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  timestamp: unknown; // Firestore server timestamp
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function db() {
  return getFirestore();
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Signs into Firebase Auth using a Google ID token.
 * Returns the Firebase UID.
 */
export async function signInWithGoogleToken(idToken: string): Promise<string> {
  const googleCredential = GoogleAuthProvider.credential(idToken);
  const userCredential = await firebaseSignInWithCredential(getAuth(), googleCredential);
  return userCredential.user.uid;
}

/**
 * Fetches the authorization profile from Firestore.
 * Reads use docRef.get() — getDoc() is not exported from RNFB v26 modular.
 */
export async function fetchUserProfile(uid: string, email?: string, displayName?: string): Promise<UserProfile | null> {
  try {
    const docRef = doc(collection(db(), 'users'), uid);
    // @ts-ignore: RNFB v26 — .get() exists on the ref instance; modular getDoc() is not exported
    const snap = await docRef.get();
    if (snap.exists()) {
      return { uid, ...snap.data() } as UserProfile;
    }

    // First time sign-in: attempt to create the user profile
    if (email) {
      const newUserProfile: Omit<UserProfile, 'uid'> = {
        email,
        displayName: displayName || email.split('@')[0],
        status: 'pending',
        role: 'user',
        createdAt: Date.now(),
      };
      await setDoc(docRef, newUserProfile);
      return { uid, ...newUserProfile };
    }

    return null;
  } catch (error: any) {
    console.error('Failed to fetch user profile from Firestore:', error);
    // If permission is denied, the user isn't in the database or doesn't have access.
    if (error?.code === 'firestore/permission-denied') {
      return null;
    }
    throw error;
  }
}

/**
 * Fetches the Customer configuration.
 */
export async function fetchCustomer(businessId: string): Promise<Customer | null> {
  try {
    const docRef = doc(collection(db(), 'customers'), businessId);
    // @ts-ignore: RNFB v26 — .get() exists on the ref instance
    const snap = await docRef.get();
    if (snap.exists()) {
      return { businessId, ...snap.data() } as Customer;
    }
    return null;
  } catch (error) {
    console.error('Failed to fetch customer from Firestore:', error);
    return null;
  }
}

/**
 * Fetches all users (Admin only).
 */
export async function fetchAllUsers(): Promise<UserProfile[]> {
  // @ts-ignore: RNFB v26 — .get() on collection ref; getDocs() is not exported from modular
  const snapshot = await collection(db(), 'users').get();
  return snapshot.docs.map((d: any) => ({ uid: d.id, ...d.data() } as UserProfile));
}

/**
 * Fetches all customers (Admin only).
 */
export async function fetchAllCustomers(): Promise<Customer[]> {
  // @ts-ignore: RNFB v26 — .get() on collection ref
  const snapshot = await collection(db(), 'customers').get();
  return snapshot.docs.map((d: any) => ({ businessId: d.id, ...d.data() } as Customer));
}

/**
 * Fetches all device records (Admin only).
 */
export async function fetchAllDevices(): Promise<DeviceRecord[]> {
  try {
    // @ts-ignore: RNFB v26 — .get() on collection ref
    const snapshot = await collection(db(), 'devices').get();
    return snapshot.docs.map((d: any) => ({ ...d.data(), uid: d.id } as DeviceRecord));
  } catch {
    return [];
  }
}

/**
 * Fetches recent audit log entries (Admin only).
 */
export async function fetchAuditLog(limitCount = 50): Promise<AuditLogEntry[]> {
  try {
    // @ts-ignore: RNFB v26 — .get() on collection ref
    const snapshot = await collection(db(), 'auditLog')
      // @ts-ignore
      .orderBy('timestamp', 'desc')
      // @ts-ignore
      .limit(limitCount)
      .get();
    return snapshot.docs.map((d: any) => d.data() as AuditLogEntry);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Admin — User Management
// ---------------------------------------------------------------------------

/**
 * Updates a user profile (Admin only).
 * Does NOT allow updating own role or status (enforced also in Firestore rules).
 */
export async function adminUpdateUser(
  uid: string,
  data: Partial<UserProfile>,
  actorUid?: string,
  actorEmail?: string,
): Promise<void> {
  const docRef = doc(collection(db(), 'users'), uid);
  await updateDoc(docRef, data as Record<string, unknown>);

  // Write audit log entry
  await writeAuditLog({
    actorUid: actorUid ?? 'unknown',
    actorEmail,
    action: buildAction(data),
    targetType: 'user',
    targetId: uid,
    metadata: data as Record<string, unknown>,
  });
}

function buildAction(data: Partial<UserProfile>): string {
  if (data.status === 'active') return 'approve_user';
  if (data.status === 'suspended') return 'suspend_user';
  if (data.status === 'pending') return 'set_user_pending';
  if (data.role === 'admin') return 'promote_to_admin';
  if (data.role === 'user') return 'demote_from_admin';
  return 'update_user';
}

// ---------------------------------------------------------------------------
// Admin — Customer Management
// ---------------------------------------------------------------------------

/**
 * Creates or updates a customer (Admin only).
 */
export async function adminSaveCustomer(
  businessId: string,
  data: Partial<Customer>,
  actorUid?: string,
  actorEmail?: string,
  isNew?: boolean,
): Promise<void> {
  const docRef = doc(collection(db(), 'customers'), businessId);
  await setDoc(docRef, data, { merge: true });

  await writeAuditLog({
    actorUid: actorUid ?? 'unknown',
    actorEmail,
    action: isNew ? 'create_business' : 'edit_business',
    targetType: 'customer',
    targetId: businessId,
    metadata: { businessName: data.businessName, status: data.status },
  });
}

// ---------------------------------------------------------------------------
// Admin — Business Assignment
// ---------------------------------------------------------------------------

export async function adminAssignBusiness(
  uid: string,
  businessId: string,
  actorUid?: string,
  actorEmail?: string,
): Promise<void> {
  const batch = writeBatch(db());
  const userRef = doc(collection(db(), 'users'), uid);
  const customerRef = doc(collection(db(), 'customers'), businessId);

  batch.update(userRef, { businessId });
  batch.set(customerRef, { allowedUserIds: { [uid]: true } }, { merge: true });
  await batch.commit();

  await writeAuditLog({
    actorUid: actorUid ?? 'unknown',
    actorEmail,
    action: 'assign_business',
    targetType: 'user',
    targetId: uid,
    metadata: { businessId },
  });
}

export async function adminRemoveBusiness(
  uid: string,
  previousBusinessId: string,
  actorUid?: string,
  actorEmail?: string,
): Promise<void> {
  const batch = writeBatch(db());
  const userRef = doc(collection(db(), 'users'), uid);

  // FieldValue.delete() removes a field — deleteField() is not a standalone export in RNFB v26
  batch.update(userRef, { businessId: FieldValue.delete() });

  if (previousBusinessId) {
    const customerRef = doc(collection(db(), 'customers'), previousBusinessId);
    batch.update(customerRef, {
      [`allowedUserIds.${uid}`]: FieldValue.delete(),
    });
  }

  await batch.commit();

  await writeAuditLog({
    actorUid: actorUid ?? 'unknown',
    actorEmail,
    action: 'remove_business',
    targetType: 'user',
    targetId: uid,
    metadata: { previousBusinessId },
  });
}

// ---------------------------------------------------------------------------
// Admin — Device Management
// ---------------------------------------------------------------------------

export async function adminUpdateDevice(
  uid: string,
  data: Partial<DeviceRecord>,
  actorUid?: string,
  actorEmail?: string,
): Promise<void> {
  const docRef = doc(collection(db(), 'devices'), uid);
  await setDoc(docRef, data, { merge: true });

  const action = data.disabled === true ? 'revoke_device' : data.disabled === false ? 'restore_device' : 'update_device';
  await writeAuditLog({
    actorUid: actorUid ?? 'unknown',
    actorEmail,
    action,
    targetType: 'device',
    targetId: uid,
    metadata: data as Record<string, unknown>,
  });
}

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

/**
 * Writes an audit log entry.
 * In production, this should be restricted to Cloud Functions for integrity.
 * For now, client writes are guarded by Firestore rules.
 */
export async function writeAuditLog(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<void> {
  try {
    const logRef = doc(collection(db(), 'auditLog'));
    await setDoc(logRef, {
      ...entry,
      timestamp: FieldValue.serverTimestamp(),
    });
  } catch (error) {
    // Audit log failures must not block primary operations
    console.warn('[WinPrint][AuditLog] Failed to write audit log entry:', error);
  }
}

// ---------------------------------------------------------------------------
// Admin Stats
// ---------------------------------------------------------------------------

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  suspendedUsers: number;
  totalBusinesses: number;
  activeBusinesses: number;
  suspendedBusinesses: number;
  totalDevices: number;
  monitoringActiveDevices: number;
}

export function computeAdminStats(
  users: UserProfile[],
  customers: Customer[],
  devices: DeviceRecord[],
): AdminStats {
  return {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.status === 'active').length,
    pendingUsers: users.filter(u => u.status === 'pending').length,
    suspendedUsers: users.filter(u => u.status === 'suspended').length,
    totalBusinesses: customers.length,
    activeBusinesses: customers.filter(c => c.status === 'active').length,
    suspendedBusinesses: customers.filter(c => c.status === 'suspended').length,
    totalDevices: devices.length,
    monitoringActiveDevices: devices.filter(d => d.monitoringEnabled && !d.disabled).length,
  };
}

// ---------------------------------------------------------------------------
// Firebase Auth Session
// ---------------------------------------------------------------------------

/**
 * Clears the Firebase Authentication session.
 */
export async function signOutFirebase(): Promise<void> {
  await firebaseSignOut(getAuth());
}
