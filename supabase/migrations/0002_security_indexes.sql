create index moments_event_participant_idx on moments (event_id, participant_id);
create index moments_published_cursor_idx on moments (event_id, published_at desc, id desc) where status = 'PUBLISHED' and deleted_at is null;
create index moments_category_published_idx on moments (event_id, category, published_at desc, id desc) where status = 'PUBLISHED' and deleted_at is null;
create index access_sessions_expiry_idx on access_sessions (expires_at) where revoked_at is null;
create index upload_reservations_expiry_idx on upload_reservations (expires_at) where status = 'RESERVED';
create unique index likes_one_active_per_anonymous_user_idx on likes (moment_id, anonymous_user_key_hash) where revoked_at is null;
