-- =====================================================================
-- PocketJob — verilənlər bazası sxemi (Supabase / PostgreSQL)
-- Supabase panelində: SQL Editor → New query → hamısını yapışdır → Run
-- Bu fayl təkrar işlədilə bilər (idempotent).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) ELANLAR
-- ---------------------------------------------------------------------
create table if not exists public.jobs (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null check (char_length(title) between 3 and 80),
  category      text not null check (category in ('logistics','retail','food','delivery','cleaning','security','events','office','other')),
  city          text not null default 'Bakı' check (city in ('Bakı','Sumqayıt','Xırdalan','Gəncə','Digər')),
  location      text not null check (char_length(location) between 2 and 80),
  pay_unit      text not null default 'negotiable' check (pay_unit in ('negotiable','total','hour')),
  pay_amount    integer check (pay_amount between 1 and 5000),
  work_date     date,
  time_from     time,
  time_to       time,
  requirements  text check (requirements is null or char_length(requirements) <= 300),
  phone         text not null check (phone ~ '^\+994(10|50|51|55|60|70|77|99)[0-9]{7}$'),
  image_url     text check (image_url is null or char_length(image_url) <= 500),
  status        text not null default 'active' check (status in ('active','closed','hidden')),
  search_text   text,
  created_at    timestamptz not null default now(),
  bumped_at     timestamptz not null default now(),
  boosted_at    timestamptz,
  expires_at    timestamptz not null default (now() + interval '7 days'),
  constraint jobs_pay_consistency check (
    (pay_unit = 'negotiable' and pay_amount is null)
    or (pay_unit <> 'negotiable' and pay_amount is not null)
  )
);

create index if not exists jobs_feed_idx    on public.jobs (status, bumped_at desc);
create index if not exists jobs_owner_idx   on public.jobs (owner_id, created_at desc);
create index if not exists jobs_expires_idx on public.jobs (expires_at);

-- Yazılma zamanı avtomatik işləyən qaydalar
create or replace function public.jobs_prepare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  baku_today date := (now() at time zone 'Asia/Baku')::date;
begin
  if tg_op = 'INSERT' then
    -- spam qoruması: 1 saatda ən çox 5 elan
    if (select count(*) from public.jobs
          where owner_id = new.owner_id
            and created_at > now() - interval '1 hour') >= 5 then
      raise exception 'rate_limit';
    end if;

    -- qorunan sahələri server təyin edir (istifadəçi dəyişə bilməz)
    new.status      := 'active';
    new.created_at  := now();
    new.bumped_at   := now();
    new.boosted_at  := null;
  end if;

  if tg_op = 'UPDATE' then
    -- şikayətlərlə gizlədilmiş elanı sahibi yenidən aça bilməz
    -- (auth.uid() boşdursa, yəni SQL Editor / admin, icazə var)
    if old.status = 'hidden' and new.status <> 'hidden' and auth.uid() is not null then
      new.status := 'hidden';
    end if;
  end if;

  -- bitmə vaxtı: iş günündən sonrakı gecə yarısı (Bakı), tarix yoxdursa 7 gün
  if tg_op = 'INSERT' or new.work_date is distinct from old.work_date then
    if new.work_date is not null then
      if new.work_date < baku_today then
        raise exception 'past_date';
      end if;
      if new.work_date > baku_today + 60 then
        raise exception 'date_too_far';
      end if;
      new.expires_at := ((new.work_date + 1)::timestamp at time zone 'Asia/Baku');
    else
      new.expires_at := now() + interval '7 days';
    end if;
  end if;

  -- axtarış mətni: Azərbaycan hərfləri sadələşdirilir (ə→e, ş→s ...)
  new.search_text := lower(translate(
    coalesce(new.title, '') || ' ' || coalesce(new.location, '') || ' ' ||
    coalesce(new.city, '') || ' ' || coalesce(new.requirements, ''),
    'əƏıİöÖüÜşŞçÇğĞ',
    'eeiioouussccgg'
  ));

  return new;
end;
$$;

drop trigger if exists jobs_prepare_trg on public.jobs;
create trigger jobs_prepare_trg
  before insert or update on public.jobs
  for each row execute function public.jobs_prepare();

