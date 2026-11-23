# Smart Water Controller App

React/Vite control panel for local BLE access and remote Supabase monitoring/control of the ESP32 controller.

## Run locally

Prerequisites: Node.js 20.19+ or 22.12+.

1. Install dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the Supabase project's URL and public anon/publishable key. Leave `VITE_DEFAULT_DEVICE_ID=swc-device-001` unless your controller is configured with another ID.
4. Start the app with `npm run dev`.

The public Supabase key is intended for browser use and must be protected by row-level security and the deployed Edge Functions. Never put a `service_role` key or the ESP32 firmware account credentials in `.env.local`.

For database migration, Auth, Edge Function, membership, and BLE setup, follow [the setup checklist](docs/SETUP_AND_TEST_CHECKLIST.md).

## BLE browser support

BLE uses Web Bluetooth with the controller's service UUID. Use a supported Chromium browser in a secure context (HTTPS, or localhost during development) and allow Bluetooth access. Browser/OS pairing UI handles the controller's passkey. iOS Safari does not provide Web Bluetooth; use remote Supabase controls there or package the app with a native BLE bridge.