# Timeback

A shared PTO tracking tool for Accenture employees — forked from Bill's personal PTO Tracker. Users sign in with Google via Supabase Auth; each user manages their own data independently.

## Running the app

```bash
cd app && npm run dev
```

## Stack & project structure

- **Vite + React** (no TypeScript), running on port 5173
- **Supabase** for auth (Google OAuth) and persistence (per-user `pto_days` + `pto_settings` tables)
- Preview config: `.claude/launch.json`

```
/Users/billchien/Documents/Apps/Timeback/
├── app/
│   ├── src/
│   │   ├── PTOTracker.jsx    ← PRIMARY working file (all UI + logic)
│   │   ├── supabase.js       ← Supabase client init
│   │   ├── App.jsx           ← Simple wrapper
│   │   └── index.css         ← Minimal reset
│   ├── package.json
│   └── vite.config.js
└── .claude/launch.json       ← Preview server config
```

## Auth

- Google OAuth via Supabase Auth
- All Supabase table reads/writes are scoped to `auth.uid()` via Row Level Security (RLS)
- App states: loading → signed out (login screen) → onboarding (first-time user) → main app
- Logout and account deletion available from Settings

## Data model

All tables have a `user_id uuid` column (references `auth.users`) with RLS policies enforcing per-user access.

### `pto_days`
| Column | Type | Description |
|--------|------|-------------|
| `date` | text | `YYYY-MM-DD` |
| `type` | text | See day types below |
| `user_id` | uuid | FK to auth.users |

### `pto_settings`
| Column | Type | Description |
|--------|------|-------------|
| `user_id` | uuid | PK + FK to auth.users |
| `data` | jsonb | All user settings (see Settings below) |

### Day types
| Type | Description |
|------|-------------|
| `PTO` | Used PTO day (past) |
| `PLAN` | Planned PTO day (future) |
| `CUL` | Used cultural day (past) |
| `PLAN_CUL` | Planned cultural day (future) |
| `UNPAID` | Used unpaid leave day (past) |
| `PLAN_UNPAID` | Planned unpaid leave day (future) |

## Leave types

- **PTO**: Accrued paid time off. Balance tracked in hours (`HOURS_PER_DAY = 8`).
- **Cultural days**: Fixed 2 days/year (`CUL_DAYS_TOTAL = 2`), separate from PTO balance.
- **Unpaid leave**: Unlimited. Does **not** consume PTO balance.

## Onboarding flow

First-time users (no `pto_settings` row) are shown an onboarding screen to configure:
1. Name
2. Management level (CL) — determines accrual rate milestones
3. Service start date — used to compute 5yr/10yr accrual milestones
4. Current PTO balance snapshot + snapshot date

## Interactions

- **Click** an empty weekday: opens popup to assign PTO or CUL day.
- **Click** an assigned day: clears the assignment.
- **Drag** across empty weekdays: multi-select to plan days off. CUL days are consumed first (up to `culRemaining`), then PTO. Capped at `totalAvailDays` — preview stops growing when balance hits zero; toast fires if drag exceeded capacity. Commits atomically on mouseup (one undo step).
- **Drag** across planned days: multi-select to remove planned days. Preview dims cells to ~20% opacity; all `PLAN`/`PLAN_CUL`/`PLAN_UNPAID` in range are cleared on mouseup.
- **⌘ Cmd + drag** across `PLAN` days: bulk convert to unpaid leave (`PLAN_UNPAID`). Preview dims cells to ~35% opacity.
- **⌘ Cmd + drag** across `PLAN_UNPAID` days: bulk convert back to `PLAN`. Preview dims cells to ~35% opacity.
- **⌥ Option + drag** across unlocked planned days: bulk lock. Preview shows the lock dot at 40% opacity; circles stay full opacity.
- **⌥ Option + drag** across locked planned days: bulk unlock. Lock dot fades to 40% opacity as preview.
- **Locked days are immune to all drag operations** — only ⌥ Option+drag unlock can affect them.
- **Cmd+Click** a planned PTO (`PLAN`) day: converts to planned unpaid leave (`PLAN_UNPAID`), restoring the PTO day to balance.
- **Cmd+Click** a planned unpaid (`PLAN_UNPAID`) day: converts back to planned PTO (`PLAN`).
- **Cmd+Z**: undo the last day assignment change (up to 20 steps, in-memory only).
- Click calendar white space → closes side panel.

## Panel tabs

