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
