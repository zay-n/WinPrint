/* eslint-env jest */

// ── @react-native-firebase/auth v26 modular API mock ─────────────────────────
jest.mock('@react-native-firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  GoogleAuthProvider: {
    credential: jest.fn(() => ({ providerId: 'google.com', token: 'mock-token', secret: null })),
  },
  signInWithCredential: jest.fn(() =>
    Promise.resolve({ user: { uid: 'mock-uid', email: 'test@example.com' } }),
  ),
  signOut: jest.fn(() => Promise.resolve()),
}));

// ── @react-native-firebase/firestore v26 modular API mock ────────────────────
// RNFB v26: doc/collection return instances with .get() method.
// getDoc/getDocs are NOT exported. Reads use ref.get().
const mockDocSnap = { exists: jest.fn(() => false), data: jest.fn(() => ({})), id: 'mock-id' };
const mockCollectionSnap = { docs: [] };
const mockDocRef = {
  id: 'mock-id',
  get: jest.fn(() => Promise.resolve(mockDocSnap)),
};
const mockCollectionRef = {
  get: jest.fn(() => Promise.resolve(mockCollectionSnap)),
};

jest.mock('@react-native-firebase/firestore', () => ({
  getFirestore: jest.fn(() => ({})),
  collection: jest.fn(() => mockCollectionRef),
  doc: jest.fn(() => mockDocRef),
  setDoc: jest.fn(() => Promise.resolve()),
  updateDoc: jest.fn(() => Promise.resolve()),
  writeBatch: jest.fn(() => ({
    update: jest.fn(),
    set: jest.fn(),
    commit: jest.fn(() => Promise.resolve()),
  })),
  FieldValue: {
    delete: jest.fn(() => '__DELETE__'),
    serverTimestamp: jest.fn(() => '__SERVER_TIMESTAMP__'),
    increment: jest.fn((n) => `__INCREMENT_${n}__`),
    arrayUnion: jest.fn((...args) => `__ARRAY_UNION_${args}__`),
    arrayRemove: jest.fn((...args) => `__ARRAY_REMOVE_${args}__`),
  },
}));


jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  getAllKeys: jest.fn(),
}));
