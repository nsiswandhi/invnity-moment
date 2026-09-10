begin;

delete from recovery_delivery_outbox;
alter table recovery_delivery_outbox alter column recovery_token_id drop not null;
alter table recovery_delivery_outbox drop column recovery_url;
alter table recovery_delivery_outbox add column delivery_payload_ciphertext text;
alter table recovery_delivery_outbox add column claimed_at timestamptz;
alter table recovery_delivery_outbox add column lease_expires_at timestamptz;
alter table recovery_delivery_outbox add column claim_token uuid;
alter table recovery_delivery_outbox drop constraint recovery_delivery_outbox_status_check;
alter table recovery_delivery_outbox add constraint recovery_delivery_outbox_status_check check (status in ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'NOOP'));
alter table recovery_delivery_outbox add constraint recovery_delivery_outbox_payload_check check (
  (status = 'NOOP' and recovery_token_id is null and delivery_payload_ciphertext is null)
  or (status in ('PENDING', 'PROCESSING', 'FAILED') and recovery_token_id is not null and delivery_payload_ciphertext ~ '^v1\.[A-Za-z0-9_-]+$')
  or (status = 'SENT' and recovery_token_id is not null and delivery_payload_ciphertext is null)
);
drop index if exists recovery_delivery_outbox_pending_idx;
create index recovery_delivery_outbox_claim_idx on recovery_delivery_outbox (status, available_at, created_at) where status in ('PENDING', 'PROCESSING');

create or replace function create_recovery_token(p_email text, p_event_id uuid, p_token_hash text, p_expires_at timestamptz, p_delivery_payload_ciphertext text)
returns jsonb language plpgsql as $$
declare v_participant participants%rowtype; v_token recovery_tokens%rowtype;
begin
  if p_expires_at <= clock_timestamp() or p_delivery_payload_ciphertext !~ '^v1\.[A-Za-z0-9_-]+$' then raise exception 'RECOVERY_TOKEN_INVALID'; end if;
  select * into v_participant from participants where event_id = p_event_id and lower(email) = lower(btrim(p_email)) and status = 'active';
  if not found then
    insert into recovery_delivery_outbox (recovery_token_id, delivery_payload_ciphertext, status) values (null, null, 'NOOP');
    return jsonb_build_object('queued', false);
  end if;
  update recovery_tokens set consumed_at = clock_timestamp() where participant_id = v_participant.id and consumed_at is null;
  insert into recovery_tokens (participant_id, token_hash, expires_at) values (v_participant.id, p_token_hash, p_expires_at) returning * into v_token;
  insert into recovery_delivery_outbox (recovery_token_id, delivery_payload_ciphertext) values (v_token.id, p_delivery_payload_ciphertext);
  return jsonb_build_object('queued', true);
end; $$;

create or replace function claim_recovery_delivery_outbox(p_limit integer, p_max_attempts integer, p_now timestamptz)
returns jsonb language plpgsql as $$
begin
  if p_limit not between 1 and 100 or p_max_attempts not between 1 and 10 then raise exception 'INVALID_RECOVERY_OUTBOX_CLAIM'; end if;
  delete from recovery_delivery_outbox o using recovery_tokens t where o.recovery_token_id = t.id and t.expires_at <= p_now;
  delete from recovery_delivery_outbox where status = 'SENT' and sent_at < p_now - interval '1 day';
  delete from recovery_delivery_outbox where status = 'NOOP' and created_at < p_now - interval '1 day';
  update recovery_delivery_outbox
  set status = 'FAILED', claim_token = null, lease_expires_at = null, updated_at = p_now
  where status in ('PENDING', 'PROCESSING') and attempts >= p_max_attempts;
  return (
    with eligible as (
      select o.id
      from recovery_delivery_outbox o
      join recovery_tokens t on t.id = o.recovery_token_id
      where o.attempts < p_max_attempts
        and t.consumed_at is null and t.expires_at > p_now
        and (o.status = 'PENDING' and o.available_at <= p_now or o.status = 'PROCESSING' and o.lease_expires_at <= p_now)
      order by o.available_at, o.created_at
      for update of o skip locked
      limit p_limit
    ), claimed as (
      update recovery_delivery_outbox o
      set status = 'PROCESSING', attempts = o.attempts + 1, claimed_at = p_now, lease_expires_at = p_now + interval '5 minutes', claim_token = gen_random_uuid(), updated_at = p_now
      from eligible
      where o.id = eligible.id
      returning o.id, o.claim_token, o.delivery_payload_ciphertext, o.attempts
    )
    select coalesce(jsonb_agg(jsonb_build_object('id', id, 'claimToken', claim_token, 'deliveryPayloadCiphertext', delivery_payload_ciphertext, 'attempts', attempts)), '[]'::jsonb)
    from claimed
  );
end; $$;

create or replace function complete_recovery_delivery(p_delivery_id uuid, p_claim_token uuid, p_now timestamptz)
returns boolean language plpgsql as $$
declare v_updated integer;
begin
  update recovery_delivery_outbox
  set status = 'SENT', sent_at = p_now, delivery_payload_ciphertext = null, claim_token = null, lease_expires_at = null, updated_at = p_now
  where id = p_delivery_id and status = 'PROCESSING' and claim_token = p_claim_token;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end; $$;

create or replace function fail_recovery_delivery(p_delivery_id uuid, p_claim_token uuid, p_max_attempts integer, p_next_attempt_at timestamptz, p_now timestamptz)
returns text language plpgsql as $$
declare v_status text;
begin
  update recovery_delivery_outbox
  set status = case when attempts >= p_max_attempts then 'FAILED' else 'PENDING' end,
      available_at = case when attempts >= p_max_attempts then available_at else p_next_attempt_at end,
      claim_token = null, lease_expires_at = null, updated_at = p_now
  where id = p_delivery_id and status = 'PROCESSING' and claim_token = p_claim_token
  returning status into v_status;
  return coalesce(v_status, 'FAILED');
end; $$;

commit;
