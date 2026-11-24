#!/usr/bin/env node
// TLS in front of a verify-clinic stack, so the browser keeps the portal's Secure __Host- cookie (Chromium drops
// Secure cookies set over http://127.0.0.1). Self-signed; drive it with ignoreHTTPSErrors.
//   node https-proxy.cjs --port 44300 --target http://127.0.0.1:38029
// Launch the stack with PORTAL_BASE_URL=https://127.0.0.1:<port> so portal writes from here pass the origin check.
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { execFileSync } = require("node:child_process");

const arg = (k) => (process.argv.includes(k) ? process.argv[process.argv.indexOf(k) + 1] : null);
const port = Number(arg("--port"));
const target = new URL(arg("--target"));
const dir = path.resolve("output/verify-clinic/tls");
fs.mkdirSync(dir, { recursive: true });
const key = path.join(dir, "key.pem");
const cert = path.join(dir, "cert.pem");
if (!fs.existsSync(cert)) {
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1", "-keyout", key, "-out", cert], { stdio: "ignore" });
}

https
  .createServer({ key: fs.readFileSync(key), cert: fs.readFileSync(cert) }, (req, res) => {
    const up = http.request({ host: target.hostname, port: target.port, path: req.url, method: req.method, headers: { ...req.headers, "x-forwarded-proto": "https" } }, (r) => {
      res.writeHead(r.statusCode, r.headers);
      r.pipe(res);
    });
    up.on("error", (e) => { res.writeHead(502); res.end(String(e.message)); });
    req.pipe(up);
  })
  .listen(port, "127.0.0.1", () => console.log(`HTTPS PROXY READY https://127.0.0.1:${port} -> ${target.origin}`));
