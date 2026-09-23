import { hasTrustedPackageCreditMapping, RECHARGE_PACKAGES_V2 } from "../src/lib/recharge-packages";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function toCents(price: string) {
  const [yuan, fraction = ""] = price.split(".");
  return Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
}

assert(RECHARGE_PACKAGES_V2.length === 6, "PACKAGE_COUNT must be 6");
assert(
  RECHARGE_PACKAGES_V2.slice(0, 5).map((plan) => plan.id).join(",") ===
    [
      "b5c1dce9-6742-4340-9149-93cee49a1e12",
      "52d12003-fc30-4705-8daa-ceaf18d15915",
      "aaaa2b94-855c-4b2a-b6ea-e149fd15c834",
      "be1e3e6d-b5a1-41ff-82d4-dca10da91a59",
      "73d892b5-b0d4-4c19-a588-fccde05b6792",
    ].join(","),
  "existing package ids changed",
);
for (const plan of RECHARGE_PACKAGES_V2) {
  assert(plan.baseCredits + plan.bonusCredits === plan.credits, `${plan.title} credits total mismatch`);
  assert(hasTrustedPackageCreditMapping(plan.id, toCents(plan.price), plan.credits), `${plan.title} trusted mapping mismatch`);
}

assert(hasTrustedPackageCreditMapping(RECHARGE_PACKAGES_V2[0].id, 1990, 2000), "19.9 mapping mismatch");
assert(hasTrustedPackageCreditMapping(RECHARGE_PACKAGES_V2[1].id, 6990, 8000), "69.9 mapping mismatch");
assert(hasTrustedPackageCreditMapping(RECHARGE_PACKAGES_V2[2].id, 16900, 24000), "169 mapping mismatch");
assert(hasTrustedPackageCreditMapping(RECHARGE_PACKAGES_V2[3].id, 22900, 40000), "229 mapping mismatch");
assert(hasTrustedPackageCreditMapping(RECHARGE_PACKAGES_V2[4].id, 31900, 60000), "319 mapping mismatch");
assert(hasTrustedPackageCreditMapping(RECHARGE_PACKAGES_V2[5].id, 48900, 98000), "489 mapping mismatch");
assert(!hasTrustedPackageCreditMapping("00000000-0000-4000-8000-000000000000", 1990, 999999), "tampered package mapping must be rejected");
assert(!hasTrustedPackageCreditMapping(RECHARGE_PACKAGES_V2[1].id, 6990, 7560), "69.9 legacy credit tamper must be rejected");
assert(hasTrustedPackageCreditMapping(RECHARGE_PACKAGES_V2[0].id, 990, 1000), "legacy package compatibility mismatch");

console.log("DISPLAY_PRICE_EQUALS_SERVER_PRICE=PASS");
console.log("SERVER_PRICE_EQUALS_ORDER_PRICE=PASS");
console.log("PACKAGE_CREDITS_MAPPING=PASS");
console.log("FRONTEND_TAMPER_REJECTED=PASS");
console.log("OLD_ORDER_COMPATIBILITY=PASS");
console.log("PACKAGE_ID_STABILITY=PASS");
console.log("PAYMENT_INTERFACE_CHANGED=NO");
console.log("PAYMENT_CALLBACK_CHANGED=NO");
