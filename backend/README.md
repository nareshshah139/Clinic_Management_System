<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Prerequisites

- Node.js `>= 18`
- npm `>= 9`
- PostgreSQL database

## Environment configuration

Create a `.env` file in the backend root and provide the required variables:

```
DATABASE_URL="postgresql://user:password@localhost:5432/clinic"
JWT_SECRET="replace-with-secure-secret"
JWT_EXPIRES_IN="1d"
# Optional – enables /visits/transcribe endpoint
OPENAI_API_KEY="sk-..."
# Optional – enables Pharmacy Agent through Codex CLI using ChatGPT/Codex auth.
# Prefer CODEX_AUTH_JSON_B64 for browser OAuth cache; use CODEX_ACCESS_TOKEN for Codex access tokens.
CODEX_AUTH_JSON_B64="base64-encoded-codex-auth-json"
CODEX_ACCESS_TOKEN="codex-access-token-from-chatgpt"
# Optional – choose the transcription model (defaults to gpt-4o-transcribe)
OPENAI_TRANSCRIBE_MODEL="gpt-4o-transcribe" # or whisper-1, gpt-4o-mini-transcribe
# Optional – enable outbound WhatsApp via Meta Cloud
WHATSAPP_TOKEN="your-meta-whatsapp-cloud-api-token"
WHATSAPP_PHONE_NUMBER_ID="your-meta-whatsapp-phone-number-id"
```

The application performs a startup validation and will refuse to boot if `DATABASE_URL` or `JWT_SECRET` are missing. Missing optional values log helpful warnings.

### Transcription models

- Default is **gpt-4o-transcribe** for higher accuracy, robust multilingual and noisy audio handling.
- For faster and lighter loads, set `OPENAI_TRANSCRIBE_MODEL="gpt-4o-mini-transcribe"`.
- To use legacy Whisper, set `OPENAI_TRANSCRIBE_MODEL="whisper-1"`.

## Project setup

```bash
npm install
```

## Compile and run the project

```bash
# development
npm run start

# watch mode
npm run start:dev

# production mode
npm run start:prod
```

## Run tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```

## Migrations

The invoice numbering has been centralized. A new table `number_sequences` is introduced via Prisma model `NumberSequence`.

To apply the migration locally:

```bash
npm run prisma:generate
npm run prisma:migrate --name add-number-sequences
```

On production, ensure zero-downtime by applying the schema before deploying code that uses it.

## Diagnosing patient saves

The API writes one JSON `http.request_completed` event per response to stdout. It records
the request reference, route template, method, HTTP status, duration, attempt number and
outcome. Failures include a category (`invalid_request`, `unauthenticated`, `forbidden`,
`conflict`, `timeout`, `rate_limited`, etc.). DTO validation failures include declared field
and validator names; database failures include a Prisma code when available. New diagnostic
events exclude patient identifiers, clinical values, bodies, query strings, credentials and
raw exception messages/stacks. Existing database audit records remain separate.

`HTTP_LOG_LEVEL` defaults to `info` (all requests). Set `warn` for failed, aborted or slow
requests (at least two seconds), or `error` for HTTP 5xx only. Keep `info` while investigating
save problems, since successful writes help distinguish lost responses from failed writes.
Logs use the hosting platform's retention; this change does not create rotating local files.

Save errors display a `Reference` UUID. After deploying both frontend and backend, search
the backend platform logs for that reference, for example:

```sh
railway logs --service backend --environment production --lines 200 --filter 'REFERENCE_UUID'
```

The same reference is sent as `X-Request-Id` across retries; `X-Request-Attempt` distinguishes
attempts. The browser keeps its last 100 summaries in the current tab's session storage
under `clinic:request-diagnostics:v1`, including network/proxy failures that never reached
the API. These summaries contain no form data and survive reloads in that tab. Support can
copy them in browser developer tools using
`copy(sessionStorage.getItem('clinic:request-diagnostics:v1'))` (where `copy` is supported).
If storage is unavailable, browser failures still emit a JSON console warning. Browser
diagnostics are not automatically uploaded; closing the tab may discard them.

Check `validation` for rejected fields, 401 for expired login, 403 for permissions, 409 for
conflicts and 5xx/Prisma codes for server/database failures. A browser timeout or
`http.request_aborted` means the outcome is unknown: the database may already have committed.
Check the patient's record before manually repeating a create. Patient/visit/prescription
save requests time out after 30 seconds per attempt unless explicitly overridden; they do
not acquire additional mutation retries from logging. Upload/transcription/export subroutes
keep their existing timeouts. Autosave preserves rejected drafts and stops automatic
retries for deterministic 4xx errors until an edit or manual save. Version conflicts
remain blocked until the existing explicit reconciliation flow is completed.

Focused verification (synthetic data; no production database required):

```sh
npm test --workspace=backend -- --runInBand http-observability.spec.ts request-context.interceptor.spec.ts
npm test --workspace=frontend -- --runInBand api-diagnostics.test.ts api.retry.test.ts save-error-message.test.ts MedicalVisitForm.saving.test.tsx
```
