DELETE FROM processed_actions WHERE processed_at < now() - interval '14 days';
DELETE FROM processed_updates WHERE processed_at < now() - interval '7 days';
DELETE FROM bot_sessions WHERE expires_at < now();
DELETE FROM rate_limits WHERE expires_at < now();
