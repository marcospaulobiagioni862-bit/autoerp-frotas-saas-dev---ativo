# CONTRACT-CANCEL-LIFECYCLE-GATE-1

The authoritative route now allows a new cancellation transition only from `DRAFT` or `AWAITING_SIGNATURE` and preserves idempotency for `CANCELLED`.

The focused TypeScript regression `contractCancelLifecycleRegression.ts` locks the lifecycle policy. The existing `contractAuthorityIntegration.ts` remains the integration authority for tenant isolation, vehicle bindings, receivables and audit rollback behavior.

Before merge, the AutoERP PR Gates must be fully green. No schema, migration, Render, Neon, production data or external integration is changed by this wave.
