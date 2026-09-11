/**
 * CsvReader.ts — Pure-JS Winsoft CSV tokenizer
 *
 * Responsibilities (ARCHITECTURE.md §4):
 *  - Read CSV text
 *  - Detect headers (first row)
 *  - Parse rows with quoted fields (handles commas inside quotes)
 *  - Handle empty values
 *  - Preserve original column names exactly
 *  - Preserve original field values exactly
 *  - Skip blank/trailing rows
 *  - Return RawWinsoftRow[] — one entry per data row
 *
 * Contains NO printer, UI, or Drive logic.
 */

import type {RawWinsoftRow} from '../../models/Receipt';

// ---------------------------------------------------------------------------
// CSV tokenizer
// ---------------------------------------------------------------------------

/**
 * Tokenize a single CSV line, handling RFC-4180 quoted fields.
 * Quoted fields may contain commas and escaped double-quotes ("").
 */
export function tokenizeCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  const len = line.length;

  while (i <= len) {
    if (i === len) {
      // Trailing comma — push empty field
      if (line.length > 0 && line[len - 1] === ',') {
        fields.push('');
      }
      break;
    }

    if (line[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let value = '';
      while (i < len) {
        if (line[i] === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            // Escaped quote inside quoted field
            value += '"';
            i += 2;
          } else {
            // Closing quote
            i++;
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      fields.push(value);
      // Skip comma after closing quote
      if (i < len && line[i] === ',') {
        i++;
      }
    } else {
      // Unquoted field — read until next comma
      const start = i;
      while (i < len && line[i] !== ',') {
        i++;
      }
      fields.push(line.slice(start, i));
      if (i < len) {
        i++; // skip comma
      }
    }
  }

  return fields;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface CsvParseResult {
  headers: string[];
  rows: RawWinsoftRow[];
  /** Rows that had a different column count from the header (skipped). */
  malformedRows: number[];
}

/**
 * Parse Winsoft CSV text into raw row objects.
 *
 * @param csvText - Full CSV file content as a string.
 * @returns Parsed headers, rows, and any malformed-row indices.
 */
export function parseCsv(csvText: string): CsvParseResult {
  // Normalize line endings
  const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

  if (lines.length === 0 || lines[0].trim() === '') {
    return {headers: [], rows: [], malformedRows: []};
  }

  // First line = headers. Header text remains unchanged so the source schema
  // is retained alongside every original field value.
  const headers = tokenizeCsvLine(lines[0]);
  const rows: RawWinsoftRow[] = [];
  const malformedRows: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === '') {
      continue; // skip blank lines
    }

    const fields = tokenizeCsvLine(line);

    if (fields.length !== headers.length) {
      malformedRows.push(i + 1); // 1-indexed line number
      continue;
    }

    const row: RawWinsoftRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = fields[j] ?? '';
    }
    rows.push(row);
  }

  return {headers, rows, malformedRows};
}
