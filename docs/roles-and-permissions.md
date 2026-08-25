# Roles & Permissions

## Roles (`app_role`)

| Role | Who | Powers |
| --- | --- | --- |
| `super_admin` | Platform operators | Everything an org admin can do, across **all** organizations (RLS bypass helpers + explicit checks). |
| `organization_admin` | Client staff | Full control inside their organization: approve/suspend BAs, manage campaigns/stores/SKUs/assignments, view all logs, export CSV, read audit trail. |
| `supervisor` | Field managers | Same as org admin but only for stores/campaigns in `supervisor_scopes`. |
| `brand_ambassador` | Field users | Check in/out, upload photos, record sales, sick leave — exclusively through RPCs, and only for themselves. |

Role lives on `profiles.role` and is **never accepted from the client**; every
server path re-derives it from the JWT via `current_profile()`.

## Account lifecycle (`account_status`)

```
pending ──approve──▶ approved ──suspend──▶ suspended
   │                    │  ▲                   │
   └──reject──▶ rejected│  └────── reinstate ─┘
                        ▼
                    inactive (off-boarding)
```

- Registration creates `pending`; pending/rejected/suspended users can sign in
  but RLS + `assert_active_ba()` block all operational access.
- Transitions are performed by elevated users via the
  `admin_set_account_status` RPC (reason recorded in audit log).
- Storage policies additionally require `pending`/`approved` to upload.

## Enforcement layers

1. **Middleware** (admin) — refreshes the session and gates portal routes.
2. **Server components / actions** — `requireStaff()` loads the profile;
   elevated-only pages call `isElevated()` (admin+super).
3. **RLS** — every table scoped by `organization_id`; supervisors narrowed by
   scopes; BAs see only their own rows.
4. **RPC guards** — mutations verify role, status, assignment, date and
   distance server-side regardless of what the client sent.
5. **Storage policies** — private buckets, own-folder writes, signed reads.

## Admin UI visibility

- Sidebar items are rendered per role (BAs never reach the portal anyway —
  `/not-authorized`).
- The approval queue appears on *Brand Ambassadors* for elevated roles only.
- CSV export button links to a service route that requires a session, an
  elevated role, and passes `check_rate_limit`.

## Passwords & identity

- BAs authenticate with mobile number → internal alias e-mail
  (`<digits>@ba.fazoo.app`); staff use e-mail directly.
- Forgot-password: self-service reset (e-mail/SMS OTP when configured) or an
  administrator-triggered secure reset link via the service-role key.
- Change-password is self-serve from the Profile screen (`updateUser`).
- Minimum password length: 10 characters (see `PASSWORD_MIN_LENGTH`).

## Audit coverage

Every sensitive action lands in `audit_logs`: account status changes,
assignment upserts, log reopens, campaign/store/SKU DML (trigger), check-in /
checkout / sale / sick-leave RPCs (actor + context). Audit rows are
immutable (no UPDATE/DELETE policies) and readable by elevated roles within
their organization.
