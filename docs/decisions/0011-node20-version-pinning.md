# ADR-0011: Pin TypeScript 5.9.3, Vitest 4.1.12, jsdom 29.1.1, ESLint 9.39.5

*Status:* accepted · *Date:* 2026-10-24

**Context.** "Latest stable" is not always mutually compatible. The build environment runs Node **20.20.2**,
which is inside Next.js 16's supported range (`>=20.9.0`), but the newest releases of several tools require
Node ≥22: `vitest@5` (`^22.12 || ^24 || >=26`), `jsdom@30` (`^22.14 || >=24`, which **crashed** here with an
`undici` ESM error), and `typescript@7`. `typescript-eslint@8.72` (used by `eslint-config-next`) also
declares `typescript <6.1`.

**Decision.** Pin the newest versions that are compatible with the supported runtime and with each other:
TypeScript **5.9.3**, Vitest **4.1.12**, jsdom **29.1.1**, ESLint **9.39.5**, `@types/node` **22.20.5**.
Direct dependencies use exact versions; the lockfile is committed and CI installs with `npm ci`.

**Consequences.** (+) Verified-working toolchain, reproducible installs, no surprise engine failures in CI.
(−) We deliberately lag the absolute newest major versions; the upgrade path (Node 22/24 → TypeScript 7 →
Vitest 5) is recorded in the README's maintenance section and is a mechanical, tested change.
