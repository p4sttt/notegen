function normalizeCell(value) {
  return String(value ?? "").trim();
}

function uniqueHeader(label, index, seen) {
  const fallback = `Column ${index + 1}`;
  const base = normalizeCell(label) || fallback;
  const count = seen.get(base) ?? 0;
  seen.set(base, count + 1);
  return count === 0 ? base : `${base} ${count + 1}`;
}

function detectDelimiter(input) {
  const candidates = [",", ";", "\t"];
  const counts = Object.fromEntries(candidates.map((candidate) => [candidate, 0]));
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        index += 1;
      } else if (char === '"') {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === "\n" || char === "\r") {
      break;
    } else if (char in counts) {
      counts[char] += 1;
    }
  }

  return candidates.sort((left, right) => counts[right] - counts[left])[0];
}

function parseCsvRows(input) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  const source = input.replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(source);

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  row.push(cell);
  rows.push(row);

  return rows.filter((cells) => cells.some((value) => normalizeCell(value)));
}

function inferValueType(value) {
  const normalized = normalizeCell(value);
  if (!normalized) {
    return "empty";
  }

  if (/^(true|false|yes|no|да|нет)$/i.test(normalized)) {
    return "boolean";
  }

  if (/^-?\d+(?:[.,]\d+)?%?$/.test(normalized)) {
    return "number";
  }

  if (/^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/.test(normalized) && !Number.isNaN(Date.parse(normalized))) {
    return "date";
  }

  return "text";
}

function inferColumnType(values) {
  const types = values.map(inferValueType).filter((type) => type !== "empty");
  if (types.length === 0) {
    return "text";
  }

  if (types.every((type) => type === "number")) {
    return "number";
  }

  if (types.every((type) => type === "date")) {
    return "date";
  }

  if (types.every((type) => type === "boolean")) {
    return "boolean";
  }

  return "text";
}

export function parseCsvDatabase(raw) {
  const parsedRows = parseCsvRows(raw);
  if (parsedRows.length === 0) {
    return { columns: [], rows: [] };
  }

  const columnCount = Math.max(...parsedRows.map((row) => row.length));
  const seenHeaders = new Map();
  const headers = Array.from({ length: columnCount }, (_, index) => uniqueHeader(parsedRows[0]?.[index], index, seenHeaders));
  const bodyRows = parsedRows.slice(1);
  const columns = headers.map((label, index) => ({
    key: `c${index}`,
    label,
    type: inferColumnType(bodyRows.map((row) => row[index]))
  }));

  const rows = bodyRows.map((row, rowIndex) => {
    const entry = { _id: rowIndex + 1 };
    for (const [columnIndex, column] of columns.entries()) {
      entry[column.key] = normalizeCell(row[columnIndex]);
    }
    return entry;
  });

  return { columns, rows };
}
