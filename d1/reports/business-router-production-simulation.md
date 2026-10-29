# Business Router Production Simulation

## DATABASE_PRIMARY

- unset: d1
- empty: d1
- d1: d1
- legacy Lovable value is rejected; D1 is the only runtime authority

## D1 Binding Lazy Init

- PASS: DatabaseRouter rejects the retired Lovable adapter before resolving a binding.
- PASS: DATABASE_PRIMARY=d1 remains the only supported path that requires a DB binding.

## Production Paths

- adminUsesRouter: PASS
- adminNoBusinessRpcCalls: PASS
- adminLegacyWritesGuarded: PASS
- paymentUsesRouter: PASS
- paymentNoDirectSupabaseBusinessDb: PASS
- profileUsesRouter: PASS
- clientAuthNoProfileSupabaseRead: PASS
- settingsDialogNoProfileSupabaseWrite: PASS
- legacyGuardPresent: PASS
- inspirationLegacyWritesGuarded: PASS
- notifyUsesRouter: PASS
- thumbnailUsesRouter: PASS
- admin legacy write guards: 0
- inspiration legacy write guards: 5

## Outbox D1-Only Behavior

- enqueueHelperRetainedForAtomicAudit: PASS
- d1BusinessBatchesRemainAtomic: PASS
- outboxSchemaPreservedForHistory: PASS
- runtimeHealthReadsOnly: PASS
- legacyReplicationConsumerDisabled: PASS
