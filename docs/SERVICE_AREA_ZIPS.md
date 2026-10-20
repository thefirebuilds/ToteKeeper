# Whole-ZIP enrollment eligibility

Owner decision, October 19, 2026: approve the **entire ZIP** if any part overlaps
Hays County north of the Blanco River or Travis County south of the Colorado River.
Addresses in an approved ZIP qualify for geographic eligibility even when they are
outside those original county/river boundaries. No per-address geofence or manual
address approval is used for this eligibility check.

## Initial allowlist: 46 ZIPs

```text
78606 78610 78612 78616 78617 78619 78620 78621 78623 78636
78640 78641 78645 78652 78653 78654 78656 78663 78666 78669
78676 78701 78702 78703 78704 78719 78721 78725 78730 78731
78732 78733 78734 78735 78736 78737 78738 78739 78741 78742
78744 78745 78746 78747 78748 78749
```

This literal overlap rule is deliberately broad: it includes San Marcos `78666`,
western Travis County, and some otherwise northern ZIPs with small river-edge
overlaps. It is not the same as approving only Buda, Kyle and South Austin street
addresses. No minimum overlap percentage was imposed, because the owner selected
any overlap rather than majority overlap or exact address boundaries.

## Data sources and limitations

Retrieved October 19, 2026:

- [City of Austin county boundaries](https://maps.austintexas.gov/arcgis/rest/services/Shared/Property/MapServer/5)
- [City of Austin ZIP polygons](https://maps.austintexas.gov/arcgis/rest/services/Shared/BoundariesGrids_1/MapServer/5)
- [TxDOT Texas Streams, derived from USGS NHD](https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/Texas_Streams/FeatureServer/0)

The stream source identifies TxDOT as publisher and states a July 2022 valid date.
These are GIS map polygons/centerlines, not a USPS address-verification product or
a guarantee about every boundary, deliverable address or current postal assignment.
Small water-edge and boundary-alignment overlaps count under this implementation.
Review those explicitly if a narrower practical operating area is desired.

The analysis splits Travis along the Colorado River and selects the component
containing South Austin. It splits Hays along the Blanco and selects the component
containing Buda. The Blanco terminates at its confluence inside Hays, so its short
remaining gap is closed to the nearest county edge for side classification. That
closure intersects only `78666`, which already crosses the Blanco; no additional ZIP
is selected solely by that construction. The data download envelope covers both
counties. Selection requires positive area, not a point-only boundary touch.

[Overlap evidence](service-area-zip-overlaps.csv) records each ZIP, its source postal
city label and approximate fraction in each selected county region. Fractions are
computed in source longitude/latitude coordinates for research, not a land survey.
The city label is not an additional eligibility restriction.

`scripts/research_service_zips.py` reproduces the offline source queries and geometry
calculation. Run it in a separate research Python environment with Shapely installed:

```text
python scripts/research_service_zips.py --cache <temporary-research-directory>
```

No GIS package or network lookup is required by the deployed application. Do not
commit downloaded source geometry or private data. Future GIS reruns are research;
they must not automatically overwrite the operational database allowlist.

## Application behavior and rollout

Migration `0007_zip_auto_enrollment` adds `ServiceArea.auto_enrollment` and seeds the
46 ZIPs. New rows start active and enabled for new enrollment. Existing names and
inactive-service decisions are preserved; unrelated areas are not deleted. The
reverse data operation does not delete service areas or owner changes.

In administration, open **Service areas**. Search by ZIP and edit:

- `active`: whether the area is available for service/window selection.
- `auto_enrollment`: whether new customers may enroll for that ZIP.

Both must be true for new enrollment. Disabling only auto-enrollment leaves existing
customers' delivery service available while closing new intake. Fictional fixture
areas are not auto-enabled by this migration. Admin can add another valid five-digit
ZIP explicitly; the database is the operational authority, not the research CSV.

Enrollment checks the saved profile ZIP server-side; checkout rechecks it so a stale
pending enrollment cannot bypass a later area closure. Valid ZIP+4 values normalize
to their five-digit prefix in profile/address/delivery forms and availability lookup.
Malformed ZIPs fail validation. Area eligibility does not activate a subscription:
offering capacity, active/finalized policy, separate liability acknowledgment,
provider pricing/tax checks and verified payment still apply. Appointments still
require availability, 72-hour minimum notice and confirmation.

The public storefront remains an inquiry flow while the agreement is a draft. This
change does **not** set `STORAGE_AGREEMENT_FINALIZED=true`, publish binding terms,
create Stripe subscriptions, deploy, or migrate production. On a later authorized
release, the existing migration step installs the initial ZIPs; verify admin flags
and complete the separate agreement/entitlement blockers before opening checkout.

## Verification

- Web build/typecheck, lint and 57 unit tests passed; all 20 desktop/mobile browser
  cases passed, including existing inquiry journeys and draft-policy navigation.
- Django ran 90 tests with one PostgreSQL-only concurrency test skipped on SQLite;
  migration drift check passed. New tests cover positive/negative ZIPs, ZIP+4,
  disabling either flag, preserving existing names/inactive decisions, whole-ZIP
  enrollment, checkout revalidation, capacity and draft-agreement safeguards.
- An initial migration-preservation test used an unnecessary SQLite schema-editor
  context; its harness was corrected and the full suite passed on rerun.
- The list was derived from the linked public GIS data, with the confluence closure
  checked to intersect only `78666`. No live geocoding or USPS address validation was
  claimed, and production data/configuration were not modified.
