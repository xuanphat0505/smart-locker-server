// Cấu hình biểu phí 4 chặng của một Tòa Nhà
export interface PricingPolicyValues {
  monthlySubscriptionFee: number;
  perUseFee: number;
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
  perUseFee: 5000,
  t1Hours: 12,
  t2Hours: 24,
  t3Hours: 48,
  feeX1: 10000,
  feeX2: 15000,
  maxOverdueFeeCap: 25000,
};

// Dựng bảng phí 4 chặng từ biểu phí, công thức khớp với calculateFee trong PaymentsService
export function buildPricingTiers(policy: PricingPolicyValues): PricingTier[] {
  const cappedOverdueFee = Math.min(
    policy.feeX1 + policy.feeX2,
    policy.maxOverdueFeeCap,
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
      subscriberFee: policy.feeX1,
      retailFee: policy.perUseFee + policy.feeX1,
    },
    {
      tier: 'TIER_2',
      fromHours: policy.t2Hours,
      toHours: policy.t3Hours,
      subscriberFee: cappedOverdueFee,
      retailFee: policy.perUseFee + cappedOverdueFee,
    },
    {
      tier: 'RETRIEVAL',
      fromHours: policy.t3Hours,
      toHours: null,
      subscriberFee: cappedOverdueFee,
      retailFee: policy.perUseFee + cappedOverdueFee,
    },
  ];
}
