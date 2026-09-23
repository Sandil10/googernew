# Design QA

Reference: user-provided web profile ad screenshot with the circular saved bookmark and amber expiry message.

Implemented checks:

- Paid profile Photo & Video ads render the save control.
- Saved state renders a filled bookmark in a dark red circular control.
- Photo/video expiry copy renders below the bookmark in compact amber text.
- Basic plan profile ads do not render the save control.
- Widget tests pass at the mobile viewport.

Live authenticated visual comparison could not be captured because the in-app browser runtime failed to initialize in this environment. The deployed endpoint and compiled Flutter output are healthy, but the final screenshot-to-screenshot comparison remains unavailable.

final result: blocked
