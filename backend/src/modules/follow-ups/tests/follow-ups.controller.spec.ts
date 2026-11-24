import { ForbiddenException } from '@nestjs/common';
import { FollowUpsController } from '../follow-ups.controller';

describe('FollowUpsController', () => {
  it('PP-24: only an OWNER can import, even though ADMIN and DOCTOR pass every role list', async () => {
    const importData = jest.fn().mockResolvedValue([]);
    const controller = new FollowUpsController({ importData } as any);
    for (const role of ['ADMIN', 'DOCTOR', 'RECEPTION'] as const) {
      expect(() => controller.importData({ user: { id: 'u', branchId: 'A', role } } as any)).toThrow(ForbiddenException);
    }
    expect(importData).not.toHaveBeenCalled();
    await controller.importData({ user: { id: 'own', branchId: 'A', role: 'OWNER' } } as any);
    expect(importData).toHaveBeenCalledWith('own');
  });
});
