# PROJECT_CONTEXT.md — Al Faris Group Logistics Dashboard

> **Purpose**: Authoritative architecture reference for all future development.  
> **Stack**: Next.js 16 (App Router) · Supabase (PostgreSQL + Auth + Storage + Realtime) · TypeScript · TailwindCSS v4  
> **Company**: Al Faris Group — internal logistics management platform

---

## Table of Contents

1. [Repository Structure](#1-repository-structure)
2. [Next.js App Router Architecture](#2-nextjs-app-router-architecture)
3. [Supabase Database Schema](#3-supabase-database-schema)
4. [Authentication System](#4-authentication-system)
5. [Permission System](#5-permission-system)
6. [Organizations](#6-organizations)
7. [Drivers Module](#7-drivers-module)
8. [Fleet Module](#8-fleet-module)
9. [Shift Management](#9-shift-management)
10. [Notification System](#10-notification-system)
11. [Realtime Subscriptions](#11-realtime-subscriptions)
12. [Supporting Modules](#12-supporting-modules)
13. [Feature Module Pattern](#13-feature-module-pattern)
14. [Supabase Client Patterns](#14-supabase-client-patterns)
15. [Internationalisation](#15-internationalisation)
16. [Key Invariants & Conventions](#16-key-invariants--conventions)

---

## 1. Repository Structure

```
logistics-dashboard/          <- workspace root
└── logistics-dashboard/      <- actual Next.js project (npm run dev runs here)
    ├── app/                  <- Next.js App Router pages & layouts
    ├── components/           <- Shared React components
    ├── features/             <- Domain-feature modules (queries, actions, types)
    ├── lib/                  <- Cross-cutting infrastructure (auth, supabase)
    ├── types/                <- Global TypeScript types (database, locale, profile)
    ├── i18n/                 <- Translation dictionaries (ar / en)
    ├── config/               <- Static configuration
    ├── supabase/             <- Migrations (42 files), config.toml
    └── public/               <- Static assets
```

---

## 2. Next.js App Router Architecture

### Route Tree

```
app/
├── globals.css
├── favicon.ico
└── [locale]/                        <- Dynamic segment: "ar" | "en"
    ├── layout.tsx                   <- Root locale layout (sets HTML lang/dir, fonts)
    ├── (auth)/
    │   └── login/                   <- /ar/login, /en/login
    └── (dashboard)/
        └── dashboard/
            ├── layout.tsx           <- Dashboard shell (auth guard, org loader, notifications)
            ├── page.tsx             <- Dashboard home (redirect or summary)
            ├── organizations/
            │   ├── page.tsx         <- System-owner: list all organizations
            │   └── [organizationCode]/
            │       ├── page.tsx             <- Org overview/dashboard
            │       ├── drivers/
            │       │   ├── page.tsx         <- Driver list
            │       │   └── reports/         <- Daily Keeta reports
            │       ├── fleet/
            │       │   ├── cars/            <- Car fleet
            │       │   └── motorcycles/     <- Motorcycle fleet
            │       ├── fuel/                <- Fuel ledger & requests
            │       ├── shifts/
            │       │   ├── manage/          <- Shift template management
            │       │   └── calculation/     <- Shift calculation/reporting
            │       ├── app-requests/        <- Driver PWA requests inbox
            │       └── driver-warnings/     <- Driver warnings management
            ├── users/                       <- System-owner: user management
            └── fuel/                        <- Cross-org fuel view
```

### Key Routing Conventions

| Convention | Purpose |
|---|---|
| `[locale]` segment | All routes are prefixed with `ar` or `en`. Locale is validated in the layout. |
| `(auth)` route group | Auth pages — no dashboard shell/nav. |
| `(dashboard)` route group | All protected pages — wrapped in `DashboardShell`. |
| `[organizationCode]` segment | Every org-scoped page reads this to scope queries. |
| `export const dynamic = "force-dynamic"` | Dashboard layout always SSR (never cached). |

### Dashboard Layout Guard (`dashboard/layout.tsx`)

Every render of the dashboard layout:
1. Calls `getAuthenticatedAdmin()` — redirects to `/login` if not authorized.
2. Calls `getAccessibleOrganizationsForProfile()` — builds the org list with permissions.
3. Calls `getAppNotificationsForCurrentUser()` — loads unread notification count.
4. Renders `<DashboardShell>` passing user, organizations, and notifications as props.

### Server Actions

- All mutation logic lives in `features/<module>/actions.ts` with `"use server"` directive.
- Server Actions body limit is **60 MB** (for document uploads) — set in `next.config.ts`.
- Pattern: `async function someAction(_previousState, formData)` — used with `useActionState`.

---

## 3. Supabase Database Schema

### Core Enums

| Enum | Values |
|---|---|
| `app_role` | `system_owner`, `manager`, `supervisor`, `driver` |
| `account_status` | `active`, `suspended` |
| `driver_status` | `active`, `suspended` |
| `driver_vehicle_type` | `motorcycle`, `car` |
| `driver_document_type` | `iqama`, `driver_card`, `driving_license` |
| `driver_settlement_type` | settlement category for drivers |
| `organization_access_level` | `view`, `manage` |
| `driver_report_attendance_status` | `present`, `absent` |
| `driver_report_eligibility_status` | `eligible`, `not_eligible` |

### Core Tables

#### `profiles` (extends Supabase Auth `auth.users`)
| Column | Notes |
|---|---|
| `id` | FK to `auth.users.id` |
| `full_name` | |
| `role` | `app_role` enum |
| `job_title` | |
| `status` | `account_status` enum |
| `home_organization_id` | FK to `organizations.id` — affiliation only, not access |
| `deleted_at` | Soft-delete / archival |
| `must_change_password` | Forces password reset on next login |

#### `organizations`
| Column | Notes |
|---|---|
| `id` | UUID PK |
| `name` | Display name |
| `code` | Unique slug (pattern: `[a-z0-9_]{1,80}`) — used as URL segment |
| `is_active` | Boolean |

#### `organization_access`
| Column | Notes |
|---|---|
| `user_id` | FK to `profiles.id` |
| `organization_id` | FK to `organizations.id` |
| `access_level` | `view` or `manage` |

> **Critical distinction**: `profiles.home_organization_id` = real employment affiliation.  
> `organization_access` = additional cross-org visibility grants. They serve different purposes and must not be confused.

#### `organization_user_permissions`
| Column | Notes |
|---|---|
| `user_id` + `organization_id` + `permission_key` | Unique triple |
| `permission_key` | One of the 39 registered permission strings |
| `granted_by`, `updated_by` | Audit trail |

#### `activity_logs`
Append-only audit records for user lifecycle and permissions operations.  
Columns: `actor_user_id`, `target_user_id`, `organization_id`, `action`, `entity_type`, `entity_id`, `before_data`, `after_data`, `metadata`.

#### `drivers`
| Column | Notes |
|---|---|
| `organization_id` | Scoped to an organization |
| `auth_user_id` | Optional link to `auth.users.id` (for Driver PWA login) |
| `keeta_driver_id` | Visible login identifier for Driver App (globally unique) |
| `keeta_username` | Keeta platform display name |
| `iqama_number` | Globally unique |
| `status` | `driver_status` enum |
| `deleted_at` | Soft-delete |
| `vehicle_type`, `vehicle_number` | Basic vehicle fields |
| `keeta_vehicle_plate_number`, `vehicle_serial_number` | Extended vehicle fields |
| `driving_license_number`, `driving_license_expiry_date` | |
| `iqama_expiry_date`, `driver_card_expiry_date`, `vehicle_authorization_expiry_date` | Expiry tracking |
| `operating_card_number`, `operating_card_expiry_date` | |
| `settlement_type`, `is_vehicle_owner`, `is_company_sponsored` | Employment/ownership |

#### `driver_bank_details`
One-to-one with `drivers`. IBAN, bank name, account number (optional).

#### `driver_documents`
Stores document metadata (not file content). Files live in Supabase Storage.  
Types: `iqama`, `driver_card`, `driving_license`. One row per driver/type (unique).

#### `fleet_vehicles`
| Column | Notes |
|---|---|
| `organization_id` | Scoped |
| `vehicle_category` | `car` or `motorcycle` |
| `plate_number` / `normalized_plate_number` | Active uniqueness per org |
| `owner_source` | `organization` (FK) or `manual` (free text) |
| `assigned_driver_source` | `none`, `organization_driver`, or `manual` |
| `authorized_person_source` | Same three options |
| `operational_status` | `active` or `suspended` |
| `technical_status` | `healthy`, `fault`, or `accident` |
| `fault_location` | `parked` or `in_maintenance` (only when `fault`) |
| `archived_at` | Soft-delete |

#### `fleet_vehicle_activity_logs`
Actions: `vehicle_created`, `vehicle_updated`, `vehicle_suspended`, `vehicle_reactivated`, `vehicle_archived`, `vehicle_restored`, `assigned_driver_changed`, `authorized_person_changed`, `technical_status_changed`, `operating_card_changed`.

#### `driver_shifts` (Driver PWA odometer sessions)
| Column | Notes |
|---|---|
| `driver_id`, `organization_id` | Scoped |
| `vehicle_id` | Optional FK (snapshot also stored in `vehicle_plate_snapshot`) |
| `status` | `open`, `completed`, `cancelled` |
| `start_odometer_reading`, `end_odometer_reading` | Bigint, KM |
| `start_photo_path`, `end_photo_path` | Paths in `driver-odometer` Storage bucket |

> Unique constraint: only one `open` shift per driver at a time.

#### `organization_shift_templates` (Admin-managed work shifts)
Separate from `driver_shifts`. These are admin-defined recurring shift patterns.
| Column | Notes |
|---|---|
| `organization_id` | Scoped |
| `name` | e.g. "Morning Shift" |
| `start_time`, `end_time` | `time` columns |
| `crosses_midnight` | Auto-computed by trigger |
| `has_break`, `break_start_time`, `break_end_time` | Optional break window |
| `is_active`, `archived_at` | Lifecycle |

#### `organization_shift_assignments`
Assigns drivers to shift templates with optional date ranges.  
Unique: one active assignment per (driver, shift_template).

#### `driver_app_requests`
Driver PWA requests submitted to managers.

| Field | Values |
|---|---|
| `request_type` | `leave`, `maintenance`, `meeting`, `oil_change` |
| `status` | `pending`, `approved`, `rejected`, `completed`, `cancelled` |

#### `driver_daily_reports` + `driver_daily_report_rows`
Daily Keeta performance snapshots imported by managers.  
Unique: one report per (org, date). Each row = one driver's daily metrics.

#### `fuel_increase_requests`
Driver requests for extra fuel quota.  
Status: `pending`, `approved`, `rejected`, `cancelled`.

#### `fuel_transactions`
Internal fuel ledger. Types: `opening` (baseline), `increase` (top-up).

#### `driver_warnings`
| Column | Notes |
|---|---|
| `category` | `attendance`, `behavior`, `compliance`, `documentation`, `performance`, `safety`, `vehicle_care`, `other` |
| `severity` | `low`, `medium`, `high` |
| `status` | `active`, `revoked` |
| `driver_seen_at` | Acknowledgement timestamp from Driver PWA |

#### `app_notifications`
In-app notification records.
| Column | Notes |
|---|---|
| `recipient_user_id` | FK to `profiles.id` |
| `organization_id` | Optional scope |
| `type` | e.g. `driver_app_request_submitted`, `driver_app_request_approved` |
| `event_key` | Unique — prevents duplicate notifications (idempotency) |
| `entity_type`, `entity_id` | Polymorphic link to the triggering entity |
| `is_read`, `read_at` | Read-state tracking |

> Realtime: added to `supabase_realtime` publication (`replica identity full`).

### Storage Buckets

| Bucket | Access | Purpose |
|---|---|---|
| `driver-documents` | Private | Driver identity documents (iqama, driver card) |
| `driver-odometer` | Private | Odometer photo captures from Driver PWA |
| `driver-avatars` | Private | Driver profile photos |
| `fleet-documents` | Private | Operating card files for fleet vehicles |

### Key RLS Functions (Security Definer)

| Function | Purpose |
|---|---|
| `is_system_owner()` | Returns true if `auth.uid()` is an active `system_owner` |
| `can_view_organization(uuid)` | Returns true if current user can see this org |
| `can_manage_organization(uuid)` | Returns true if current user can write to this org |
| `has_organization_permission(user_id, org_id, key)` | Checks `organization_user_permissions` table |

---

## 4. Authentication System

### Two Distinct User Types

| Type | Role | Login Method |
|---|---|---|
| **Admin users** | `system_owner`, `manager`, `supervisor` | Email + Password via Supabase Auth |
| **Driver users** | `driver` | Keeta Driver ID + Password via Supabase Auth (internal email generated server-side) |

### Admin Authentication Flow

1. `features/auth/actions.ts` — `signInAction` Server Action:
   - `supabase.auth.signInWithPassword({ email, password })`
   - `getProfileForUser()` -> `validateAdminProfile()`
   - Blocks: `driver` role, `suspended`/`deleted_at` profiles
   - On success -> `redirect(/${locale}/dashboard)`
2. Session stored in HTTP-only cookie by `@supabase/ssr`.
3. `lib/supabase/update-session.ts` — middleware refreshes the session on every request.

### Authorization Helpers (`lib/auth/authorization.ts`)

```typescript
// Roles that can access the Admin Dashboard
const adminRoles = new Set(["system_owner", "manager", "supervisor"]);

// Main guard used in every Server Action and Server Component
async function getAuthenticatedAdmin(): Promise<AdminAuthorizationResult>

// For system-owner-only operations
async function requireSystemOwner()
```

`AdminAuthorizationResult` statuses:
- `authorized` — includes `user`, `profile`, `supabase`
- `unauthenticated` — not logged in
- `missing_profile` — no matching profile row
- `suspended` — `status !== 'active'` or `deleted_at` is set
- `driver` — role is `driver`
- `unexpected` — unknown role

### Driver App Authentication

- Drivers log in via their `keeta_driver_id` (visible identifier).
- Server generates an internal `@internal.alfaris.app` email.
- Supabase Auth handles password storage.
- Profile row for driver has `role = 'driver'` and `must_change_password` flag.
- Driver must change temporary password before any data access.

---

## 5. Permission System

### Two Layers

**Layer 1: Global Role** (`profiles.role`)
- `system_owner` — full access to everything, no permission checks needed
- `manager` — org-scoped with granular permissions
- `supervisor` — org-scoped with granular permissions

**Layer 2: Per-Organization Permissions** (`organization_user_permissions`)
- 39 registered permission keys stored in `features/permissions/registry.ts`
- One row per (user, organization, permission_key)

### Permission Key Groups

| Group | Keys |
|---|---|
| `organization` | `organization.dashboard.view` |
| `drivers` | `drivers.view`, `.create`, `.update`, `.status`, `.archive`, `.documents.view`, `.documents.download`, `.activity.view`, `.account.manage` |
| `driver_reports` | `driver_reports.view`, `.import`, `.replace`, `.details.view` |
| `fleet` | `fleet.cars.view`, `fleet.motorcycles.view`, `.create`, `.update`, `.technical_status`, `.operational_status`, `.archive`, `.operating_card.download`, `.activity.view` |
| `fuel` | `fuel.manage`, `.reports.view`, `.increase.review` |
| `app_requests` | `app_requests.view`, `.review`, `odometer.manage` |
| `driver_warnings` | `driver_warnings.view`, `.issue`, `.revoke` |
| `shifts` | `shifts.view`, `.create`, `.update`, `.assign`, `.archive` |
| `notifications` | `notifications.view` |

### Permission Dependencies

`applyPermissionDependencies()` in `registry.ts` enforces automatic escalation:
- Any `drivers.*` write key -> automatically adds `drivers.view`
- Any `driver_reports.*` write key -> automatically adds `driver_reports.view`
- `fuel.manage` or `fuel.increase.review` -> adds `fuel.reports.view`
- `app_requests.review` -> adds `app_requests.view`
- Any `driver_warnings.*` write key -> adds `driver_warnings.view`
- Any `shifts.*` write key -> adds `shifts.view`

### Server-Side Permission Check

```typescript
// features/permissions/server.ts
async function getOrganizationPermissionsForCurrentUser(organizationId: string)
async function hasOrganizationPermission({ organizationId, permissionKey })
async function getAccessibleOrganizationNavigation(permissions: Set<...>)
```

- `system_owner` short-circuits all checks (returns full permission set).
- Others are read from `organization_user_permissions`.

### Navigation Permissions Object

```typescript
type OrganizationNavigationPermissions = {
  organizationHome, drivers, driverReports, fleetCars, fleetMotorcycles,
  fuelManagement, fuelReports, appRequests, notifications,
  odometerManagement, driverWarnings, shifts
}
```

Built and passed to the `DashboardShell` to show/hide sidebar links.

---

## 6. Organizations

### Accessible Organization Model

```typescript
type AccessibleOrganization = {
  id: string;
  name: string;
  code: string;             // URL slug
  accessLevel: "view" | "manage";
  isHomeOrganization: boolean;
  isSystemOwnerAccess: boolean;
  permissionKeys: OrganizationPermissionKey[];
  navigation: OrganizationNavigationPermissions;
}
```

### Organization Access Resolution

`features/organizations/queries.ts` — `getAccessibleOrganizationsForProfile()`:

1. **system_owner**: reads all active organizations from DB — gets full `manage` + all permission keys.
2. **manager / supervisor**: reads `organization_access` + `organization_user_permissions` rows -> merges into list.
3. Home organization sorts first; others sort alphabetically (Arabic/English aware).
4. Organizations the user has no access or permission rows for are excluded.

### URL Pattern

`/[locale]/dashboard/organizations/[organizationCode]/[section]`

`[organizationCode]` validated against pattern `^[a-z0-9_]{1,80}$` and must be in the user's accessible organizations — otherwise 404.

---

## 7. Drivers Module

### Feature Files

| File | Contents |
|---|---|
| `features/drivers/service.ts` (58 KB) | Core CRUD, document management, account linking |
| `features/drivers/actions.ts` (32 KB) | Server Actions wrapping service |
| `features/drivers/queries.ts` | List/detail fetches |
| `features/drivers/types.ts` | All TypeScript types |
| `features/drivers/validation.ts` | Zod-like field validation |
| `features/drivers/storage.ts` | Supabase Storage helpers for documents |
| `features/drivers/expiry.ts` | Document expiry calculation utilities |
| `features/drivers/login-identifiers.ts` | Keeta driver ID management |

### Driver Record Data Model

Key fields:
- Personal: `full_name`, `nationality`, `mobile_number`, `iqama_number`
- Vehicle: `vehicle_type` (motorcycle/car), `vehicle_number`, `keeta_vehicle_plate_number`, `vehicle_serial_number`, `vehicle_brand`
- Keeta platform: `keeta_username`, `keeta_driver_id`
- Documents with expiry: iqama, driving license, driver card, vehicle authorization, operating card
- Employment: `is_company_sponsored`, `is_vehicle_owner`, `settlement_type`
- Driver App: `auth_user_id` (nullable, links to Supabase Auth)

### Driver App Account Linking

Status types:
- `not_linked` — no `auth_user_id`
- `active` — linked and can log in
- `suspended` — linked but profile `status = 'suspended'`
- `password_change_required` — `must_change_password = true`

Account creation creates a Supabase Auth user server-side using the Admin client, then links it by setting `drivers.auth_user_id`.

### Document Expiry Alerts

`features/notifications/queries.ts` — `getDriverExpiryAlertsForOrganizations()`:
- Checks 5 document types: iqama, driving_license, driver_card, vehicle_authorization, operating_card
- Severity: `expired` (< 0 days), `expires_today` (0 days), `urgent` (<= 3 days), `warning` (<= 10 days)
- Filters out documents expiring in > 10 days

### Driver Warnings

`driver_warnings` table — categories: attendance, behavior, compliance, documentation, performance, safety, vehicle_care, other.  
Severity: low, medium, high.  
Status: active -> revoked. Revocation requires a reason.  
`driver_seen_at` is set by the Driver PWA when the driver acknowledges the warning.

---

## 8. Fleet Module

### Feature Files

| File | Contents |
|---|---|
| `features/fleet/service.ts` (19 KB) | Vehicle CRUD, status changes, archive |
| `features/fleet/actions.ts` (9 KB) | Server Actions |
| `features/fleet/queries.ts` (7 KB) | List/detail with driver options |
| `features/fleet/types.ts` | TypeScript types |

### Vehicle Data Model

- Category: `car` or `motorcycle` (separate sidebar entries)
- Owner source: `organization` (FK to another org) or `manual` (free text name)
- Assigned driver source: `none`, `organization_driver` (FK), or `manual` (name + iqama)
- Authorized person source: same three options
- Technical status: `healthy`, `fault` (requires `fault_location`), `accident`
- Fault location: `parked` or `in_maintenance`
- Operational status: `active` or `suspended`
- Plate uniqueness: enforced by partial unique index on `normalized_plate_number` where `archived_at IS NULL`

### Activity Logging

Every mutation writes to `fleet_vehicle_activity_logs` with `old_values` / `new_values` JSONB snapshots.

---

## 9. Shift Management

### Two Separate Systems (Important!)

| System | Table | Purpose |
|---|---|---|
| **Driver PWA odometer sessions** | `driver_shifts` | Driver starts/ends their work day, capturing odometer photos |
| **Admin shift templates** | `organization_shift_templates` + `organization_shift_assignments` | Admin-defined recurring shift schedules assigned to drivers |

### Driver PWA Shifts (`driver_shifts`)

- Created/ended via `SECURITY DEFINER` RPC functions: `start_driver_shift()`, `end_driver_shift()`
- Only one `open` shift per driver at a time (partial unique index)
- Photos stored in `driver-odometer` bucket (path format: `{auth_user_id}/{uuid}/{filename}.jpg`)
- OCR audit table (`driver_shift_ocr_audit`) stores raw OCR readings vs submitted readings

### Admin Shift Templates

- Templates define: name, start/end time, break window, `crosses_midnight` flag (auto-computed by trigger)
- Assignments link a driver to a template with optional date range
- One active assignment per (driver, template) enforced by partial unique index
- Permissions: `shifts.view`, `.create`, `.update`, `.assign`, `.archive`

### Shift Actions (`features/shifts/actions.ts`)

- `saveShiftTemplateAction` — create or update a template
- `archiveShiftTemplateAction` — archive template and deactivate all its assignments
- `saveShiftAssignmentAction` — assign/unassign a driver
- `archiveShiftAssignmentAction` — deactivate a single assignment

---

## 10. Notification System

### Two Notification Types

| Type | Source | Storage |
|---|---|---|
| **In-app notifications** (`app_notifications`) | Database triggers on `driver_app_requests` | Persistent DB rows |
| **Driver expiry alerts** | Computed on-demand from `drivers` expiry dates | Not stored, computed per request |

### In-App Notification Triggers (Database Level)

**`notify_driver_app_request_submitted`** (AFTER INSERT on `driver_app_requests`):
- Finds all active non-driver profiles with `notifications.view` + `app_requests.view` permissions for the org.
- Creates one `app_notifications` row per recipient.
- Uses `event_key = 'driver_app_request:{id}:submitted:{recipient_id}'` for idempotency.

**`notify_driver_app_request_reviewed`** (AFTER UPDATE OF status):
- Fires when status changes to `approved` or `rejected`.
- Notifies the driver's own Auth user.
- Event key: `'driver_app_request:{id}:{status}:{driver_auth_user_id}'`

### Notification Enrichment

`getAppNotificationsForCurrentUser()` enriches raw rows with:
- Organization name/code (for display and linking)
- Request type and status (for contextual messages)
- Driver name (for admin-facing notifications)

### Read State

- `app_notifications.is_read` + `read_at` — updated by RLS-scoped UPDATE policy.
- Only the recipient (`recipient_user_id = auth.uid()`) can mark their own notifications as read.

---

## 11. Realtime Subscriptions

### Published Tables

The following tables are added to `supabase_realtime` publication:

| Table | Added In Migration |
|---|---|
| `driver_app_requests` | `20260801203000` |
| `app_notifications` | `20260801203000` |
| `organization_shift_templates` | `20260805120000` |
| `organization_shift_assignments` | `20260805120000` |

All use `REPLICA IDENTITY FULL` on `app_notifications` so the full row is available in the change event.

### Client-Side Subscription Component

`components/dashboard/realtime-refresh.tsx` — `<RealtimeRefresh>`:

```typescript
// Subscribes to postgres_changes events on a table (with optional filter)
// On any change: calls router.refresh() to re-fetch Server Component data
// Displays a toast notification for 2.8 seconds
// Supported tables: driver_app_requests, app_notifications, driver_warnings,
//                  organization_shift_templates, organization_shift_assignments
```

Usage pattern:
```tsx
<RealtimeRefresh
  channelName="unique-channel-name"
  table="driver_app_requests"
  filter={`organization_id=eq.${organizationId}`}
  toast="New request received"
  enabled={hasPermission}
/>
```

### Client Supabase Instance

`lib/supabase/client.ts` — `createClient()` returns a browser-side Supabase client using the anon key. Used exclusively for Realtime subscriptions (all data queries are server-side).

---

## 12. Supporting Modules

### Driver Reports Module

- Imports daily Keeta platform performance data (Excel/CSV) via `driver_reports.import` permission.
- Tables: `driver_daily_reports` (one per org/date), `driver_daily_report_rows` (one per driver/day).
- Metrics per row: attendance_status, accepted/delivered/rejected tasks, valid_online_seconds, delivery_rate, city_ranking, region_ranking.
- Unmatched IDs (no matching driver) are tracked in arrays on the parent report row.

### Fuel Management Module

Tables:
- `fuel_increase_requests` — driver requests for extra fuel (reviewed by manager).
- `fuel_transactions` — internal ledger: `opening` (initial allocation) + `increase` (top-up).

One opening transaction per (org, driver, date). One increase per approved request.

### App Requests Module (`driver_app_requests`)

Types: `leave`, `maintenance`, `meeting`, `oil_change`  
Status flow: `pending` -> `approved` / `rejected` -> `completed` / `cancelled`  
The `reviewed_by` + `reviewed_at` + `review_note` fields are set on status change.  
The `completed_by` + `completed_at` fields are set when an approved request is physically completed.

Idempotency key (migration `20260803150000`): prevents duplicate submissions from the Driver PWA.

### User Management Module

System-owner-only. Creates/manages admin accounts (manager, supervisor roles).  
Service functions call the Admin Supabase client then `create_managed_user_profile()` RPC.  
Supports: create, suspend, reactivate, delete (soft), reset password, manage org access.

---

## 13. Feature Module Pattern

Every feature follows a consistent structure:

```
features/<module>/
├── actions.ts      "use server" — thin wrappers that validate permissions, call service/queries
├── queries.ts      "server-only" — pure read queries returning typed results
├── service.ts      "server-only" — complex business logic, uses Admin client for mutations
├── types.ts        TypeScript types and discriminated unions
├── validation.ts   Input validation logic
└── storage.ts      Supabase Storage helpers (if module uses file uploads)
```

### Layering Rules

1. **Pages** -> call `queries.ts` or `actions.ts`
2. **Actions** -> validate auth/permissions -> call `service.ts`
3. **Service** -> use `createAdminClient()` for mutations (bypasses RLS with service_role key)
4. **Queries** -> use `createClient()` (server session, respects RLS)

---

## 14. Supabase Client Patterns

### Three Client Types

| Client | File | Auth | When To Use |
|---|---|---|---|
| **Server client** | `lib/supabase/server.ts` | Cookie-based session | All server-side reads respecting RLS |
| **Admin client** | `lib/supabase/admin.ts` | Service role key | Mutations that must bypass RLS (user creation, etc.) |
| **Browser client** | `lib/supabase/client.ts` | Anon key | Realtime subscriptions only |

### Admin Client Warning

`createAdminClient()` uses `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`.  
It is marked `"server-only"` and must **never** be used in Client Components.  
It bypasses all RLS — only use when you have already validated permissions in application code.

---

## 15. Internationalisation

### Locales

- `ar` (Arabic, RTL) — default
- `en` (English, LTR)

### Directory Structure

```
i18n/
├── dictionaries.ts     <- Type-safe dictionary loader (getDictionary(locale))
├── ar.ts               <- Arabic translations
└── en.ts               <- English translations
```

### Usage Pattern

```typescript
const dict = getDictionary(locale);  // Synchronous, import-based
// Used in Server Components, Server Actions, and passed as props to Client Components
```

### Font Setup

- **Cairo** (`--font-cairo`) — Arabic + Latin subsets, weights 400-800. Primary UI font.
- **Geist Mono** (`--font-geist-mono`) — Latin only. Code/mono displays.

---

## 16. Key Invariants & Conventions

### Database

1. **Never trust `home_organization_id` for access control.** Access is determined exclusively by `organization_access` + `organization_user_permissions` rows (and `system_owner` role bypass).
2. **All mutations go through the Admin client** in `service.ts` files. Read queries use the Server client.
3. **Soft-delete everywhere** via `deleted_at` column (never hard-delete drivers, profiles, etc.).
4. **All timestamps are UTC** stored as `timestamptz` with `timezone('utc', now())`.
5. **`event_key` uniqueness** in `app_notifications` prevents duplicate notifications.

### Application

6. **`getAuthenticatedAdmin()`** is called at the start of every Server Action and sensitive Server Component.
7. **`system_owner`** role bypasses all organization permission checks — no explicit permission rows needed.
8. **`must_change_password = true`** blocks Driver App access until password is changed.
9. **`RealtimeRefresh` triggers `router.refresh()`** — Supabase Realtime + Next.js server re-render is the live update pattern (no client state management library used).
10. **Server Actions body limit is 60 MB** to support document uploads.
11. **Permission dependencies are enforced in code** (`applyPermissionDependencies()`) at the time of granting permissions, not at read time.

### Route/URL

12. All routes are locale-prefixed: `/ar/...` or `/en/...`.
13. Organization code in URL must match `^[a-z0-9_]{1,80}$` and must be in the user's accessible organizations.
14. Dashboard layout forces SSR (`dynamic = "force-dynamic"`) — no page-level caching.

---

## Migration Timeline Summary

| Date | Migration | What It Added |
|---|---|---|
| 2026-07-25 | Foundation | `organizations`, `organization_access`, `profiles.home_organization_id`, core RLS helpers |
| 2026-07-25 | Initial orgs | Seed data for organizations |
| 2026-07-25 | Secure user creation | `create_managed_user_profile()` RPC |
| 2026-07-25 | User lifecycle | `activity_logs`, soft-delete, `deleted_at` |
| 2026-07-26 | Drivers foundation | `drivers`, `driver_bank_details`, `driver_documents`, RLS |
| 2026-07-26 | Driver extensions | `keeta_driver_id`, `driving_license`, vehicle registration, settlement fields |
| 2026-07-26 | Driver lifecycle | Audit trail, status management |
| 2026-07-26 | Driver reports | `driver_daily_reports`, `driver_daily_report_rows` |
| 2026-07-27 | Report ranking | Ranking details columns in report rows |
| 2026-07-28 | Driver banking | Optional bank details |
| 2026-07-28 | Fleet module | `fleet_vehicles`, `fleet_vehicle_activity_logs` |
| 2026-07-28 | Granular permissions | `organization_user_permissions`, `has_organization_permission()` |
| 2026-07-29 | Driver App auth | `drivers.auth_user_id`, `must_change_password`, internal email scheme |
| 2026-07-29 | Driver App shifts | `driver_shifts`, `driver-odometer` bucket, `start_driver_shift()` / `end_driver_shift()` RPC |
| 2026-07-30 | Fuel management | `fuel_increase_requests`, `fuel_transactions` |
| 2026-07-30 | App requests | `driver_app_requests`, `app_requests.*` permissions |
| 2026-08-01 | Manual review | Shift OCR audit, manual review fields |
| 2026-08-01 | Realtime notifications | `app_notifications`, DB triggers, Realtime publication |
| 2026-08-02 | Driver warnings | `driver_warnings`, `driver_warnings.*` permissions |
| 2026-08-03 | Request idempotency | Idempotency key on app requests |
| 2026-08-03 | Iqama login | Iqama number as alternative Driver App login identifier |
| 2026-08-03 | Meeting manager | Manager selector for meeting requests |
| 2026-08-05 | Org shift management | `organization_shift_templates`, `organization_shift_assignments`, `shifts.*` permissions |
| 2026-08-06 | Explicit permissions | `home_organization_id` no longer implies access; all access is explicit via permission rows |
