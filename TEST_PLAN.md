# Test suite implementation plan

## Goal

Catch regressions in every user-facing workflow and in the Supabase permission
model without calling paid third-party services. A pull request is mergeable
only when the build, application tests, database permission tests, and browser
smoke tests pass.

This plan does not test React, Supabase, Google Maps, or OpenAI themselves. It
tests our use of their contracts. Google Maps and OpenAI are deterministic
mocks in CI; Supabase runs locally because mocked database calls cannot prove
that RLS is safe.

## Minimal toolset

- **Vitest + jsdom** for unit, component, and serverless-handler tests.
- **React Testing Library + user-event** for behavior through the rendered UI.
- **Playwright (Chromium only)** for complete browser workflows.
- **Local Supabase/Postgres** for schema, RPC, cascade, and RLS tests.

Do not add a mock framework beyond Vitest, snapshot-heavy tests, multiple
browsers, visual regression, or a coverage percentage gate initially. Add one
only after a real regression shows the missing value.

## Test layout

```text
tests/
  app.test.jsx                 # App routing and carnet workflows
  auth.test.jsx                # Auth UI and lib contract
  trips.test.js                # Trip helpers and Supabase mapping
  store.test.js                # Idea mapping and persistence contract
  maps.test.jsx                # Places and map behavior with fake SDK
  generate-trip.test.js        # Vercel handler with mocked OpenAI
  generate-idea.test.js        # Vercel handler with mocked OpenAI
  rls.test.js                  # Real local Supabase users and permissions
  e2e/
    journeys.spec.js           # Critical browser workflows
  helpers/
    supabase.js                # Seed users/data and clean test records
    vercel-response.js         # Minimal req/res object for handler tests
```

Keep fixtures inline unless reused by at least three files. Exercise private
helpers through their public function or UI; do not export production internals
only to test them.

## Feature inventory

### Application boot and session

- Missing Supabase variables show the configuration screen and make no data
  calls.
- Session lookup shows loading, then routes to `Auth` or `Workspace`.
- An auth-state change mounts/unmounts the workspace.
- A password-recovery event displays the reset form and returns to the app
  after success.
- Sign-out returns to authentication.
- The auth listener unsubscribes when `App` unmounts.

### Authentication

- Sign-in submits normalized email and password.
- Sign-up handles immediate sessions and email-confirmation-required responses.
- Forgot-password submits a normalized email and displays a non-enumerating
  confirmation message.
- Password reset requires six characters and matching confirmation.
- Invalid email, short password, mismatched confirmation, busy state, and
  repeated submission are handled.
- Known Supabase errors are translated; unknown errors remain visible.
- Confirmation/recovery redirects use the site origin and auth tokens are
  removed from the URL fragment.

### Trip list and sharing UI

- Owned and shared trips render with their dates and access labels.
- Loading, empty, and error states render correctly.
- Opening a trip stores its id; returning clears it; refresh restores it.
- Only owners see delete and sharing controls.
- The sharing dialog lists members and supports add, access change, removal,
  loading, and error states.
- Unknown accounts, self-sharing, invalid access, and non-owner sharing show
  the database error without corrupting the displayed list.

### New-trip wizard

- Destination is required and whitespace-only input is rejected.
- Dates are optional; return must be after departure; nights are calculated
  across month/year and daylight-saving boundaries.
- Steps can move forward/back without losing answers.
- Cities, interests, pace, and notes reach `onCreate` unchanged.
- Cancel works on the first step and creation cannot be submitted twice.
- Busy and generation-error states are visible.

### Trip creation and deletion

- Successful generation creates the trip, normalizes cities, attaches ideas
  to the matching city ids, inserts them in order, and opens the trip.
- User-entered cities override generated fallback cities as designed.
- An unmatched generated idea falls back to the first city.
- Non-finite generated coordinates are omitted.
- Generation HTTP errors, invalid JSON, and network failures still create a
  usable empty trip and display a warning.
- A trip insert failure does not insert ideas or close the wizard.
- An idea batch failure keeps the created trip and displays a warning.
- Deletion requires confirmation, removes the trip from the list, clears an
  open trip, and reports database failure.
