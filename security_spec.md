# Security Specification (`security_spec.md`)

## 1. Data Invariants
1. **Default Deny**: All paths not explicitly matched are denied for both `read` and `write`.
2. **PII Isolation**: User PII (`email`, `phone`) is stored exclusively in `/users/{userId}/private/{docId}` and is strictly accessible only when `request.auth.uid == userId`. Public profiles in `/users/{userId}` never store email or phone.
3. **Identity Integrity**: Every document in `/users/{userId}`, `/users/{userId}/private/{docId}`, and `/users/{userId}/notes/{noteId}` must have its owner/uid field strictly matching `request.auth.uid` and the path parameter `{userId}`.
4. **Master Gate & Relational Sync**: A `CloudNote` in `/users/{userId}/notes/{noteId}` can only be created or updated if the parent `/users/{userId}` document exists and belongs to `request.auth.uid`.
5. **Temporal Integrity**: `createdAt` is immutable on update and must equal `request.time` on create. `updatedAt` must equal `request.time` on both create and update.

## 2. The "Dirty Dozen" Payloads
1. **Unauthenticated Write**: `auth = null`, creating `/users/user_1` -> `PERMISSION_DENIED`.
2. **Identity Spoofing on User Create**: `auth.uid = 'attacker'`, creating `/users/victim` with `uid: 'victim'` -> `PERMISSION_DENIED`.
3. **Shadow Field Injection on Create**: Creating `/users/user_1` with extra field `isAdmin: true` -> `PERMISSION_DENIED`.
4. **Oversized DisplayName Poisoning**: Creating `/users/user_1` with `displayName` of 500 chars (> 64 limit) -> `PERMISSION_DENIED`.
5. **Invalid Username Pattern**: Creating `/users/user_1` with `username: 'bad user!'` -> `PERMISSION_DENIED`.
6. **Spoofed Timestamp on Create**: Creating `/users/user_1` with `createdAt` in the past instead of `request.time` -> `PERMISSION_DENIED`.
7. **Mutating Immutable `createdAt` on Update**: Updating `/users/user_1` with a modified `createdAt` -> `PERMISSION_DENIED`.
8. **Cross-User PII Read**: `auth.uid = 'user_2'` attempting `get` on `/users/user_1/private/info` -> `PERMISSION_DENIED`.
9. **Unverified Email Write**: `auth.token.email_verified = false` attempting to create `/users/user_1` -> `PERMISSION_DENIED`.
10. **Orphaned Subcollection Write**: Creating `/users/user_1/notes/note_1` when `/users/user_1` does not exist -> `PERMISSION_DENIED`.
11. **Value Poisoning on Update**: Updating `/users/user_1` with `bio: 12345` (number instead of string) -> `PERMISSION_DENIED`.
12. **Path ID Poisoning**: Creating `/users/user_1/notes/invalid$id!` with non-alphanumeric ID -> `PERMISSION_DENIED`.
