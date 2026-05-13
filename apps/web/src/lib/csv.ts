/**
 * csv.ts — Import / Export fichiers tabulaires (CSV + Excel XLSX)
 *
 * Import : accepte .csv (séparateur ; ou ,) et .xlsx
 * Export : génère du CSV semicolon UTF-8 BOM (compatible Excel France)
 */
import * as XLSX from 'xlsx';

export interface CsvColumn {
  key: string;
  header: string;
}

// ─── Export CSV ────────────────────────────────────────────────────────────────

/** Télécharge un CSV semicolon UTF-8 BOM lisible par Excel. */
export function exportCSV(
  rows: Record<string, unknown>[],
  columns: readonly CsvColumn[],
  filename: string,
): void {
  const escape = (value: unknown): string => {
    const str = value == null ? '' : String(value);
    if (str.includes(';') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = columns.map((c) => escape(c.header)).join(';');
  const body = rows
    .map((row) => columns.map((c) => escape(row[c.key])).join(';'))
    .join('\r\n');

  // UTF-8 BOM → Excel Windows détecte l'encodage
  const csv = '﻿' + header + '\r\n' + body;
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Import (CSV + XLSX) ───────────────────────────────────────────────────────

/**
 * Importe un fichier CSV ou Excel et retourne un tableau d'objets
 * dont les clés sont normalisées : minuscules, sans accents, sans espaces.
 *
 * Exemples de normalisation :
 *   "Raison sociale" → "raison sociale"
 *   "Téléphone"      → "telephone"
 *   "N° TVA"         → "n° tva"
 */
export function importFile(file: File): Promise<Record<string, string>[]> {
  const isExcel =
    file.name.endsWith('.xlsx') ||
    file.name.endsWith('.xls') ||
    file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.type === 'application/vnd.ms-excel';

  return isExcel ? importExcel(file) : importCSV(file);
}

/** Normalise un nom de colonne : minuscules + supprime accents. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // supprime les diacritiques
    .trim();
}

/** Construit un enregistrement à clés normalisées. */
function buildRecord(
  headers: string[],
  values: string[],
): Record<string, string> {
  const record: Record<string, string> = {};
  headers.forEach((h, i) => {
    record[normalize(h)] = (values[i] ?? '').trim();
  });
  return record;
}

// ── CSV ───────────────────────────────────────────────────────────────────────

function importCSV(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        let text = (e.target?.result as string) ?? '';
        // Strip UTF-8 BOM
        if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

        const lines = text
          .replace(/\r\n/g, '\n')
          .replace(/\r/g, '\n')
          .split('\n')
          .filter((l) => l.trim() !== '');

        if (lines.length < 2) { resolve([]); return; }

        // Détection automatique du séparateur (; ou ,)
        const firstLine = lines[0];
        const sep = firstLine.includes(';') ? ';' : ',';

        const parseLine = (line: string): string[] => {
          const result: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') {
              if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
              else { inQuotes = !inQuotes; }
            } else if (ch === sep && !inQuotes) {
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
        const records = lines.slice(1).map((line) =>
          buildRecord(headers, parseLine(line)),
        );
        resolve(records);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsText(file, 'UTF-8');
  });
}

// ── XLSX ──────────────────────────────────────────────────────────────────────

function importExcel(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        // Prendre la première feuille
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        if (!sheet) { resolve([]); return; }

        // header:1 → tableau de tableaux, raw:false → tout en string
        const rows = XLSX.utils.sheet_to_json<string[]>(sheet, {
          header: 1,
          raw: false,
          defval: '',
        });

        if (rows.length < 2) { resolve([]); return; }

        const headers = (rows[0] as string[]).map(String);
        const records = (rows.slice(1) as string[][])
          .filter((r) => r.some((v) => String(v).trim() !== ''))
          .map((r) => buildRecord(headers, r.map(String)));

        resolve(records);
      } catch (err) {
        reject(err);
      }
    };

    reader.onerror = () => reject(new Error('Erreur de lecture du fichier Excel'));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Rétrocompatibilité : alias ────────────────────────────────────────────────
/** @deprecated Utiliser importFile() qui supporte aussi le XLSX. */
export const importCSVCompat = importCSV;