-- İcazələr (sütun səviyyəsində: sahibi yalnız öz məlumat sahələrini dəyişə bilər)
alter table public.jobs enable row level security;

revoke all on public.jobs from anon, authenticated;
grant select on public.jobs to anon, authenticated;
grant insert (title, category, city, location, pay_unit, pay_amount, work_date,
              time_from, time_to, requirements, phone, image_url)
  on public.jobs to authenticated;
grant update (title, category, city, location, pay_unit, pay_amount, work_date,
              time_from, time_to, requirements, phone, image_url, status)
  on public.jobs to authenticated;
grant delete on public.jobs to authenticated;

drop policy if exists jobs_select_public on public.jobs;
create policy jobs_select_public on public.jobs
  for select to anon, authenticated
  using (status = 'active' and expires_at > now());

drop policy if exists jobs_select_own on public.jobs;
create policy jobs_select_own on public.jobs
  for select to authenticated
  using (owner_id = (select auth.uid()));

drop policy if exists jobs_insert_own on public.jobs;
create policy jobs_insert_own on public.jobs
  for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists jobs_update_own on public.jobs;
create policy jobs_update_own on public.jobs
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists jobs_delete_own on public.jobs;
create policy jobs_delete_own on public.jobs
  for delete to authenticated
  using (owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 2) ELANI İRƏLİ ÇƏKMƏK (yalnız sahibi, 6 saatda bir dəfə)
--    Bu funksiyanı Netlify funksiyası çağırır və sonra Telegram-a yazır.
-- ---------------------------------------------------------------------
create or replace function public.boost_job(p_job_id uuid)
returns public.jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  j public.jobs;
begin
  select * into j
    from public.jobs
   where id = p_job_id
     and owner_id = auth.uid()
     and status = 'active'
     and expires_at > now()
   for update;

  if not found then
    raise exception 'job_not_found';
  end if;

  if j.boosted_at is not null and j.boosted_at > now() - interval '6 hours' then
    raise exception 'boost_cooldown';
  end if;

  update public.jobs
     set bumped_at = now(), boosted_at = now()
   where id = p_job_id
   returning * into j;

  return j;
end;
$$;

revoke all on function public.boost_job(uuid) from public, anon;
grant execute on function public.boost_job(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 3) ŞİKAYƏTLƏR (3 fərqli şikayətdən sonra elan avtomatik gizlədilir)
-- ---------------------------------------------------------------------
create table if not exists public.reports (
  id          bigint generated always as identity primary key,
  job_id      uuid not null references public.jobs(id) on delete cascade,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  reason      text not null check (reason in ('spam','fraud','wrong','other')),
  created_at  timestamptz not null default now(),
  unique (job_id, reporter_id)
);

alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
grant insert (job_id, reason) on public.reports to authenticated;

drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert to authenticated
  with check (reporter_id = (select auth.uid()));

create or replace function public.reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.reports where job_id = new.job_id) >= 3 then
    update public.jobs set status = 'hidden'
     where id = new.job_id and status = 'active';
  end if;
  return null;
end;
$$;

drop trigger if exists reports_after_insert_trg on public.reports;
create trigger reports_after_insert_trg
  after insert on public.reports
  for each row execute function public.reports_after_insert();

-- ---------------------------------------------------------------------
-- 4) SÖHBƏTLƏR VƏ MESAJLAR (həqiqi, cihazlararası)
-- ---------------------------------------------------------------------
create table if not exists public.conversations (
  id                   uuid primary key default gen_random_uuid(),
  job_id               uuid references public.jobs(id) on delete set null,
  job_title            text not null default '',
  seeker_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  employer_id          uuid not null references auth.users(id) on delete cascade,
  created_at           timestamptz not null default now(),
  last_message_at      timestamptz not null default now(),
  last_message_preview text not null default '',
  last_sender_id       uuid,
  unique (job_id, seeker_id),
  check (seeker_id <> employer_id)
);

