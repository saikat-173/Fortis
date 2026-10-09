/* Excel export (ExcelJS). Produces a styled, formula-driven workbook; the Gantt sheet is driven by conditional
   formatting on real dates, so editing a start/end date in Excel moves the bar. */
(() => {
'use strict';
const FP = window.FP;

const argb = hex => 'FF' + hex.replace('#', '').toUpperCase();
const solid = hex => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const cfFill = hex => ({ type: 'pattern', pattern: 'solid', bgColor: { argb: argb(hex) } });
const colL = n => { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; };
const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const thin = c => ({ style: 'thin', color: { argb: argb(c) } });
const BORDER = { top: thin('#DDE1F0'), left: thin('#DDE1F0'), bottom: thin('#DDE1F0'), right: thin('#DDE1F0') };
const NAVY = '#0F1633', INDIGO = '#5B6CFF', INK = '#12172E', MUTED = '#56608A', ZEBRA = '#F7F8FD', WEND = '#EEF0F8';
const DATE_FMT = 'dd mmm yyyy';
const STATUS_FILL = { 'To do': ['#E9ECF7', '#56608A'], 'In progress': ['#DDF1FC', '#0A6FA3'], 'In review': ['#EBDDFF', '#6B3FB5'], 'Done': ['#D6F5E7', '#0B7A52'], 'Blocked': ['#FDDDE2', '#B42339'] };
const PRIO_FILL = { 'Low': ['#E9ECF7', '#56608A'], 'Medium': ['#FDF0D2', '#8A5A00'], 'High': ['#FDDDE2', '#B42339'], 'Critical': ['#B42339', '#FFFFFF'] };

function banner(ws, title, sub, lastCol) {
  ws.mergeCells(1, 1, 1, lastCol); ws.mergeCells(2, 1, 2, lastCol);
  const a = ws.getCell(1, 1); a.value = title; a.font = { name: 'Calibri', size: 20, bold: true, color: { argb: 'FFFFFFFF' } }; a.alignment = { vertical: 'middle', indent: 1 };
  const b = ws.getCell(2, 1); b.value = sub; b.font = { name: 'Calibri', size: 11, color: { argb: argb('#C5CCFF') } }; b.alignment = { vertical: 'middle', indent: 1, wrapText: true };
  for (let c = 1; c <= lastCol; c++) { ws.getCell(1, c).fill = solid(NAVY); ws.getCell(2, c).fill = solid(NAVY); }
  ws.getRow(1).height = 36; ws.getRow(2).height = 24;
}
function headerRow(ws, r, labels, from = 1) {
  labels.forEach((l, i) => {
    const c = ws.getCell(r, from + i); c.value = l;
    c.font = { name: 'Calibri', bold: true, size: 10.5, color: { argb: 'FFFFFFFF' } }; c.fill = solid(INDIGO);
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; c.border = BORDER;
  });
  ws.getRow(r).height = 28;
}
function body(ws, r, from, to, zebra) {
  for (let c = from; c <= to; c++) {
    const cell = ws.getCell(r, c); cell.border = BORDER;
    cell.font = { name: 'Calibri', size: 10.5, color: { argb: argb(INK) }, ...(cell.font || {}) };
    cell.alignment = { vertical: 'middle', wrapText: true, ...(cell.alignment || {}) };
    if (zebra && !cell.fill) cell.fill = solid(ZEBRA);
  }
}
const sectionTitle = (ws, r, text, lastCol) => {
  const c = ws.getCell(r, 1); c.value = text; c.font = { name: 'Calibri', size: 13, bold: true, color: { argb: argb(INK) } };
  for (let i = 1; i <= lastCol; i++) ws.getCell(r, i).border = { bottom: { style: 'medium', color: { argb: argb(INDIGO) } } };
  ws.getRow(r).height = 22;
};
const hexOr = (h, d = '#7480A8') => /^#[0-9a-f]{6}$/i.test(h || '') ? h : d;

FP.exportExcel = async function (scope = 'month') {
  if (!window.ExcelJS) throw new Error('Excel library failed to load');
  const H = FP.helpers, S = FP.state(), mi = H.MI(), today = H.todayISO();
  const wb = new ExcelJS.Workbook();
  wb.creator = S.plan.owner || 'Fortis Monthly Planner'; wb.created = new Date(); wb.title = S.plan.name;
  const lab = H.lab, STATUS = H.STATUS, PRIORITY = H.PRIORITY, PSTATUS = H.PSTATUS;
  const statusL = k => lab(STATUS, k), prioL = k => lab(PRIORITY, k);

  // ordered task list: by project order, then start
  const pIndex = id => { const i = S.projects.findIndex(p => p.id === id); return i < 0 ? 999 : i; };
  const tasks = S.tasks.filter(t => scope === 'all' || H.inMonth(t, mi))
    .sort((a, b) => pIndex(a.projectId) - pIndex(b.projectId) || a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  const L = H.computeLoad();
  const REG = "'Task Register'", R0 = 5, R1 = Math.max(R0, R0 + tasks.length - 1);
  const rng = col => `${REG}!$${col}$${R0}:$${col}$${R1}`;
  const wdCount = mi.days.filter(s => !H.isWE(s)).length;
  const projName = id => (H.project(id) || {}).name || '—';
  const ownerName = id => (H.member(id) || {}).name || 'Unassigned';
  const planPct = tasks.length ? H.wavg(tasks) / 100 : 0;
  const healthL = t => ({ done: 'Done', blocked: 'Blocked', overdue: 'Overdue', behind: 'Behind', ontrack: 'On track' }[H.health(t)]);

  /* ────────────── 1 · Overview ────────────── */
  {
    const ws = wb.addWorksheet('Overview', { views: [{ showGridLines: false }], properties: { tabColor: { argb: argb(INDIGO) } } });
    ws.columns = [{ width: 30 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
    banner(ws, S.plan.name || 'Monthly Plan', `${mi.label}  ·  Owner: ${S.plan.owner || '—'}${S.plan.org ? '  ·  ' + S.plan.org : ''}  ·  ${H.WEEKEND_LABEL[S.plan.weekend]}`, 8);
    ws.mergeCells('A3:H3'); const o = ws.getCell('A3'); o.value = S.plan.objective || ''; o.font = { italic: true, size: 11, color: { argb: argb(MUTED) } }; o.alignment = { wrapText: true, vertical: 'middle', indent: 1 }; ws.getRow(3).height = 38;
    // KPI tiles
    const done = tasks.filter(t => t.status === 'done').length, hrs = tasks.reduce((a, t) => a + (t.hours || 0), 0);
    const atRisk = tasks.filter(t => ['overdue', 'behind', 'blocked'].includes(H.health(t))).length;
    const tiles = [
      [1, 1, 'TASKS', { formula: `COUNTA(${rng('C')})`, result: tasks.length }, '0', INDIGO, '#F2F4FF'],
      [2, 3, 'COMPLETED', { formula: `COUNTIF(${rng('J')},"Done")`, result: done }, '0', '#0B7A52', '#EAFAF2'],
      [4, 5, 'OVERALL PROGRESS', { formula: `IFERROR(SUMPRODUCT(${rng('I')},${rng('H')})/SUM(${rng('H')}),0)`, result: planPct }, '0%', INDIGO, '#F2F4FF'],
      [6, 7, 'PLANNED HOURS', { formula: `SUM(${rng('L')})`, result: hrs }, '#,##0', '#8A5A00', '#FFF7E3'],
      [8, 8, 'AT RISK', { formula: `COUNTIF(${rng('O')},"Overdue")+COUNTIF(${rng('O')},"Behind")+COUNTIF(${rng('O')},"Blocked")`, result: atRisk }, '0', '#B42339', '#FFF1F3'],
    ];
    tiles.forEach(([from, to, label, val, nf, ink, bg]) => {
      if (to > from) { ws.mergeCells(5, from, 5, to); ws.mergeCells(6, from, 6, to); }
      const lc = ws.getCell(5, from), vc = ws.getCell(6, from);
      lc.value = label; lc.font = { size: 9, bold: true, color: { argb: argb(MUTED) } }; lc.alignment = { horizontal: 'center', vertical: 'middle' };
      vc.value = val; vc.numFmt = nf; vc.font = { size: 24, bold: true, color: { argb: argb(ink) } }; vc.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let cc = from; cc <= to; cc++) { ws.getCell(5, cc).fill = solid(bg); ws.getCell(6, cc).fill = solid(bg); ws.getCell(5, cc).border = { top: { style: 'medium', color: { argb: argb(ink) } }, left: cc === from ? thin('#FFFFFF') : undefined }; }
    });
    ws.getRow(4).height = 8; ws.getRow(5).height = 22; ws.getRow(6).height = 42;

    // goals
    let r = 8; sectionTitle(ws, r, 'Goals this month', 8); r++;
    headerRow(ws, r, ['Goal', 'Metric', 'Start', 'Current', 'Target', 'Progress', 'Owner', 'Due']); r++;
    S.goals.forEach((g, i) => {
      const p = H.goalPct(g) / 100;
      ws.getCell(r, 1).value = g.title; ws.getCell(r, 2).value = g.metric ? `${g.metric}${g.unit ? ' (' + g.unit + ')' : ''}` : '';
      ws.getCell(r, 3).value = g.baseline; ws.getCell(r, 4).value = g.current; ws.getCell(r, 5).value = g.target;
      ws.getCell(r, 6).value = { formula: `IFERROR(MAX(0,MIN(1,(D${r}-C${r})/(E${r}-C${r}))),0)`, result: p }; ws.getCell(r, 6).numFmt = '0%';
      ws.getCell(r, 7).value = ownerName(g.owner); ws.getCell(r, 8).value = g.due ? toDate(g.due) : null; ws.getCell(r, 8).numFmt = DATE_FMT;
      body(ws, r, 1, 8, i % 2); ws.getCell(r, 1).font = { bold: true, size: 10.5 }; [3, 4, 5, 6, 8].forEach(c => ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' });
      ws.getCell(r, 1).border = { ...BORDER, left: { style: 'thick', color: { argb: argb(hexOr(g.color)) } } };
      ws.getRow(r).height = 22; r++;
    });
    if (!S.goals.length) { ws.getCell(r, 1).value = 'No goals defined'; ws.getCell(r, 1).font = { italic: true, color: { argb: argb(MUTED) } }; r++; }
    if (S.goals.length) ws.addConditionalFormatting({ ref: `F10:F${r - 1}`, rules: [{ type: 'dataBar', gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: argb('#9AA6FF') } }] });

    // project roll-up
    r += 1; sectionTitle(ws, r, 'Project roll-up', 8); r++;
    headerRow(ws, r, ['Project', 'Owner', 'Status', 'Tasks', 'Done', 'Progress', 'Hours', 'Health']); r++;
    const pr0 = r;
    S.projects.forEach((p, i) => {
      const pts = tasks.filter(t => t.projectId === p.id), pdone = pts.filter(t => t.status === 'done').length;
      const pp = pts.length ? H.wavg(pts) / 100 : 0;
      const hl = pts.some(t => ['overdue', 'blocked'].includes(H.health(t))) ? 'At risk' : pts.some(t => H.health(t) === 'behind') ? 'Watch' : 'On track';
      ws.getCell(r, 1).value = p.name; ws.getCell(r, 2).value = ownerName(p.owner); ws.getCell(r, 3).value = lab(PSTATUS, p.status);
      ws.getCell(r, 4).value = { formula: `COUNTIF(${rng('B')},A${r})`, result: pts.length };
      ws.getCell(r, 5).value = { formula: `COUNTIFS(${rng('B')},A${r},${rng('J')},"Done")`, result: pdone };
      ws.getCell(r, 6).value = { formula: `IFERROR(SUMPRODUCT((${rng('B')}=A${r})*${rng('I')}*${rng('H')})/SUMIF(${rng('B')},A${r},${rng('H')}),0)`, result: pp }; ws.getCell(r, 6).numFmt = '0%';
      ws.getCell(r, 7).value = { formula: `SUMIF(${rng('B')},A${r},${rng('L')})`, result: pts.reduce((a, t) => a + (t.hours || 0), 0) }; ws.getCell(r, 7).numFmt = '#,##0';
      ws.getCell(r, 8).value = hl;
      body(ws, r, 1, 8, i % 2); ws.getCell(r, 1).font = { bold: true, size: 10.5 };
      ws.getCell(r, 1).border = { ...BORDER, left: { style: 'thick', color: { argb: argb(hexOr(p.color)) } } };
      [3, 4, 5, 6, 7, 8].forEach(c => ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' }); ws.getRow(r).height = 22; r++;
    });
    if (S.projects.length) {
      ws.addConditionalFormatting({ ref: `F${pr0}:F${r - 1}`, rules: [{ type: 'dataBar', gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: argb('#9AA6FF') } }] });
      ws.addConditionalFormatting({ ref: `H${pr0}:H${r - 1}`, rules: [
        { type: 'containsText', operator: 'containsText', text: 'At risk', style: { font: { bold: true, color: { argb: argb('#B42339') } }, fill: cfFill('#FDDDE2') } },
        { type: 'containsText', operator: 'containsText', text: 'Watch', style: { font: { bold: true, color: { argb: argb('#8A5A00') } }, fill: cfFill('#FDF0D2') } },
        { type: 'containsText', operator: 'containsText', text: 'On track', style: { font: { bold: true, color: { argb: argb('#0B7A52') } }, fill: cfFill('#D6F5E7') } }] });
    }
    if (S.plan.notes) { r += 1; sectionTitle(ws, r, 'Notes & cadence', 8); r++; ws.mergeCells(r, 1, r, 8); const n = ws.getCell(r, 1); n.value = S.plan.notes; n.alignment = { wrapText: true, vertical: 'top' }; ws.getRow(r).height = 48; }
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }

  /* ────────────── 2 · Gantt Chart ────────────── */
  {
    const ws = wb.addWorksheet('Gantt Chart', { views: [{ showGridLines: false, state: 'frozen', xSplit: 6, ySplit: 6 }], properties: { tabColor: { argb: argb('#22C3A6') } } });
    const D0 = 7, N = mi.n, last = D0 + N - 1;
    ws.columns = [{ width: 36 }, { width: 16 }, { width: 11.5 }, { width: 11.5 }, { width: 6.5 }, { width: 7.5 }, ...Array.from({ length: N }, () => ({ width: 3.9 }))];
    banner(ws, `Gantt — ${mi.label}`, 'Bars are live: change a Start or End date and the bar follows. Dark shade = completed share. Pink = today. Grey = days off.', last);
    // week row (4), weekday row (5), date row (6)
    const weeks = []; mi.days.forEach((s, i) => { if (i === 0 || H.dow(s) === 1) weeks.push({ from: i, n: 0, s }); weeks[weeks.length - 1].n++; });
    weeks.forEach(w => {
      const c1 = D0 + w.from, c2 = c1 + w.n - 1; if (c2 > c1) ws.mergeCells(4, c1, 4, c2);
      const c = ws.getCell(4, c1); c.value = `Week of ${H.fmt(w.s)}`; c.font = { bold: true, size: 9.5, color: { argb: 'FFFFFFFF' } }; c.alignment = { horizontal: 'center', vertical: 'middle' };
      for (let x = c1; x <= c2; x++) { ws.getCell(4, x).fill = solid(w.from % 2 ? '#2A3470' : '#1B2455'); ws.getCell(4, x).border = { left: thin('#0F1633') }; }
    });
    ['Task', 'Owner', 'Start', 'End', 'Days', '% done'].forEach((l, i) => {
      ws.mergeCells(4, i + 1, 6, i + 1); const c = ws.getCell(4, i + 1); c.value = l; c.font = { bold: true, size: 10.5, color: { argb: 'FFFFFFFF' } }; c.fill = solid(INDIGO); c.alignment = { horizontal: i ? 'center' : 'left', vertical: 'middle', indent: i ? 0 : 1 }; c.border = BORDER;
    });
    mi.days.forEach((s, i) => {
      const c = D0 + i, we = H.isWE(s);
      const wd = ws.getCell(5, c); wd.value = { formula: `LEFT(TEXT(${colL(c)}6,"ddd"),1)`, result: H.WDL[H.dow(s)][0] };
      wd.font = { size: 8.5, bold: true, color: { argb: argb(we ? '#8791B6' : '#C5CCFF') } }; wd.alignment = { horizontal: 'center' }; wd.fill = solid(we ? '#222A55' : NAVY);
      const dd = ws.getCell(6, c); dd.value = toDate(s); dd.numFmt = 'd'; dd.font = { size: 10, bold: true, color: { argb: argb(we ? '#8791B6' : '#FFFFFF') } }; dd.alignment = { horizontal: 'center', vertical: 'middle' }; dd.fill = solid(we ? '#222A55' : NAVY);
    });
    ws.getRow(4).height = 20; ws.getRow(5).height = 16; ws.getRow(6).height = 20;
    ws.addConditionalFormatting({ ref: `${colL(D0)}5:${colL(last)}6`, rules: [{ type: 'expression', formulae: [`${colL(D0)}$6=TODAY()`], style: { fill: cfFill('#FF5C8A'), font: { color: { argb: 'FFFFFFFF' }, bold: true } } }] });
    const weFormula = c => 'OR(' + FP.weekendDows().map(d => `WEEKDAY(${c}$6)=${d + 1}`).join(',') + ')';

    let r = 7; const L0 = colL(D0), Ll = colL(last);
    const groups = S.projects.map(p => ({ p, ts: tasks.filter(t => t.projectId === p.id) })).filter(g => g.ts.length);
    const orphan = tasks.filter(t => !H.project(t.projectId)); if (orphan.length) groups.push({ p: { id: '_', name: 'No project', color: '#7480A8' }, ts: orphan });
    groups.forEach(({ p, ts }) => {
      const col = hexOr(p.color);
      ws.mergeCells(r, 1, r, 2);
      const gc = ws.getCell(r, 1); gc.value = `${p.name}`; gc.font = { bold: true, size: 11, color: { argb: argb(H.inkOn(col) === '#FFFFFF' ? '#FFFFFF' : '#0A0E22') } }; gc.alignment = { vertical: 'middle', indent: 1 };
      for (let c = 1; c <= last; c++) { const x = ws.getCell(r, c); x.fill = solid(c <= 6 ? col : H.shade(col, 0.55)); x.border = { bottom: thin('#FFFFFF') }; }
      const gs = ts.reduce((a, t) => t.start < a ? t.start : a, ts[0].start), ge = ts.reduce((a, t) => t.end > a ? t.end : a, ts[0].end);
      [[3, toDate(gs)], [4, toDate(ge)]].forEach(([c, v]) => { const x = ws.getCell(r, c); x.value = v; x.numFmt = 'dd mmm'; x.alignment = { horizontal: 'center' }; x.font = { bold: true, size: 10, color: { argb: argb(H.inkOn(col) === '#FFFFFF' ? '#FFFFFF' : '#0A0E22') } }; });
      const gp = ws.getCell(r, 6); gp.value = H.wavg(ts) / 100; gp.numFmt = '0%'; gp.alignment = { horizontal: 'center' }; gp.font = { bold: true, size: 10, color: { argb: argb(H.inkOn(col) === '#FFFFFF' ? '#FFFFFF' : '#0A0E22') } };
      ws.getRow(r).height = 22; r++;
      const r1 = r;
      ts.forEach((t, i) => {
        const m = H.member(t.assignee);
        const row = r;
        ws.getCell(row, 1).value = (t.milestone ? '◆ ' : '') + t.name; ws.getCell(row, 2).value = m ? m.name : 'Unassigned';
        ws.getCell(row, 3).value = toDate(t.start); ws.getCell(row, 4).value = toDate(t.end); ws.getCell(row, 3).numFmt = ws.getCell(row, 4).numFmt = 'dd mmm';
        ws.getCell(row, 5).value = { formula: `D${row}-C${row}+1`, result: H.dur(t) }; ws.getCell(row, 6).value = t.progress / 100; ws.getCell(row, 6).numFmt = '0%';
        for (let c = 1; c <= 6; c++) { const x = ws.getCell(row, c); x.border = BORDER; x.font = { size: 10, color: { argb: argb(INK) } }; x.alignment = { vertical: 'middle', horizontal: c <= 2 ? 'left' : 'center', indent: c === 1 ? 1 : 0, wrapText: false }; x.fill = solid(i % 2 ? ZEBRA : '#FFFFFF'); }
        ws.getCell(row, 1).font = { size: 10.5, bold: !!t.milestone, color: { argb: argb(INK) } };
        for (let c = D0; c <= last; c++) {
          const x = ws.getCell(row, c); x.border = { left: thin('#E6E9F5'), right: thin('#E6E9F5'), top: thin('#EEF0F8'), bottom: thin('#EEF0F8') };
          if (t.milestone) { x.value = { formula: `IF(${colL(c)}$6=$C${row},"◆","")`, result: mi.days[c - D0] === t.start ? '◆' : '' }; x.alignment = { horizontal: 'center', vertical: 'middle' }; x.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } }; }
        }
        ws.getRow(row).height = 21; r++;
      });
      const r2 = r - 1, ref = `${L0}${r1}:${Ll}${r2}`;
      ws.addConditionalFormatting({ ref, rules: [
        { type: 'expression', formulae: [`AND(${L0}$6>=$C${r1},${L0}$6<=$C${r1}+ROUND(($D${r1}-$C${r1}+1)*$F${r1},0)-1)`], style: { fill: cfFill(H.shade(col, -0.32)), font: { color: { argb: 'FFFFFFFF' } } } },
        { type: 'expression', formulae: [`AND(${L0}$6>=$C${r1},${L0}$6<=$D${r1})`], style: { fill: cfFill(col), font: { color: { argb: 'FFFFFFFF' } } } },
        { type: 'expression', formulae: [`${L0}$6=TODAY()`], style: { fill: cfFill('#FFE3EC') } },
        { type: 'expression', formulae: [weFormula(L0)], style: { fill: cfFill(WEND) } },
      ] });
    });
    if (!groups.length) { ws.getCell(7, 1).value = 'No tasks to display'; ws.getCell(7, 1).font = { italic: true, color: { argb: argb(MUTED) } }; }
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
    ws.headerFooter.oddFooter = '&L&8Fortis Monthly Planner&R&8Page &P of &N';
  }

  /* ────────────── 3 · Task Register ────────────── */
  {
    const ws = wb.addWorksheet('Task Register', { views: [{ showGridLines: false, state: 'frozen', xSplit: 3, ySplit: 4 }], properties: { tabColor: { argb: argb('#F2B94B') } } });
    const heads = ['#', 'Project', 'Task', 'Work details', 'Owner', 'Start', 'End', 'Days', 'Progress', 'Status', 'Priority', 'Hours', 'Depends on', 'Expected output / deliverable', 'Health'];
    ws.columns = [{ width: 5 }, { width: 24 }, { width: 38 }, { width: 44 }, { width: 18 }, { width: 13 }, { width: 13 }, { width: 7 }, { width: 11 }, { width: 13 }, { width: 11 }, { width: 8 }, { width: 28 }, { width: 40 }, { width: 11 }];
    banner(ws, 'Task Register', `${mi.label} · ${tasks.length} tasks · filter, sort and edit freely — summary sheets recalculate`, heads.length);
    headerRow(ws, 4, heads);
    tasks.forEach((t, i) => {
      const r = R0 + i, dep = H.task(t.dep);
      const vals = [i + 1, projName(t.projectId), (t.milestone ? '◆ ' : '') + t.name, t.details || '', ownerName(t.assignee), toDate(t.start), toDate(t.end), { formula: `G${r}-F${r}+1`, result: H.dur(t) }, t.progress / 100, statusL(t.status), prioL(t.priority), t.hours || 0, dep ? dep.name : '', t.output || '', healthL(t)];
      vals.forEach((v, c) => ws.getCell(r, c + 1).value = v);
      ws.getCell(r, 6).numFmt = ws.getCell(r, 7).numFmt = DATE_FMT; ws.getCell(r, 9).numFmt = '0%'; ws.getCell(r, 12).numFmt = '#,##0.0';
      body(ws, r, 1, 15, i % 2);
      [1, 6, 7, 8, 9, 10, 11, 12, 15].forEach(c => ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true });
      ws.getCell(r, 3).font = { bold: true, size: 10.5, color: { argb: argb(INK) } };
      const p = H.project(t.projectId); if (p) ws.getCell(r, 2).border = { ...BORDER, left: { style: 'thick', color: { argb: argb(hexOr(p.color)) } } };
      ws.getCell(r, 10).dataValidation = { type: 'list', allowBlank: false, formulae: ['"To do,In progress,In review,Done,Blocked"'] };
      ws.getCell(r, 11).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Low,Medium,High,Critical"'] };
      ws.getCell(r, 9).dataValidation = { type: 'decimal', operator: 'between', formulae: [0, 1], showErrorMessage: true, errorTitle: 'Progress', error: 'Enter a value between 0% and 100%' };
      ws.getRow(r).height = Math.max(22, Math.min(64, 15 * Math.ceil(Math.max((t.details || '').length / 48, (t.output || '').length / 44, 1))));
    });
    if (tasks.length) {
      const sr = R1 + 1;
      ws.getCell(sr, 3).value = 'TOTAL'; ws.getCell(sr, 8).value = { formula: `SUBTOTAL(109,H${R0}:H${R1})`, result: tasks.reduce((a, t) => a + H.dur(t), 0) };
      ws.getCell(sr, 9).value = { formula: `IFERROR(SUMPRODUCT(I${R0}:I${R1},H${R0}:H${R1})/SUM(H${R0}:H${R1}),0)`, result: planPct }; ws.getCell(sr, 9).numFmt = '0%';
      ws.getCell(sr, 12).value = { formula: `SUBTOTAL(109,L${R0}:L${R1})`, result: tasks.reduce((a, t) => a + (t.hours || 0), 0) }; ws.getCell(sr, 12).numFmt = '#,##0.0';
      for (let c = 1; c <= 15; c++) { const x = ws.getCell(sr, c); x.fill = solid('#E4E8FB'); x.font = { bold: true, size: 11, color: { argb: argb(INK) } }; x.border = { top: { style: 'medium', color: { argb: argb(INDIGO) } } }; x.alignment = { horizontal: c === 3 ? 'left' : 'center', vertical: 'middle' }; }
      ws.getRow(sr).height = 24;
    }
    ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: R1, column: 15 } };
    // live status / priority / health colouring
    const stRules = Object.entries(STATUS_FILL).map(([k, [bg, fg]], i) => ({ type: 'expression', formulae: [`$J${R0}="${k}"`], style: { fill: cfFill(bg), font: { bold: true, color: { argb: argb(fg) } } } }));
    const prRules = Object.entries(PRIO_FILL).map(([k, [bg, fg]], i) => ({ type: 'expression', formulae: [`$K${R0}="${k}"`], style: { fill: cfFill(bg), font: { bold: true, color: { argb: argb(fg) } } } }));
    const hlRules = [['Overdue', '#FDDDE2', '#B42339'], ['Behind', '#FDF0D2', '#8A5A00'], ['Blocked', '#FDDDE2', '#B42339'], ['On track', '#D6F5E7', '#0B7A52'], ['Done', '#D6F5E7', '#0B7A52']].map(([k, bg, fg], i) => ({ type: 'expression', formulae: [`$O${R0}="${k}"`], style: { fill: cfFill(bg), font: { bold: true, color: { argb: argb(fg) } } } }));
    if (tasks.length) {
      ws.addConditionalFormatting({ ref: `J${R0}:J${R1}`, rules: stRules }); ws.addConditionalFormatting({ ref: `K${R0}:K${R1}`, rules: prRules }); ws.addConditionalFormatting({ ref: `O${R0}:O${R1}`, rules: hlRules });
      ws.addConditionalFormatting({ ref: `I${R0}:I${R1}`, rules: [{ type: 'dataBar', gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: argb('#9AA6FF') } }] });
    }
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 }; ws.pageSetup.printTitlesRow = '4:4';
  }

  /* ────────────── 4 · Allocation ────────────── */
  {
    const D0 = 5, N = mi.n, last = D0 + N - 1, ws = wb.addWorksheet('Allocation', { views: [{ showGridLines: false, state: 'frozen', xSplit: 4, ySplit: 5 }], properties: { tabColor: { argb: argb('#FF8A5B') } } });
    ws.columns = [{ width: 24 }, { width: 22 }, { width: 10 }, { width: 10 }, ...Array.from({ length: N }, () => ({ width: 4.6 })), { width: 11 }, { width: 11 }, { width: 12 }];
    const cT = last + 1, cA = last + 2, cU = last + 3;
    banner(ws, `Task allocation — ${mi.label}`, `Hours per person per day (task effort spread over working days). Red = above daily capacity. ${wdCount} working days this month.`, cU);
    headerRow(ws, 5, ['Team member', 'Role', 'Cap. h/day', 'Tasks']);
    mi.days.forEach((s, i) => { const c = ws.getCell(5, D0 + i), we = H.isWE(s); c.value = `${+s.slice(8)}\n${H.WDL[H.dow(s)][0]}`; c.font = { bold: true, size: 9, color: { argb: argb(we ? '#8791B6' : '#FFFFFF') } }; c.fill = solid(we ? '#222A55' : NAVY); c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; c.border = BORDER; });
    headerRow(ws, 5, ['Total h', 'Available h', 'Utilisation'], cT);
    ws.getRow(5).height = 32;
    S.team.forEach((m, i) => {
      const r = 6 + i, tcount = tasks.filter(t => t.assignee === m.id).length;
      ws.getCell(r, 1).value = m.name; ws.getCell(r, 2).value = m.role; ws.getCell(r, 3).value = m.capacity;
      ws.getCell(r, 4).value = { formula: `COUNTIF(${rng('E')},A${r})`, result: tcount };
      body(ws, r, 1, 4, i % 2); ws.getCell(r, 1).font = { bold: true, size: 10.5 }; ws.getCell(r, 1).border = { ...BORDER, left: { style: 'thick', color: { argb: argb(hexOr(m.color)) } } };
      [3, 4].forEach(c => ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' });
      mi.days.forEach((s, k) => {
        const c = ws.getCell(r, D0 + k), h = L[m.id][s] || 0; if (h > 0.05) c.value = Math.round(h * 10) / 10;
        c.numFmt = '0.#;;'; c.alignment = { horizontal: 'center', vertical: 'middle' }; c.font = { size: 9.5, color: { argb: argb(INK) } }; c.border = BORDER;
        if (H.isWE(s)) c.fill = solid(WEND);
      });
      const tot = mi.days.reduce((a, s) => a + (L[m.id][s] || 0), 0), avail = m.capacity * wdCount;
      ws.getCell(r, cT).value = { formula: `SUM(${colL(D0)}${r}:${colL(last)}${r})`, result: tot }; ws.getCell(r, cT).numFmt = '#,##0.0';
      ws.getCell(r, cA).value = { formula: `C${r}*${wdCount}`, result: avail }; ws.getCell(r, cA).numFmt = '#,##0';
      ws.getCell(r, cU).value = { formula: `IFERROR(${colL(cT)}${r}/${colL(cA)}${r},0)`, result: avail ? tot / avail : 0 }; ws.getCell(r, cU).numFmt = '0%';
      body(ws, r, cT, cU, i % 2); [cT, cA, cU].forEach(c => { ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' }; ws.getCell(r, c).font = { bold: true, size: 10.5 }; });
      ws.getRow(r).height = 24;
    });
    if (S.team.length) {
      const r1 = 6, r2 = 5 + S.team.length, g = `${colL(D0)}${r1}:${colL(last)}${r2}`;
      ws.addConditionalFormatting({ ref: g, rules: [
        { type: 'expression', formulae: [`${colL(D0)}${r1}>$C${r1}`], style: { fill: cfFill('#FB7185'), font: { bold: true, color: { argb: 'FFFFFFFF' } } } },
        { type: 'expression', formulae: [`${colL(D0)}${r1}>=$C${r1}*0.75`], style: { fill: cfFill('#34D399'), font: { bold: true } } },
        { type: 'expression', formulae: [`${colL(D0)}${r1}>0`], style: { fill: cfFill('#B8F0D8') } },
      ] });
      ws.addConditionalFormatting({ ref: `${colL(cU)}${r1}:${colL(cU)}${r2}`, rules: [
        { type: 'cellIs', operator: 'greaterThan', formulae: [1], style: { fill: cfFill('#FDDDE2'), font: { color: { argb: argb('#B42339') }, bold: true } } },
        { type: 'cellIs', operator: 'between', formulae: [0.6, 1], style: { fill: cfFill('#D6F5E7'), font: { color: { argb: argb('#0B7A52') }, bold: true } } }] });
      const tr = 6 + S.team.length; ws.getCell(tr, 1).value = 'TEAM TOTAL';
      ws.getCell(tr, cT).value = { formula: `SUM(${colL(cT)}6:${colL(cT)}${tr - 1})`, result: S.team.reduce((a, m) => a + mi.days.reduce((x, s) => x + (L[m.id][s] || 0), 0), 0) }; ws.getCell(tr, cT).numFmt = '#,##0.0';
      ws.getCell(tr, cA).value = { formula: `SUM(${colL(cA)}6:${colL(cA)}${tr - 1})`, result: S.team.reduce((a, m) => a + m.capacity * wdCount, 0) }; ws.getCell(tr, cA).numFmt = '#,##0';
      ws.getCell(tr, cU).value = { formula: `IFERROR(${colL(cT)}${tr}/${colL(cA)}${tr},0)`, result: 0 }; ws.getCell(tr, cU).numFmt = '0%';
      for (let c = 1; c <= cU; c++) { const x = ws.getCell(tr, c); x.fill = solid('#E4E8FB'); x.font = { bold: true, size: 11 }; x.border = { top: { style: 'medium', color: { argb: argb(INDIGO) } } }; if (c > 4) x.alignment = { horizontal: 'center' }; }
    } else { ws.getCell(6, 1).value = 'No team members defined'; }
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  /* ────────────── 5 · Projects ────────────── */
  {
    const ws = wb.addWorksheet('Projects', { views: [{ showGridLines: false, state: 'frozen', ySplit: 4 }], properties: { tabColor: { argb: argb('#A67BFF') } } });
    const heads = ['Project', 'Owner', 'Status', 'Supports goal', 'Start', 'End', 'Tasks', 'Done', 'Progress', 'Hours', 'Description & scope'];
    ws.columns = [{ width: 30 }, { width: 18 }, { width: 12 }, { width: 30 }, { width: 13 }, { width: 13 }, { width: 8 }, { width: 8 }, { width: 11 }, { width: 9 }, { width: 60 }];
    banner(ws, 'Projects', `${S.projects.length} projects in this plan`, heads.length); headerRow(ws, 4, heads);
    S.projects.forEach((p, i) => {
      const r = 5 + i, all = tasks.filter(t => t.projectId === p.id), g = H.byId(S.goals, p.goalId);
      const s = all.length ? all.reduce((a, t) => t.start < a ? t.start : a, all[0].start) : '', e = all.length ? all.reduce((a, t) => t.end > a ? t.end : a, all[0].end) : '';
      const vals = [p.name, ownerName(p.owner), lab(PSTATUS, p.status), g ? g.title : '', s ? toDate(s) : '', e ? toDate(e) : '',
        { formula: `COUNTIF(${rng('B')},A${r})`, result: all.length }, { formula: `COUNTIFS(${rng('B')},A${r},${rng('J')},"Done")`, result: all.filter(t => t.status === 'done').length },
        { formula: `IFERROR(SUMPRODUCT((${rng('B')}=A${r})*${rng('I')}*${rng('H')})/SUMIF(${rng('B')},A${r},${rng('H')}),0)`, result: all.length ? H.wavg(all) / 100 : 0 },
        { formula: `SUMIF(${rng('B')},A${r},${rng('L')})`, result: all.reduce((a, t) => a + (t.hours || 0), 0) }, p.description || ''];
      vals.forEach((v, c) => ws.getCell(r, c + 1).value = v);
      ws.getCell(r, 5).numFmt = ws.getCell(r, 6).numFmt = DATE_FMT; ws.getCell(r, 9).numFmt = '0%'; ws.getCell(r, 10).numFmt = '#,##0';
      body(ws, r, 1, 11, i % 2); ws.getCell(r, 1).font = { bold: true, size: 10.5 };
      ws.getCell(r, 1).border = { ...BORDER, left: { style: 'thick', color: { argb: argb(hexOr(p.color)) } } };
      [3, 5, 6, 7, 8, 9, 10].forEach(c => ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true });
      ws.getRow(r).height = 34;
    });
    if (S.projects.length) ws.addConditionalFormatting({ ref: `I5:I${4 + S.projects.length}`, rules: [{ type: 'dataBar', gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: argb('#9AA6FF') } }] });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  /* ────────────── 6 · Goals & Outputs ────────────── */
  {
    const ws = wb.addWorksheet('Goals & Outputs', { views: [{ showGridLines: false }], properties: { tabColor: { argb: argb('#34D399') } } });
    ws.columns = [{ width: 34 }, { width: 26 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 20 }, { width: 14 }, { width: 14 }];
    banner(ws, 'Goals & Outputs', 'What the month must move — and what will exist when it is done', 9);
    let r = 4; sectionTitle(ws, r, 'Goals / key results', 9); r++;
    headerRow(ws, r, ['Goal', 'Metric', 'Start', 'Current', 'Target', 'Progress', 'Owner', 'Due', 'Linked projects']); r++;
    const g0 = r;
    S.goals.forEach((g, i) => {
      const linked = S.projects.filter(p => p.goalId === g.id).map(p => p.name).join(', ');
      ws.getCell(r, 1).value = g.title; ws.getCell(r, 2).value = g.metric ? `${g.metric}${g.unit ? ' (' + g.unit + ')' : ''}` : ''; ws.getCell(r, 3).value = g.baseline; ws.getCell(r, 4).value = g.current; ws.getCell(r, 5).value = g.target;
      ws.getCell(r, 6).value = { formula: `IFERROR(MAX(0,MIN(1,(D${r}-C${r})/(E${r}-C${r}))),0)`, result: H.goalPct(g) / 100 }; ws.getCell(r, 6).numFmt = '0%';
      ws.getCell(r, 7).value = ownerName(g.owner); ws.getCell(r, 8).value = g.due ? toDate(g.due) : null; ws.getCell(r, 8).numFmt = DATE_FMT; ws.getCell(r, 9).value = linked;
      body(ws, r, 1, 9, i % 2); ws.getCell(r, 1).font = { bold: true, size: 10.5 }; ws.getCell(r, 1).border = { ...BORDER, left: { style: 'thick', color: { argb: argb(hexOr(g.color)) } } };
      [3, 4, 5, 6, 8].forEach(c => ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' }); ws.getRow(r).height = 26; r++;
    });
    if (S.goals.length) ws.addConditionalFormatting({ ref: `F${g0}:F${r - 1}`, rules: [{ type: 'dataBar', gradient: false, cfvo: [{ type: 'num', value: 0 }, { type: 'num', value: 1 }], color: { argb: argb('#7EE0B8') } }] });
    else { ws.getCell(r, 1).value = 'No goals defined'; r++; }
    r += 1; sectionTitle(ws, r, 'Outputs & deliverables', 9); r++;
    headerRow(ws, r, ['Deliverable', 'Task', 'Project', '', 'Owner', 'Due', 'Status', 'Delivered', '']); ws.mergeCells(r, 3, r, 4); r++;
    const o0 = r, outs = tasks.filter(t => t.output || t.milestone);
    outs.forEach((t, i) => {
      ws.getCell(r, 1).value = t.output || t.name; ws.getCell(r, 2).value = t.name; ws.mergeCells(r, 3, r, 4); ws.getCell(r, 3).value = projName(t.projectId);
      ws.getCell(r, 5).value = ownerName(t.assignee); ws.getCell(r, 6).value = toDate(t.end); ws.getCell(r, 6).numFmt = 'dd mmm'; ws.getCell(r, 7).value = statusL(t.status);
      ws.getCell(r, 8).value = { formula: `IF(G${r}="Done","✔ Delivered","")`, result: t.status === 'done' ? '✔ Delivered' : '' };
      body(ws, r, 1, 8, i % 2); ws.getCell(r, 1).font = { bold: true, size: 10.5 }; [6, 7, 8].forEach(c => ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' });
      ws.getCell(r, 7).dataValidation = { type: 'list', formulae: ['"To do,In progress,In review,Done,Blocked"'] };
      ws.getRow(r).height = 26; r++;
    });
    if (outs.length) {
      const rules = Object.entries(STATUS_FILL).map(([k, [bg, fg]], i) => ({ type: 'expression', formulae: [`$G${o0}="${k}"`], style: { fill: cfFill(bg), font: { bold: true, color: { argb: argb(fg) } } } }));
      ws.addConditionalFormatting({ ref: `G${o0}:G${r - 1}`, rules });
      ws.addConditionalFormatting({ ref: `H${o0}:H${r - 1}`, rules: [{ type: 'expression', formulae: [`$G${o0}="Done"`], style: { font: { bold: true, color: { argb: argb('#0B7A52') } } } }] });
      ws.getCell(r, 7).value = 'Delivered'; ws.getCell(r, 7).font = { bold: true }; ws.getCell(r, 7).alignment = { horizontal: 'right' };
      ws.getCell(r, 8).value = { formula: `COUNTIF(G${o0}:G${r - 1},"Done")&" / "&COUNTA(G${o0}:G${r - 1})`, result: `${outs.filter(t => t.status === 'done').length} / ${outs.length}` }; ws.getCell(r, 8).font = { bold: true, size: 12 }; ws.getCell(r, 8).alignment = { horizontal: 'center' };
    } else { ws.getCell(r, 1).value = 'No outputs defined yet'; }
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 };
  }

  /* ────────────── 7 · Team ────────────── */
  {
    const ws = wb.addWorksheet('Team', { views: [{ showGridLines: false }], properties: { tabColor: { argb: argb('#4FB6FF') } } });
    const heads = ['Name', 'Role', 'Capacity (h/day)', 'Tasks assigned', 'Tasks done', 'Planned hours', 'Available hours', 'Utilisation'];
    ws.columns = [{ width: 26 }, { width: 24 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 13 }];
    banner(ws, 'Team', `${S.team.length} people · ${wdCount} working days in ${mi.label}`, heads.length); headerRow(ws, 4, heads);
    S.team.forEach((m, i) => {
      const r = 5 + i, mine = tasks.filter(t => t.assignee === m.id), tot = mi.days.reduce((a, s) => a + (L[m.id][s] || 0), 0);
      ws.getCell(r, 1).value = m.name; ws.getCell(r, 2).value = m.role; ws.getCell(r, 3).value = m.capacity;
      ws.getCell(r, 4).value = { formula: `COUNTIF(${rng('E')},A${r})`, result: mine.length };
      ws.getCell(r, 5).value = { formula: `COUNTIFS(${rng('E')},A${r},${rng('J')},"Done")`, result: mine.filter(t => t.status === 'done').length };
      ws.getCell(r, 6).value = { formula: `SUMIF(${rng('E')},A${r},${rng('L')})`, result: mine.reduce((a, t) => a + (t.hours || 0), 0) };
      ws.getCell(r, 7).value = { formula: `C${r}*${wdCount}`, result: m.capacity * wdCount };
      ws.getCell(r, 8).value = { formula: `IFERROR(F${r}/G${r},0)`, result: m.capacity * wdCount ? mine.reduce((a, t) => a + (t.hours || 0), 0) / (m.capacity * wdCount) : 0 }; ws.getCell(r, 8).numFmt = '0%';
      body(ws, r, 1, 8, i % 2); ws.getCell(r, 1).font = { bold: true, size: 10.5 }; ws.getCell(r, 1).border = { ...BORDER, left: { style: 'thick', color: { argb: argb(hexOr(m.color)) } } };
      for (let c = 3; c <= 8; c++) ws.getCell(r, c).alignment = { horizontal: 'center', vertical: 'middle' }; ws.getRow(r).height = 24;
    });
    if (S.team.length) ws.addConditionalFormatting({ ref: `H5:H${4 + S.team.length}`, rules: [
      { type: 'cellIs', operator: 'greaterThan', formulae: [1], style: { fill: cfFill('#FDDDE2'), font: { bold: true, color: { argb: argb('#B42339') } } } },
      { type: 'cellIs', operator: 'between', formulae: [0.6, 1], style: { fill: cfFill('#D6F5E7'), font: { bold: true, color: { argb: argb('#0B7A52') } } } }] });
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }

  const buf = await wb.xlsx.writeBuffer();
  const safe = (S.plan.name || 'Monthly-Plan').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'Monthly-Plan';
  FP.download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${safe}-${S.plan.month}.xlsx`);
};
})();
