# Lenovo Nigeria partner collection

Merchandisers open **Partner collection** in the web brand workspace or native Today screen. Administrators open `/partners`. Access is limited to approved Lenovo Nigeria merchandisers and administrators. Client and supervisor accounts cannot read these records.

The form maps all 30 columns in the supplied Nigeria Partner Data Collection workbook. Collector identity comes from the signed-in profile. Total PCs, Lenovo share and priority are calculated. Branch/outlet, contact method, reporting month and sales basis add the context required to distinguish repeat visits and interpret monthly quantities.

## Submission and reporting rules

- Every successful submission creates an immutable visit/call log and an audit event.
- Reusing the same request ID with the same answers returns the original receipt. A different actor, operation or changed answers cannot reuse that receipt.
- Existing outlets are searchable. New identities are deduplicated using normalized company name, city/area, state and branch. Separate branches need distinct branch identifiers.
- Monthly summaries use the latest server-received submission per outlet and reporting month, across the entire team. Collector filters apply after selecting that latest submission. Earlier visit records remain in activity/history and exports.
- Enter actual figures for a named month or explicitly label a typical-month estimate. The dashboard displays the number of estimated current records. Values are survey-reported units, not verified national market share or revenue.
- Zero is a known count. Unknown is stored as JSON null. A current record with any unknown brand quantity is excluded from all brand totals and shares, keeping the numerator and denominator comparable. Other profile/category information remains visible.
- Collective Lenovo share is total Lenovo units divided by total PC units across the same complete current records. Zero total units has no calculable share.
- Default priority thresholds are High at 100 PCs/month and Medium at 30. Administrators can change them. Reports classify records using the current thresholds. Records with unknown totals have Unknown priority.
- A merchandiser can correct their own submission for the same outlet/month. The correction creates a new record linked to the original. There is no direct update/delete permission on logs.
- Visit dates and reporting months cannot be in the future. The reporting month cannot follow the visit month. Lagos dates/time helpers are used throughout.

## Drafts and connectivity

Drafts are explicitly saved on the current device under an organization/user-specific key. Submission attempts also save the request ID and answers before calling the server. A lost response can be retried safely. Saved drafts require an explicit restore and are cleared after confirmed submission. This feature does not automatically submit drafts in the background.

## Dashboard and exports

Admin results refresh every 20 seconds while the page is visible. The form and personal log history are available in `/brand/partners`. Filters include reporting month, state, collector and company/area/branch search. History is paginated at 30 records; summaries cover the full filtered dataset.

Excel-compatible CSV exports preserve the workbook's first 30 columns, with traceability fields appended. History exports include every matching submission and identify the current monthly record. A separate summary CSV uses deduplicated current records. Exports use one database statement snapshot, escape spreadsheet formulas, require an approved admin session, and are rate limited. Over 10,000 history records requires narrower filters; the export fails explicitly instead of silently truncating.

## Deployment and verification

Apply the `lenovo_partner_collection` migration before deploying the web bundle. Push the implementation to `main`; Vercel builds the web application and the existing EAS production workflow publishes native changes. Existing production maintenance/client features are retained in the main rollout.

The PostgreSQL integration suite covers identity derivation, retry receipts, cross-organization access, direct-write denial, BA ownership, unknown quantities, priority boundaries, repeated visits, branch identity, weighted brand share, corrections and pagination. Fictitious test records run in an isolated PGlite database.
