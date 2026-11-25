import { Prisma } from '@prisma/client';

const KEYWORDS = ['procedure', 'operation', 'surgery'];

export const isProcedureRoom = (type: string) => KEYWORDS.some((keyword) => type.toLowerCase().includes(keyword));

export async function procedureRoomIds(tx: Prisma.TransactionClient, branchId: string) {
  const rooms = await tx.room.findMany({
    where: { branchId, isActive: true },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    select: { id: true, type: true },
  });
  return rooms.filter((room) => isProcedureRoom(room.type)).map((room) => room.id);
}
