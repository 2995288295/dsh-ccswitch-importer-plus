# DSH CCSwitch Importer (community edition)

Import CCSwitch Codex, Claude, Claude Desktop, and OpenCode providers into DeepSeek Harness and manage per-model reasoning depth on the same **Settings -> Models** page.

[中文 README](./README.md)

> **Derivative work notice**: this plugin is a **derivative** of [wtiaw/dsh-ccswitch-importer](https://github.com/wtiaw/dsh-ccswitch-importer) (Apache-2.0), maintained by a third party. It is **not the original author's official release**. The upstream version targets DSH 0.1.x; this version reworks the Host/Client wiring for **DSH 0.2.0-rc.2** and fixes batch import, secret redaction, and localization. The npm package is `dsh-ccswitch-importer-plus`; the plugin id and loader id match the package name. See [Differences from upstream](#differences-from-upstream).

## Features

- Read-only scanning of `~/.cc-switch/cc-switch.db` for custom **Codex**, **Claude**, **Claude Desktop**, and **OpenCode** providers; official and default profiles are skipped.
- Imports endpoints, protocol, model IDs, and API keys into DSH’s `llm-pi-ai` settings.
- Reads API keys only in the Host process and stores them through DSH credentials as an `apiKeyEnv` reference; scan and import responses are redacted.
- Prefills reasoning from the top-level Codex TOML field `model_reasoning_effort` while keeping all values editable in DSH.
- Maps `none` to disabled reasoning; known models use a conservative catalog; unknown models receive only the imported level; invalid values disable reasoning with a warning.
- Re-imports preserve existing reasoning levels, route defaults, headers, capacity fields, and models that are absent from CCSwitch.
- Keeps the native Models page, CCSwitch import controls, and reasoning editor in one Models page.
- The CCSwitch import section, reasoning panel, and each model card can be collapsed; collapse preferences persist in the current browser.

CCSwitch is a read-only import source. After import, DSH settings and the credentials service are authoritative; the plugin never writes back to the CCSwitch database.

## Installation

Install from GitHub:

```bash
dsh plugin --profile desktop add github:2995288295/dsh-ccswitch-importer-plus
```

Install from a local checkout:

```bash
dsh plugin --profile desktop add ./dsh-ccswitch-importer-plus
```

After installing or updating, reload DSH Web and open **Settings -> Models**.

## Usage

1. Open **CCSwitch Import** on the Models page and click **Scan**.
2. Select the providers to import and click **Import selected**.
3. Review the import results and provider model list.
4. Confirm the prefilled reasoning levels in the reasoning section; edit wire values for a gateway when needed, then save.
5. Use the arrows in section headers or model cards to collapse and expand content; the preference is remembered automatically.
6. Use the saved reasoning levels from the composer model picker.

If a settings revision conflict occurs, the import stops and restores the credential written by that attempt; an existing credential is restored to its prior value.

## Reasoning Catalog

The conservative defaults include:

- GPT-5.6 family: `off: none`, `low`, `medium`, `high`, `xhigh`, and `max`.
- OpenAI o-series (`o1`, `o3`, `o4-mini` and variants): `off: null`, `low`, `medium`, and `high`.

The catalog is only a default. Saved DSH fields remain user-controlled.

## DSH Community Market Catalog

This plugin ships a standard catalog source for DSH Community Market as described in the [catalog adapter guide (path A: standard source)](https://github.com/anywhere-labs/deepseek-harness-desktop/blob/master/dsh-community-market/docs/catalog-adapter-guide.md). The repo includes:

- `scripts/build-catalog.mjs` — generates the `catalog-source` manifest and the `/v1/plugins` page from `package.json` metadata;
- `scripts/deploy-catalog.sh` — one-command Cloudflare Pages deployment (with JSON Content-Type rewrite rules);
- `test/catalog.test.mjs` — validates the output against the official schemas and asserts metadata consistency;
- [docs/catalog.md](./docs/catalog.md) — deployment options, Content-Type requirements, and source registration.

The repository is also tagged with the GitHub topic `dsh-plugin`, so it is automatically indexed by the [dshfind](https://dshfind.com) catalog source.

Build and deploy:

```bash
DSH_CATALOG_ORIGIN=https://catalog.example.com npm run build:catalog
```

## Security and Limitations

- Host routes accept only loopback, same-origin requests; API keys never enter the browser, logs, summaries, or error text.
- Reading requires Node.js 22.19 or newer for the read-only SQLite API.
- The plugin handles custom CCSwitch Codex / Claude / Claude Desktop / OpenCode providers and the fields currently present in the database; it does not probe third-party API capabilities.
- Unknown models and invalid levels default to disabled reasoning to avoid sending unconfirmed parameters to a gateway.

## Differences from upstream

Relative to [wtiaw/dsh-ccswitch-importer](https://github.com/wtiaw/dsh-ccswitch-importer) (`0.1.3`, 2026-09-24, targeting DSH 0.1.x):

**Compatibility rewrite for DSH 0.2.0-rc.2**

- Peer dependencies moved to `^0.2.0-rc.2`; the `@deepseek-ai/dsh-client-runtime` injection dropped in 0.2.0 was removed.
- Adapted to the 0.2.0 `{ ok, value }` remote envelope and the `settings.describe()` namespace view.
- Import sources expanded from Codex to Codex, Claude, Claude Desktop, and OpenCode.
- Added a model-catalog fallback, model probing, and loopback error surfacing.
- Mounts into the native Models page footer slot and coexists with the built-in UI.

**Fixes**

- Batch import previously succeeded only for the first provider: the settings revision is now re-read after every successful write and used as the precondition for the next one.
- Secret redaction changed from `sk-` shape matching to redaction by known secret **values**, so import responses and stderr never echo an API key.
- `POST /import` now requires a same-origin `Origin` header; an oversized request body destroys the connection instead of being silently ignored.
- If newer edits arrive while a reasoning save is in flight, the status reads "saved (unsaved changes)" rather than "saved".
- Empty scans now distinguish "CCSwitch not installed / no profiles / database unreadable / Node too old" and echo the probed path.
- `node:sqlite` is loaded lazily, so an unsupported Node version produces a readable message instead of a load failure.
- All UI strings go through the zh/en message catalogue instead of hard-coded Chinese.

**`0.2.0-rc.3` UI usability fixes**

- Blocked rows now say why: the host attaches a machine-readable `blockedCode` to every blocked reason (unknown values fall back to `blocked`), the panel localises it from the zh/en catalogue, and the variable part (app type, npm adapter) travels as `blockedDetail`.
- The refresh that follows an import no longer wipes the import report; rows show the provider name instead of the internal id, failures are marked in the error colour, and a "clear" action was added.
- The empty-state flash ("no CCSwitch provider found") is gone on first paint, and "scanning" and "importing" no longer share one button label.
- Reasoning panel: editing after a save flips the badge to "unsaved changes" instead of still claiming "saved"; the save button is disabled when the draft is unchanged, so it cannot burn a pointless settings write; "reload" asks before discarding local edits; and the level summary shows a "N custom" marker so a collapsed row still reveals customised wire values.

The upstream copyright and license are kept unmodified in `LICENSE`; changed files carry a notice header and `NOTICE` records the modifications.

## Development and Verification

Requirements: Node.js 22.19 or newer.

```bash
npm install
npm test
npm run pack:check
```

`npm run build` creates the DSH Host bundle and the Client bundle with the required `window.__ModuleLoader__.load` registration. The release package contains only `dist`, the patch, the READMEs, `NOTICE`, and the license; source and tests are excluded.
