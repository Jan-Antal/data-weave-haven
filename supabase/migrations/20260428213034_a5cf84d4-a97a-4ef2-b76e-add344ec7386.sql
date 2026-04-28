create table public.ares_cache (
  ico text primary key,
  raw_data jsonb,
  obchodni_jmeno text,
  dic text,
  adresa text,
  mesto text,
  psc text,
  ulice text,
  pravni_forma text,
  datum_vzniku date,
  not_found boolean not null default false,
  fetched_at timestamptz not null default now(),
  constraint ares_cache_ico_format check (ico ~ '^\d{8}$')
);

create index ares_cache_fetched_at_idx on public.ares_cache (fetched_at);

alter table public.ares_cache enable row level security;

create policy "ares_cache_select_authenticated"
  on public.ares_cache
  for select
  to authenticated
  using (true);
