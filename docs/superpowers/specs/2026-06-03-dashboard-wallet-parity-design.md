# Dashboard Wallet Parity Design

## Goal

Replace the legacy `apps/tatum` hackathon UI with the new React dashboard in `apps/dashboard` while preserving the demo-critical functionality:

- separate `Connect EVM` and `Connect Sui` actions
- wallet-aware uploads with owner autofill
- `eth_sepolia` and `sui` as the primary demo chains
- upload, finalize, polling, provenance, and explorer flows
- latest-asset focus after a successful upload
- search and portfolio views that work with connected wallets and manual filters

The result should be a single primary dashboard surface for the live demo. `apps/tatum` becomes reference code, not the main UI.

## Scope

In scope:

- add dual-wallet connectivity to `apps/dashboard`
- port the upload and finalize flow from `apps/tatum`
- wire the new dashboard pages to the same backend contract used by the legacy demo
- preserve support for the currently supported chains, while emphasizing `eth_sepolia` and `sui`
- show provenance, explorer links, upload progress, and success/failure states in the new dashboard

Out of scope:

- redesigning the API contract
- changing backend upload/finalize semantics
- adding new chains beyond the current supported set
- deep analytics work unrelated to the demo path

## Product Decisions

- The new dashboard fully replaces the previous demo dashboard.
- Wallet connectivity uses two explicit entry points: one `EVM` button and one `Sui` button.
- The app uses one shared upload/search surface rather than separate EVM and Sui pages.
- EVM and Sui are the focus chains for the demo, with EVM on `eth_sepolia` as the primary judged path.
- Owner precedence is:
  1. manually entered owner
  2. connected EVM address
  3. connected Sui address

## Architecture

`apps/dashboard` becomes the single demo UI and is extended with four focused layers.

### 1. Wallet state layer

Add a shared wallet provider and hook that tracks EVM and Sui independently.

Expected state shape:

- `evm.address`
- `evm.chainId` and derived display name when available
- `evm.connected`
- `evm.connecting`
- `evm.error`
- `sui.account`
- `sui.connected`
- `sui.connecting`
- `sui.error`

Expected actions:

- `connectEvm()`
- `disconnectEvm()`
- `connectSui()`
- `disconnectSui()`

The dashboard should not pretend the wallets are interchangeable. Both connections may exist at once, and the UI should show that clearly.

### 2. API client layer

Create a shared dashboard API client by adapting the working logic from `apps/tatum/src/lib/api.ts`.

The client should own:

- upload session creation
- chunk upload
- upload completion
- upload status polling
- file listing and search
- provenance lookup

All calls must respect `VITE_FLOE_API_URL`.

### 3. Upload controller layer

Add a shared upload controller hook or stateful module that owns:

- upload mode: `public` or `wallet`
- selected target chain
- owner input
- selected file
- progress percentage and progress text
- busy/error/success state
- last anchored asset metadata

This layer should encapsulate the exact upload sequence used in the legacy demo so page components stay presentational.

### 4. Page composition layer

Use the new dashboard pages as the primary surface:

- `Overview`
  - latest asset focus
  - wallet status
  - recent uploads
  - quick actions into upload/search
- `Uploads`
  - full upload form
  - owner and chain controls
  - upload progress and result state
  - searchable list/grid of files
- `Analytics`
  - lightweight summaries derived from fetched file data
- `Settings`
  - API configuration visibility
  - wallet/provider status visibility

## Component Plan

### Top bar

Replace the single generic wallet button with:

- `Connect EVM`
- `Connect Sui`
- independent connected-state pills and disconnect actions

The top bar should always make it obvious which wallet types are connected.

### Sidebar and navigation

Keep the existing navigation shell. Update the wallet hint to reflect dual-wallet support and the new upload path.

### Upload form

Add the working demo controls from the legacy app:

- upload mode selector
- target chain selector with `eth_sepolia` and `sui` highlighted
- file picker
- owner input
- submit/reset actions
- progress bar
- status messaging
- success panel with explorer and provenance links

### Latest asset focus

After a successful upload, the dashboard should immediately refocus on the new asset:

- show the latest file as the lead item on `Overview`
- set search/list filters from the upload result when useful
- preserve the resulting `fileId`, chain, owner, and explorer/provenance links in local state

## Data Flow

1. User connects `EVM`, `Sui`, or both.
2. Wallet state is stored globally and exposed to pages/components.
3. Upload form derives its default owner using the defined precedence.
4. User selects chain, file, and optional owner override.
5. Dashboard runs:
   - create upload
   - upload chunks
   - complete upload
   - poll upload status until terminal state
6. On success, dashboard stores the anchored asset details and updates the visible focus state.
7. Search, recent uploads, and wallet-specific views refresh against the API.
8. Manual owner and chain filters remain available even when a wallet is connected.

## Chain Handling

Primary focus:

- `eth_sepolia`
- `sui`

Secondary support remains for the current supported chains already handled by the backend and legacy demo.

The UI should:

- make the primary demo chains easiest to choose
- keep existing chain normalization and explorer-link logic
- avoid implying that all chains have identical wallet behavior

## Error Handling

### Wallet connection

EVM errors should distinguish, where detectable:

- no injected EVM wallet
- user rejected connection
- unsupported or unexpected network state

Sui errors should distinguish, where detectable:

- no Sui wallet provider
- user rejected connection
- provider unavailable

### Upload flow

The dashboard should expose stage-specific status:

- creating upload
- uploading chunks
- finalizing
- waiting for anchor
- anchored
- failed

Wallet mode must block submit when no owner can be resolved.

If anchoring succeeds but a follow-up fetch fails, the dashboard must still preserve:

- `fileId`
- chain
- explorer link
- provenance link when available

That ensures the live demo path is still recoverable even during partial read failures.

## Testing And Verification

Implementation should be considered complete only after:

- dashboard lint passes
- dashboard build passes
- wallet-state and API-helper tests pass if added
- manual demo verification succeeds for:
  - connect EVM
  - connect Sui
  - upload in wallet mode with autofilled owner
  - upload with manual owner override
  - latest asset refocus after success
  - search/filter using connected owner
  - explorer and provenance links opening correctly

## Risks And Constraints

- The current new dashboard is largely presentational and does not yet own the legacy demo flow.
- Sui wallet integration may require bringing over provider setup from `apps/tatum/src/main.tsx` rather than only adding a hook.
- The legacy upload flow contains working logic that should be reused carefully instead of reimplemented from scratch.
- Demo behavior depends on backend credentials and runtime services; frontend verification alone is not sufficient.

## Implementation Direction

The implementation should prefer adapting proven code from `apps/tatum` into focused dashboard modules over rebuilding wallet and upload behavior from first principles.

The end state is:

- `apps/dashboard` is the single dashboard used for the hackathon demo
- dual wallet connections are visible and reliable
- upload and provenance functionality match the previous demo surface
- recent uploads and search remain integrated with the new dashboard shell
