# Winsoft Print Station - User Provisioning Guide

Winsoft Print Station uses Firebase Authentication and Firestore to secure access to the app. When a user signs in for the first time via Google Sign-In, their Firebase Auth profile is created, but they will not have access to the app until an admin provisions their profile in Firestore.

By default, users who are not active will see an "Awaiting Approval" or "Not Authorized" screen and cannot access the app or start background monitoring.

## How to Provision a New User

1. **Obtain the User's UID:**
   - Go to the [Firebase Console](https://console.firebase.google.com/).
   - Select the `winprint-8a644` project.
   - Navigate to **Authentication > Users**.
   - Find the user by their Google email address.
   - Copy their **User UID**.

2. **Create the Firestore Profile:**
   - Navigate to **Firestore Database**.
   - Click **Start collection** (if `users` doesn't exist) or select the `users` collection.
   - Add a new document with the following exact details:
     - **Document ID:** Paste the User UID from step 1.
     - **Fields:**
       - `email` (string): The user's email address.
       - `displayName` (string): The user's name.
       - `status` (string): `active` (must be exact).
       - `role` (string): `user` or `admin`.

3. **User Access:**
   - The user will now be able to access the app upon their next sign-in (or restart).
   - If you need to revoke access, change the `status` field to `suspended`.

## Allowed Status Values

- `active`: User has full access to the app and monitoring.
- `pending`: User is awaiting approval (default state if document is missing).
- `suspended`: User access has been revoked.

## Security Rules

The Firestore security rules restrict users from modifying their own profiles. Only admins (via the Firebase Console or Admin SDK) can create or update these documents. Users can only read their own profile to determine their access status.
