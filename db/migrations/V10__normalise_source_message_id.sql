-- WAHA NOWEB stores payload.id as the full composite key:
--   false_{groupJid}@g.us_{messageHash}_{participantJid}
-- e.g. false_120363407257275527@g.us_2A8FB62D10054AF8F99B_102830828470452@lid
--
-- The message.revoked event exposes only the bare hash in revokedMessageId.
-- Normalise existing rows to store just the hash so the two values match.
--
-- Rows that already hold a bare hash (no @g.us_ segment) are left unchanged.
-- Non-WhatsApp source_message_ids (e.g. Telegram numeric IDs) have no @g.us_
-- segment, so they are also untouched by the WHERE filter.
UPDATE beer_logs
SET source_message_id = SPLIT_PART(
  SPLIT_PART(source_message_id, '@g.us_', 2),
  '_',
  1
)
WHERE source_message_id LIKE '%@g.us\_%' ESCAPE '\'
  AND source_message_id IS NOT NULL;
