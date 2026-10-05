alter table public.events
  alter column max_active_moments_per_participant set default 20;

update public.events
set max_active_moments_per_participant = 20,
    updated_at = now()
where max_active_moments_per_participant = 10;
