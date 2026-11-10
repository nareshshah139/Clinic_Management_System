# OpenPanel analytics: browser proof

This check drives the real frontend in a browser and records every request that reaches the analytics collector. It fails if a patient ID, patient name, phone number, staff name or email, OAuth code, query string, page title or cookie appears in any request body or header.

## What it runs

- `servers.cjs` starts a stand-in OpenPanel collector on port 4010 and a stub backend on port 4000. The collector appends each request to `collector.jsonl`. The stub backend signs in one staff member whose profile has a name, email and phone number.
- `verify.cjs` opens five dashboard screens whose URLs carry a patient ID, a patient name, a phone number, a visit ID and an OAuth code. It then asserts on what the collector received.

## Run it

Playwright must be installed. Start the servers, then the frontend with analytics configured.

```bash
node verification/openpanel-analytics-2026-11-10/servers.cjs
```

```bash
cd frontend && NEXT_PUBLIC_OPENPANEL_CLIENT_ID=verify-client NEXT_PUBLIC_OPENPANEL_API_URL=http://localhost:4010 NEXT_PUBLIC_API_PROXY=http://localhost:4000/ npx next dev --port 3100
```

```bash
node verification/openpanel-analytics-2026-11-10/verify.cjs configured
```

Restart the frontend without the two `NEXT_PUBLIC_OPENPANEL_*` variables and run the second mode. It asserts that the browser sends no request to the collector.

```bash
node verification/openpanel-analytics-2026-11-10/verify.cjs unconfigured
```

## Result on 2026-11-10

- `configured` passed. The collector received 9 requests: 4 `identify` payloads (one per full page load) and 5 `screen_view` payloads. `collector-configured.jsonl` holds them verbatim.
- `unconfigured` passed with 0 requests.

## What it does not cover

The stand-in collector accepts every request. This check does not prove that a real OpenPanel instance accepts the payloads, groups screens by the route template, or allows the clinic's origin.
