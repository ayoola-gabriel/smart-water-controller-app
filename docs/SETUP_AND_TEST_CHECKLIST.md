# Smart Water Controller — Setup Instructions & Manual Test Checklist

## 1. Security Architecture Overview

- **Firmware Account Isolation**: The ESP32 firmware authenticates using its own dedicated Supabase Auth user mapped in `public.device_registry`. Never embed the firmware user's email, password, refresh token, or any `service_role` key inside the web/mobile client bundle.
- **App User Accounts**: Each human operator signs in with their own Supabase Auth account (`email` + `password`).
- **Least-Privilege Access (`device_members` + RLS)**:
  - App users can only `SELECT` from `device_status`, `telemetry_history`, and `device_commands` for `device_id` values present in `public.device_members` where `user_id = auth.uid()`.
  - App users can **never** directly `INSERT`, `UPDATE`, or `DELETE` `device_status`, `telemetry_history`, or `device_commands`.
  - Remote commands are created exclusively by the `create-command` Edge Function after verifying the caller's JWT and confirming `role IN ('owner', 'operator')` in `device_members`.
- **BLE Security**:
  - BLE requires authenticated encrypted pairing (bonding) with a 6-digit passkey shown on the controller LCD.
  - Wi-Fi provisioning credentials are written only to characteristic `7c2e0005-7d5a-4f3b-9b2a-5c2d8f001001` over an active paired/bonded BLE session, are write-only (never readable back), and are never logged.

---

## 2. Supabase Setup Instructions

### Step A: Apply Database Migration
Run the migration in `supabase/migrations/20261122000000_smart_water_controller.sql` using the Supabase CLI or SQL Editor:

```bash
supabase db push
```

### Step B: Configure Supabase Auth
1. In the Supabase Dashboard, open **Authentication -> Providers -> Email** and enable Email/Password sign-in.
2. Under **Authentication -> URL Configuration**, add your production and local preview URLs to **Redirect URLs**.
3. Create the ESP32 firmware's dedicated Auth user (if not already present) and ensure `public.device_registry` maps `"swc-device-001"` to that firmware user's UUID.

### Step C: Associate App Users with Devices
After an app user creates an account (get their UUID from **Authentication -> Users**), assign them to `swc-device-001` in `public.device_members`:

```sql
insert into public.device_members (device_id, user_id, role, device_alias)
values (
  'swc-device-001',
  '<APP_USER_UUID>',
  'owner',
  'Main Overhead Tank'
)
on conflict (device_id, user_id) do update set role = excluded.role;
```

Roles:
- `owner` / `operator`: Can read status/history and issue remote commands via `create-command`.
- `viewer`: Can read status/history only (cannot issue remote commands).

### Step D: Deploy Edge Functions & Secrets
Set the server-side secrets (never exposed to the client):

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<your-service-role-key>"
supabase secrets set ALLOWED_ORIGINS="https://your-app-domain.example,http://localhost:3000,http://localhost:5173"
```

Deploy the three Edge Functions:

```bash
supabase functions deploy create-command
supabase functions deploy list-devices
```

### Step E: Client Environment Configuration
Configure only the public project URL and publishable/anon key in your client environment (`.env`):

```env
VITE_SUPABASE_URL="https://<your-project-ref>.supabase.co"
VITE_SUPABASE_ANON_KEY="<your-publishable-or-anon-key>"
```

On native mobile wrappers (Capacitor/Cordova), implement a Keychain/Keystore storage adapter for Supabase Auth session persistence rather than unencrypted storage.

---

## 3. Manual Test Checklist

### A. BLE Pairing & Offline Local Control
- [ ] Launch app with no internet connection and click **Continue without sign-in**.
- [ ] Verify local BLE discovery and controls remain accessible without requiring Supabase login.
- [ ] Open **Devices** -> initiate BLE pairing for **Smart Water Controller** (`7c2e0001-7d5a-4f3b-9b2a-5c2d8f001001`).
- [ ] When the phone's Bluetooth prompt asks for a passkey, enter the code shown on the controller LCD. The app does not display or request the code.
- [ ] Disconnect and reconnect; verify reconnection to the previously bonded controller succeeds cleanly.
- [ ] On **Dashboard**, verify real-time BLE notifications update water level %, `LOW`/`MID`/`FULL` flags, pump mode, reported pump state, temperature, current (`A`), and fault state.
- [ ] On **Controls**, select **MANUAL** -> **Pump ON**. Verify the confirmation dialog appears before sending `{"mode":"MANUAL","pump":true}` to characteristic `7c2e0003-...`.
- [ ] Verify **OFF** (`{"mode":"OFF"}`), **AUTO** (`{"mode":"AUTO"}`), and **Clear Fault** (`{"clearFault":true}`) write cleanly over BLE.

### B. Remote Monitoring & Control
- [ ] Sign in with an authorized app user account via Supabase Auth.
- [ ] Verify **Devices** lists `swc-device-001` with role, BLE state, Wi-Fi/cloud state, and last update timestamp.
- [ ] Switch to **Controls** -> **Remote Internet** and send **OFF**, then **AUTO**.
- [ ] Verify the app shows a simple sent/error message and the Dashboard updates from controller telemetry.
- [ ] Confirm the firmware and database still enforce command ID, timestamp, acknowledgement, replay, and expiry checks. These remain active for safe delivery but are not shown as app command sessions.
- [ ] Trigger a firmware interlock fault (e.g., `DRY_RUN_LOCKOUT` or `OVERCURRENT_TRIP`) and verify `MANUAL ON` is rejected/blocked and fault warning is prominently shown.

### C. Stale Data, Offline Gaps & Wi-Fi Provisioning
- [ ] Stop telemetry updates (simulate Wi-Fi loss or disconnect BLE) and wait past the stale threshold.
- [ ] Verify **Dashboard** displays the exact data age (never presenting cached telemetry as live) and raises a prominent stale-data warning banner.
- [ ] Open **History** and verify `telemetry_history` samples show time, water level, pump state, temperature, current, fault, **offline gap markers**, and **queued** sample badges.
- [ ] Open **Settings** -> **Wi-Fi Provisioning**. Verify credentials cannot be sent without an active paired BLE connection, are write-only to `7c2e0005-...`, cannot be read back, and never appear in logs or UI state after submission.

### D. Access Control Verification
- [ ] Attempt to insert directly into `device_commands` or `device_status` from the browser using the anon key + app user JWT -> confirm RLS blocks it with `403` / `42501`.
- [ ] Sign in as a second Supabase Auth user **not** listed in `device_members` for `swc-device-001` -> confirm `device_status`, `telemetry_history`, and `create-command` return empty / `403 Forbidden`.
- [ ] Sign in as a `viewer` member -> confirm read access succeeds while `create-command` returns `403 Forbidden`.
