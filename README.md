# Kelly Felder — Production Planning & Control (prototype)

Frontend prototype of a production planning system for Kelly Felder's CMS manufacturing plants.
Runs fully in the browser — no backend, no API keys. All data is stored in `localStorage` (DEMO mode); ERP sync is simulated.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to dist/
npm test           # scheduling / capacity / demo-data unit tests (Vitest)
```

## Modules

| Page | Purpose |
|---|---|
| Overview | Live KPIs, planned vs actual chart, prioritised "needs attention" list |
| Planning Board | Plants/lines × dates grid, drag-and-drop scheduling with validation, undo/redo, Daily Align, save, export |
| Orders | Production orders, buyers and styles; CSV import/export; simulated ERP sync |
| Critical Path | Milestone follow-ups with derived statuses, dependencies, comments and history |
| Plants & Lines | Network master data, activation, calendars, CSV import/export |
| Efficiency Ladder | Configurable efficiency levels by production day (35% → 40% → 45% → 50%) |
| Carder Management | Monthly MOS / helper / carder counts per line (drives capacity) |
| Production Output | Good pieces, rejects and shortages against the plan |
| Calendar | Shifts, weekly patterns and day exceptions (holidays, half days) by company / plant / line |
| Settings | Demo role, scheduling preferences, backup/restore, demo reset, audit log |

## Planning logic (simplified demo assumption)

```
daily capacity (pcs) = MOS × working minutes × ladder efficiency ÷ style SMV
```

- Working minutes come from the line → plant → company calendar (exceptions override the weekly pattern).
- MOS comes from the monthly carder record; if missing, the line default is used and flagged.
- The efficiency ladder applies per working day of each allocation; the last level holds. An allocation can
  start higher up the ladder (e.g. repeat styles).
- All rules live in `src/services/` (`capacityService`, `schedulingService`, `milestoneService`); pages only display results.

## Structure

```
src/
  app/          App shell + router
  components/   layout, common UI, planning board, orders, master-data forms
  pages/        one file per module
  services/     storage, demo data, capacity, scheduling, milestones, CSV, audit (+ tests)
  store/        Zustand store (single source of truth, persisted via storageService)
  hooks/        useDerived — shared, cached planning calculations
  utils/        dates and formatting
```

Demo roles (Central Planner, Plant Manager, Administrator) only demonstrate permissions in the UI — they are not real authorisation.

---

# kelly-felder-production-planing-demo
