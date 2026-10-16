import Papa from 'papaparse';

export function downloadFile(filename, content, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** columns: [{ key, header, value?: (row) => any }] */
export function exportCsv(filename, rows, columns) {
  const data = rows.map((r) => Object.fromEntries(columns.map((c) => [c.header, c.value ? c.value(r) : r[c.key]])));
  const csv = Papa.unparse({ fields: columns.map((c) => c.header), data: data.map((d) => columns.map((c) => d[c.header] ?? '')) });
  downloadFile(filename, '﻿' + csv);
}

export function downloadTemplate(filename, headers, example) {
  downloadFile(filename, Papa.unparse({ fields: headers, data: example ? [example] : [] }));
}

export function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: (h) => h.trim(),
      complete: (res) => resolve(res),
      error: reject,
    });
  });
}

/**
 * Validate parsed rows with a per-row function returning { item } or { error }.
 * Duplicate keys (within the file or against existing records) are rejected, never silently merged.
 */
export function validateRows(rows, { required, toItem, keyOf, existingKeys }) {
  const valid = [];
  const errors = [];
  const seen = new Set();
  rows.forEach((row, i) => {
    const line = i + 2;
    const missing = required.filter((k) => !String(row[k] ?? '').trim());
    if (missing.length) return errors.push(`Row ${line}: missing ${missing.join(', ')}`);
    const res = toItem(row);
    if (res.error) return errors.push(`Row ${line}: ${res.error}`);
    const key = keyOf(res.item);
    if (seen.has(key)) return errors.push(`Row ${line}: duplicate "${key}" in file`);
    if (existingKeys?.has(key)) return errors.push(`Row ${line}: "${key}" already exists`);
    seen.add(key);
    valid.push(res.item);
  });
  return { valid, errors };
}
