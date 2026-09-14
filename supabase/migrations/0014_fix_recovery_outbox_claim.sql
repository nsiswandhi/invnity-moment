begin;

create or replace function claim_recovery_delivery_outbox(p_limit integer, p_max_attempts integer, p_now timestamptz)
returns jsonb language plpgsql as $$
declare v_claimed jsonb;
begin
  if p_limit not between 1 and 100 or p_max_attempts not between 1 and 10 then raise exception 'INVALID_RECOVERY_OUTBOX_CLAIM'; end if;
  delete from recovery_delivery_outbox o using recovery_tokens t where o.recovery_token_id = t.id and t.expires_at <= p_now;
  delete from recovery_delivery_outbox where status = 'SENT' and sent_at < p_now - interval '1 day';
  delete from recovery_delivery_outbox where status = 'NOOP' and created_at < p_now - interval '1 day';
  update recovery_delivery_outbox
  set status = 'FAILED', claim_token = null, lease_expires_at = null, updated_at = p_now
  where status in ('PENDING', 'PROCESSING') and attempts >= p_max_attempts;
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
  into v_claimed
  from claimed;
  return v_claimed;
end; $$;

commit;
