const MAX_CELLS = 10000;
const MAX_EVIDENCE_BYTES = 2 * 1024 * 1024;

// Iterate stored cells, not every coordinate in a potentially enormous !ref range.
function collectSpreadsheetEvidence(sheetName, sheet) {
  const cells = [];
  let bytes = 0;
  let omittedCells = 0;
  for (const [address, cell] of Object.entries(sheet)) {
    if (!/^[A-Z]+[1-9]\d*$/.test(address) || !cell || cell.t === 'z') continue;
    const formula = typeof cell.f === 'string' ? cell.f : null;
    const raw = cell.v;
    const rawValue = raw instanceof Date ? raw.toISOString() :
      (typeof raw === 'string' || typeof raw === 'boolean' || (typeof raw === 'number' && Number.isFinite(raw)) ? raw : null);
    if (rawValue === null && !formula) continue;
    const evidence = {
      address, cellType: cell.t || 'unknown', rawValue,
      formattedText: typeof cell.w === 'string' ? cell.w : null,
      numberFormat: typeof cell.z === 'string' ? cell.z : null,
      formula,
      valueOrigin: formula ? (rawValue === null ? 'missing_formula_cache' : 'cached_formula_result') : 'literal'
    };
    const size = Buffer.byteLength(JSON.stringify(evidence), 'utf8');
    if (cells.length >= MAX_CELLS || bytes + size > MAX_EVIDENCE_BYTES) { omittedCells++; continue; }
    cells.push(evidence);
    bytes += size;
  }
  const merges = Array.isArray(sheet['!merges']) ? sheet['!merges'] : [];
  const mergedRanges = merges.slice(0, MAX_CELLS).filter(range =>
    [range?.s?.r, range?.s?.c, range?.e?.r, range?.e?.c].every(n => Number.isInteger(n) && n >= 0)
  ).map(range => ({
    startRow: range.s.r + 1, startColumn: range.s.c + 1,
    endRow: range.e.r + 1, endColumn: range.e.c + 1
  }));
  return {
    sheetName, cells, mergedRanges, omittedCells,
    omittedMergedRanges: merges.length - mergedRanges.length,
    truncated: omittedCells > 0 || merges.length !== mergedRanges.length
  };
}

module.exports = { collectSpreadsheetEvidence, MAX_CELLS, MAX_EVIDENCE_BYTES };
