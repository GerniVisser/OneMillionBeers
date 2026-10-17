-- The natural key of a beer is the message that carried it, scoped to its group.
--
-- Several WhatsApp numbers now run in each group for redundancy, so the same
-- message arrives several times — typically 16 ms apart, but after an outage
-- WhatsApp replays a backlog and a number can be days behind. All of them carry
-- the same bare message id (verified across 385 images seen by two numbers over
-- two days: 385/385 identical), so this index is what makes a redundant
-- collector fleet idempotent. It holds no time window, which is what makes an
-- arbitrary delay safe.
--
-- Scoping to group_id also closes a live defect: a bare WhatsApp message hash is
-- not globally unique, so a collision across two groups let one group's revoke
-- delete the other group's row, and then its photo from S3.
--
-- The new index is strictly weaker than the one it replaces — every row set that
-- satisfied UNIQUE(source_message_id) satisfies this — so it cannot fail to
-- build on existing data: pre-V8 NULLs, the composite-form ids written before
-- the collector settled on the bare hash, and seeded rows all survive untouched.
DROP INDEX idx_beer_logs_source_message_id;

CREATE UNIQUE INDEX idx_beer_logs_group_message
  ON beer_logs (group_id, source_message_id)
  WHERE source_message_id IS NOT NULL;

-- "Delete for everyone" is a fact about a WhatsApp message, not about a row of
-- ours, and it can arrive before the message does: WhatsApp delivers the revoke
-- first often enough that the lab caught it twice in a day, up to 13 s ahead.
-- The delete then finds nothing, the message lands afterwards, and the beer is
-- logged permanently. So the revocation has to be recorded independently of
-- beer_logs and outlive the row it deletes.
--
-- Keyed on the upstream identifiers rather than groups.id so the revoke path
-- never has to create a group row for a group no beer has ever come from.
CREATE TABLE beer_log_revocations (
  source_group_id   TEXT        NOT NULL,
  source_message_id TEXT        NOT NULL,
  revoked_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_group_id, source_message_id)
);
