function median(numbers) {
  const ordered = numbers.slice().sort((a, b) => a - b),
    mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
}
// Compare like postings. Flags are observations and never alter the journal.
export function anomalyRows(entries) {
  const reversed = new Set(entries.map((e) => e.reversal).filter(Boolean)),
    groups = new Map(),
    seen = new Map(),
    rows = [];
  for (const e of [...entries].reverse()) {
    if (e.reversal || reversed.has(e.id)) continue;
    const key = JSON.stringify([e.date, e.debit, e.credit, e.amount]),
      earlier = seen.get(key);
    if (earlier)
      rows.push([
        '#' + e.id,
        'Possible duplicate',
        'Same date, accounts and amount as #' + earlier,
      ]);
    seen.set(key, e.id);
    const category = e.debit.startsWith('Due/') ? 'Credit sales' : e.debit;
    const group = groups.get(category) ?? [];
    group.push(e);
    groups.set(category, group);
  }
  for (const [category, group] of groups) {
    if (group.length < 5) continue;
    const centre = median(group.map((e) => e.amount)),
      mad = median(group.map((e) => Math.abs(e.amount - centre)));
    for (const e of group) {
      const score = mad ? (0.6745 * (e.amount - centre)) / mad : 0;
      if (score > 3.5)
        rows.push([
          '#' + e.id,
          'Unusually large',
          category + ' · robust score ' + score.toFixed(1),
        ]);
      if (e.amount % 100000 === 0 && e.amount >= 3 * centre)
        rows.push([
          '#' + e.id,
          'Round-number spike',
          'Whole thousands and at least three times the group median',
        ]);
    }
  }
  return rows;
}