- Database cascade deletion removes the trip's ideas and memberships.

### Trip and city helpers

- `slugify` handles accents, punctuation, empty labels, and maximum length.
- `normalizeCities` removes empty entries, trims fields, preserves order, and
  gives duplicate labels unique ids.
- `formatDates` covers two dates, start only, and no dates without timezone
  off-by-one errors.
- `listTrips` merges memberships into `owner`, `read`, and `write` access and
  reports either query failure.
- Trip create/update/delete and share helpers send the expected Supabase
  operation and surface errors.

### Ideas and carnet UI

- Ideas load for the opened trip in database position order.
- Empty, loading, read-only, save-in-progress, saved, and error states render.
- Create and edit preserve every supported field.
- Delete requires confirmation and clears a selected deleted marker.
- Favorite toggle updates the UI and persists.
- Save failure remains visible. For optimistic favorite/delete mutations,
  test the current behavior explicitly so a later rollback/reload change is
  deliberate.
- City, verdict, and favorite filters work alone and in combination.
- Switching cities clears map selection and counts all ideas in each city.
- List/map switching and marker selection show the expected subset.
- Readers cannot create, edit, favorite, or delete; writers and owners can.

### Idea persistence mapping

- `desc` maps to/from `description`; `when` maps to/from `when_note`.
- Empty optional strings become `null`; returned nulls are omitted from the UI
  model.
- Verdict/origin defaults, favorite coercion, and numeric coordinates map
  correctly.
- Position is sent on insert/batch insert but not overwritten on update unless
  explicitly supplied.
- Create returns the database id; update targets the idea id; delete targets
  only that id; load scopes by trip and orders by position.
- Empty batch insertion makes no database request.

### Place search and map

- Missing Maps key hides search and shows the map fallback.
- The SDK loader inserts one script and shares the same promise across callers.
- Existing SDK, successful callback, script failure, and retry after failure
  are covered.
- Places search starts at three characters, waits for the debounce, limits
  results to six, uses a session token, and applies optional location bias.
- A changed query cancels stale results; outside click closes suggestions.
- Selecting a place resolves its name/address/coordinates, clears the search,
  resets the billing session token, and fills the form.
- Search and resolution errors are displayed.
- Map creation, zero/one/multiple points, valid marker content, bounds, marker
  selection, deselection, info-window close, and prop updates work against a
  small fake `window.google.maps` implementation.
- Marker text is HTML-escaped before entering an info window.

### AI-assisted idea form

- Generation requires a title and cannot run twice concurrently.
- Request context contains title, coordinates, address, destination, and the
  selected city's label.
- Generated values fill only empty fields and never overwrite user input.
- Researched/non-researched notices and request failures render correctly.
- Reset restores the original values for edits and blank defaults for creates.
- Latitude/longitude parse as numbers; either invalid value causes both to be
  omitted; coordinates remain optional.

### `generate-trip` serverless handler

- Rejects non-POST requests, missing destination, and missing server API key.
- Builds the prompt for optional dates, duration, cities, interests, pace, and
  notes without inserting empty values.
- Sends the expected model and strict JSON schema to OpenAI.
- Returns valid structured output.
- Explicitly requested cities take precedence: extra generated cities are
  removed and missing requested cities are restored.
- City matching is case-insensitive and the five-city maximum is enforced.
- Missing output, invalid JSON, and OpenAI failure produce a safe 502 response.

### `generate-idea` serverless handler

- Rejects non-POST requests, missing title, and missing server API key.
- Trims string input and distinguishes valid from invalid coordinates.
- Research uses web search with the correct place context.
- Research success feeds the formatting call and returns `researched: true`.
- Research failure continues to structured generation and returns
  `researched: false`.
- Sends the expected model and strict JSON schema.
- Missing output, invalid JSON, and OpenAI failure produce a safe 502 response
  without exposing the API key.

### Database schema, sharing, and RLS

Run these cases against local Supabase using three authenticated users: owner,
reader, and writer. Seed through an admin connection; assertions use each
user's JWT so policies are genuinely evaluated.

