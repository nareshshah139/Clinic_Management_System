# CR-06 — Doctor signature

Implemented on 2026-09-27 and subsequently merged and deployed. See [production deployment and live acceptance](cr-06-production-deployment-2026-09-27.md). No Email or WhatsApp messages were sent during verification.

## Behavior

- A logged-in doctor opens **My Settings → Doctor signature** to upload, replace, or remove her own signature. Changes save immediately. PNG/JPG files up to 2 MB are supported; transparent PNG backgrounds are retained.
- The supplied `Dr_Praneeta_Jain_signature.png` is bundled as the default for an active doctor named **Praneeta Jain** (optional `Dr.` prefix, case and whitespace normalized). It is available without uploading when that doctor has no signature history. It is never used for another doctor's name or across branches. An upload overrides the default; removal stays effective after reloads. The default image does not change the remembered checkbox choice.
- **Show signature** appears immediately after **Refill stamp** in Print Preview. The selection is remembered per doctor on the same browser, across visits and reloads. It defaults off.
- The selected signature appears above the prescribing doctor's name. Turning it off restores the existing name and hand-signing space. The image and name stay together across page breaks.
- Browser print clones the paginated preview. Download, WhatsApp, and Email use one PDF-rendering function over that same preview. Email now attaches the PDF rather than sending only text. Signature decoding and pagination must finish before export.
- Mobile preview panes stack so the signature control and export buttons remain reachable. Intrinsic image proportions are preserved in both native print and canvas-based PDF output.

## UI design and finish review

CR-06 is an **Operate** extension of the existing clinic Settings and Print Preview surfaces. It inherits their typography, bordered sections, form controls, and buttons. The signature upload stays in the doctor's own settings; the remembered **Show signature** choice sits immediately after **Refill stamp**. The optional image remains proportional within a bounded area above the doctor's name, and disappears when unchecked. Desktop keeps the preview beside its control sidebar; mobile stacks independently scrollable panes.

**Fresh finish review: Pass.** The final review confirmed the following fixes:

| Finding | Final disposition | Evidence |
|---|---|---|
| Exported signature was distorted | Resolved: native print and PDF preserve the source aspect ratio. | [Native print](../../output/cr06-signature/signed-print.png), [PDF raster](../../output/cr06-signature/signed-download.png) |
| Mobile signature controls were clipped | Resolved: stacked panes keep the signature choice and export controls reachable. | [Mobile preview](../../output/cr06-signature/preview-signed-mobile.png) |

The browser acceptance results below confirm checked/unchecked behavior and identical Download, WhatsApp, and Email PDF rasters. [Settings](../../output/cr06-signature/settings-desktop.png) and [desktop preview](../../output/cr06-signature/preview-signed-desktop.png) capture the inherited visual treatment.

## Storage and authorization

No database migration is needed. The existing `ClinicAsset` table stores an embedded PNG with `type=SIGNATURE`, `ownerId` and `branchId`; replacing or removing a signature deactivates the earlier asset.

Removing a signature also writes an inactive marker, including when the doctor was using the bundled default. Reads return the default only when there is no signature history, so removal or invalid saved data cannot silently restore it. The PNG lives under `backend/src/modules/users/assets/` and Nest copies it into the compiled backend. The source and compiled image are byte-identical to the supplied file (SHA-256 `9c57bd4d1b33980fc7cd561bf375c3e9879e8edc6ee0f0bd37a75f1574961530`).

`POST /users/me/signature` and `DELETE /users/me/signature` derive ownership from the authenticated session. Both verify the session role and the database doctor's active status. Caller-supplied doctor/owner identifiers cannot select another profile. The generic asset endpoints reject signature creation, deletion, and retyping of an existing signature. Reads select the prescribing doctor in the current branch.

The upload service decodes/re-encodes PNG/JPEG data, rejects corrupt or disguised formats, limits decoded pixels, strips metadata, preserves alpha, and caps dimensions. Print rendering accepts embedded raster data only. `POST /prescriptions/:id/share-preview` accepts a bounded PDF attachment and verifies that the prescription belongs to the current branch before delivery.

## Verification

| Check | Result |
|---|---|
| Backend signature/default, authorization, PDF and controller suites | 34 passed; two optional browser cases skipped in the unit run |
| Settings, preference hook, image decoding tests | 13 passed |
| Targeted preview/print/PDF regression tests | 10 passed; eight unrelated cases excluded |
| Frontend production TypeScript check | Passed |
| Backend build and bundled PNG packaging | Passed; compiled PNG matches the supplied file |
| Contract syntax and discoverability (`cc-check format` / `list`) | Passed for affected declarations |
| Default signature visible before upload | Passed in API and browser checks |
| Default ownership, removal and replacement | Passed |
| Supplied PNG through actual browser upload | Passed; transparency retained |
| Both checkbox choices survive a browser reload | Passed |
| Signature proportions and mobile control access | Passed |
| Download / WhatsApp / Email raster parity | Passed in browser run |
| Checked / unchecked print and PDF output | Passed in browser run |

These checks were rerun in the isolated CR-06 branch based on main commit `9e87999`, with other uncommitted change requests excluded. All 57 targeted tests pass. The production backend uses SWC and builds successfully; a separate full backend TypeScript check in the shared checkout previously reported existing errors. An initial broad frontend run reported existing numeric-dosage test failures, outside the signature/export scope.

Generated browser evidence lives locally under `output/cr06-signature/` and is not committed. It uses a synthetic patient, an in-memory persistence fixture, and mocked delivery services. The supplied PNG is bundled in the backend, not exposed as a public frontend asset. No production database or patient-delivery service was contacted.

The complete browser acceptance case passed, including default availability before upload. Local evidence includes `result.json`, `signed-print.pdf`, `signed-download.pdf`, `signed-whatsapp.pdf`, and `signed-email.pdf`. The last three PDFs render to identical pixels at 96 dpi, with SHA-256 `95e78a21297f0a78a8465469b5eb487bf527c97f3b7423ae7eb317bab020c9d6`. The 548 × 350 source image keeps its aspect ratio in both native print and PDF output.

## Reproduce

```sh
npm test --workspace=backend -- --runInBand doctor-signature.spec.ts prescription-pdf.pipeline.spec.ts prescriptions.controller.spec.ts
npm test --workspace=frontend -- --runInBand DoctorSignatureSettings usePrescriptionSignature signature-images
npm test --workspace=frontend -- --runInBand PrescriptionBuilder.pagedjs.margins -t 'signature|Print|PDF|margin|continuation|page count'
npx tsc --noEmit -p frontend/tsconfig.build.json
npm exec --workspace=backend -- nest build
CR06_BROWSER_TEST=1 npm test --workspace=backend -- --runInBand doctor-signature.spec.ts -t 'runs browser'
```

The optional browser run starts the frontend on port 3016 from a temporary source snapshot with existing dependencies. It uses Obscura for a local login smoke check and Chromium for file upload, print CSS, screenshots, and PDF comparison. Only localhost requests are permitted in the Chromium acceptance run; external fonts use the available fallback font.
