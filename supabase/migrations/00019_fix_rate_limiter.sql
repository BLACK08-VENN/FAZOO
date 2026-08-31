-- ═══════════════════════════════════════════════════════════════════════════
-- Fazoo 00019 — Fix check_rate_limit window_start ambiguity on deployed DBs.
--
-- Deployments of this project (remote `lcptkprosdmprizvsgsp`) carry the
-- original definition of check_rate_limit from 00004, which SELECTs from
-- private.rate_limits where the variable declared in the PL/pgSQL `declare`
-- block shares its name with the table column: `window_start`, so the query
-- fails with `column reference "window_start" is ambiguous` and the rate
-- limiter silently never works.
--
-- Because 00004 is already recorded as applied on remote, the fix ships
-- here as an idempotent `create or replace`. Privileges are preserved by
-- `create or replace`; the grants are restated below for clarity.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql security definer set search_path = public, private as $$
declare window_start timestamptz; hits int; now_ts timestamptz := now();
begin
  select r.window_start, r.hit_count into window_start, hits
    from private.rate_limits r where r.key = p_key;

  if window_start is null or now_ts - window_start > make_interval(secs => p_window_seconds) then
    insert into private.rate_limits (key, window_start, hit_count)
    values (p_key, now_ts, 1)
    on conflict (key) do update set window_start = excluded.window_start,
                                    hit_count = 1;
    return true;
  end if;

  if hits >= p_max then
    return false;
  end if;

  update private.rate_limits set hit_count = hit_count + 1 where key = p_key;
  return true;
end;
$$;

grant execute on function public.check_rate_limit(text, int, int) to service_role;
grant execute on function public.check_rate_limit(text, int, int) to authenticated;