-- Extend public album projections without altering existing album APIs.
create or replace function list_published_moments(p_event_id uuid, p_category text, p_cursor text, p_limit integer, p_anonymous_user_key_hash text)
returns jsonb language plpgsql stable as $$
declare v_limit integer := least(greatest(coalesce(p_limit, 30), 1), 50); v_cursor jsonb := decode_public_album_cursor(p_cursor);
begin
  if p_category is not null and p_category not in ('REUNI','PANGGUNG','FESTIVAL','BAZAAR','KOMUNITAS','ZERO_WASTE','NOSTALGIA','MOMEN_KITA') then raise exception 'INVALID_MOMENT_CATEGORY' using errcode = 'P0001'; end if;
  if p_anonymous_user_key_hash is not null and p_anonymous_user_key_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_LIKE_IDENTITY' using errcode = 'P0001'; end if;
  return (with page as (
    select m.id, m.category, coalesce(nullif(btrim(m.caption), ''), 'Momen berharga bersama teman-teman reuni.') as caption, p.name as "participantName", p.batch as "participantBatch", m.created_at as "createdAt", m.published_at as "publishedAt", m.r2_display_key as "r2DisplayKey", m.r2_thumbnail_key as "r2ThumbnailKey", m.r2_original_key as "r2OriginalKey", count(l.id)::integer as "likeCount", exists(select 1 from likes active_like where active_like.moment_id = m.id and active_like.anonymous_user_key_hash = p_anonymous_user_key_hash and active_like.revoked_at is null) as liked
    from moments m join participants p on p.id = m.participant_id left join likes l on l.moment_id = m.id and l.revoked_at is null
    where m.event_id = p_event_id and m.status = 'PUBLISHED' and m.deleted_at is null and (p_category is null or m.category = p_category) and (v_cursor is null or (m.published_at, m.id) < ((v_cursor->>'publishedAt')::timestamptz, (v_cursor->>'id')::uuid))
    group by m.id, p.id order by m.published_at desc, m.id desc limit v_limit + 1
  ), returned as (select * from page order by "publishedAt" desc, id desc limit v_limit)
  select jsonb_build_object('data', coalesce((select jsonb_agg(row_to_json(returned)) from returned), '[]'::jsonb), 'nextCursor', case when (select count(*) from page) > v_limit then (select replace(replace(replace(encode(convert_to(jsonb_build_object('publishedAt', "publishedAt", 'id', id)::text, 'UTF8'), 'base64'), '=', ''), '+', '-'), '/', '_') from returned order by "publishedAt" asc, id asc limit 1) else null end));
end; $$;

create or replace function get_published_moment(p_event_id uuid, p_moment_id uuid, p_anonymous_user_key_hash text)
returns jsonb language sql stable as $$
  select jsonb_build_object('id', m.id, 'category', m.category, 'caption', coalesce(nullif(btrim(m.caption), ''), 'Momen berharga bersama teman-teman reuni.'), 'participantName', p.name, 'participantBatch', p.batch, 'createdAt', m.created_at, 'publishedAt', m.published_at, 'r2DisplayKey', m.r2_display_key, 'r2ThumbnailKey', m.r2_thumbnail_key, 'r2OriginalKey', m.r2_original_key, 'likeCount', (select count(*)::integer from likes l where l.moment_id = m.id and l.revoked_at is null), 'liked', exists(select 1 from likes active_like where active_like.moment_id = m.id and active_like.anonymous_user_key_hash = p_anonymous_user_key_hash and active_like.revoked_at is null))
  from moments m join participants p on p.id = m.participant_id
  where m.event_id = p_event_id and m.id = p_moment_id and m.status = 'PUBLISHED' and m.deleted_at is null
$$;
