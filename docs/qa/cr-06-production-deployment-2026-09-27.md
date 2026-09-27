# CR-06 production deployment — 2026-09-27

## Outcome

CR-06 is merged into `main` and deployed to both Railway production services as `7166ea575a76c6f05a7db6c13d88db867638c1da`. Both deployments report SUCCESS:

| Service | Deployment |
|---|---|
| Backend | `e96f183e-57ec-48c7-9785-f27ae65eb9e8` |
| Frontend | `afbc65a8-551d-4fea-b669-84852831e071` |

Live application: https://frontend-production-703e.up.railway.app

The missing UI was caused by the signature commit existing only on its feature branch. Before rollout, the live signature endpoint returned 404. The release merges CR-06 with the already-deployed tele-video and inventory changes; it adds no schema changes or migrations. Read-only preflight found no pending/failed migrations or checksum mismatches, and backend startup confirmed **No pending migrations to apply**. One active doctor matches the bundled default signature's name.

## Verification

- 50 backend signature, PDF, controller and tele-video tests passed.
- 16 signature/settings and tele-video form tests passed.
- 11 selected preview/export tests passed; eight unrelated cases were excluded.
- Both production builds and relevant contract format/discoverability checks passed.
- Public backend health, frontend login and API proxy health returned 200. The signature endpoint now returns 401 without authentication, confirming route availability and authentication enforcement.

Twelve production acceptance checks passed using an isolated synthetic branch, doctor account, patient, visit and prescription:

1. Normal authentication returns the exact bundled default PNG.
2. Server PDFs include the signature only when requested.
3. My Settings displays the default signature before upload.
4. Removing the default persists across reloads.
5. The doctor can upload a replacement from Settings.
6. Show signature adds the image above the doctor's name in Print Preview.
7. The checked preference survives a page reload.
8. Native print content includes the selected image.
9. The browser downloads a signed PDF.
10. WhatsApp and Email controls generate PDF attachments, with delivery intercepted.
11. Download, WhatsApp and Email PDFs render identically at 96 dpi (SHA-256 `a4b11e52224d73f89143462c6cb66b91bf310f12bbd916e1b61cac317db9bc53`).
12. Unticking removes the image from preview and print.

There were no browser page errors. All synthetic clinical records, signature assets, idempotency records, the account and temporary branch were removed. No real patient records were used or changed, and no Email or WhatsApp messages were sent.

## Evidence and rollback

Local evidence is under `output/cr06-deployment/`: preflight, deployment/status records, HTTP smoke checks, production acceptance results, Settings/Print Preview screenshots and rendered PDFs. The temporary acceptance driver is under `tmp/cr06-release-ops/`; it does not save passwords or authentication tokens.

Previous healthy deployments are backend `10ca239c-8d4e-4934-81ab-bd8609b5436b` and frontend `65b4feec-0d68-40e0-9984-e73d5566ddd7`, both at `037e77e5cdce695d0ac5a3ca9ab09ac3c25031ca`. Application rollback requires no database restore or schema rollback.
