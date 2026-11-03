# Combined Fazoo expansion preview

Canonical review branch: `feature/fazoo-expansion`.

The maintenance branch already contains the complete expansion history. The
expansion review branch is fast-forwarded to that history plus this preview hub;
no changes are dropped and no main/production branch is updated.

Credential-free Vercel previews open `/maintenance-preview/expansion` at the root.
The hub links to sign-in/request access, app styling, maintenance and the Hanan
retail case study. Shared preview navigation connects the interactive pages.
The root proxy exception applies only to an unconfigured preview and only `/`.
Authenticated portal routes keep their existing guards. All demo pages return
404 outside credential-free previews.

The project alias `fazoo-expansion-preview.vercel.app` points to the verified
preview deployment so a single review address can be retained across updates.
Deploy future combined changes from the canonical review branch to the isolated
`fazoo-expansion-preview` project, verify them, and move this preview alias.
Do not promote to the live Fazoo project or apply hosted database migrations.

Existing client campaign requests, approval and privacy-safe analytics code is
preserved. Those real account-based screens need a configured test database and
approved test accounts; the credential-free hub provides visual/simulated demos.
