# Role-based web notifications

The signed-in web portal has one bell per workspace, including the neutral administration page, client/BA workspaces, pending-account screen and service desk. The inbox shows brand, event, time, unread state and paginated history. Users can mark one or all notifications read and mute the ping on their device.

## Events and recipients

| Activity | Recipients |
| --- | --- |
| Leave submission | Approved organization/platform administrators |
| Leave approval, denial or cancellation | The requester |
| Assignment changes | The assigned user |
| Reopened field log | The log owner |
| Completed or flagged field log | Administrators and supervisors with campaign access |
| Lenovo partner log | Administrators with Lenovo access |
| Booklist progress or ownership | Administrators and the assigned BA |
| New maintenance request or work ready for review | Administrators |
| Work order assignment or update | Assigned technician and requester |
| Campaign awaiting approval | Administrators |
| Campaign status changes | Brand clients and assigned BAs |
| Pending account/membership | Administrators |
| Approved account/membership | The affected user |

The actor does not receive their own action as a new alert. No client receives another person's leave, partner, contact or personnel data. Bodies contain controlled descriptions, never free-text reasons, coordinates, phone numbers or images.

## Delivery

Database triggers create alerts in the same transaction as the activity. Rolled-back actions generate no delivered alerts, and existing history is not backfilled. Approval events mirrored between profiles/memberships are deduplicated per recipient and transaction.

This release provides in-app web alerts. Visible pages poll every 15 seconds and refresh on focus. Browsing older history pauses the automatic replacement of that list. Background browser push, email/SMS and native push delivery are separate capabilities and are not enabled here.

The original soft two-note chime is iPhone-inspired. Browsers require a user gesture to unlock audio. Old unread history does not ping on first load; new unread events do. Muting persists per account on the current device.

## Authorization and navigation

Notification generation is private database code. Public clients cannot create, change content or delete alerts. RLS allows only the recipient to read a notification while their approved role and brand access remain valid. Revoked memberships, changed roles and suspended accounts/organizations remove visibility.

Read actions use guarded, audited RPCs and retry receipts. Opening an item rechecks ownership and role, then returns a controlled local path. Staff explicitly enter the relevant authorized brand before navigation, including when starting from the neutral hub. Every destination also enforces its own existing data access rules.

Tests cover recipient routing, supervisor scope, cross-brand isolation, ownership, revocation, read retries, pagination, transactional rollback, anonymous/direct-write denial and audio playback restrictions. Live integration checks use temporary data in a transaction that is rolled back.