| Tab | Purpose |
|-----|---------|
| **PLAN** (`reco`) | Suggests break opportunities around holidays; preview + apply to calendar |
| **DRAFT** (`write`) | Draft approval email from planned dates; copy to clipboard |
| **BALANCE** (`overview`) | Current balance, accrual rates, used days |
| **SETTINGS** (`settings`) | Name, CL, service start date, snapshot balance, calendar view, logout, delete account |

## Business logic

### Key constants
```js
ACCRUAL_RATE_PRE5   = 7.0    // hrs/pay period before 5yr milestone
ACCRUAL_RATE_POST5  = 7.67   // hrs/pay period from 5yr to 10yr milestone
ACCRUAL_RATE_POST10 = 8.33   // hrs/pay period after 10yr milestone
HOURS_PER_DAY       = 8
CARRYOVER_CAP       = 200    // max hrs carrying to next FY
CUL_DAYS_TOTAL      = 2      // cultural days per calendar year
FY boundary: Sep 1 – Aug 31
```

Milestones are computed dynamically from each user's service start date.

### Balance calculation

`currentBal` is computed by walking FY by FY from the snapshot date to today, applying the 200-hr carryover cap at each Aug 31 boundary crossed:

1. Start with `snapshotBal` at `balDate`
2. For each Aug 31 between `balDate` and today: add accruals, subtract PTO taken, then `min(balance, 200)`
3. Add remaining accruals and PTO from the last Aug 31 to today

This ensures a user whose balance would have been capped in a prior FY doesn't carry an inflated balance into the current year. Mid-year the balance **can** legitimately exceed 200 hrs (e.g. 25 days carried over + ~25 days accrued = ~50 days peak).

Unpaid leave excluded from all balance calculations.

