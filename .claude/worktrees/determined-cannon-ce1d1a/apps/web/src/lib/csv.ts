/**
 * CSV utility — semicolon-separated, UTF-8 BOM so French Excel opens correctly.
 */

export interface CsvColumn {
  key: string;
  header: string;
}

/** Download a semicolon-delimited CSV with UTF-8 BOM. */
export function exportCSV(
  rows: Record<string, unknown>[],
  columns: readonly CsvColumn[],
  filename: string,
): void {
  const escape = (value: unknown): string => {
    const str = value == null ? '' : String(value);
    // Wrap in quotes if the value contains a semicolon, quote, or newline
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escape(c.header)).join(';');
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(';'))
    .join('\r\n');

  // UTF-8 BOM (﻿) ensures Excel detects the encoding on Windows
  const csv = '﻿' + header + '\r\n' + body;

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse a semicolon-delimited CSV File into an array of header-keyed objects. */
export function importCSV(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        let text = (e.target?.result as string) ?? '';

        // Strip UTF-8 BOM if present
        if (text.charCodeAt(0) === 0xfeff) {
          text = text.slice(1);
        }

        const lines = text
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .filter((l) => l.trim() !== '');

        if (lines.length < 2) {
          resolve([]);
          return;
        }

        const parseLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;

          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
              } else {
                inQuotes = !inQuotes;
              }
            } else if (ch === ';' && !inQuotes) {
              result.push(current.trim());
              current = '';
            } else {
              current += ch;
            }
          }
          result.push(current.trim());
          return result;
        };

        const headers = parseLine(lines[0]);
        const records = lines.slice(1).map((line) => {
          const values = parseLine(line);
          const record: Record<string, string> = {};
          headers.forEach((h, i) => {
            record[h] = values[i] ?? '';
          });
          return record;
        });

        resolve(records);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsText(file, 'UTF-8');
  });
}
