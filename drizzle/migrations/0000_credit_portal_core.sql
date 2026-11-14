
-- =========================================================
-- ENUMS
-- =========================================================
create type public.app_role as enum ('super_admin','admin','supervisor','credit_officer','finance_officer');
create type public.loan_status as enum ('pending','approved','active','partially_paid','fully_paid','overdue','cancelled');
create type public.repayment_frequency as enum ('weekly','fortnightly','monthly');
create type public.risk_band as enum ('excellent','good','fair','poor','high_risk');

-- =========================================================
-- HELPERS (no table deps)
-- =========================================================
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end $$;

create or replace function public.sa_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Africa/Johannesburg')::date
$$;

create or replace function public.instalment_due_date(_first date, _freq public.repayment_frequency, _k int)
returns date language sql immutable set search_path = public as $$
  select case _freq
    when 'weekly' then _first + (7 * _k)
    when 'fortnightly' then _first + (14 * _k)
    else (_first + make_interval(months => _k))::date end
$$;

create or replace function public.loan_expected_paid(_first date, _freq public.repayment_frequency, _n int, _inst numeric, _total numeric, _as_of date)
returns numeric language sql immutable set search_path = public as $$
  select case when s.c >= _n then _total else least(_total, s.c * _inst) end
  from (select count(*)::int as c from generate_series(0, _n - 1) k
        where public.instalment_due_date(_first, _freq, k) < _as_of) s
$$;

create or replace function public.loan_next_due_index(_paid numeric, _inst numeric, _n int)
returns int language sql immutable set search_path = public as $$
  select least(_n - 1, floor((_paid + 0.005) / nullif(_inst, 0))::int)
$$;

create or replace function public.compute_risk_band(_score int) returns public.risk_band
language sql immutable set search_path = public as $$
  select case when _score is null then null
    when _score >= 800 then 'excellent'::public.risk_band
    when _score >= 700 then 'good'::public.risk_band
    when _score >= 600 then 'fair'::public.risk_band
    when _score >= 500 then 'poor'::public.risk_band
    else 'high_risk'::public.risk_band end
$$;

create or replace function public.is_valid_sa_id(_id text) returns boolean
language plpgsql immutable set search_path = public as $$
declare total int := 0; d int; i int;
begin
  if _id is null or _id !~ '^[0-9]{13}$' then return false; end if;
  for i in 1..13 loop
    d := substr(_id, 14 - i, 1)::int;
    if i % 2 = 0 then d := d * 2; if d > 9 then d := d - 9; end if; end if;
    total := total + d;
  end loop;
  return total % 10 = 0;
end $$;

-- =========================================================
-- STAFF: profiles + roles
-- =========================================================
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.profiles to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
                 where p.id = _user_id and p.is_active and r.role = any(_roles))
$$;

create or replace function public.is_active_staff(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p join public.user_roles r on r.user_id = p.id
                 where p.id = _user_id and p.is_active)
$$;

create or replace function public.is_admin(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['super_admin','admin']::public.app_role[])
$$;
create or replace function public.can_manage(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['super_admin','admin','supervisor']::public.app_role[])
$$;
create or replace function public.can_credit(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['super_admin','admin','supervisor','credit_officer']::public.app_role[])
$$;
create or replace function public.can_finance(_user_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.has_any_role(_user_id, array['super_admin','admin','supervisor','finance_officer']::public.app_role[])
$$;

create policy "Staff can view staff profiles" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_active_staff(auth.uid()));
create policy "Staff can update own profile" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy "Staff can view roles" on public.user_roles for select to authenticated
  using (user_id = auth.uid() or public.is_active_staff(auth.uid()));

-- =========================================================
-- AUDIT + NOTIFICATIONS
-- =========================================================
create table public.audit_log (
  id bigserial primary key,
  actor_id uuid,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log (created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_id, created_at desc);
grant select on public.audit_log to authenticated;
grant all on public.audit_log to service_role;
alter table public.audit_log enable row level security;
create policy "Managers view audit log" on public.audit_log for select to authenticated
  using (public.can_manage(auth.uid()) or actor_id = auth.uid());

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text not null,
  message text not null,
  link text,
  entity_id uuid,
  created_at timestamptz not null default now()
);
create index notifications_created_idx on public.notifications (created_at desc);
grant select on public.notifications to authenticated;
grant all on public.notifications to service_role;
alter table public.notifications enable row level security;
create policy "Staff view notifications" on public.notifications for select to authenticated
  using (public.is_active_staff(auth.uid()));

create table public.notification_reads (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);
grant select, insert, delete on public.notification_reads to authenticated;
grant all on public.notification_reads to service_role;
alter table public.notification_reads enable row level security;
create policy "Own reads select" on public.notification_reads for select to authenticated using (user_id = auth.uid());
create policy "Own reads insert" on public.notification_reads for insert to authenticated with check (user_id = auth.uid() and public.is_active_staff(auth.uid()));
create policy "Own reads delete" on public.notification_reads for delete to authenticated using (user_id = auth.uid());

