'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, Check, CheckCheck, Volume2, VolumeX, X } from 'lucide-react';
import { browserSupabase } from '@fazoo/database/browser';
import type { FazooClient } from '@fazoo/database';
import type { NotificationInbox, UserNotification } from '@fazoo/types';
import { openUserNotification } from '@/app/notification-actions';
import { armNotificationSound, playNotificationPing } from '@/lib/notification-sound';

const cursor = (n: UserNotification) => `${n.created_at}|${n.id}`;
export function NotificationBell({ userId }: { userId: string }) {
  const [items, setItems] = useState<UserNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sound, setSound] = useState(true);
  const [toast, setToast] = useState<UserNotification | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const client = useRef<FazooClient | null>(null);
  const initialized = useRef(false);
  const lastSeen = useRef('');
  const historyMode = useRef(false);
  const oldest = useRef<UserNotification | null>(null);
  const active = useRef(false);
  const sequence = useRef(0);
  const soundEnabled = useRef(true);
  const soundKey = `fazoo-notification-sound:${userId}`;
  const watermarkKey = `fazoo-notification-seen:${userId}`;
  const refresh = useCallback(
    async (older = false) => {
      if (!client.current || !active.current) return;
      const request = ++sequence.current;
      const before = older ? oldest.current : null;
      const { data, error: failure } = await client.current.rpc('notification_inbox', {
        p_before: before?.created_at ?? null,
        p_before_id: before?.id ?? null,
      });
      if (!active.current || request !== sequence.current) return;
      if (failure) {
        setError('Notifications could not refresh. Please try again.');
        return;
      }
      const inbox = data as unknown as NotificationInbox;
      setError('');
      setUnread(inbox.unread_count);
      setItems((previous) => {
        if (!older) return inbox.items;
        const merged = new Map(previous.map((n) => [n.id, n]));
        inbox.items.forEach((n) => merged.set(n.id, n));
        return [...merged.values()].sort((a, b) => cursor(b).localeCompare(cursor(a)));
      });
      oldest.current = inbox.items.at(-1) ?? null;
      setMore(inbox.has_more);
      historyMode.current = older;
      if (older) return;
      const newest = inbox.items[0];
      if (!newest) {
        initialized.current = true;
        return;
      }
      let shared = '';
      try {
        shared = localStorage.getItem(watermarkKey) || '';
      } catch {
        /* Device storage is optional. */
      }
      const watermark = [lastSeen.current, shared].sort().at(-1) || '';
      const fresh = inbox.items.find((n) => !n.read_at && cursor(n) > watermark);
      if (initialized.current && fresh) {
        setToast(fresh);
        if (soundEnabled.current) playNotificationPing();
      }
      initialized.current = true;
      lastSeen.current = [cursor(newest), watermark].sort().at(-1)!;
      try {
        localStorage.setItem(watermarkKey, lastSeen.current);
      } catch {
        /* Badge still updates. */
      }
    },
    [watermarkKey],
  );
  useEffect(() => {
    active.current = true;
    client.current = browserSupabase();
    try {
      soundEnabled.current = localStorage.getItem(soundKey) !== 'off';
    } catch {
      /* Default on. */
    }
    setSound(soundEnabled.current);
    const unlock = () => {
      if (soundEnabled.current) void armNotificationSound();
    };
    const visible = () => {
      if (
        document.visibilityState === 'visible' &&
        !(historyMode.current && dialog.current?.open)
      )
        void refresh();
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    const timer = window.setInterval(visible, 15000);
    void refresh();
    return () => {
      active.current = false;
      sequence.current++;
      window.clearInterval(timer);
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
    };
  }, [refresh, soundKey]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 6500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  async function markRead(ids: string[] | null) {
    if (!client.current || busy) return;
    setBusy(true);
    sequence.current++;
    try {
      const result = await client.current.rpc('notification_mark_read', {
        p_client_request_id: crypto.randomUUID(),
        p_notification_ids: ids,
      });
      if (result.error) {
        setError('Could not mark notifications as read. Please retry.');
        return;
      }
      setItems((previous) =>
        previous.map((n) =>
          ids === null || ids.includes(n.id)
            ? { ...n, read_at: n.read_at || new Date().toISOString() }
            : n,
        ),
      );
      await refresh();
    } finally {
      setBusy(false);
    }
  }
  async function open(n: UserNotification) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await openUserNotification(n.id, crypto.randomUUID());
      if (result.error || !result.href) {
        setError(result.error || 'Could not open notification.');
        return;
      }
      window.location.assign(result.href);
    } catch {
      setError('Could not open notification. Please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.current?.showModal();
          setToast(null);
          void refresh();
        }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-ink/10 bg-white text-ink hover:bg-primary/5"
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-primary px-1 text-center text-[10px] font-bold leading-5 text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>
      {toast ? (
        <div
          role="status"
          className="fixed bottom-24 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-primary/20 bg-white p-4 text-ink shadow-xl dark:bg-charcoal"
        >
          <button
            type="button"
            className="absolute right-2 top-2 min-h-8 min-w-8 text-muted"
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
          <p className="pr-7 text-sm font-semibold">{toast.title}</p>
          <p className="mt-1 text-xs text-muted">{toast.brand_name}</p>
          <button
            type="button"
            className="mt-2 min-h-9 text-sm font-semibold text-primary"
            onClick={() => {
              setToast(null);
              dialog.current?.showModal();
            }}
          >
            View notifications
          </button>
        </div>
      ) : null}
      <dialog
        ref={dialog}
        onClose={() => {
          historyMode.current = false;
          void refresh();
        }}
        aria-labelledby={`notifications-title-${userId}`}
        className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-ink/10 bg-white p-5 text-ink shadow-xl backdrop:bg-ink/35 dark:bg-charcoal"
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id={`notifications-title-${userId}`} className="text-lg font-semibold">
              Notifications
            </h2>
            <p className="text-xs text-muted" aria-live="polite">
              {unread} unread
            </p>
          </div>
          <button
            type="button"
            aria-label="Close notifications"
            className="flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-primary/5"
            onClick={() => dialog.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <div className="my-4 flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            aria-pressed={!onlyUnread}
            className="min-h-10 rounded-lg border border-ink/10 px-3"
            onClick={() => setOnlyUnread(false)}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={onlyUnread}
            className="min-h-10 rounded-lg border border-ink/10 px-3"
            onClick={() => setOnlyUnread(true)}
          >
            Unread
          </button>
          <button
            type="button"
            aria-label={sound ? 'Mute notification ping' : 'Enable notification ping'}
            aria-pressed={sound}
            className="ml-auto flex min-h-10 items-center gap-2 rounded-lg border border-ink/10 px-3"
            onClick={() => {
              const next = !sound;
              setSound(next);
              soundEnabled.current = next;
              try {
                localStorage.setItem(soundKey, next ? 'on' : 'off');
              } catch {
                /* Optional preference. */
              }
              if (next) void armNotificationSound().then(playNotificationPing);
            }}
          >
            {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}Ping {sound ? 'on' : 'off'}
          </button>
        </div>
        <div className="mb-3 flex items-center justify-between text-xs">
          <button
            type="button"
            className="min-h-10 text-primary"
            onClick={() => void refresh()}
          >
            Refresh
          </button>
          <button
            type="button"
            disabled={busy || !unread}
            className="flex min-h-10 items-center gap-1 text-primary disabled:opacity-40"
            onClick={() => void markRead(null)}
          >
            <CheckCheck size={15} />
            Mark all read
          </button>
        </div>
        {error ? (
          <p role="alert" className="mb-3 rounded-lg bg-primary/5 p-3 text-sm">
            {error}
          </p>
        ) : null}
        <ul className="space-y-2">
          {items
            .filter((n) => !onlyUnread || !n.read_at)
            .map((n) => (
              <li
                key={n.id}
                className={`flex rounded-xl border ${n.read_at ? 'border-ink/8' : 'border-primary/25 bg-primary/5'}`}
              >
                <button
                  type="button"
                  disabled={busy}
                  className="min-w-0 flex-1 p-3 text-left"
                  onClick={() => void open(n)}
                >
                  <p className="text-xs text-muted">
                    {n.brand_name}
                    {!n.read_at ? ' · Unread' : ''}
                  </p>
                  <p className="mt-1 text-sm font-semibold">{n.title}</p>
                  <p className="mt-1 text-xs text-muted">{n.body}</p>
                  <time dateTime={n.created_at} className="mt-2 block text-[10px] text-muted">
                    {new Date(n.created_at).toLocaleString('en-NG', {
                      timeZone: 'Africa/Lagos',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </time>
                </button>
                {!n.read_at ? (
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Mark ${n.title} as read`}
                    className="m-1 flex min-h-11 min-w-11 items-center justify-center self-start rounded-lg text-primary hover:bg-primary/10"
                    onClick={() => void markRead([n.id])}
                  >
                    <Check size={17} />
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
        {!items.some((n) => !onlyUnread || !n.read_at) ? (
          <p className="py-8 text-center text-sm text-muted">
            {onlyUnread
              ? 'You’re all caught up.'
              : 'No notifications yet. New activity will appear here.'}
          </p>
        ) : null}
        {more ? (
          <button
            type="button"
            disabled={busy}
            className="mt-4 min-h-11 w-full rounded-lg border border-ink/10 text-sm"
            onClick={() => void refresh(true)}
          >
            Load older notifications
          </button>
        ) : null}
      </dialog>
    </>
  );
}
