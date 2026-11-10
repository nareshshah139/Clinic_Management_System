const http = require('http');
const fs = require('fs');
const path = require('path');

const out = path.join(__dirname, 'collector.jsonl');
fs.writeFileSync(out, '');

const STAFF = {
  id: 'cmstaff000000000000000001',
  firstName: 'Ravi',
  lastName: 'Kumar',
  email: 'ravi.kumar@clinic.example',
  phone: '9876543210',
  role: 'DOCTOR',
  status: 'ACTIVE',
  branchId: 'branch-seed-1',
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

http
  .createServer((req, res) => {
    const cors = {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors);
      return res.end();
    }
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      fs.appendFileSync(
        out,
        JSON.stringify({
          method: req.method,
          url: req.url,
          referer: req.headers.referer ?? null,
          origin: req.headers.origin ?? null,
          cookie: req.headers.cookie ?? null,
          clientId: req.headers['openpanel-client-id'] ?? null,
          sdkName: req.headers['openpanel-sdk-name'] ?? null,
          body,
        }) + '\n',
      );
      res.writeHead(200, { ...cors, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ deviceId: 'device-1', sessionId: 'session-1' }));
    });
  })
  .listen(4010, () => console.log('collector on 4010'));

http
  .createServer((req, res) => {
    const url = req.url.split('?')[0];
    const json = (status, value) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(value));
    };
    if (url === '/auth/me') return json(200, { id: STAFF.id, role: STAFF.role, branchId: STAFF.branchId });
    if (url === `/users/${STAFF.id}`) return json(200, STAFF);
    if (url === '/auth/logout') return json(200, { ok: true });
    return json(404, { message: 'stub backend has no such resource' });
  })
  .listen(4000, () => console.log('backend stub on 4000'));
