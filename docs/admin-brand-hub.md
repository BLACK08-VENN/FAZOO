# Brand-neutral administration

`/overview` is the platform landing page. It shows the active brands available to the caller and general counts for active brands, campaigns, approved staff and pending membership approvals. It does not render a selected brand's logo, operational dashboard or navigation.

Each active brand has an **Open brand** action. The database validates the staff account, target brand and permissions before changing the current organization. Super administrators can open any active brand. Other staff can open their existing organization or a brand with an approved staff membership. A brand selection writes a retry receipt and an audit event.

After selection, an HTTP-only cookie records the user/organization pair. `/workspace` contains the brand's existing operational dashboard. The shared navigation displays school-specific tools only for a school brand and retail tools only for a retail brand. Lenovo partner collection is available inside Lenovo Nigeria. **All brands** returns to the neutral landing page without defaulting to the first organization.

Client-side navigation computes the shell mode from the current path so a shared App Router layout cannot leave a brand menu visible after returning to the hub. Initial requests to operational pages without a valid selection return to `/overview`. This is a navigation guard; database authorization remains authoritative.

Retail overview logs, filter options and recent activity are explicitly restricted to the current organization, including for super administrators. Platform totals come from the separate guarded brand-hub RPC rather than a campaign-specific dashboard.

# Document preparation

Automated text recognition has been removed. Provider implementations, conversion APIs, browser asset proxy, document-generation libraries, configuration templates, badges and filters are deleted. `/booklists/preparation` is a manual worklist. Original files can be downloaded and prepared Word/PDF files can be uploaded for the existing approval, printing and delivery process.

The old preparation bookmark redirects to the replacement page. Historical database enum values and metadata remain for compatibility with saved records and older installed clients. Existing stored documents and download paths are preserved. New uploads cannot queue automated recognition or create machine-generated draft records, and the retired recognition RPC is removed.

# Verification

Tests cover neutral versus brand-specific navigation, stale/cross-user selection cookies, approved membership scope, super-administrator selection, inactive brands, retry receipts, revoked access, manual preparation queues and preservation of historical documents. Visual inspection uses a temporary rendered fixture; production database checks run in a transaction that is rolled back.
