import { useState } from 'react';
import { Bluetooth, Lock, Mail, ShieldCheck, AlertCircle, WifiOff } from 'lucide-react';
import { isSupabaseConfigured, signInAppUser, signUpAppUser } from '../lib/supabaseClient';
import type { AppUser } from '../types/controller';

interface AuthScreenProps {
  onAuthenticated: (user: AppUser) => void;
  onContinueOfflineBle: () => void;
}

export function AuthScreen({ onAuthenticated, onContinueOfflineBle }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const supabaseReady = isSupabaseConfigured();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (!supabaseReady) {
      setError('Remote sign-in is not configured. Use nearby Bluetooth access or configure the Supabase app settings.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signin') {
        const user = await signInAppUser(trimmedEmail, password);
        onAuthenticated(user);
      } else {
        const res = await signUpAppUser(trimmedEmail, password);
        if (res.confirmationRequired) {
          setNotice('Account created. Check your inbox to confirm your email before signing in.');
          setMode('signin');
        } else if (res.user) {
          onAuthenticated(res.user);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        {/* Left: Operational Context & Offline BLE Assurance */}
        <section className="lg:col-span-6 p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-between gap-6">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400">
              ESP32 Tank Telemetry & Pump Control
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 text-balance">
              Local BLE precision with zero-trust cloud control
            </h1>
            <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed">
              Monitor tank water levels, motor current, temperature, and safety interlocks from anywhere via Supabase, or connect directly over encrypted Bluetooth Low Energy when on site.
            </p>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-start gap-3">
              <WifiOff className="w-5 h-5 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Works completely offline via BLE
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  No internet connection or cloud login is required to discover, pair, monitor, or control a nearby controller over Bluetooth.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Isolated app-user authentication
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 leading-relaxed">
                  Remote access uses your personal Supabase Auth account verified server-side against assigned devices. Firmware credentials never touch this app.
                </p>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              onClick={onContinueOfflineBle}
              className="w-full min-h-[48px] px-5 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm font-semibold inline-flex items-center justify-center gap-2.5 transition-colors"
            >
              <Bluetooth className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
              <span>Continue without sign-in (nearby Bluetooth)</span>
            </button>
          </div>
        </section>

        {/* Right: Supabase Auth Form */}
        <section className="lg:col-span-6 p-6 sm:p-8 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col justify-center">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-100">
              {mode === 'signin' ? 'Sign in for remote access' : 'Create operator account'}
            </h2>
            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setMode('signin');
                  setError(null);
                }}
                className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  mode === 'signin'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                }}
                className={`min-h-[36px] px-3 py-1 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  mode === 'signup'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Create account
              </button>
            </div>
          </div>

          {!supabaseReady && (
            <div className="mb-4 p-3 rounded-lg border border-amber-200 dark:border-amber-800/80 bg-amber-50 dark:bg-amber-950/40 text-xs text-amber-900 dark:text-amber-200 leading-relaxed">
              Remote access is not configured. Nearby Bluetooth monitoring and control are still available without an account.
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="mb-4 p-3 rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/50 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mb-4 p-3 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-xs text-emerald-800 dark:text-emerald-200"
            >
              {notice}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="auth-email" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  placeholder="operator@facility.org"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-sky-600"
                />
              </div>
            </div>

            <div>
              <label htmlFor="auth-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:outline-2 focus:outline-sky-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={busy || !supabaseReady}
              className="w-full min-h-[48px] px-5 py-3 rounded-lg bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
            >
              {busy
                ? 'Authenticating…'
                : mode === 'signin'
                ? 'Sign in to Remote Cloud'
                : 'Create App Account'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
