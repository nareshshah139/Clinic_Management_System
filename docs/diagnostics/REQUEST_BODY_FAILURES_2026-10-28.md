# Request-body rejection diagnosis

The backend uses Nest's default JSON parser limit of **102,400 bytes (100 KiB)**. A larger request is rejected with HTTP 413 before a controller or save handler runs. The previous diagnostic read only `req.route.path`, which is unavailable at that point, and therefore reported `unmatched` with the generic `request_rejected` category.

A local HTTP reproduction using the locked Nest 11 and Express 5 dependencies confirmed the boundary:

```text
102400 bytes: HTTP 200, handler called
102401 bytes: HTTP 413, handler not called
```

These are synthetic requests to a test controller. The old production logs do not contain the rejected route or body size, so they cannot identify the original form or record retrospectively.

## A concrete payload contributor

`frontend/src/components/visits/MedicalVisitForm.tsx` reads a print-background image as a data URL. **Save Doctor Default** includes that base64 string in `metadata.rxPrintProfile.printBgUrl` and sends it to `PATCH /users/:id/profile`.

A synthetic 102,400-byte PNG produces a **136,607-byte JSON body** with this shape. It exceeds the current parser limit before any other profile preferences are included. Other profile actions also resend stored metadata. This establishes a reproducible contributor, but does not prove which form caused the historical production failures. Visit-photo uploads use a separate multipart route.

## Diagnostic changes

- HTTP 413 receives the fixed category `payload_too_large` and a useful public response with the existing request reference.
- Pre-routing errors can carry a server-registered route template. `routeSource: registered_template` means a candidate inferred from the registered method and path matcher; it does not mean the handler ran.
- Known body-parser errors include `parserErrorType`. Numeric fields are `bodyLimitBytes`, `bodyDeclaredBytes`, and `bodyReceivedBytes`, when available. Counts describe the parser stream, which can be decompressed, rather than network transfer size.
- Types are allowlisted and byte counts must be nonnegative safe integers. Bodies, images, URL values, headers, identifiers, raw exceptions, and stacks remain excluded.

The parser limit and save behavior are unchanged. Unsupported route shapes, mounted routers, malformed encodings, or unfamiliar Express routing internals leave attribution unmatched. Nest wraps some malformed-JSON exceptions before the diagnostic filter, so unavailable parser metadata stays absent.

## Design choice

Server-owned route matching covers existing clients and direct API calls without changing every caller. A client-operation header could distinguish several actions sharing one endpoint, but would require caller updates and remain an untrusted intent label. The implementation uses existing pure Express matchers and never calls the state-mutating layer matcher.

## Verification

The failing regression was committed before the implementation. The original HTTP reproduction was then rerun against the fix:

```text
102401 bytes: HTTP 413, route /patients/:id,
payload_too_large, entity.too.large,
bodyLimitBytes 102400, bodyDeclaredBytes 102401,
handler not called, request reference preserved, no private data leaked
```

- 22 tests passed across the HTTP and inventory diagnostic suites. Cases include the exact size boundary, nested profile-image payloads, chunked and compressed requests, invalid metadata, malformed paths, unsupported routes, and routing-state isolation.
- The backend typecheck and build passed.
- `cc-check format` and `cc-check list` passed for the affected logging files. Contract consumers and privacy behavior were also reviewed.

Run the regression suites from the repository root with:

```sh
npm test --workspace=backend -- --runInBand src/shared/logging/http-observability.spec.ts src/modules/inventory/tests/inventory-observability.spec.ts
npm run build --workspace=backend
```

## Production follow-up

These diagnostics require a backend deployment. For the next rejection, group by the registered route candidate, parser type, limit, byte counts, and request reference. Do not merge old unmatched incidents into a known form without new evidence.

If the profile-image path is confirmed, use an uploaded image reference or a bounded image representation rather than growing every JSON request with base64. Review large inventory documents separately. A successful response under a different reference does not establish recovery of an earlier rejected record.
