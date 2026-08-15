create table if not exists public.request_limits (
  visitor_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.request_limits enable row level security;

revoke all on table public.request_limits from public, anon, authenticated;

create or replace function public.consume_analysis_quota(
  p_visitor_hash text,
  p_limit integer default 4
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_row public.request_limits%rowtype;
begin
  if p_visitor_hash is null or length(p_visitor_hash) <> 64 then
    raise exception 'Invalid visitor hash';
  end if;

  if p_limit < 1 or p_limit > 100 then
    raise exception 'Invalid quota limit';
  end if;

  insert into public.request_limits (visitor_hash, window_started_at, request_count, updated_at)
  values (p_visitor_hash, v_now, 0, v_now)
  on conflict (visitor_hash) do nothing;

  select *
  into v_row
  from public.request_limits
  where visitor_hash = p_visitor_hash
  for update;

  if v_now >= v_row.window_started_at + interval '24 hours' then
    update public.request_limits
    set window_started_at = v_now,
        request_count = 0,
        updated_at = v_now
    where visitor_hash = p_visitor_hash
    returning * into v_row;
  end if;

  if v_row.request_count >= p_limit then
    return query
    select false, 0, v_row.window_started_at + interval '24 hours';
    return;
  end if;

  update public.request_limits
  set request_count = request_count + 1,
      updated_at = v_now
  where visitor_hash = p_visitor_hash
  returning * into v_row;

  return query
  select true,
         greatest(p_limit - v_row.request_count, 0),
         v_row.window_started_at + interval '24 hours';
end;
$$;

revoke all on function public.consume_analysis_quota(text, integer) from public, anon, authenticated;
grant execute on function public.consume_analysis_quota(text, integer) to service_role;
