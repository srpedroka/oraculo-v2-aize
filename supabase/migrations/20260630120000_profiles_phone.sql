alter table public.profiles
  add column if not exists phone text;

create unique index if not exists profiles_phone_unique_idx
on public.profiles (phone)
where phone is not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_phone_international_format'
  ) then
    alter table public.profiles
      add constraint profiles_phone_international_format
      check (phone is null or phone ~ '^\+[1-9][0-9]{7,14}$');
  end if;
end
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email),
    nullif(new.raw_user_meta_data ->> 'phone', '')
  )
  on conflict (id) do update
    set
      full_name = excluded.full_name,
      phone = coalesce(public.profiles.phone, excluded.phone);

  return new;
end;
$$;
