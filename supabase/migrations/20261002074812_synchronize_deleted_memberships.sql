CREATE OR REPLACE FUNCTION public.profiles_sync_primary_membership()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_primary record; v_user_id uuid;
begin
  v_user_id := case when TG_OP='DELETE' then OLD.user_id else NEW.user_id end;
  select m.organization_id, m.role, m.account_status, m.id as membership_id
    into v_primary
    from public.organization_memberships m
    where m.user_id = v_user_id
    order by
      case when m.account_status = 'approved' then 0 else 1 end,
      m.updated_at desc
    limit 1;
  if v_primary is not null then
    perform set_config('fazoo.membership_sync', 'true', true);
    insert into public.profiles
      (id, organization_id, full_name, phone, role, account_status, current_membership_id)
    values
      (v_user_id, v_primary.organization_id,
       coalesce((select full_name from public.profiles where id = v_user_id), ''),
       coalesce((select phone from public.profiles where id = v_user_id), ''),
       v_primary.role, v_primary.account_status, v_primary.membership_id)
    on conflict (id) do update
      set organization_id = v_primary.organization_id,
          role = v_primary.role,
          account_status = v_primary.account_status,
          current_membership_id = v_primary.membership_id;
    perform set_config('fazoo.membership_sync', 'false', true);
  elsif TG_OP='DELETE' then
    perform set_config('fazoo.membership_sync', 'true', true);
    update public.profiles set account_status='inactive', current_membership_id=NULL where id=v_user_id;
    perform set_config('fazoo.membership_sync', 'false', true);
  end if;
  if TG_OP='DELETE' then return OLD; end if;
  return NEW;
end;
$function$
;
CREATE TRIGGER profiles_sync_membership_delete_trg AFTER DELETE ON public.organization_memberships FOR EACH ROW EXECUTE FUNCTION public.profiles_sync_primary_membership();