create or replace function public.audit_row() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_new jsonb; v_old jsonb; v_details jsonb; v_id text;
begin
  if TG_OP in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;
  if TG_OP in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  v_id := coalesce(v_new->>'id', v_old->>'id', v_new->>'customer_id', v_old->>'customer_id', v_new->>'user_id', v_old->>'user_id');
  if TG_OP = 'UPDATE' then
    select jsonb_object_agg(key, jsonb_build_object('from', v_old->key, 'to', value)) into v_details
    from jsonb_each(v_new) where (v_old->key) is distinct from value and key <> 'updated_at';
    if v_details is null then return new; end if;
    if v_details ? 'id_number' then v_details := v_details || jsonb_build_object('id_number', 'changed (masked)'); end if;
  elsif TG_OP = 'INSERT' then
    v_details := v_new;
  else
    v_details := v_old;
  end if;
  if v_details ? 'id_number' and TG_OP <> 'UPDATE' then v_details := v_details || jsonb_build_object('id_number', '*** masked ***'); end if;
  if v_details ? 'connection_key' then v_details := v_details - 'connection_key'; end if;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, details)
  values (auth.uid(), lower(TG_OP), TG_TABLE_NAME, v_id, v_details);
  return coalesce(new, old);
end $$;

create or replace function public.log_event(_action text, _entity_type text, _entity_id text, _summary text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  insert into public.audit_log(actor_id, action, entity_type, entity_id, summary)
  values (auth.uid(), left(_action, 60), left(coalesce(_entity_type,'system'), 60), left(_entity_id, 100), left(_summary, 500));
end $$;

create trigger trg_audit_user_roles after insert or update or delete on public.user_roles for each row execute function public.audit_row();
create trigger trg_audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_row();

-- =========================================================
-- CUSTOMERS
-- =========================================================
create sequence public.customer_account_seq;
grant usage on sequence public.customer_account_seq to authenticated, service_role;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  account_number text not null unique default ('ACC' || lpad(nextval('public.customer_account_seq')::text, 5, '0')),
  first_name text not null check (length(trim(first_name)) between 1 and 100),
  last_name text not null check (length(trim(last_name)) between 1 and 100),
  phone text not null check (length(trim(phone)) between 6 and 20),
  email text check (email is null or length(email) <= 255),
  address text check (address is null or length(address) <= 500),
  employer text check (employer is null or length(employer) <= 200),
  employment_status text,
  job_title text,
  monthly_income numeric(14,2) not null default 0 check (monthly_income >= 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.customers to authenticated;
grant insert (first_name, last_name, phone, email, address, employer, employment_status, job_title, monthly_income) on public.customers to authenticated;
grant update (first_name, last_name, phone, email, address, employer, employment_status, job_title, monthly_income) on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "Staff view customers" on public.customers for select to authenticated using (public.is_active_staff(auth.uid()));
create policy "Credit staff add customers" on public.customers for insert to authenticated with check (public.can_credit(auth.uid()));
create policy "Credit staff edit customers" on public.customers for update to authenticated using (public.can_credit(auth.uid())) with check (public.can_credit(auth.uid()));
create trigger trg_customers_updated before update on public.customers for each row execute function public.set_updated_at();
create trigger trg_audit_customers after insert or update or delete on public.customers for each row execute function public.audit_row();

create table public.customer_private (
  customer_id uuid primary key references public.customers(id) on delete cascade,
  id_number text not null unique,
  updated_at timestamptz not null default now()
);
grant select on public.customer_private to authenticated;
grant insert (customer_id, id_number) on public.customer_private to authenticated;
grant update (id_number) on public.customer_private to authenticated;
grant all on public.customer_private to service_role;
alter table public.customer_private enable row level security;
create policy "Credit staff view ID numbers" on public.customer_private for select to authenticated using (public.can_credit(auth.uid()));
create policy "Credit staff add ID numbers" on public.customer_private for insert to authenticated with check (public.can_credit(auth.uid()));
create policy "Credit staff edit ID numbers" on public.customer_private for update to authenticated using (public.can_credit(auth.uid())) with check (public.can_credit(auth.uid()));

create or replace function public.customer_private_validate() returns trigger
language plpgsql set search_path = public as $$
begin
  new.id_number := regexp_replace(new.id_number, '\s', '', 'g');
  if not public.is_valid_sa_id(new.id_number) then
    raise exception 'Invalid South African ID number';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_customer_private_validate before insert or update on public.customer_private for each row execute function public.customer_private_validate();
create trigger trg_audit_customer_private after insert or update or delete on public.customer_private for each row execute function public.audit_row();

create or replace function public.create_customer(_data jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if exists (select 1 from public.customer_private where id_number = regexp_replace(_data->>'id_number', '\s', '', 'g')) then
    raise exception 'A customer with this ID number is already registered';
  end if;
  insert into public.customers(first_name, last_name, phone, email, address, employer, employment_status, job_title, monthly_income)
  values (trim(_data->>'first_name'), trim(_data->>'last_name'), trim(_data->>'phone'), nullif(trim(_data->>'email'), ''),
          nullif(trim(_data->>'address'), ''), nullif(trim(_data->>'employer'), ''), nullif(_data->>'employment_status', ''),
          nullif(trim(_data->>'job_title'), ''), coalesce((_data->>'monthly_income')::numeric, 0))
  returning id into v_id;
  insert into public.customer_private(customer_id, id_number) values (v_id, _data->>'id_number');
  return v_id;
end $$;

create or replace function public.update_customer(_id uuid, _data jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.customers set
    first_name = trim(_data->>'first_name'), last_name = trim(_data->>'last_name'), phone = trim(_data->>'phone'),
    email = nullif(trim(_data->>'email'), ''), address = nullif(trim(_data->>'address'), ''),
    employer = nullif(trim(_data->>'employer'), ''), employment_status = nullif(_data->>'employment_status', ''),
    job_title = nullif(trim(_data->>'job_title'), ''), monthly_income = coalesce((_data->>'monthly_income')::numeric, 0)
  where id = _id;
  if not found then raise exception 'Customer not found or you do not have permission'; end if;
  if coalesce(_data->>'id_number', '') <> '' then
    update public.customer_private set id_number = _data->>'id_number' where customer_id = _id
      and id_number is distinct from regexp_replace(_data->>'id_number', '\s', '', 'g');
  end if;
end $$;

-- =========================================================
-- CREDIT ALLOWANCE
-- =========================================================
create table public.credit_settings (
  id int primary key default 1 check (id = 1),
  default_daily_allowance int not null default 5 check (default_daily_allowance between 0 and 1000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.credit_settings (id, default_daily_allowance) values (1, 5);
grant select on public.credit_settings to authenticated;
grant update (default_daily_allowance) on public.credit_settings to authenticated;
grant all on public.credit_settings to service_role;
alter table public.credit_settings enable row level security;
create policy "Staff view credit settings" on public.credit_settings for select to authenticated using (public.is_active_staff(auth.uid()));
create policy "Admins update credit settings" on public.credit_settings for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

create table public.staff_credit_limits (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  daily_allowance int not null check (daily_allowance between 0 and 1000),
  updated_by uuid,
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.staff_credit_limits to authenticated;
grant all on public.staff_credit_limits to service_role;
alter table public.staff_credit_limits enable row level security;
create policy "Staff view limits" on public.staff_credit_limits for select to authenticated using (user_id = auth.uid() or public.can_manage(auth.uid()));
create policy "Admins insert limits" on public.staff_credit_limits for insert to authenticated with check (public.is_admin(auth.uid()));
create policy "Admins update limits" on public.staff_credit_limits for update to authenticated using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));
create policy "Admins delete limits" on public.staff_credit_limits for delete to authenticated using (public.is_admin(auth.uid()));

create or replace function public.stamp_updated_by() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_by := auth.uid(); new.updated_at := now(); return new; end $$;
create trigger trg_credit_settings_stamp before insert or update on public.credit_settings for each row execute function public.stamp_updated_by();
create trigger trg_staff_limits_stamp before insert or update on public.staff_credit_limits for each row execute function public.stamp_updated_by();
create trigger trg_audit_credit_settings after update on public.credit_settings for each row execute function public.audit_row();
create trigger trg_audit_staff_limits after insert or update or delete on public.staff_credit_limits for each row execute function public.audit_row();

-- =========================================================
-- CREDIT ASSESSMENTS
-- =========================================================
create table public.credit_assessments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','completed')),
  consent_given boolean not null default false,
  consent_method text not null default 'signed_form' check (consent_method in ('signed_form','digital','verbal_recorded')),
  consent_date timestamptz not null default now(),
  source text not null default 'manual' check (source in ('manual','bureau_api')),
  bureau_name text check (bureau_name is null or length(bureau_name) <= 100),
  bureau_reference text check (bureau_reference is null or length(bureau_reference) <= 100),
  credit_score int check (credit_score is null or credit_score between 0 and 999),
  risk_band public.risk_band,
  existing_debt numeric(14,2) not null default 0 check (existing_debt >= 0),
  monthly_debt_obligations numeric(14,2) not null default 0 check (monthly_debt_obligations >= 0),
  payment_history text check (payment_history is null or length(payment_history) <= 2000),
  notes text check (notes is null or length(notes) <= 2000),
  assessed_by uuid not null default auth.uid(),
  assessment_date date not null default public.sa_today(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index credit_assessments_customer_idx on public.credit_assessments (customer_id, created_at desc);
grant select on public.credit_assessments to authenticated;
grant insert (customer_id, status, consent_given, consent_method, bureau_name, bureau_reference, credit_score, existing_debt, monthly_debt_obligations, payment_history, notes, assessment_date) on public.credit_assessments to authenticated;
grant update (status, bureau_name, bureau_reference, credit_score, existing_debt, monthly_debt_obligations, payment_history, notes) on public.credit_assessments to authenticated;
grant all on public.credit_assessments to service_role;
alter table public.credit_assessments enable row level security;
create policy "Credit staff view assessments" on public.credit_assessments for select to authenticated using (public.can_credit(auth.uid()));
create policy "Credit staff create assessments" on public.credit_assessments for insert to authenticated with check (public.can_credit(auth.uid()));
create policy "Credit staff complete assessments" on public.credit_assessments for update to authenticated using (public.can_credit(auth.uid()) and status = 'pending') with check (public.can_credit(auth.uid()));

create table public.credit_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  assessment_id uuid references public.credit_assessments(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  used_on date not null default public.sa_today(),
  created_at timestamptz not null default now()
);
create index credit_usage_user_day_idx on public.credit_usage (user_id, used_on);
grant select on public.credit_usage to authenticated;
grant all on public.credit_usage to service_role;
alter table public.credit_usage enable row level security;
create policy "View own or managed credit usage" on public.credit_usage for select to authenticated using (user_id = auth.uid() or public.can_manage(auth.uid()));

create or replace function public.credit_allowance_for(_user_id uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select daily_allowance from public.staff_credit_limits where user_id = _user_id),
                  (select default_daily_allowance from public.credit_settings where id = 1), 5)
$$;

create or replace function public.ca_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_allow int; v_used int;
begin
  if TG_OP = 'UPDATE' and old.status = 'completed' then
    raise exception 'Completed assessments cannot be edited. Start a new assessment instead.';
  end if;
  if not new.consent_given then
    raise exception 'Customer consent is required before accessing credit information';
  end if;
  if new.status = 'completed' then
    if new.credit_score is null then raise exception 'A credit score from an authorised bureau report is required to complete the assessment'; end if;
    if coalesce(trim(new.bureau_name), '') = '' or coalesce(trim(new.bureau_reference), '') = '' then
      raise exception 'The credit bureau name and report reference are required to complete the assessment';
    end if;
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  new.risk_band := public.compute_risk_band(new.credit_score);
  new.updated_at := now();
  if TG_OP = 'INSERT' then
    new.assessed_by := coalesce(auth.uid(), new.assessed_by);
    new.consent_date := now();
    v_allow := public.credit_allowance_for(new.assessed_by);
    select count(*) into v_used from public.credit_usage where user_id = new.assessed_by and used_on = public.sa_today();
    if v_used >= v_allow then
      raise exception 'Daily credit allowance reached: you have used % of % credits today', v_used, v_allow;
    end if;
  end if;
  return new;
end $$;
create trigger trg_ca_before before insert or update on public.credit_assessments for each row execute function public.ca_before_write();

create or replace function public.ca_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_acc text;
begin
  select account_number into v_acc from public.customers where id = new.customer_id;
  if TG_OP = 'INSERT' then
    insert into public.credit_usage(user_id, assessment_id, customer_id) values (new.assessed_by, new.id, new.customer_id);
  end if;
  if new.status = 'completed' and (TG_OP = 'INSERT' or old.status <> 'completed') then
    insert into public.notifications(type, title, message, link, entity_id)
    values ('assessment', 'Credit assessment completed', format('Assessment completed for customer %s.', v_acc), '/customers/' || new.customer_id, new.customer_id);
  end if;
  return new;
end $$;
create trigger trg_ca_after after insert or update on public.credit_assessments for each row execute function public.ca_after_write();
create trigger trg_audit_ca after insert or update or delete on public.credit_assessments for each row execute function public.audit_row();

create or replace function public.my_credit_status() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_allow int; v_used int;
begin
  if not public.is_active_staff(auth.uid()) then raise exception 'Not authorised'; end if;
  v_allow := public.credit_allowance_for(auth.uid());
  select count(*) into v_used from public.credit_usage where user_id = auth.uid() and used_on = public.sa_today();
  return jsonb_build_object('allowance', v_allow, 'used', v_used, 'remaining', greatest(v_allow - v_used, 0));
end $$;

create or replace function public.staff_credit_overview()
returns table(user_id uuid, full_name text, email text, role public.app_role, is_active boolean, daily_allowance int, is_custom boolean, used_today int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage(auth.uid()) then raise exception 'Not authorised'; end if;
  return query
  select p.id, p.full_name, p.email,
         (select r.role from public.user_roles r where r.user_id = p.id order by r.role limit 1),
         p.is_active,
         public.credit_allowance_for(p.id),
         exists (select 1 from public.staff_credit_limits l where l.user_id = p.id),
         (select count(*)::int from public.credit_usage u where u.user_id = p.id and u.used_on = public.sa_today())
  from public.profiles p order by p.full_name;
end $$;

-- =========================================================
-- LOANS
-- =========================================================
create sequence public.loan_ref_seq;
grant usage on sequence public.loan_ref_seq to authenticated, service_role;

create table public.loans (
  id uuid primary key default gen_random_uuid(),
  loan_reference text not null unique default ('LN' || lpad(nextval('public.loan_ref_seq')::text, 5, '0')),
  customer_id uuid not null references public.customers(id) on delete restrict,
  principal numeric(14,2) not null check (principal > 0 and principal <= 100000000),
  interest_rate numeric(7,3) not null default 0 check (interest_rate between 0 and 100),
  fees numeric(14,2) not null default 0 check (fees >= 0),
  interest_amount numeric(14,2) not null default 0,
  total_repayable numeric(14,2) not null default 0,
  issue_date date not null default public.sa_today(),
  repayment_frequency public.repayment_frequency not null default 'monthly',
  number_of_instalments int not null check (number_of_instalments between 1 and 360),
  first_payment_date date not null,
  instalment_amount numeric(14,2) not null default 0,
  maturity_date date,
  status public.loan_status not null default 'pending',
  amount_paid numeric(14,2) not null default 0,
  outstanding_balance numeric(14,2) not null default 0,
  purpose text check (purpose is null or length(purpose) <= 300),
  notes text check (notes is null or length(notes) <= 2000),
  approved_by uuid, approved_at timestamptz,
  disbursed_by uuid, disbursed_at timestamptz,
  cancelled_by uuid, cancelled_at timestamptz, cancel_reason text,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index loans_customer_idx on public.loans (customer_id);
create index loans_status_idx on public.loans (status);
grant select on public.loans to authenticated;
grant insert (customer_id, principal, interest_rate, fees, issue_date, repayment_frequency, number_of_instalments, first_payment_date, purpose, notes) on public.loans to authenticated;
grant update (principal, interest_rate, fees, issue_date, repayment_frequency, number_of_instalments, first_payment_date, purpose, notes) on public.loans to authenticated;
grant all on public.loans to service_role;
alter table public.loans enable row level security;
create policy "Staff view loans" on public.loans for select to authenticated using (public.is_active_staff(auth.uid()));
create policy "Credit staff record loans" on public.loans for insert to authenticated with check (public.can_credit(auth.uid()));
create policy "Credit staff edit undisbursed loans" on public.loans for update to authenticated
  using (public.can_credit(auth.uid()) and status in ('pending','approved')) with check (public.can_credit(auth.uid()));

create or replace function public.loan_before_write() returns trigger
language plpgsql set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and old.status not in ('pending','approved') and (
       new.principal is distinct from old.principal or new.interest_rate is distinct from old.interest_rate
    or new.fees is distinct from old.fees or new.number_of_instalments is distinct from old.number_of_instalments
    or new.repayment_frequency is distinct from old.repayment_frequency or new.first_payment_date is distinct from old.first_payment_date
    or new.issue_date is distinct from old.issue_date or new.customer_id is distinct from old.customer_id) then
    raise exception 'Loan terms cannot be changed after the loan has been disbursed';
  end if;
  if new.first_payment_date < new.issue_date then
    raise exception 'The first payment date cannot be before the loan issue date';
  end if;
  new.interest_amount := round(new.principal * new.interest_rate / 100, 2);
  new.total_repayable := new.principal + new.interest_amount + new.fees;
  new.instalment_amount := round(new.total_repayable / new.number_of_instalments, 2);
  new.maturity_date := public.instalment_due_date(new.first_payment_date, new.repayment_frequency, new.number_of_instalments - 1);
  new.outstanding_balance := new.total_repayable - new.amount_paid;
  new.updated_at := now();
  return new;
end $$;
create trigger trg_loans_before before insert or update on public.loans for each row execute function public.loan_before_write();
create trigger trg_audit_loans after insert or update or delete on public.loans for each row execute function public.audit_row();

-- =========================================================
-- REPAYMENTS + LEDGER
-- =========================================================
create table public.repayments (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  payment_date date not null default public.sa_today(),
  payment_method text not null check (payment_method in ('cash','eft','debit_order','card','other')),
  transaction_reference text not null check (length(trim(transaction_reference)) between 1 and 100),
  notes text check (notes is null or length(notes) <= 1000),
  status text not null default 'valid' check (status in ('valid','reversed')),
  captured_by uuid not null default auth.uid(),
  reversed_by uuid, reversed_at timestamptz, reversal_reason text,
  created_at timestamptz not null default now()
);
create unique index repayments_reference_uniq on public.repayments (lower(transaction_reference));
create index repayments_loan_idx on public.repayments (loan_id, payment_date);
grant select on public.repayments to authenticated;
grant insert (loan_id, customer_id, amount, payment_date, payment_method, transaction_reference, notes) on public.repayments to authenticated;
grant all on public.repayments to service_role;
alter table public.repayments enable row level security;
create policy "Staff view repayments" on public.repayments for select to authenticated using (public.is_active_staff(auth.uid()));
create policy "Finance staff record repayments" on public.repayments for insert to authenticated with check (public.can_finance(auth.uid()));

create table public.loan_transactions (
  id uuid primary key default gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  customer_id uuid not null references public.customers(id) on delete restrict,
  repayment_id uuid references public.repayments(id) on delete restrict,
  txn_type text not null check (txn_type in ('disbursement','interest','fee','repayment','reversal')),
  description text not null,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  txn_date date not null,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index loan_txn_loan_idx on public.loan_transactions (loan_id, txn_date, created_at);
create index loan_txn_customer_idx on public.loan_transactions (customer_id, txn_date);
grant select on public.loan_transactions to authenticated;
grant all on public.loan_transactions to service_role;
alter table public.loan_transactions enable row level security;
create policy "Staff view ledger" on public.loan_transactions for select to authenticated using (public.is_active_staff(auth.uid()));

create or replace function public.recompute_loan(_loan_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l public.loans; v_paid numeric; v_out numeric; v_status public.loan_status;
begin
  select * into l from public.loans where id = _loan_id for update;
  if not found then return; end if;
  select coalesce(sum(amount), 0) into v_paid from public.repayments where loan_id = _loan_id and status = 'valid';
  v_out := l.total_repayable - v_paid;
  if l.status in ('pending','approved','cancelled') then v_status := l.status;
  elsif v_out <= 0.004 then v_status := 'fully_paid';
  elsif v_paid + 0.004 < public.loan_expected_paid(l.first_payment_date, l.repayment_frequency, l.number_of_instalments, l.instalment_amount, l.total_repayable, public.sa_today()) then v_status := 'overdue';
  elsif v_paid > 0 then v_status := 'partially_paid';
  else v_status := 'active';
  end if;
  if v_status = 'overdue' and l.status <> 'overdue' then
    insert into public.notifications(type, title, message, link, entity_id)
    values ('overdue', 'Account overdue', format('Loan %s has missed a scheduled instalment.', l.loan_reference), '/loans/' || l.id, l.id);
  end if;
  if v_status = 'fully_paid' and l.status <> 'fully_paid' then
    insert into public.notifications(type, title, message, link, entity_id)
    values ('paid_up', 'Loan fully paid', format('Loan %s has been settled in full.', l.loan_reference), '/loans/' || l.id, l.id);
  end if;
  if v_paid is distinct from l.amount_paid or v_status is distinct from l.status then
    update public.loans set amount_paid = v_paid, status = v_status where id = _loan_id;
  end if;
end $$;
revoke execute on function public.recompute_loan(uuid) from public, anon, authenticated;

create or replace function public.refresh_loan_statuses() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; s public.loan_status;
begin
  if not public.is_active_staff(auth.uid()) then return 0; end if;
  for r in select id, status from public.loans where status in ('active','partially_paid','overdue') loop
    perform public.recompute_loan(r.id);
    select status into s from public.loans where id = r.id;
    if s is distinct from r.status then n := n + 1; end if;
  end loop;
  return n;
end $$;

create or replace function public.change_loan_status(_loan_id uuid, _action text, _reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare l public.loans; uid uuid := auth.uid();
begin
  if not public.can_manage(uid) then raise exception 'Only supervisors and administrators can change loan status'; end if;
  select * into l from public.loans where id = _loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if _action = 'approve' then
    if l.status <> 'pending' then raise exception 'Only pending loans can be approved'; end if;
    update public.loans set status = 'approved', approved_by = uid, approved_at = now() where id = _loan_id;
    insert into public.notifications(type, title, message, link, entity_id)
    values ('loan', 'Loan approved', format('Loan %s was approved.', l.loan_reference), '/loans/' || l.id, l.id);
  elsif _action = 'disburse' then
    if l.status <> 'approved' then raise exception 'Only approved loans can be disbursed'; end if;
    update public.loans set status = 'active', disbursed_by = uid, disbursed_at = now() where id = _loan_id;
    insert into public.loan_transactions(loan_id, customer_id, txn_type, description, debit, txn_date, created_by)
    values (l.id, l.customer_id, 'disbursement', 'Loan issued (' || l.loan_reference || ')', l.principal, l.issue_date, uid);
    if l.interest_amount > 0 then
      insert into public.loan_transactions(loan_id, customer_id, txn_type, description, debit, txn_date, created_by)
      values (l.id, l.customer_id, 'interest', 'Interest (' || trim(to_char(l.interest_rate, 'FM990.###')) || '% flat)', l.interest_amount, l.issue_date, uid);
    end if;
    if l.fees > 0 then
      insert into public.loan_transactions(loan_id, customer_id, txn_type, description, debit, txn_date, created_by)
      values (l.id, l.customer_id, 'fee', 'Fees', l.fees, l.issue_date, uid);
    end if;
    perform public.recompute_loan(_loan_id);
    insert into public.notifications(type, title, message, link, entity_id)
    values ('loan', 'Loan disbursed', format('Loan %s of R%s is now active.', l.loan_reference, to_char(l.principal, 'FM999G999G990D00')), '/loans/' || l.id, l.id);
  elsif _action = 'cancel' then
    if l.status not in ('pending','approved') then raise exception 'Only pending or approved loans can be cancelled'; end if;
    if coalesce(trim(_reason), '') = '' then raise exception 'A cancellation reason is required'; end if;
    update public.loans set status = 'cancelled', cancelled_by = uid, cancelled_at = now(), cancel_reason = left(trim(_reason), 500) where id = _loan_id;
  else
    raise exception 'Unknown action %', _action;
  end if;
end $$;

create or replace function public.loan_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_name text;
begin
  select first_name || ' ' || last_name into v_name from public.customers where id = new.customer_id;
  insert into public.notifications(type, title, message, link, entity_id)
  values ('loan', 'New loan recorded', format('Loan %s for %s (R%s) is awaiting approval.', new.loan_reference, v_name, to_char(new.principal, 'FM999G999G990D00')), '/loans/' || new.id, new.id);
  return new;
end $$;
create trigger trg_loans_after_insert after insert on public.loans for each row execute function public.loan_after_insert();

create or replace function public.repayment_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare l public.loans;
begin
  select * into l from public.loans where id = new.loan_id for update;
  if not found then raise exception 'Loan not found'; end if;
  if l.status not in ('active','partially_paid','overdue') then
    raise exception 'Payments can only be recorded against active loans (this loan is %)', replace(l.status::text, '_', ' ');
  end if;
  new.transaction_reference := trim(new.transaction_reference);
  if exists (select 1 from public.repayments where lower(transaction_reference) = lower(new.transaction_reference)) then
    raise exception 'Duplicate payment: transaction reference % has already been recorded', new.transaction_reference;
  end if;
  if new.amount > l.outstanding_balance + 0.004 then
    raise exception 'Payment of R% exceeds the outstanding balance of R%', to_char(new.amount, 'FM999G999G990D00'), to_char(l.outstanding_balance, 'FM999G999G990D00');
  end if;
  if new.payment_date > public.sa_today() then raise exception 'The payment date cannot be in the future'; end if;
  if new.payment_date < l.issue_date then raise exception 'The payment date cannot be before the loan issue date'; end if;
  new.customer_id := l.customer_id;
  new.status := 'valid';
  new.captured_by := coalesce(auth.uid(), new.captured_by);
  new.reversed_by := null; new.reversed_at := null; new.reversal_reason := null;
  return new;
end $$;
create trigger trg_repayments_before before insert on public.repayments for each row execute function public.repayment_before_insert();

create or replace function public.repayment_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_ref text;
begin
  select loan_reference into v_ref from public.loans where id = new.loan_id;
  insert into public.loan_transactions(loan_id, customer_id, repayment_id, txn_type, description, credit, txn_date, created_by)
  values (new.loan_id, new.customer_id, new.id, 'repayment', 'Repayment – ' || new.transaction_reference, new.amount, new.payment_date, new.captured_by);
  perform public.recompute_loan(new.loan_id);
  insert into public.notifications(type, title, message, link, entity_id)
  values ('repayment', 'Repayment received', format('R%s received on loan %s.', to_char(new.amount, 'FM999G999G990D00'), v_ref), '/loans/' || new.loan_id, new.loan_id);
  return new;
end $$;
create trigger trg_repayments_after after insert on public.repayments for each row execute function public.repayment_after_insert();
create trigger trg_audit_repayments after insert or update or delete on public.repayments for each row execute function public.audit_row();

create or replace function public.reverse_repayment(_repayment_id uuid, _reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r public.repayments; uid uuid := auth.uid();
begin
  if not public.can_manage(uid) then raise exception 'Only supervisors and administrators can reverse payments'; end if;
  if coalesce(trim(_reason), '') = '' then raise exception 'A reason for the reversal is required'; end if;
  select * into r from public.repayments where id = _repayment_id for update;
  if not found then raise exception 'Payment not found'; end if;
  if r.status <> 'valid' then raise exception 'This payment has already been reversed'; end if;
  update public.repayments set status = 'reversed', reversed_by = uid, reversed_at = now(), reversal_reason = left(trim(_reason), 500) where id = _repayment_id;
  insert into public.loan_transactions(loan_id, customer_id, repayment_id, txn_type, description, debit, txn_date, created_by)
  values (r.loan_id, r.customer_id, r.id, 'reversal', 'Reversal of ' || r.transaction_reference || ' – ' || left(trim(_reason), 120), r.amount, public.sa_today(), uid);
  perform public.recompute_loan(r.loan_id);
end $$;

-- =========================================================
-- STATEMENTS
-- =========================================================
create table public.statements (
  id uuid primary key default gen_random_uuid(),
  statement_number text not null unique default ('ST' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 5))),
  customer_id uuid not null references public.customers(id) on delete restrict,
  loan_id uuid references public.loans(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  opening_balance numeric(14,2) not null,
  total_debits numeric(14,2) not null,
  total_credits numeric(14,2) not null,
  closing_balance numeric(14,2) not null,
  generated_by uuid not null,
  generated_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create index statements_customer_idx on public.statements (customer_id, generated_at desc);
grant select on public.statements to authenticated;
grant all on public.statements to service_role;
alter table public.statements enable row level security;
create policy "Staff view statements" on public.statements for select to authenticated using (public.is_active_staff(auth.uid()));

create or replace function public.generate_statement(_customer_id uuid, _loan_id uuid, _start date, _end date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_open numeric; v_dr numeric; v_cr numeric; v_id uuid;
begin
  if not public.is_active_staff(auth.uid()) then raise exception 'Not authorised'; end if;
  if _end < _start then raise exception 'The end date must be after the start date'; end if;
  if _loan_id is not null and not exists (select 1 from public.loans where id = _loan_id and customer_id = _customer_id) then
    raise exception 'Loan does not belong to this customer';
  end if;
  select coalesce(sum(debit - credit), 0) into v_open from public.loan_transactions
   where customer_id = _customer_id and (_loan_id is null or loan_id = _loan_id) and txn_date < _start;
  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_dr, v_cr from public.loan_transactions
   where customer_id = _customer_id and (_loan_id is null or loan_id = _loan_id) and txn_date between _start and _end;
  insert into public.statements(customer_id, loan_id, period_start, period_end, opening_balance, total_debits, total_credits, closing_balance, generated_by)
  values (_customer_id, _loan_id, _start, _end, v_open, v_dr, v_cr, v_open + v_dr - v_cr, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

-- =========================================================
-- CUSTOMER NOTIFICATIONS
-- =========================================================
create or replace function public.customer_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications(type, title, message, link, entity_id)
  values ('customer', 'New customer registered', format('%s %s (%s) was registered.', new.first_name, new.last_name, new.account_number), '/customers/' || new.id, new.id);
  return new;
end $$;
create trigger trg_customers_after_insert after insert on public.customers for each row execute function public.customer_after_insert();

-- =========================================================
-- VIEWS
-- =========================================================
create view public.loan_summary with (security_invoker = on) as
select l.*,
  c.first_name, c.last_name, c.account_number,
  case when l.status in ('active','partially_paid','overdue')
       then public.instalment_due_date(l.first_payment_date, l.repayment_frequency, x.idx) end as next_due_date,
  case when l.status in ('active','partially_paid','overdue')
       then greatest(0, (case when x.idx >= l.number_of_instalments - 1 then l.total_repayable
                              else least(l.total_repayable, (x.idx + 1) * l.instalment_amount) end) - l.amount_paid) end as next_due_amount,
  case when l.status in ('active','partially_paid','overdue')
       then greatest(0, public.loan_expected_paid(l.first_payment_date, l.repayment_frequency, l.number_of_instalments, l.instalment_amount, l.total_repayable, public.sa_today()) - l.amount_paid)
       else 0 end as arrears_amount
from public.loans l
join public.customers c on c.id = l.customer_id
cross join lateral (select public.loan_next_due_index(l.amount_paid, l.instalment_amount, l.number_of_instalments) as idx) x;
grant select on public.loan_summary to authenticated, service_role;

create view public.customer_overview with (security_invoker = on) as
select c.*,
  (select count(*) from public.loans l where l.customer_id = c.id and l.status <> 'cancelled')::int as loan_count,
  (select count(*) from public.loans l where l.customer_id = c.id and l.status in ('active','partially_paid','overdue'))::int as active_loans,
  (select count(*) from public.loans l where l.customer_id = c.id and l.status = 'overdue')::int as overdue_loans,
  (select coalesce(sum(outstanding_balance), 0) from public.loans l where l.customer_id = c.id and l.status in ('active','partially_paid','overdue')) as outstanding_balance,
  (select a.risk_band from public.credit_assessments a where a.customer_id = c.id and a.status = 'completed' order by a.completed_at desc limit 1) as latest_risk_band,
  (select a.credit_score from public.credit_assessments a where a.customer_id = c.id and a.status = 'completed' order by a.completed_at desc limit 1) as latest_score
from public.customers c;
grant select on public.customer_overview to authenticated, service_role;

-- =========================================================
-- DASHBOARD
-- =========================================================
create or replace function public.dashboard_stats() returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare v_today date := public.sa_today(); v_month date := date_trunc('month', public.sa_today())::date; r jsonb;
begin
  if not public.is_active_staff(auth.uid()) then raise exception 'Not authorised'; end if;
  select jsonb_build_object(
    'total_customers', (select count(*) from public.customers),
    'customers_this_month', (select count(*) from public.customers where created_at >= v_month),
    'loans_issued_count', (select count(*) from public.loans where status in ('active','partially_paid','fully_paid','overdue')),
    'loans_issued_amount', (select coalesce(sum(principal), 0) from public.loans where status in ('active','partially_paid','fully_paid','overdue')),
    'outstanding_balance', (select coalesce(sum(outstanding_balance), 0) from public.loans where status in ('active','partially_paid','overdue')),
    'repayments_total', (select coalesce(sum(amount), 0) from public.repayments where status = 'valid'),
    'overdue_count', (select count(*) from public.loans where status = 'overdue'),
    'overdue_arrears', (select coalesce(sum(arrears_amount), 0) from public.loan_summary where status = 'overdue'),
    'overdue_outstanding', (select coalesce(sum(outstanding_balance), 0) from public.loans where status = 'overdue'),
    'awaiting_assessment', (select count(*) from public.customers c where not exists (select 1 from public.credit_assessments a where a.customer_id = c.id and a.status = 'completed')),
    'pending_assessments', (select count(*) from public.credit_assessments where status = 'pending'),
    'pending_loans', (select count(*) from public.loans where status in ('pending','approved')),
    'today_loans_amount', (select coalesce(sum(principal), 0) from public.loans where status in ('active','partially_paid','fully_paid','overdue') and issue_date = v_today),
    'today_repayments_amount', (select coalesce(sum(amount), 0) from public.repayments where status = 'valid' and payment_date = v_today),
    'today_repayments_count', (select count(*) from public.repayments where status = 'valid' and payment_date = v_today),
    'month_loans_amount', (select coalesce(sum(principal), 0) from public.loans where status in ('active','partially_paid','fully_paid','overdue') and issue_date >= v_month),
    'month_repayments_amount', (select coalesce(sum(amount), 0) from public.repayments where status = 'valid' and payment_date >= v_month),
    'monthly_series', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'month', to_char(m, 'YYYY-MM'),
        'issued', coalesce((select sum(principal) from public.loans where status in ('active','partially_paid','fully_paid','overdue') and issue_date >= m::date and issue_date < (m + interval '1 month')::date), 0),
        'repaid', coalesce((select sum(amount) from public.repayments where status = 'valid' and payment_date >= m::date and payment_date < (m + interval '1 month')::date), 0)
      ) order by m), '[]'::jsonb)
      from generate_series((v_month - interval '11 months')::timestamp, v_month::timestamp, interval '1 month') m),
    'status_distribution', (select coalesce(jsonb_object_agg(status, cnt), '{}'::jsonb) from (select status, count(*) as cnt from public.loans group by status) s),
    'risk_distribution', (select coalesce(jsonb_object_agg(risk_band, cnt), '{}'::jsonb) from (
        select risk_band, count(*) as cnt from (
          select distinct on (customer_id) customer_id, risk_band from public.credit_assessments
          where status = 'completed' order by customer_id, completed_at desc) latest group by risk_band) s)
  ) into r;
  return r;
end $$;
