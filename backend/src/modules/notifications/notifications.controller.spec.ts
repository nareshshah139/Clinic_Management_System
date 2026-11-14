import { BadRequestException } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';

describe('NotificationsController', () => {
  const make = (email: string | null | undefined) => {
    const notifications = {
      emailStatus: jest.fn().mockReturnValue({ configured: true, from: 'clinic@example.com' }),
      sendEmail: jest.fn().mockResolvedValue(undefined),
    };
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue(email === undefined ? null : { email }) } };
    return { notifications, prisma, controller: new NotificationsController(notifications as any, prisma as any) };
  };

  it('returns the email status', () => {
    expect(make('a@b.com').controller.status()).toEqual({ configured: true, from: 'clinic@example.com' });
  });

  it('sends the test email only to the requesting user own address', async () => {
    const { controller, notifications, prisma } = make('doc@example.com');
    const result = await controller.test({ user: { sub: 'user-1' } });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'user-1' }, select: { email: true } });
    expect(notifications.sendEmail).toHaveBeenCalledWith({
      to: 'doc@example.com',
      subject: 'Test email from your clinic',
      text: 'Email sending is working.',
    });
    expect(result).toEqual({ sent: true, to: 'doc@example.com' });
  });

  it('rejects with 400 when the user has no email', async () => {
    const { controller, notifications } = make(null);
    await expect(controller.test({ user: { sub: 'user-1' } })).rejects.toBeInstanceOf(BadRequestException);
    expect(notifications.sendEmail).not.toHaveBeenCalled();
  });
});
