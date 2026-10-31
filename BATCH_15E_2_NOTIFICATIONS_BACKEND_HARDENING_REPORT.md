# Apna Samaj — Batch 15E.2: Notifications Backend Hardening & Admin Trigger Integration Report

**Date:** October 31, 2026<br>
**Auditor / Roles:** Senior Backend Engineer & Security Lead<br>
**Repository:** `ravindrakewat/ApnaSamaj` (`https://github.com/ravindrakewat/ApnaSamaj.git`)<br>
**Active Branch:** `main`<br>
**Current HEAD:** `4e7e61560275d8e3fc4319c7b63c8d0ad3380726` (`4e7e615`)<br>
**Status:** COMPLETE & VERIFIED (Zero regressions, 214 test assertions passed)

---

## 1. Executive Summary

In Batch 15E.2, we hardened route parameter validation on the in-app notifications REST endpoints and integrated automated in-app notifications into administrative user status updates and matrimonial profile review workflows.

Key achievements:
1. **Strict UUID Route Validation:** Implemented and exported `notificationIdSchema` and `notificationIdParamSchema` in `@apnasamaj/validation`. Wired into `markAsReadHandler` (`PATCH /api/v1/notifications/:id/read`) and `deleteNotificationHandler` (`DELETE /api/v1/notifications/:id`). Malformed notification IDs now fail fast with HTTP 400 before querying Prisma or the database.
2. **Account Status Notification Triggers:** Enhanced `updateAdminUserStatus` in `apps/api/src/modules/admin/users/admin.users.service.ts` to dispatch an `ACCOUNT_STATUS_UPDATE` notification on successful `SUSPENDED` and `ACTIVE` transitions.
   - Enforced idempotency: if user status is unchanged, redundant database transactions and duplicate notifications are suppressed.
   - Enforced moderator confidentiality: `actorId: null` ensures administrative identity is not exposed in user-facing alerts.
   - Bilingual/Hindi messaging: clear, respectful notifications (`खाता निलंबित (Account Suspended)` and `खाता सक्रिय (Account Activated)`).
   - Non-blocking side-effects: transient notification dispatch errors never roll back status updates.
   - Note on "Ban" state: Verified that the Prisma `UserStatus` enum only supports `PENDING`, `ACTIVE`, and `SUSPENDED`. No unsupported states were invented.
3. **Matrimonial Profile Review Triggers:** Enhanced `moderateMatrimonialProfile` in `apps/api/src/modules/admin/matrimonial/admin.matrimonial.service.ts`.
   - On approval (`APPROVED`), dispatches `MATRIMONIAL_PROFILE_APPROVED` to profile owner with `actorId: null`.
   - On rejection (`REJECTED`), dispatches `MATRIMONIAL_PROFILE_REJECTED` to profile owner with the specific rejection reason and `actorId: null`.
   - Idempotency: duplicate approvals or rejections skip redundant notification dispatch.
   - Anti-self-approval rule (`profile.userId === actor.id` throws HTTP 403) strictly enforced.
4. **Verification & Testing:** Created a dedicated 17-assertion test suite in `apps/api/src/tests/notifications-hardening-triggers.test.ts`. All 17 assertions passed. Ran the existing 5 regression suites (197 assertions) for a total of **214 passed assertions with 0 failures**.

---

## 2. File Modification Inventory

```text
packages/validation/src/notification.ts                 |  8 ++++++++
apps/api/src/modules/notifications/notifications.controller.ts | 10 +++++-----
apps/api/src/modules/admin/users/admin.users.service.ts | 19 +++++++++++++++----
apps/api/src/modules/admin/matrimonial/admin.matrimonial.service.ts | 12 ++++++------
apps/api/src/tests/notifications-hardening-triggers.test.ts | 565 ++++++++++++++++++++++
5 files changed, 614 insertions(+), 25 deletions(-)
```

