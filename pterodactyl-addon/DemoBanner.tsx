import React, { useEffect, useState } from 'react';
import http from '@/api/http';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faEye,
  faLock,
  faSignOutAlt,
  faSpinner,
  faTimes,
  faChevronDown,
  faChevronUp,
  faExclamationCircle,
} from '@fortawesome/free-solid-svg-icons';

interface ExtendedWindow extends Window {
  PterodactylUser?: {
    email?: string;
    username?: string;
    is_demo?: boolean;
  };
}

export default function DemoBanner() {
  const win = typeof window !== 'undefined' ? (window as ExtendedWindow) : undefined;
  const user = win?.PterodactylUser;
  const isDemoUser = Boolean(
    user && (user.is_demo || (user.email || '').toLowerCase() === 'demo@gmail.com')
  );

  const [pathname, setPathname] = useState<string>(
    typeof window !== 'undefined' ? window.location.pathname : '/'
  );
  const [minimized, setMinimized] = useState<boolean>(false);
  const [loggingOut, setLoggingOut] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Track SPA route changes safely without requiring React Router context.
  useEffect(() => {
    if (!isDemoUser || typeof window === 'undefined') return;

    const syncPath = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', syncPath);
    window.addEventListener('hashchange', syncPath);
    const interval = window.setInterval(syncPath, 400);

    return () => {
      window.removeEventListener('popstate', syncPath);
      window.removeEventListener('hashchange', syncPath);
      window.clearInterval(interval);
    };
  }, [isDemoUser]);

  // Listen for blocked demo actions from both WebSocket shim and HTTP 403 responses.
  useEffect(() => {
    if (!isDemoUser || typeof window === 'undefined') return;

    let hideTimer: number | undefined;
    const showToast = (msg: string) => {
      setToastMessage(msg);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => setToastMessage(null), 4500);
    };

    const onDemoBlocked = (ev: Event) => {
      const detail = (ev as CustomEvent<{ message?: string }>).detail;
      showToast(detail?.message || 'This action is disabled in Demo Preview mode.');
    };

    window.addEventListener('arix:demo-blocked', onDemoBlocked);

    const interceptorId = http.interceptors.response.use(
      (resp) => resp,
      (error) => {
        const data = error?.response?.data;
        const isDemoError =
          error?.response?.status === 403 &&
          (Boolean(data?.demo_blocked) || data?.errors?.[0]?.code === 'DemoModeException');
        if (isDemoError) {
          const msg =
            data?.error ||
            data?.message ||
            data?.errors?.[0]?.detail ||
            'This action is disabled in Demo Preview mode.';
          showToast(msg);
        }
        return Promise.reject(error);
      }
    );

    return () => {
      window.removeEventListener('arix:demo-blocked', onDemoBlocked);
      http.interceptors.response.eject(interceptorId);
      if (hideTimer) window.clearTimeout(hideTimer);
    };
  }, [isDemoUser]);

  // Visually lock credential & profile forms when viewing /account as the demo user.
  useEffect(() => {
    if (!isDemoUser || !pathname.startsWith('/account') || typeof document === 'undefined') {
      return;
    }

    const protectedNames = new Set([
      'email',
      'password',
      'current',
      'confirmPassword',
      'username',
      'first_name',
      'last_name',
      'name_first',
      'name_last',
      'code',
      'description',
      'public_key',
    ]);

    const lockAccountForms = () => {
      const forms = document.querySelectorAll('form');
      forms.forEach((form) => {
        if (form.closest('[data-demo-banner="true"]')) return;
        const inputs = form.querySelectorAll('input, textarea, select');
        let hasProtectedInput = false;
        inputs.forEach((el) => {
          const name = (el.getAttribute('name') || '').trim();
          const type = (el.getAttribute('type') || '').toLowerCase();
          if (protectedNames.has(name) || type === 'password' || type === 'email') {
            hasProtectedInput = true;
          }
        });

        if (!hasProtectedInput) return;

        inputs.forEach((el) => {
          const inputEl = el as HTMLInputElement;
          inputEl.disabled = true;
          inputEl.readOnly = true;
          inputEl.title = 'Demo account credentials & profile fields are locked.';
          inputEl.classList.add('opacity-60', 'cursor-not-allowed');
        });

        const buttons = form.querySelectorAll('button');
        buttons.forEach((btn) => {
          btn.disabled = true;
          btn.title = 'Locked in Demo Preview mode.';
          btn.classList.add('opacity-50', 'cursor-not-allowed');
        });
      });
    };

    lockAccountForms();
    const observer = new MutationObserver(lockAccountForms);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [isDemoUser, pathname]);

  if (!isDemoUser) {
    return null;
  }

  const handleLogout = () => {
    if (loggingOut) return;
    setLoggingOut(true);
    http.post('/auth/logout').finally(() => {
      window.location.href = '/auth/login';
    });
  };

  const isAccountPage = pathname.startsWith('/account');

  return (
    <div data-demo-banner="true">
      {/* Floating notification toast when a blocked demo action is attempted */}
      {toastMessage && (
        <div
          role="alert"
          className="fixed top-5 right-5 z-[99999] max-w-sm bg-[#111827]/95 border border-amber-500/50 text-amber-100 rounded-xl shadow-2xl px-4 py-3 flex items-start gap-3 backdrop-blur-md"
        >
          <FontAwesomeIcon
            icon={faExclamationCircle}
            className="text-amber-400 text-base mt-0.5 shrink-0"
          />
          <div className="flex-1 text-xs leading-relaxed">
            <div className="font-bold text-amber-300 uppercase tracking-wider text-[10px] mb-0.5">
              Demo Preview Restriction
            </div>
            <div>{toastMessage}</div>
          </div>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-gray-400 hover:text-white p-0.5 transition-colors"
            aria-label="Dismiss demo notice"
          >
            <FontAwesomeIcon icon={faTimes} className="text-xs" />
          </button>
        </div>
      )}

      {/* Docked bottom-center Demo Preview pill / bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[99990] px-3 max-w-[95vw]">
        {minimized ? (
          <div className="flex items-center gap-2 bg-[#0d121c]/95 border border-sky-500/40 text-sky-100 rounded-full px-3.5 py-1.5 shadow-2xl backdrop-blur-md text-xs">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <span className="font-semibold">Demo Mode</span>
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="text-sky-300 hover:text-white ml-1"
              title="Expand demo bar"
            >
              <FontAwesomeIcon icon={faChevronUp} />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-3 bg-[#0d121c]/95 border border-sky-500/40 text-gray-100 rounded-2xl px-4 py-2.5 shadow-2xl backdrop-blur-md text-xs">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-300 font-bold tracking-wider uppercase text-[10px]">
              <FontAwesomeIcon icon={faEye} />
              <span>Demo Preview</span>
            </span>

            <span className="text-gray-200 flex items-center gap-1.5">
              <FontAwesomeIcon icon={faLock} className="text-amber-400 text-[11px]" />
              {isAccountPage ? (
                <span>
                  Account name, email, password &amp; security settings are locked in demo mode.
                </span>
              ) : (
                <span>
                  Signed in as <strong className="text-white">{user?.email || 'demo@gmail.com'}</strong> — Explore every panel feature (start &amp; edits locked).
                </span>
              )}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-red-600/90 hover:bg-red-500 text-white font-semibold transition-colors disabled:opacity-60 cursor-pointer"
              >
                <FontAwesomeIcon
                  icon={loggingOut ? faSpinner : faSignOutAlt}
                  className={loggingOut ? 'fa-spin' : ''}
                />
                <span>{loggingOut ? 'Signing out...' : 'Logout'}</span>
              </button>

              <button
                type="button"
                onClick={() => setMinimized(true)}
                className="p-1 text-gray-400 hover:text-white transition-colors"
                title="Minimize demo bar"
                aria-label="Minimize demo bar"
              >
                <FontAwesomeIcon icon={faChevronDown} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