create index if not exists conv_seeker_idx   on public.conversations (seeker_id, last_message_at desc);
create index if not exists conv_employer_idx on public.conversations (employer_id, last_message_at desc);

create table if not exists public.messages (
  id              bigint generated always as identity primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  body            text not null check (char_length(body) between 1 and 1000),
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index if not exists messages_conv_idx   on public.messages (conversation_id, created_at);
create index if not exists messages_unread_idx on public.messages (conversation_id) where read_at is null;

-- Yardımçı: istifadəçi bu söhbətin iştirakçısıdırmı?
create or replace function public.is_conversation_member(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.conversations c
     where c.id = p_conversation_id
       and (select auth.uid()) in (c.seeker_id, c.employer_id)
  );
$$;

revoke all on function public.is_conversation_member(uuid) from public, anon;
grant execute on function public.is_conversation_member(uuid) to authenticated;

-- Söhbət yaradılanda elanın adını yadda saxla
create or replace function public.conversations_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select title into new.job_title from public.jobs where id = new.job_id;
  new.job_title := coalesce(new.job_title, '');
  return new;
end;
$$;

drop trigger if exists conversations_before_insert_trg on public.conversations;
create trigger conversations_before_insert_trg
  before insert on public.conversations
  for each row execute function public.conversations_before_insert();

-- Mesaj yazılmazdan əvvəl: spam limiti (dəqiqədə 20 mesaj)
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (select count(*) from public.messages
        where sender_id = new.sender_id
          and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'rate_limit';
  end if;
  return new;
end;
$$;

drop trigger if exists messages_before_insert_trg on public.messages;
create trigger messages_before_insert_trg
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- Mesajdan sonra: söhbət siyahısı üçün son mesajı yenilə
create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(new.body, 80),
         last_sender_id = new.sender_id
   where id = new.conversation_id;
  return null;
end;
$$;

drop trigger if exists messages_after_insert_trg on public.messages;
create trigger messages_after_insert_trg
  after insert on public.messages
  for each row execute function public.messages_after_insert();

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

revoke all on public.conversations from anon, authenticated;
revoke all on public.messages from anon, authenticated;
grant select on public.conversations to authenticated;
grant insert (job_id, employer_id) on public.conversations to authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;

drop policy if exists conv_select on public.conversations;
create policy conv_select on public.conversations
  for select to authenticated
  using ((select auth.uid()) in (seeker_id, employer_id));

drop policy if exists conv_insert on public.conversations;
create policy conv_insert on public.conversations
  for insert to authenticated
  with check (
    seeker_id = (select auth.uid())
    and exists (
      select 1 from public.jobs j
       where j.id = job_id
         and j.owner_id = employer_id
         and j.status = 'active'
    )
  );

drop policy if exists msg_select on public.messages;
create policy msg_select on public.messages
  for select to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists msg_insert on public.messages;
create policy msg_insert on public.messages
  for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
  );

-- Oxunmuş kimi işarələ (yalnız qarşı tərəfin mesajları)
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'forbidden';
  end if;
  update public.messages
     set read_at = now()
   where conversation_id = p_conversation_id
     and sender_id <> auth.uid()
     and read_at is null;
end;
$$;

revoke all on function public.mark_conversation_read(uuid) from public, anon;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5) ŞƏKİL SAXLANCI (Storage)
--    Hər istifadəçi yalnız öz qovluğuna (uid/...) yükləyə bilər. Maks 2 MB.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-images', 'job-images', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists job_images_insert_own on storage.objects;
create policy job_images_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'job-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists job_images_delete_own on storage.objects;
create policy job_images_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'job-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- ---------------------------------------------------------------------
-- 6) CANLI YENİLƏNMƏ (Realtime)
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['jobs', 'messages'] loop
    if not exists (
      select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) (İSTƏYƏ GÖRƏ) Köhnə elanları avtomatik təmizləmək
--    Supabase → Database → Extensions → pg_cron aktiv edin, sonra bunu işlədin:
--
-- select cron.schedule('pocketjob-cleanup', '0 3 * * *',
--   $$ delete from public.jobs where expires_at < now() - interval '30 days' $$);
-- ---------------------------------------------------------------------
