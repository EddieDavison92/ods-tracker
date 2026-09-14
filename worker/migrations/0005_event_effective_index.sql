-- Filter and order the change feed by the date a change took effect, not only when it was detected.
CREATE INDEX change_event_effective ON change_event (effective_date, id);
