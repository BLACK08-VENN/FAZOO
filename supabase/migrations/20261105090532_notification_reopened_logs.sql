-- The account-review destination is an explicit approved local route.
alter table public.user_notifications drop constraint user_notifications_web_path_check;
alter table public.user_notifications add constraint user_notifications_web_path_check
 check(web_path ~ '^/(overview|workspace|brand|brand-ambassadors|campaigns|leave-requests|daily-logs|partners|booklists|service-desk)(/|[?]|$)');

create function private.notify_reopened_log() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if old.status='completed' and new.status='open' then
  perform private.notify_user(new.brand_ambassador_id,new.organization_id,
   'field-reopened:'||new.id::text||':'||gen_random_uuid()::text,'field.reopened',
   'Field log needs an update','An administrator reopened your field log. Please review it.',
   '/daily-logs/'||new.id::text,'/brand/logs',auth.uid());
 end if;
 return new;
end $$;
revoke all on function private.notify_reopened_log() from public,anon,authenticated;
create trigger notify_field_reopened after update of status on public.daily_logs
 for each row execute function private.notify_reopened_log();
