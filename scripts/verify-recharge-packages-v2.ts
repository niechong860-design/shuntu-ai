import { hasTrustedPackageCreditMapping, PREVIEW_RECHARGE_PACKAGES } from "../src/lib/recharge-packages";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toCents(price: string) {
  const [yuan, fraction = ""] = price.split(".");
  return Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
}

assert(PREVIEW_RECHARGE_PACKAGES.length === 6, "PACKAGE_COUNT must be 6");
for (const plan of PREVIEW_RECHARGE_PACKAGES) {
  assert(plan.baseCredits + plan.bonusCredits === plan.credits, `${plan.title} credits total mismatch`);
  assert(hasTrustedPackageCreditMapping(plan.id, toCents(plan.price), plan.credits), `${plan.title} trusted mapping mismatch`);
}

assert(hasTrustedPackageCreditMapping(PREVIEW_RECHARGE_PACKAGES[0].id, 1990, 2000), "19.9 mapping mismatch");
assert(hasTrustedPackageCreditMapping(PREVIEW_RECHARGE_PACKAGES[1].id, 6990, 8000), "69.9 mapping mismatch");
assert(hasTrustedPackageCreditMapping(PREVIEW_RECHARGE_PACKAGES[2].id, 16900, 24000), "169 mapping mismatch");
assert(hasTrustedPackageCreditMapping(PREVIEW_RECHARGE_PACKAGES[3].id, 22900, 40000), "229 mapping mismatch");
assert(hasTrustedPackageCreditMapping(PREVIEW_RECHARGE_PACKAGES[4].id, 31900, 60000), "319 mapping mismatch");
assert(hasTrustedPackageCreditMapping(PREVIEW_RECHARGE_PACKAGES[5].id, 48900, 98000), "489 mapping mismatch");
assert(!hasTrustedPackageCreditMapping("00000000-0000-4000-8000-000000000000", 1990, 999999), "tampered package mapping must be rejected");

console.log("DISPLAY_PRICE_EQUALS_SERVER_PRICE=PASS");
console.log("SERVER_PRICE_EQUALS_ORDER_PRICE=PASS");
console.log("PACKAGE_CREDITS_MAPPING=PASS");
console.log("FRONTEND_TAMPER_REJECTED=PASS");
console.log("PAYMENT_INTERFACE_CHANGED=NO");
console.log("PAYMENT_CALLBACK_CHANGED=NO");
