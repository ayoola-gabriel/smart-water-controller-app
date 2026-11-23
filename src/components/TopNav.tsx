import { Bluetooth, Cloud, Cpu, LayoutDashboard, History, Settings, Sliders, LogIn, LogOut } from 'lucide-react';
import type { AppUser } from '../types/controller';

export type AppScreen = 'auth' | 'devices' | 'dashboard' | 'controls' | 'history' | 'settings';

interface TopNavProps {
  activeScreen: AppScreen;
  onNavigate: (screen: AppScreen) => void;
  user: AppUser | null;
  offlineMode: boolean;
  onAuthAction: () => void;
  bleConnected: boolean;
  cloudOnline: boolean;
}

const NAV_ITEMS: Array<{ id: AppScreen; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'devices', label: 'Devices', icon: Cpu },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'controls', label: 'Controls', icon: Sliders },
  { id: 'history', label: 'History', icon: History },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function TopNav({
  activeScreen,
  onNavigate,
  user,
  offlineMode,
  onAuthAction,
  bleConnected,
  cloudOnline,
}: TopNavProps) {
  return (
    <>
      {/* Desktop & Mobile Top Header — Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-30 h-14 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-8">
          {/* Zone 1: Single-element Brand Wordmark */}
          <button
            type="button"
            onClick={() => onNavigate('dashboard')}
            className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 rounded"
          >
            Smart Water Controller
          </button>

          {/* Zone 2: Concise single-line text navigation links */}
          <nav aria-label="Primary navigation" className="hidden md:flex items-center gap-6">
            {NAV_ITEMS.map((item) => {
              const active = activeScreen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={active ? 'page' : undefined}
                  className={`py-1.5 text-sm font-medium whitespace-nowrap shrink-0 transition-colors border-b-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
                    active
                      ? 'border-sky-600 dark:border-sky-400 text-slate-900 dark:text-slate-100'
                      : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: 1 Primary Action */}
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onAuthAction}
              className="min-h-[40px] px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 inline-flex items-center gap-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
            >
              {user ? (
                <>
                  <LogOut className="w-4 h-4 text-slate-500 dark:text-slate-400" aria-hidden="true" />
                  <span>Sign out</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4 text-sky-600 dark:text-sky-400" aria-hidden="true" />
                  <span>{offlineMode ? 'Sign in' : 'Account'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Bottom Tab Bar — Fixed Thumb Zone <= 15% aggregate height */}
      <nav
        aria-label="Mobile navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 h-15 border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-950/95 backdrop-blur-md"
      >
        <div className="grid grid-cols-5 h-full">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeScreen === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-sky-600 ${
                  active
                    ? 'text-sky-600 dark:text-sky-400'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5" aria-hidden="true" />
                <span className="whitespace-nowrap">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Subtle mobile status context strip inside normal scroll flow (not sticky) */}
      <div className="md:hidden border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-4 py-1.5 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Bluetooth className={`w-3.5 h-3.5 ${bleConnected ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} aria-hidden="true" />
          <span>{bleConnected ? 'BLE Connected' : 'BLE Off'}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Cloud className={`w-3.5 h-3.5 ${cloudOnline ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'}`} aria-hidden="true" />
          <span>{cloudOnline ? 'Cloud Online' : 'Offline Mode'}</span>
        </span>
      </div>
    </>
  );
}
