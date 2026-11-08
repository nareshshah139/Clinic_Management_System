# Authorization source revalidation

The four refreshed source fingerprints cover only the access changes in this patch:

- The workspace controller now declares the clinic-staff role boundary. Its service methods and request routing remain unchanged.
- Inventory workflow and workspace checks now recognize a wildcard for the final action in the exact permission scope. Bare `*` grants from non-privileged users are discarded; the existing owner, admin and doctor bypass remains. Branch checks and stock/recovery transition guards are unchanged.
- Purchase capabilities apply the same scoped matching while retaining their existing eligible-role and per-operation checks.

The recovery witness model abstracts the result of each individual authorization check as a guard; it does not assume a particular user's permission strings. Its action guards, stock transitions, recovery evidence and same-actor assumptions therefore remain applicable. Scoped matching and rejection of broader nested grants are separately exercised by the permission, inventory and pharmacy tests. The HTTP tests exercise the controller boundary. This revalidation does not claim whole-program refinement.
