import { PricingPolicyValues, PricingTierKey } from './pricing-policy.util';

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
    overdueFee = hasActiveSubscription
      ? policy.feeX1
      : policy.feeX1 + policy.feeX2;
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
