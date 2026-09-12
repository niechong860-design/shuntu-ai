export type RechargePackagePreview = {
  id: string;
  title: string;
  subtitle: string;
  price: string;
  baseCredits: number;
  bonusCredits: number;
  credits: number;
  features: string[];
  badgeText: string;
  isPopular: boolean;
  highlighted: boolean;
  doubleCredits: boolean;
  note?: string;
  sortOrder: number;
  buttonText: string;
  purchaseUrl: string;
};

// Trusted package definition shared by production D1 projection and payment
// validation. D1 remains the runtime source of the package rows.
export const RECHARGE_PACKAGES_V2: readonly RechargePackagePreview[] = [
  {
    id: "b5c1dce9-6742-4340-9149-93cee49a1e12",
    title: "轻享体验版",
    subtitle: "适合首次体验与偶尔创作",
    price: "19.9",
    baseCredits: 2000,
    bonusCredits: 0,
    credits: 2000,
    features: ["2,000 积分", "低门槛体验", "适合首次尝试"],
    badgeText: "新客体验",
    isPopular: false,
    highlighted: false,
    doubleCredits: false,
    sortOrder: 10,
    buttonText: "立即体验",
    purchaseUrl: "",
  },
  {
    id: "52d12003-fc30-4705-8daa-ceaf18d15915",
    title: "灵感创作版",
    subtitle: "适合日常轻度创作",
    price: "69.9",
    baseCredits: 7000,
    bonusCredits: 1000,
    credits: 8000,
    features: ["7,000 基础积分", "赠送 1,000 积分", "实际到账 8,000 积分"],
    badgeText: "入门推荐",
    isPopular: false,
    highlighted: false,
    doubleCredits: false,
    sortOrder: 20,
    buttonText: "立即升级",
    purchaseUrl: "",
  },
  {
    id: "aaaa2b94-855c-4b2a-b6ea-e149fd15c834",
    title: "进阶创作版",
    subtitle: "适合稳定创作与频繁出图",
    price: "169",
    baseCredits: 17000,
    bonusCredits: 7000,
    credits: 24000,
    features: ["17,000 基础积分", "赠送 7,000 积分", "实际到账 24,000 积分"],
    badgeText: "超值升级",
    isPopular: false,
    highlighted: false,
    doubleCredits: false,
    sortOrder: 30,
    buttonText: "立即升级",
    purchaseUrl: "",
  },
  {
    id: "be1e3e6d-b5a1-41ff-82d4-dca10da91a59",
    title: "专业创作版",
    subtitle: "适合高频创作与长期使用",
    price: "229",
    baseCredits: 23000,
    bonusCredits: 17000,
    credits: 40000,
    features: ["23,000 基础积分", "赠送 17,000 积分", "实际到账 40,000 积分"],
    badgeText: "最受欢迎",
    isPopular: true,
    highlighted: true,
    doubleCredits: false,
    note: "比 ¥169 多 ¥60，多得 16,000 积分",
    sortOrder: 40,
    buttonText: "立即购买",
    purchaseUrl: "",
  },
  {
    id: "73d892b5-b0d4-4c19-a588-fccde05b6792",
    title: "工作室版",
    subtitle: "适合重度创作与小型团队",
    price: "319",
    baseCredits: 32000,
    bonusCredits: 28000,
    credits: 60000,
    features: ["32,000 基础积分", "赠送 28,000 积分", "实际到账 60,000 积分"],
    badgeText: "专业推荐",
    isPopular: false,
    highlighted: false,
    doubleCredits: false,
    sortOrder: 50,
    buttonText: "选择工作室版",
    purchaseUrl: "",
  },
  {
    id: "41bec294-6d11-4593-94d3-07181afb69e6",
    title: "企业旗舰版",
    subtitle: "适合团队、批量生成与商业项目",
    price: "489",
    baseCredits: 49000,
    bonusCredits: 49000,
    credits: 98000,
    features: ["49,000 基础积分", "赠送 49,000 积分", "实际到账 98,000 积分", "赠送比例 100%"],
    badgeText: "企业优选",
    isPopular: false,
    highlighted: false,
    doubleCredits: true,
    sortOrder: 60,
    buttonText: "选择企业旗舰版",
    purchaseUrl: "",
  },
];

// Existing production package mappings remain supported. The candidate mapping
// must include package_id because ¥69.9 has a different candidate credit grant.
const LEGACY_PACKAGE_MAPPINGS_BY_ID = new Map<string, { amountCents: number; credits: number }>([
  ["b5c1dce9-6742-4340-9149-93cee49a1e12", { amountCents: 990, credits: 1000 }],
  ["52d12003-fc30-4705-8daa-ceaf18d15915", { amountCents: 2990, credits: 3180 }],
  ["aaaa2b94-855c-4b2a-b6ea-e149fd15c834", { amountCents: 6990, credits: 7560 }],
  ["be1e3e6d-b5a1-41ff-82d4-dca10da91a59", { amountCents: 12900, credits: 14170 }],
  ["73d892b5-b0d4-4c19-a588-fccde05b6792", { amountCents: 19900, credits: 22000 }],
]);

export function getConfiguredRechargePackage(packageId: string) {
  return RECHARGE_PACKAGES_V2.find((pkg) => pkg.id === packageId);
}

export function hasTrustedPackageCreditMapping(packageId: string, amountCents: number, credits: number) {
  const configuredPackage = getConfiguredRechargePackage(packageId);
  if (configuredPackage) {
    if (configuredPackage.credits === credits && priceToCents(configuredPackage.price) === amountCents) return true;
  }
  // Keep old rows payable during the short code-first rollout window, but only
  // for the same stable package_id and its original locked values.
  const legacy = LEGACY_PACKAGE_MAPPINGS_BY_ID.get(packageId);
  return legacy?.amountCents === amountCents && legacy.credits === credits;
}

function priceToCents(price: string) {
  const [yuan, fraction = ""] = price.split(".");
  return Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
}