### Smart logic
- Dynamic PLAN colors: lime if projected balance covers it, coral if not feasible (per-date projected balance check). Coral days are still clickable.
- Year-aware stats: switching years recalculates everything.
- Service-year milestones: accrual rate bumps at 5yr and 10yr marks (computed per user).
- FY rollover: caps balance at 200 hrs **only at Aug 31** — balance can exceed 200 hrs mid-year.
- Feasibility checking per planned date based on projected accruals.
- CUL popup option hidden when `culRemaining <= 0` (respects onboarding-configured cultural day balance, not just the default 2).
- **`totalAvailDays`**: header PTO stat = `currentBal + accruals(today→Dec31 of viewYear) − planned(today→Dec31 of viewYear)`, no carryover cap. Updates when `viewYear` changes. Resets naturally on Sep 1 when `currentBal` gets the Aug 31 cap applied.
- **PTO planning gate**: when `totalAvailDays <= 0`, any attempt to plan a future PTO day (via popup or single-click) shows a toast "All PTO planned for the year" and does nothing. Prevents the header from going negative.
- **Infeasible PLAN cell text**: always uses `P.maroon` (#400000) — dark red readable on coral in both light and dark themes.

### Pay period generation
`PAY_PERIOD_ENDS` is generated dynamically at module load, covering 2025 through `currentYear + 20`.

**Rule:** Accenture pays on the **6th and 21st of each month**. If either date falls on a weekend or US federal holiday, the pay date moves to the **prior business day**. This was confirmed against actual pay statements (Jul 2025 – May 2026).

Example: July 6, 2025 is a Sunday → July 5 is Saturday → July 4 is Independence Day → pay date = **July 3 (Thursday)**.

`getFederalHolidays(year)` computes all 11 US federal holidays algorithmically (nth-weekday rules for floating holidays, observed-date rules for fixed ones). No hardcoded date lists needed.

### Year navigation & data retention
- `viewYear` initializes dynamically based on the current FY: `month >= 8 ? year + 1 : year`. So on Sep 1, 2026 it defaults to 2027, etc. Never hardcoded.
- `minViewYear = Math.max(2026, currentYear - 5)` — computed per session in `PTOTrackerApp`.
- Left arrow in year nav is disabled (faded, no cursor) at `minViewYear`; can't navigate before it.
- On app load, any `pto_days` entries with dates before `minViewYear + "-01-01"` are deleted from Supabase and excluded from local state. This creates a rolling 5-year retention window (active starting when `currentYear − 5 > 2026`, i.e. 2032+).

## Design system

**Fonts:**
- `Space Mono` — numbers, stat values, year nav
- `Work Sans` — all UI text, labels, buttons
- `Sorts Mill Goudy` — user name in panel header (italic serif)

**Type scale (`T`):**
```js
T.stat                          // Space Mono, weight 400, lineHeight 1 — big header numbers (fontSize set per usage: 44 mobile, 54 desktop)
T.display.lg                    // Sorts Mill Goudy italic, 50px — user name
T.display.md                    // Sorts Mill Goudy italic, 22px
T.num                           // Work Sans, 20px, weight 500 — panel stat numbers
T.label.alt                     // Work Sans, 11px, weight 500, uppercase + letterSpacing — primary labels (e.g. "PTO DAYS")
T.label.base                    // Work Sans, 11px, weight 400, uppercase + letterSpacing — secondary labels (e.g. "BY DEC 31")
T.label.sm                      // Work Sans, 11px, weight 400 — small labels, no transform
T.body.sm                       // Work Sans, 12px, weight 400 — small body text
T.body.smAlt                    // Work Sans, 12px, weight 500 — small body emphasis
T.body.base                     // Work Sans, 14px, weight 400 — default body
T.body.alt                      // Work Sans, 14px, weight 500 — body emphasis, inputs, buttons
```

**Colors:** Two-tier system — primitives (`P`) hold raw values; semantic tokens (`S`) reference them. `S` has light + dark variants (`LIGHT_S` / `DARK_S`); `applyTheme(mode)` mutates the live `S` object on every render of the top-level component.

```js
// Primitives
P.white "#FFFFFF"   P.gray05 "#F8F8F8"   P.gray15 "#E3E3E3"
P.gray25 "#CECECE"  P.gray45 "#757575"   P.black "#000000"
P.ink "#141B13"     P.inkDeep "#0F170F"
P.lime "#ADFF55"    P.limeDeep "#70D900"
P.lime05 "#E0FF66"  P.lime35 "#4C9928"   P.lime55 "#386828"   P.lime75 "#263E21"
P.mint "#C8FFD6"
P.yellow "#D9FF00"  P.yellowHi "#FCF937" P.coral "#FF715B"    P.maroon "#400000"

// Semantic              LIGHT          DARK
S.bg / S.surface       → P.white      / P.ink
S.surfaceAlt           → P.gray05     / P.inkDeep
S.surfaceAltRgb        → "248,248,248"/"15,23,15"
S.border               → P.gray15     / P.lime75
S.text                 → P.black      / P.lime
S.textSubtle           → P.gray45     / P.lime55
S.textFaint            → P.gray25     / P.lime75
S.iconSubtle           → P.gray45     / P.lime35
S.iconOnPto            → P.white      / P.inkDeep
S.today / S.todayText  → P.black/P.white   / P.mint/P.inkDeep
S.pto                  → P.lime       / P.lime
S.ptoOver / Text       → P.coral / P.maroon (light) / P.coral (dark)
S.cul                  → P.yellow     / P.lime05
S.holiday              → P.yellowHi   / P.lime75
S.unpaid               → P.limeDeep   / P.lime35
S.shadowHeader         → "0 1px 12px rgba(0,0,0,0.08)" / "0 2px 16px rgba(0,0,0,0.4)"
S.shadowThumb          → "0 1px 4px rgba(0,0,0,0.12)"  / "0 2px 6px rgba(0,0,0,0.4)"
```

Theme (Light / Dark / System) in Settings. Default is `system`.

**Layout:**
- Sticky header: 2 stats (PTO Days / By Dec 31, CUL Days / As of today) + year nav + panel toggle + divider
- Calendar grid: `repeat(auto-fill, minmax(260px, 1fr))` — 4 cols desktop, responsive to 1 col
- Fluid circular cells: `width: 100%, aspectRatio: 1, borderRadius: 999`
- Side panel: animated width `0 ↔ 360px`, pushes calendar (not overlay)

## Roadmap

1. ~~Google sign-in + sign-out~~ ✓ Done
2. ~~Onboarding flow (name, CL, service date, balance snapshot)~~ ✓ Done
3. ~~Per-user data with RLS~~ ✓ Done
4. ~~Account deletion + logout~~ ✓ Done (real auth deletion via Edge Function with CORS)
5. ~~Publish Google OAuth app~~ ✓ Done
6. Multi-year view
7. Export to CSV/Google Calendar

## Notes for Claude

- Update this CLAUDE.md whenever an important logic or architecture decision is made.
- Bill prefers brief direct answers, lead with the conclusion.
- He's a designer — expects pixel-perfect implementation from Figma.
- The code uses `var` and `function()` style (artifact parser legacy).
- Bill knows enough to read code but isn't a developer — explain changes plainly.
- The screenshot preview tool captures at 2x DPR — use `preview_eval` for precise layout verification.
