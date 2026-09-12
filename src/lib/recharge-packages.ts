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

// Candidate-only configuration for the 0% Version Preview. It is intentionally
// kept out of production D1 so the current production package rows are unchanged.
export const PREVIEW_RECHARGE_PACKAGES: readonly RechargePackagePreview[] = [
  {
    id: "a885967a-32c3-4697-81e2-281cfdfb4968",
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
    id: "89eb193d-f99b-4d69-81e1-5c26eca1c8ee",
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
    id: "5ffbb43a-39c1-4484-9e87-ee022abf9e80",
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
    id: "6a3d9fba-d047-45a9-82e4-2d5ff728c3d5",
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
    id: "16b54129-43ce-4881-b294-8454b18f1434",
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
export const LEGACY_PACKAGE_CREDITS_BY_CENTS = new Map<number, number>([
  [990, 1000],
  [2990, 3180],
  [6990, 7560],
  [12900, 14170],
  [19900, 22000],
]);

export function getPreviewRechargePackage(packageId: string) {
  return PREVIEW_RECHARGE_PACKAGES.find((pkg) => pkg.id === packageId);
}

export function hasTrustedPackageCreditMapping(packageId: string, amountCents: number, credits: number) {
  const previewPackage = getPreviewRechargePackage(packageId);
  if (previewPackage) {
    return previewPackage.credits === credits && priceToCents(previewPackage.price) === amountCents;
  }
  return LEGACY_PACKAGE_CREDITS_BY_CENTS.get(amountCents) === credits;
}

function priceToCents(price: string) {
  const [yuan, fraction = ""] = price.split(".");
  return Number(yuan) * 100 + Number(fraction.padEnd(2, "0"));
}
