# Walk report: STORY-405, compare melasma photos across visits and remove a blurry shot

- **Topic**: visit-documentation
- **Persona**: Dr. Shravya (DOCTOR)
- **Result**: **FAIL**. Photo delete is completely broken for saved visits: every delete returns 404 because the URL has a doubled `/api/api/` prefix. Underneath that, the thumbnail trash targets the previously active photo, so fixing the 404 alone would turn this into silent data loss. Photos uploaded before the first save detach from the visit.
- **Screenshots**: `/tmp/claude-0/-home-user-Clinic-Management-System/1eff4a85-453f-5886-a484-208393c84f41/scratchpad/ux-walker/shots/visit-documentation--STORY-405/`

**Data setup**: The seed has no Lakshmi and no visit photos. I used **John Doe** (`patient-seed-1`, 5 seed visits by Dr. Shravya) and set up the precondition through the UI:

- **visit-seed-2** ("Visit 2") got Front, Left and Right.
- **visit-seed-5** ("Visit #5", the one being reviewed) got Front, Left, Right and Close-up. Inference tagged the 4th file "Back", and I corrected it to Close-up in Grid mode.

## Steps

| # | Story step | What happened | Screenshot |
|---|---|---|---|
| 1 | Dashboard → Recent Visits → row | The link `/dashboard/visits?patientId=patient-seed-1&visitId=visit-seed-5` opens Visit #5. The sub-heading shows "Patient: Unknown • **Doctor: Dr. Praneeta Jain**", but the visit belongs to Shravya (STORY-402 F2). Every load fires 3× `GET /billing/invoices?patientId=patient-seed-1` → 400. | `step-01-recent-visit-open.png` |
| 0 | (setup) Tag dialog, Grid mode | Grid mode shows 4 selects. Inference by index: Front, Left, Right, **Back**. | `step-00-tag-grid-mode.png` |
| 2 | Photos tab | Viewer, meta "Uploaded: 07 Nov 2026, 06:21 pm • Front", Prev/Next, a thumbnail strip with a red trash on each, plus Delete in the header and Delete in the viewer. | `step-02-photos-viewer.png` |
| 3 | Compare: Off → On | "Compare against:" defaults to **Visit 4**, which has no photos, so the left pane shows "No photo". | `step-03-compare-on.png` |
| 4 | Choose Visit 2 | Panes "Visit 2 - Front" and "Visit 5 - Front", "Position: Front • 1 / 4" ✓. Two Prev/Next pairs are stacked. The panes are only ~145px tall. | `step-04-compare-visit2.png` |
| 5 | Next ×3 | Left → Right → Close-up; at Close-up the left pane shows "No photo" ✓. | `step-05-compare-closeup.png` |
| 6–7 | Compare off; Front active; click trash on the Close-up thumbnail; confirm | Confirm: "Delete this photo? This cannot be undone." (it does not say which photo). The viewer jumps to Close-up, but the request is **`DELETE /api/api/visits/visit-seed-5/photos/cmw6ek31n00887dc1xii9qzao`**. Per `GET /visits/visit-seed-5/photos`, that id is the **FRONT** photo. Backend: 404 "Cannot DELETE /api/visits/…". Toast "Delete failed / Failed to delete photo." Count stays 4. | `step-06-before-thumb-delete.png`, `step-08-wrong-photo-deleted.png` |
| 9 | Close-up selected → header Delete | This time the request targets the correct id (`…32e008g…` = CLOSE_UP), but again goes to `/api/api/…` → 404 → "Delete failed". **The blurry photo cannot be removed at all.** | `step-09-header-delete-fails.png` |
| 10 | Other saved photos | "Visit — 07 Nov 2026 (3)" (Visit 2's set). There is no visit number, so the group is ambiguous when visits share a date. The 3 images open in new tabs (`target=_blank`) ✓. | `step-10-other-saved-photos.png` |
| a | (defect #3 check, Dr. Praneeta, walk-in Sanjay Mehta) Upload 2 photos before the first save | "Before / After Photos (2)", "2 Photos", 20% ✓. | `step-a1-draft-upload-before-save.png` |
| a2 | Fill vitals → Save Draft (POST /visits) | The visit now shows "(0)", "0 Photos" and 0%. The photos appear only under "Unattached uploads — 07 Nov 2026 (2)", with no attach action. | `step-a2-after-first-save-photos-gone.png` |
| M | Mobile 390×844, Photos tab | The card is wider than the viewport. Camera, Delete and Next are clipped at the right edge. | `mobile-check.png` |

**Root cause of the 404** (`frontend/src/components/visits/VisitPhotos.tsx`):

- `applyResponseList` runs every item URL through `toAbsolute()`, which returns `/api/visits/…` (`:95-102`).
- `deleteActive` then builds `` `${baseUrl}${active.url}` `` (`:583-584`), which yields `/api/api/visits/…`.

## Geometry audit

- **Photos tab (1280)**: no uneven rows or spills inside the photo card. The page-level header/badge crush is the same as STORY-401.
- **Mobile**: spills of 391px (page container and Patient Context row). Wrapped: Back to Setup, Save Draft, Complete Visit.

## Mapped defects touched

| Defect | Verdict |
|---|---|
| #4 thumbnail trash deletes the previously selected photo | **CONFIRMED** at request level: the FRONT id is sent while the Close-up is shown. The delete is currently masked by a new defect: every visit-photo delete 404s through `/api/api/`. |
| #3 photos uploaded before first save never attach | **CONFIRMED**: they move to Unattached uploads and progress drops from 20% to 0% |
| #6 delete shown to nurse/reception | Not tested (doctor walker) |
| Edge: photo count on four surfaces | CONFIRMED: Overview "Photos Captured: 0" (see STORY-401) |

## Flow log

- **Ideal path**: 5 steps. The actual attempt took 7, with 2 failed deletes, and the goal "delete the blurry shot" was **not achievable**.
- **Hesitations**:
  - Compare opened on a visit with no photos.
  - It was unclear which Prev/Next pair moves the comparison.
  - The confirm dialog does not name the photo.
  - After "Delete failed" there is no hint why and no retry path.
- **Data loss risk**: once the URL bug is fixed, the thumbnail trash will permanently delete the wrong photo.
- **Duplication**: delete appears in 3 places, navigators in 2, and photo counts on 3–4 surfaces that disagree.
