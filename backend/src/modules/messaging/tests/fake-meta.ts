import { createServer, IncomingMessage, Server } from 'http';
import { AddressInfo } from 'net';

export type FakeMetaCall = { path: string; auth: string | undefined; body: any };

/** A stand-in for the Meta Graph API messages endpoint: records calls and answers as told. */
export async function startFakeMeta() {
  const calls: FakeMetaCall[] = [];
  let next: Array<{ status: number; body: any }> = [];
  let counter = 0;
  const server: Server = createServer((req: IncomingMessage, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      calls.push({ path: req.url ?? '', auth: req.headers.authorization, body: raw ? JSON.parse(raw) : null });
      const answer = next.shift() ?? { status: 200, body: { messages: [{ id: `wamid.fake.${++counter}` }] } };
      res.writeHead(answer.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(answer.body));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as AddressInfo).port;
  return {
    baseUrl: `http://127.0.0.1:${port}/v18.0`,
    calls,
    answerNext: (status: number, body: any) => next.push({ status, body }),
    reset: () => { calls.length = 0; next = []; },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