### Detailed Changes:
1. [`packages/validation/src/notification.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\packages\validation\src\notification.ts):
   - Exported `notificationIdSchema` (`z.string().uuid(...)`).
   - Exported `notificationIdParamSchema` (`z.object({ id: notificationIdSchema })`).
   - Exported `NotificationIdParam` type.
2. [`apps/api/src/modules/notifications/notifications.controller.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\api\src\modules\notifications\notifications.controller.ts):
   - Replaced generic `idParamSchema` with strict `notificationIdParamSchema` in `markAsReadHandler` and `deleteNotificationHandler`.
   - Returns HTTP 400 with descriptive error message on malformed UUID inputs.
3. [`apps/api/src/modules/admin/users/admin.users.service.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\api\src\modules\admin\users\admin.users.service.ts):
   - Added idempotency guard `if (targetUser.status === newStatus) return getAdminUserDetails(...)` to avoid duplicate processing.
   - Enforced `actorId: null` in `sendNotificationSafely` payload to protect moderator confidentiality.
   - Added Hindi titles and messages.
4. [`apps/api/src/modules/admin/matrimonial/admin.matrimonial.service.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\api\src\modules\admin\matrimonial\admin.matrimonial.service.ts):
   - Enforced `actorId: null` in approval and rejection notification payloads.
   - Localized notification titles and messages to Hindi + English.
5. [`apps/api/src/tests/notifications-hardening-triggers.test.ts`](file:///c:/sunil%20kewat/dsas158\ApnaSamaj\apps\api\src\tests\notifications-hardening-triggers.test.ts):
   - 17 unit and integration tests covering UUID parameter validation, HTTP 400 early return, cross-user ownership isolation, account status triggers, idempotency, failure resiliency, matrimonial profile review notifications, and anti-self-approval enforcement.

---

## 3. Test & Verification Results

| Test Suite File | Focus / Scope | Result |
|:---|:---|:---|
| [`notifications-hardening-triggers.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/notifications-hardening-triggers.test.ts) | UUID parameter validation, account status triggers & matrimonial reviews | **17 / 17 PASS** |
| [`notifications.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/notifications.test.ts) | Core notification service contracts, deduplication, unread counts | **31 / 31 PASS** |
| [`notifications-chat-tenant.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/notifications-chat-tenant.test.ts) | Multi-tenant physical DB isolation & Socket.IO handshake invariants | **47 / 47 PASS** |
| [`realtime-moderation-notifications.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/realtime-moderation-notifications.test.ts) | Moderation queue rooms & reporter resolution notifications | **47 / 47 PASS** |
| [`realtime-notifications-socket.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/api/src/tests/realtime-notifications-socket.test.ts) | Socket room scoping, token auth, event delivery & crash isolation | **35 / 35 PASS** |
| [`notifications-experience.test.ts`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/tests/notifications-experience.test.ts) | Target routing, query string generation, optimistic count math | **37 / 37 PASS** |

**Total Live Verified Assertions:** **214 passed, 0 failed, 0 skipped.**

---

## 4. Security & Privacy Audit

- **Physical Tenant Scoping:** All operations require `req.db` and tenant context; missing context fails closed with HTTP 400.
- **Authoritative Recipient:** Recipient ID is derived from authoritative database records (`targetUserId` / `profile.userId`), never from client body parameters.
- **Moderator Identity Protection:** All administrative notifications set `actorId: null` in user-facing notifications, preventing retaliatory identification of administrators or moderators.
- **Zero Sensitive Data Leakage:** Notification payloads omit passwords, tokens, phone numbers, email addresses, and confidential review notes.

---

## 5. Next Recommended Batch

### **Batch 15E.3 — Notifications Frontend Hindi Localization & UX Refinements**
- Localize [`NotificationBell.tsx`](file:///c:/sunil%20kewat/dsas158/ApnaSamaj/apps/web/src/components/NotificationBell.tsx) into Hindi ("सूचनाएं", "सभी पढ़ी हुई मार्क करें", "सभी", "अपठित", "कोई नई सूचना नहीं है", etc.).
- Add dedicated `/notifications` page or full-screen mobile view for responsive browsing.
