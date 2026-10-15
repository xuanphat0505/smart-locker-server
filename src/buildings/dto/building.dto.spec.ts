import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateBuildingDto, UpdateBuildingDto } from './building.dto';

// Gom thông báo lỗi của mọi trường, kể cả trường lồng nhau, thành một danh sách chuỗi để dễ kiểm tra
async function errorMessages(
  cls: new () => object,
  plain: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, plain), {
    whitelist: true,
  });
  const collect = (list: typeof errors): string[] =>
    list.flatMap((e) => [
      ...Object.values(e.constraints ?? {}),
      ...collect(e.children ?? []),
    ]);
  return collect(errors);
}

describe('Building DTO: tài khoản ngân hàng', () => {
  const validBuilding = {
    name: 'Tòa S1.01',
    code: 'S1.01',
    address: 'Khu đô thị Vinhomes Grand Park',
    totalFloors: 25,
    totalApartments: 500,
  };
  const validBank = {
    bankBin: '970422',
    bankName: 'MBBank',
    accountNumber: '0123456789',
    accountName: 'BQL CHUNG CU TECCO TOWER',
  };

  describe('CreateBuildingDto', () => {
    it('tạo tòa đủ thông tin ngân hàng thì hợp lệ', async () => {
      expect(
        await errorMessages(CreateBuildingDto, {
          ...validBuilding,
          bankAccount: validBank,
        }),
      ).toEqual([]);
    });

    it('thiếu bankAccount thì bị từ chối với thông báo rõ ràng', async () => {
      const messages = await errorMessages(CreateBuildingDto, validBuilding);

      expect(messages).toContain(
        'Phải cung cấp thông tin tài khoản ngân hàng thụ hưởng',
      );
    });

    it('bankAccount rỗng thì bị từ chối', async () => {
      const messages = await errorMessages(CreateBuildingDto, {
        ...validBuilding,
        bankAccount: {},
      });

      expect(messages.length).toBeGreaterThan(0);
    });

    it('một trong ba trường nhận tiền bị bỏ trống thì bị từ chối', async () => {
      const messages = await errorMessages(CreateBuildingDto, {
        ...validBuilding,
        bankAccount: { ...validBank, accountNumber: '' },
      });

      expect(messages).toContain('Số tài khoản không được để trống');
    });

    it('bankName là tùy chọn', async () => {
      const { bankName, ...withoutName } = validBank;
      void bankName;

      expect(
        await errorMessages(CreateBuildingDto, {
          ...validBuilding,
          bankAccount: withoutName,
        }),
      ).toEqual([]);
    });
  });

  describe('UpdateBuildingDto', () => {
    it('không gửi bankAccount thì hợp lệ để vẫn sửa được thông tin khác', async () => {
      expect(await errorMessages(UpdateBuildingDto, { name: 'Tên mới' })).toEqual(
        [],
      );
    });

    it('chỉ gửi một trường ngân hàng hợp lệ thì hợp lệ (các trường khác giữ nguyên)', async () => {
      expect(
        await errorMessages(UpdateBuildingDto, {
          bankAccount: { accountName: 'BQL MOI' },
        }),
      ).toEqual([]);
    });

    it('gửi chuỗi rỗng cho một trường ngân hàng thì bị từ chối', async () => {
      const messages = await errorMessages(UpdateBuildingDto, {
        bankAccount: { accountNumber: '' },
      });

      expect(messages).toContain('Số tài khoản không được để trống');
    });
  });
});
