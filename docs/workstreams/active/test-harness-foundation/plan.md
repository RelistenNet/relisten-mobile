# Workstream: Test Harness Foundation

## Goal

Add the smallest deterministic JavaScript/TypeScript test harness needed to validate user-library mobile logic without repeatedly launching the full app. The harness should support pure tests for API base selection, URL sanitization, Queue V2 grouping/shuffle behavior, user-library client auth decisions, and later sync reducers.

## Why This Workstream Exists

This repo currently relies on `yarn lint` and `yarn ts:check` as the default validation gates. That is not enough for risky pure logic like block-aware shuffle or token scrubbing. A narrow test harness gives later workstreams a fast feedback loop and prevents playback/auth changes from being validated only by manual app runs.

## Mutable Surface

Allowed files and directories:

- `package.json` and the Yarn lockfile for a minimal test runner dependency and `yarn test` script.
- New test config files only if the chosen runner needs them.
- Test files under `relisten/**/__tests__/`, `relisten/**/*.test.ts`, or another single convention chosen in this workstream.
- Small extraction modules needed only to make pure logic testable, such as API config parsing or URL sanitizer helpers.
- `docs/autoplan-user-library-mobile.md`, `docs/loop-ledger-user-library-mobile.md`, and this workstream ledger.

Out of scope:

- Broad refactors only to satisfy a test runner.
- Native, Detox, or end-to-end simulator testing.
- Snapshot tests for UI.

## Main Validator

Run from `/Users/alecgorge/code/relisten/relisten-mobile`:

    yarn test
    yarn lint
    yarn ts:check

The first harness slice should include at least one real test that fails if the tested logic is wrong, not only a runner smoke test.

## Fastest Useful Current Check

After the runner exists:

    yarn test -- <target-pattern>

The exact pattern depends on the runner. Record it here after implementation.

## Dependencies or Blockers

No dependency blocks this workstream. Prefer a runner that works with the existing TypeScript/Expo setup with minimal configuration.

## Current Hypothesis

Vitest or Node's built-in test runner with TypeScript support can provide enough deterministic coverage without requiring React Native runtime. The workstream should choose the option that adds the least configuration and runs fast.

## Next Scoped Step

Claim experiment `MOB-TEST-001` in this ledger before editing code. Add the runner, a script, and a first pure test around API config or URL sanitization, then validate with `yarn test`, `yarn lint`, and `yarn ts:check`.

## Code Quality Rules

Keep the harness boring. Avoid app-rendering tests until a screen-specific workstream needs them. Prefer pure functions and explicit fixtures over mocking large React Native modules.
