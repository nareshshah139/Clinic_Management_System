# CR-20: Save custom investigations for the whole clinic

A custom investigation typed into **Add Custom Investigation** is now saved to the clinic's list. Every later prescription in that clinic shows it as a checkbox beside CBC, ESR, CRP and the other built-in tests. Before this change, the name lived only in that prescription's local draft, so the doctor retyped it every time.

## Behavior

- **Add** saves the name to the clinic list and ticks it on the current prescription.
- The list belongs to the branch. Doctors in another branch do not see it.
- Names match without regard to case or extra spaces. Typing "  mri   BRAIN " when "MRI Brain" exists does not add a second entry, and the Add button stays disabled.
- **Manage saved investigations** lists the clinic's saved entries, each with Rename and Remove.
- Rename changes the checkbox label for every future prescription. If the old name is ticked on the open prescription, the tick moves to the new name.
- Remove deletes the entry from the clinic list. If it is ticked on the open prescription, it stays ticked there.
- Saved prescriptions keep the investigation text they were written with. Renaming or removing an entry never changes a past prescription.
- If saving to the clinic list fails, the investigation is still ticked on the current prescription, and a message says it was added to this prescription only.
- Doctors, admins and owners can add, rename and remove. Nurses can see the list. Reception cannot change it.

## Not included

- The built-in investigations stay fixed in code. The clinic can rename or remove only the ones it added, which is what CR-20 asks for.
- Remove has no confirmation step. A removed entry can be added again by typing it.

## Verification, 06/11/2026

`scripts/diagnostics/cr20-saved-investigations-browser.cjs` drives the real frontend against the real backend and PostgreSQL, with real login and role checks. It seeds two synthetic clinics. It then checks the following:

- A doctor adds "MRI Brain" on one patient's prescription. It is ticked there, stored in the database and printed in the print preview.
- With local drafts cleared, a second patient's prescription shows "MRI Brain" unticked, alongside the built-in tests.
- A case or spacing variant cannot be added again.
- A rename persists after a reload.
- A doctor in the other clinic does not see the entry.
- A removed entry stays removed after a reload, and the database row is gone.

The same flow fails on `main` at "the investigation is stored for the clinic", because `main` never sends the name to the server.

The new migration applies with `prisma migrate deploy` on a database built from `main`'s schema, leaves no drift against `schema.prisma`, and a second deploy applies nothing.

To reproduce, start the backend on port 4000 and the frontend on port 3000 with `NEXT_PUBLIC_API_PROXY=http://localhost:4000`, then run:

```bash
CR20_DATABASE_URL=<the backend's local DATABASE_URL> node scripts/diagnostics/cr20-saved-investigations-browser.cjs
```

Screenshots go to the system temp folder unless `CR20_OUTPUT` names a folder.
