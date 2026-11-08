-- Paid seats remain protected by seat_allocation. A session may own many paid
-- tickets, but only one unfinished checkout. Existing tickets are unchanged.
DROP INDEX IF EXISTS session_allocation;
CREATE UNIQUE INDEX session_allocation ON attempts(session)
WHERE status IN ('initializing','pending');
