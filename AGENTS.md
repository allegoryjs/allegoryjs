# Agent Instructions for Allegory.js

This project uses **oxfmt** for formatting and **oxlint** for linting. All generated code must comply with these rules.

## Code Style (oxfmt)

- **No semicolons** — never end statements with `;`
- **Single quotes** — use `'` for strings, not `"`
- **Trailing commas** — always add trailing commas in multi-line objects, arrays, and function params
- **100 char width** — keep lines within 100 characters
- **Sort imports** — imports will be auto-sorted; don't worry about ordering

## TypeScript Conventions (oxlint)

- **`import type`** — always use `import type { Foo }` for type-only imports. Do not mix types and values in the same import statement (`consistent-type-imports`).
- **No relative parent imports** — use the `@/` path alias instead of `../` to reach into `src/`.
  ```ts
  // ❌
  import { Foo } from '../../utilities/foo'

  // ✅
  import { Foo } from '@/utilities/foo'
  ```
- **`await` in loops is allowed** — the `no-await-in-loop` rule is off.
- **Correctness & perf rules** are errors — do not introduce lint errors.
- **Suspicious rules** are warnings — address them when possible.

## TypeScript Config

- **Strict mode** is on — all types must be fully sound.
- **`verbatimModuleSyntax`** is on — `import type` is mandatory for type-only imports.
- **Target**: ESNext, **Module**: Preserve (bundler module resolution).
- **JSX**: `react-jsx`.
- **Path alias**: `@/*` maps to `./src/*`.

## Project Commands

- `bun run lint` — check formatting and linting
- `bun run lint:fix` — auto-fix both formatting and linting
- `bun run lint:style` — fix formatting only

Always run `bun run lint` after making changes to verify compliance.
