// Thông tin tài khoản ngân hàng đã đủ để dựng mã QR và đối soát tiền
export interface ConfiguredBankAccount {
  bankBin: string;
  accountNumber: string;
  accountName: string;
  bankName?: string;
}

// Đối tượng có thể chứa tài khoản ngân hàng thụ hưởng, thường là tòa nhà
interface HasBankAccount {
  bankAccount?: {
    bankBin?: string;
    accountNumber?: string;
    accountName?: string;
    bankName?: string;
  } | null;
}

// Kiểm tra tòa nhà đã có đủ bankBin, accountNumber và accountName; dùng kiểu khẳng định để các đoạn sau truy cập tài khoản mà không cần kiểm tra lại
export function isPaymentConfigured<T extends HasBankAccount>(
  building: T | null | undefined,
): building is T & { bankAccount: ConfiguredBankAccount } {
  const bank = building?.bankAccount;
  return Boolean(bank?.bankBin && bank?.accountNumber && bank?.accountName);
}
