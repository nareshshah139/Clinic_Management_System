import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ChangePasswordDto } from '../dto/user.dto';

const problems = async (body: object) =>
  (await validate(plainToInstance(ChangePasswordDto, body))).map((e) => e.property);

describe('ChangePasswordDto', () => {
  it('accepts a current password of any length a reset could have set, up to 72', async () => {
    const current = 'a-25-character-password!!';
    expect(await problems({ currentPassword: current, newPassword: 'new-pass-456', confirmPassword: 'new-pass-456' })).toEqual([]);
    const long = 'x'.repeat(72);
    expect(await problems({ currentPassword: long, newPassword: long, confirmPassword: long })).toEqual([]);
  });

  it('refuses a new password under 8 or over 72 characters', async () => {
    expect(await problems({ currentPassword: 'old-pass-123', newPassword: 'short', confirmPassword: 'short' })).toEqual(['newPassword', 'confirmPassword']);
    const tooLong = 'x'.repeat(73);
    expect(await problems({ currentPassword: 'old-pass-123', newPassword: tooLong, confirmPassword: tooLong })).toEqual(['newPassword', 'confirmPassword']);
  });

  it('refuses a new password longer than the 72 bytes bcrypt reads, even under 72 characters', async () => {
    const accented = 'é'.repeat(40);
    expect(await problems({ currentPassword: 'old-pass-123', newPassword: accented, confirmPassword: accented })).toEqual(['newPassword', 'confirmPassword']);
  });
});
