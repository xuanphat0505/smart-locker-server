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

  (Object.keys(DEFAULT_PRICING_POLICY) as (keyof PricingPolicyValues)[]).forEach((key) => {
    const value = policy[key];
    if (typeof value === 'number' && !Number.isNaN(value)) {
      merged[key] = value;
    }
  });
  return merged;
}

// Dựng bảng phí 4 chặng từ biểu phí, công thức khớp với calculateStorageFee
export function buildPricingTiers(policy: PricingPolicyValues): PricingTier[] {
  const cappedOverdueFee = Math.min(policy.feeX1 + policy.feeX2, policy.maxOverdueFeeCap);

  // Gói tháng luôn được miễn phí tối thiểu bằng chặng T1 của khách thường
  const subscriberFreeHours = Math.max(policy.t1Hours, policy.subscriberFreeHours);

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

// Dữ liệu đầu vào để tính phí lưu kho của một kiện hàng
export interface StorageFeeInput {
  droppedOffAt: Date | string;
  paidUntil?: Date | string | null;
  totalFeePaid?: number;
  now: number;
  policy: PricingPolicyValues;
  hasActiveSubscription: boolean;
}

// Kết quả tính phí lưu kho
export interface StorageFeeResult {
  isOverdue: boolean;
  feeDue: number;
  hoursElapsed: number;
  currentTier: PricingTierKey;
  isPendingRetrieval: boolean;
  canExtend: boolean;
  freeUntilHours: number;
  baseFee: number;
  overdueFee: number;
  paidUntil?: Date;
  totalFeePaid: number;
}

// Tính phí lưu kho theo thời lượng kể từ lúc gửi: miễn phí đến mốc của từng loại tài khoản, sau đó phụ thu theo chặng
export function calculateStorageFee(input: StorageFeeInput): StorageFeeResult {
  const { policy, hasActiveSubscription, now } = input;
  const droppedOffAtMs = new Date(input.droppedOffAt).getTime();
  const totalFeePaid = input.totalFeePaid || 0;

  // Thời lượng lưu kho tính từ droppedOffAt, làm tròn lên theo giờ
  const hoursElapsed = Math.ceil((now - droppedOffAtMs) / (3600 * 1000));

  // Gói tháng miễn phí lâu hơn nhưng không bao giờ ngắn hơn khách thường
  const freeUntilHours = hasActiveSubscription
    ? Math.max(policy.t1Hours, policy.subscriberFreeHours)
    : policy.t1Hours;

  // Phí cơ bản mỗi lượt chỉ áp dụng cho khách thường, mặc định bằng 0
  const baseFee = hasActiveSubscription ? 0 : policy.perUseFee;

  const isPendingRetrieval = hoursElapsed >= policy.t3Hours;

  // Đã nộp phí gia hạn và vẫn trong hạn bảo chứng thì không thu thêm
  const paidUntil = input.paidUntil ? new Date(input.paidUntil) : undefined;
  if (paidUntil && now <= paidUntil.getTime()) {
    return {
      isOverdue: false,
      feeDue: 0,
      hoursElapsed,
      currentTier: 'FREE',
      isPendingRetrieval: false,
      canExtend: true,
      freeUntilHours,
      baseFee: 0,
      overdueFee: 0,
      paidUntil,
      totalFeePaid,
    };
  }

  // Còn trong thời gian miễn phí của loại tài khoản này
  if (hoursElapsed <= freeUntilHours && !isPendingRetrieval) {
    return {
      isOverdue: false,
      feeDue: baseFee,
      hoursElapsed,
      currentTier: 'FREE',
      isPendingRetrieval: false,
      canExtend: true,
      freeUntilHours,
      baseFee,
      overdueFee: 0,
      paidUntil: new Date(droppedOffAtMs + freeUntilHours * 3600 * 1000),
      totalFeePaid,
    };
  }

  // Phụ thu quá hạn: chặng 2 chỉ cấp một, chặng 3 cộng cả cấp hai (gói tháng vẫn chỉ cấp một), thu hồi tính như nhau
  let overdueFee: number;
  let currentTier: PricingTierKey;
  if (isPendingRetrieval) {
    overdueFee = policy.feeX1 + policy.feeX2;
    currentTier = 'RETRIEVAL';
  } else if (hoursElapsed <= policy.t2Hours) {
    overdueFee = policy.feeX1;
    currentTier = 'TIER_1';
  } else {
    overdueFee = hasActiveSubscription ? policy.feeX1 : policy.feeX1 + policy.feeX2;
    currentTier = 'TIER_2';
  }

  const maxCap = baseFee + policy.maxOverdueFeeCap;
  const rawFee = baseFee + overdueFee - totalFeePaid;

  return {
    isOverdue: true,
    feeDue: Math.max(0, Math.min(rawFee, maxCap)),
    hoursElapsed,
    currentTier,
    isPendingRetrieval,
    canExtend: !isPendingRetrieval,
    freeUntilHours,
    baseFee,
    overdueFee,
    paidUntil,
    totalFeePaid,
  };
}
