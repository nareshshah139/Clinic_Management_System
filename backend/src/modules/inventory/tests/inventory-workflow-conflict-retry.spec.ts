import { ConflictException } from '@nestjs/common';
import { InventoryWorkflowService } from '../inventory-workflow.service';

describe('Workflow document transactions under concurrent writers', () => {
  const conflict = () => Object.assign(new Error('Transaction failed due to a write conflict or a deadlock. Please retry your transaction'), { code: 'P2034' });
  const serviceFailing = (times: number) => {
    const $transaction = jest.fn(async (run: any) => {
      if ($transaction.mock.calls.length <= times) throw conflict();
      return run({});
    });
    return { service: new InventoryWorkflowService({ $transaction } as any), $transaction };
  };

  it('keeps retrying a serialization conflict until the other writer has committed', async () => {
    const { service, $transaction } = serviceFailing(6);
    await expect(service.transaction(async () => 'saved')).resolves.toBe('saved');
    expect($transaction).toHaveBeenCalledTimes(7);
  });

  it('tells the user to retry instead of exposing the database error when the conflict never clears', async () => {
    const { service } = serviceFailing(Infinity);
    const failure = await service.transaction(async () => 'saved').catch((error) => error);
    expect(failure).toBeInstanceOf(ConflictException);
    expect(failure.message).not.toMatch(/transaction|deadlock/i);
  }, 30000);

  it('does not retry failures that are not conflicts', async () => {
    const $transaction = jest.fn(async () => { throw new Error('Unique constraint failed'); });
    const service = new InventoryWorkflowService({ $transaction } as any);
    await expect(service.transaction(async () => 'saved')).rejects.toThrow('Unique constraint failed');
    expect($transaction).toHaveBeenCalledTimes(1);
  });
});