- Unauthenticated users cannot read or mutate any application table.
- Owners can select, insert, update, and delete their trips and ideas.
- Unrelated users cannot discover or mutate private trips, ideas, or members.
- Readers can select the shared trip and ideas but cannot mutate either.
- Writers can select the trip and CRUD its ideas but cannot update/delete the
  trip or manage sharing.
- Only the owner can call `share_trip`; target email must exist; self-sharing
  and invalid access are rejected; repeat sharing updates access.
- Owners can list/change/remove memberships; members see only their own row.
- `set_idea_owner` assigns a writer-created idea to the trip owner.
- Deleting a writer account does not delete ideas they contributed.
- Deleting a trip cascades to ideas and memberships; deleting the owner account
  cascades to owned trips.
- Verdict and access check constraints reject invalid values.
- `touch_updated_at` changes timestamps on update.
- Reapplying `schema.sql` succeeds without duplicating migrated data.

### Browser journeys

Keep this suite small; lower layers already cover edge cases.

1. Sign in, create a manually configured trip when generation is unavailable,
   open it, refresh, and return to the trip list.
2. Create, edit, favorite, filter, and delete an idea.
3. Owner shares a trip; reader sees it without write controls; writer adds an
   idea; owner sees that idea.
4. Create a generated trip and enrich an idea using deterministic HTTP mocks.
5. Delete a trip and verify it disappears together with its ideas.

## Test doubles and data

- Mock `src/lib/*` at component boundaries for fast UI tests.
- Mock the `openai` module in handler tests; assert calls and return fixed
  structured responses.
- Use a minimal Google Maps fake implementing only APIs called by this app.
- Intercept `/api/generate-*` in Playwright; never use `OPENAI_API_KEY` in CI.
- Use unique emails/UUIDs per database test and clean only records created by
  that test run.
- Use fake timers only for debounce and saved-message timeout behavior.

## Scripts and CI gates

Implementation should add these commands:

```text
npm test              # Vitest once
npm run test:watch    # Vitest during development
npm run test:db       # local Supabase RLS/schema suite
npm run test:e2e      # Playwright Chromium
npm run test:all      # build + test + test:db + test:e2e
```

Pull requests run `npm run build`, `npm test`, `npm run test:db`, and
`npm run test:e2e`. Unit/component/handler failures stop before slower database
and browser jobs. Store Playwright traces only on failure. Retry no test in
Vitest and at most once in CI for Playwright; a repeatedly flaky test is fixed
or removed rather than normalized.

## Implementation order

1. Install Vitest/jsdom/Testing Library, add configuration and scripts, and
   leave one passing smoke test proving the harness.
2. Cover pure trip helpers and persistence mappings.
3. Cover both serverless handlers with mocked OpenAI.
4. Cover Auth, wizard, trip list, carnet, Places, and map behavior.
5. Start local Supabase from the existing `schema.sql`; add the RLS suite before
   relying on mocked permission tests.
6. Add Playwright and the five critical journeys.
7. Add CI gates and document the commands in `README.md`.

Each step should be a separately reviewable commit and leave all earlier
commands green.

## Completion criteria

- Every feature listed above has at least one automated success case and every
  trust boundary has failure/permission cases.
- No test calls production Supabase, Google Maps, Places, or OpenAI.
- The full suite starts from a clean checkout with documented commands.
- Test failures identify the broken behavior rather than relying on broad
  snapshots.
- A developer can change a covered feature and rely on required CI checks
  instead of repeating the corresponding manual regression flow.

## Current implementation status

Implemented: trip/auth/store helpers, wizard validation, AI handlers, app
fallback creation, Maps-without-key behavior, schema safeguard checks, and
five browser journeys covering login, trip creation/deletion, idea CRUD and
filters, sharing, and read/write UI permissions. A pgTAP suite exercises the
owner/reader/writer/anonymous RLS matrix against Supabase local.

Next additions, in priority order:

1. Exercise successful Google Places/Maps SDK interactions with a small fake
   SDK once those integrations change again.
2. Add browser cases for password recovery and AI success only if regressions
   appear there; handler/component tests already cover their contracts.
