-- Align staff action guards with the authenticator pause already approved.
-- Leave review retains its administrator, organization, pending-status and audit checks.
-- Existing function grants and signatures are preserved.
CREATE OR REPLACE FUNCTION public.assert_org_staff()
 RETURNS profiles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.account_status <> 'approved' then
    raise exception 'Your account is not approved yet (%).', p.account_status;
  end if;
  if p.role not in ('super_admin','organization_admin','supervisor') then
    raise exception 'Not permitted';
  end if;
  return p;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assert_org_admin()
 RETURNS profiles
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare p public.profiles;
begin
  select * into p from public.profiles where id = auth.uid();
  if p.id is null then raise exception 'Not signed in' using errcode = '42501'; end if;
  if p.account_status <> 'approved' then
    raise exception 'Your account is not approved yet (%).', p.account_status;
  end if;
  if p.role not in ('super_admin','organization_admin') then
    raise exception 'Not permitted';
  end if;
  return p;
end;
$function$
;
