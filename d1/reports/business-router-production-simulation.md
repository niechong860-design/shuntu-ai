# Business Router Production Simulation

## DATABASE_PRIMARY

- unset: lovable
- empty: lovable
- lovable: lovable
- d1: d1
- invalid values fall back to lovable: 1=lovable, D1=lovable, dl=lovable, postgres=lovable, true=lovable

## D1 Binding Lazy Init

- PASS: DatabaseRouter returns the Lovable adapter before resolving env.DB when primary is lovable.
- PASS: DATABASE_PRIMARY=d1 remains the only path that requires a DB binding.

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
- admin legacy write guards: 22
- inspiration legacy write guards: 5

## Outbox Guards

- batchRequiresBusinessStatements: PASS
- batchRequiresOutboxEvents: PASS
- payloadGuardPresent: PASS
- d1WritesUseOutbox: PASS
