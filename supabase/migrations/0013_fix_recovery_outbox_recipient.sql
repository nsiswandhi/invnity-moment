-- Keep recovery delivery recipients only inside the encrypted payload.
alter table recovery_delivery_outbox drop column if exists recipient_email;
