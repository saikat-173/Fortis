# Fortis Monthly Planner

A zero-build, single-page planner for running an entire month: Gantt timeline, projects, task allocation,
work details, outputs and goals — with a fully formatted **Excel export**.

Open `index.html` through any static server (e.g. `python3 -m http.server`) or straight from disk.
Data is stored in the browser (`localStorage`); use the database icon for JSON backup/restore.

| View | What it does |
| --- | --- |
| Overview | KPIs, planned burn-up curve, status mix, project/goal/team summaries |
| Gantt Timeline | Drag to reschedule, drag edges to resize, dependencies, milestones, group by project or person |
| Projects / Tasks | Registers with owners, dates, effort, work details and expected outputs |
| Team & Allocation | Capacity per person and a daily hours heat-map (flags overloads) |
| Goals & Outputs | KPI-style goals with progress, and a deliverables checklist |

**Excel export** (7 sheets): Overview, Gantt Chart (live conditional-formatted bars — edit a date and the bar moves),
Task Register (filters, dropdowns, formulas), Allocation heat-map, Projects, Goals & Outputs, Team.

Shortcuts: `N` new task · `/` search · `Esc` close. Vendored: ExcelJS 4.4.0 (MIT) in `vendor/`.
