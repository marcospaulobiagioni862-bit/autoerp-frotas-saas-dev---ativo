# Server-side acceptance checklist

- ACTIVE cancellation attempt must return 409.
- Contract must remain ACTIVE.
- Bound vehicle must remain RENTED with the same driver/contract IDs.
- Receivable count must remain unchanged.
- No cancellation audit mutation may be created.
- DRAFT and AWAITING_SIGNATURE remain eligible for cancellation.
- CANCELLED remains idempotent.

These assertions are the acceptance criteria for issue #439 and must be verified by the authoritative integration suite before merge.
