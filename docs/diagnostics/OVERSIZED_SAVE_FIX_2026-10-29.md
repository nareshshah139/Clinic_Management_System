# Oversized save fix, 29 October 2026

## Observed mechanism

Nest/Express applied its implicit 102,400-byte JSON limit before controllers. The local production-style HTTP reproduction sent a synthetic print-background profile request of 136,607 bytes and received HTTP 413; the save handler was not called.

The frontend also creates large clinical requests without images. A synthetic 60,000-character personal history appears in both prescription clinical data and metadata, producing 120,228 JSON bytes. A visit containing 36,000 Devanagari history characters produces 108,041 UTF-8 JSON bytes. Patient histories and consultation data are JSON; visit photos and doctor signatures have separate multipart upload paths.

The active deployment's filtered 413 query returned only the known synthetic deployment probe. No new user-generated 413 was observed after the diagnostic release. The earlier production failures still lack route attribution. These synthetic examples prove the transport failure mechanism, not the identity of a historical failed form.

## Chosen policy

All backend startup paths install request diagnostics first, then a shared JSON parser with a finite 5,242,880-byte limit, before application initialization. JSON within that limit passes intact to the existing authentication, DTO validation and save logic. JSON above the limit is rejected before a handler runs, with the existing request reference and safe parser diagnostics. The limit applies to decompressed JSON bytes, including streamed requests.

The helper exposes one operation:

```ts
configureRequestBody(app: NestExpressApplication): void
```

Normal startup, the `MINIMAL_BOOT` branch and the standalone minimal entry use the same policy. Nest's supported `useBodyParser` API replaces its default JSON parser registration. URL-encoded and multipart limits remain unchanged. No clinical field is truncated, omitted or rewritten by this change; snapshot and conflict semantics stay with the existing save services.

Five MiB is a chosen operational ceiling with headroom for the demonstrated payloads and existing embedded profile metadata. It is below the installed Next.js middleware body-cloning default of 10 MiB. It is not a measured maximum patient record size or a promise of unlimited saving. Larger JSON raises worst-case pre-authentication memory and parsing work; the finite cap remains deliberate.

## Alternatives considered

A route-specific allowance duplicates application routing before controllers and risks leaving future save endpoints on the accidental 100 KiB default. The installed Nest adapter also detects parser middleware by function name, making partial parser registration easy to misconfigure. A shared policy has fewer moving parts.

Moving embedded print backgrounds to validated uploads could reduce profile payloads, but requires asset storage and compatibility work and does not fix large clinical text. Removing duplicated prescription history requires preserving its existing snapshot consumers. Neither is necessary to correct the confirmed parser ceiling.

Two independent source investigations produced these candidates. A separate read-only design review selected the shared finite policy. Model diversity was not claimed. Boundary Discipline places the limit at HTTP ingress; Prove It Works requires real HTTP round trips and verification on the deployed release.

## Verification

The failing regression was committed before the implementation. The parent independently observed 10 failures and three passing compatibility cases under the old parser. The original reproduction changed from HTTP 413 with no handler call to HTTP 200 with the full submitted value preserved.

The parent independently reran all 36 targeted HTTP, request-logging and inventory-logging tests successfully. The backend typecheck and production build also passed, compiling 270 source files. Contract syntax, discovery and independent source/privacy review passed. They exercise synthetic save/read-back behavior, UTF-8 byte sizes, the exact limit and one byte above, chunked and gzip bodies, malformed JSON, URL-encoded and multipart handling, request references and private-data exclusion from logs.

No production patient or inventory record is created or changed for release verification. Live checks use public health routes and explicitly identified synthetic requests. Exact synthetic request references are excluded from the daily monitoring summary.
