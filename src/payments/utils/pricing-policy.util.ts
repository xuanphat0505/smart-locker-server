// Cấu hình biểu phí 4 chặng của một Tòa Nhà
export interface PricingPolicyValues {
  monthlySubscriptionFee: number;
  perUseFee: number;
  subscriberFreeHours: number;
  t1Hours: number;
  t2Hours: number;
  t3Hours: number;
  feeX1: number;
  feeX2: number;
  maxOverdueFeeCap: number;
}

export type PricingTierKey = 'FREE' | 'TIER_1' | 'TIER_2' | 'RETRIEVAL';

// Một chặng phí: mốc giờ bắt đầu/kết thúc và mức phí cho gói tháng và khách lẻ
export interface PricingTier {
  tier: PricingTierKey;
  fromHours: number;
  toHours: number | null;
  subscriberFee: number;
  retailFee: number;
}

// Biểu phí mặc định khi tòa nhà chưa cấu hình riêng
export const DEFAULT_PRICING_POLICY: PricingPolicyValues = {
  monthlySubscriptionFee: 30000,
  perUseFee: 0,
  subscriberFreeHours: 24,
  t1Hours: 12,
  t2Hours: 24,
  t3Hours: 48,
  feeX1: 10000,
  feeX2: 15000,
  maxOverdueFeeCap: 25000,
};

// Trộn biểu phí của tòa nhà với biểu phí mặc định, trường nào thiếu hoặc không phải số thì lấy giá trị mặc định
export function mergePricingPolicy(
  policy?: Partial<PricingPolicyValues> | null,
): PricingPolicyValues {
  const merged = { ...DEFAULT_PRICING_POLICY };
  if (!policy) return merged;

  (Object.keys(DEFAULT_PRICING_POLICY) as (keyof PricingPolicyValues)[]).forEach(
    (key) => {
      const value = policy[key];
      if (typeof value === 'number' && !Number.isNaN(value)) {
        merged[key] = value;
      }
    },
  );
  return merged;
}

// Dựng bảng phí 4 chặng từ biểu phí, công thức khớp với calculateStorageFee
export function buildPricingTiers(policy: PricingPolicyValues): PricingTier[] {
  const cappedOverdueFee = Math.min(
    policy.feeX1 + policy.feeX2,
    policy.maxOverdueFeeCap,
  );

  // Gói tháng luôn được miễn phí tối thiểu bằng chặng T1 của khách thường
  const subscriberFreeHours = Math.max(
    policy.t1Hours,
    policy.subscriberFreeHours,
  );

  return [
    {
      tier: 'FREE',
      fromHours: 0,
      toHours: policy.t1Hours,
      subscriberFee: 0,
      retailFee: policy.perUseFee,
    },
    {
      tier: 'TIER_1',
      fromHours: policy.t1Hours,
      toHours: policy.t2Hours,
      subscriberFee: subscriberFreeHours >= policy.t2Hours ? 0 : policy.feeX1,
      retailFee: policy.perUseFee + policy.feeX1,
    },
    {
      tier: 'TIER_2',
      fromHours: policy.t2Hours,
      toHours: policy.t3Hours,
      // Gói tháng chỉ chịu phụ thu cấp một khi hết thời gian miễn phí, không cộng phụ thu cấp hai
      subscriberFee: subscriberFreeHours >= policy.t3Hours ? 0 : policy.feeX1,
      retailFee: policy.perUseFee + cappedOverdueFee,
    },
    {
      tier: 'RETRIEVAL',
      fromHours: policy.t3Hours,
      toHours: null,
      // Phí chuộc kiện đã chuyển về kho giống nhau cho mọi cư dân
      subscriberFee: cappedOverdueFee,
      retailFee: policy.perUseFee + cappedOverdueFee,
    },
  ];
}
