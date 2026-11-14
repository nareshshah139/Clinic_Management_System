# Authorization source revalidation

The four refreshed source fingerprints cover only the access changes in this patch:

- The workspace controller now declares the clinic-staff role boundary. Its service methods and request routing remain unchanged.
- Inventory workflow and workspace checks now recognize a wildcard for the final action in the exact permission scope. Bare `*` grants from non-privileged users are discarded; the existing owner, admin and doctor bypass remains. Branch checks and stock/recovery transition guards are unchanged.
- Purchase capabilities apply the same scoped matching while retaining their existing eligible-role and per-operation checks.

The recovery witness model abstracts the result of each individual authorization check as a guard; it does not assume a particular user's permission strings. Its action guards, stock transitions, recovery evidence and same-actor assumptions therefore remain applicable. Scoped matching and rejection of broader nested grants are separately exercised by the permission, inventory and pharmacy tests. The HTTP tests exercise the controller boundary. This revalidation does not claim whole-program refinement.

## Per-user revocation (PR #100)

The two refreshed source fingerprints cover only how a user's grants are read:

- Inventory workflow now selects `revokedPermissions` with the user's role and saved permissions, and `grantsOf` and `countStaff` call the shared `userGrants` rule in place of a hand-written union of role and user grants. Branch checks, the role-match check and every stock and recovery transition guard are unchanged.
- Purchase capabilities read grants through the same `userGrants` rule. The eligible-role test and the per-operation permission names are unchanged.

`userGrants` gives the same answer as before for a user with nothing revoked. A revoked permission is now refused, so fewer users may satisfy a given guard, and none gain one. The recovery witness model treats each authorization check as a guard and assumes no particular permission strings, so its action guards, stock transitions, recovery evidence and same-actor assumptions still apply. Revocation is exercised by the permission-grant, guard, inventory-permission and scoped-purchase tests. This revalidation does not claim whole-program refinement.
