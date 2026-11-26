import type { Team } from '@/types/quiz';

export interface ParsedCsvQuestion {
  team: Team;
  question_text: string;
  answer_text: string | null;
  notes: string | null;
  is_active: boolean;
}

export interface CsvParseResult {
  rows: ParsedCsvQuestion[];
  errors: string[];
}

function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  const cleanText = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const next = cleanText[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        currentField += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        currentField += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        currentRow.push(currentField);
        currentField = '';
      } else if (ch === '\r' && next === '\n') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
        i++;
      } else if (ch === '\n' || ch === '\r') {
        currentRow.push(currentField);
        rows.push(currentRow);
        currentRow = [];
        currentField = '';
      } else {
        currentField += ch;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows.filter((row) => row.some((cell) => cell.trim() !== ''));
}

export function parseQuestionsCsv(csvText: string): CsvParseResult {
  const matrix = parseCsvMatrix(csvText);
  if (matrix.length === 0) {
    return { rows: [], errors: ['CSV is empty.'] };
  }

  const headers = matrix[0].map((h) => h.trim().toLowerCase());
  const teamIdx = headers.indexOf('team');
  const questionIdx = headers.indexOf('question_text');
  const answerIdx = headers.indexOf('answer_text');
  const notesIdx = headers.indexOf('notes');
  const activeIdx = headers.indexOf('is_active');

  if (teamIdx === -1 || questionIdx === -1) {
    return {
      rows: [],
      errors: [
        'CSV header must include at least "team" and "question_text". Supported columns: team,question_text,answer_text,notes,is_active',
      ],
    };
  }

  const rows: ParsedCsvQuestion[] = [];
  const errors: string[] = [];

  for (let i = 1; i < matrix.length; i++) {
    const lineNum = i + 1;
    const cols = matrix[i];

    const rawTeam = (cols[teamIdx] ?? '').trim().toLowerCase();
    const rawQuestion = (cols[questionIdx] ?? '').trim();
    const rawAnswer = answerIdx >= 0 ? (cols[answerIdx] ?? '').trim() : '';
    const rawNotes = notesIdx >= 0 ? (cols[notesIdx] ?? '').trim() : '';
    const rawActive = activeIdx >= 0 ? (cols[activeIdx] ?? '').trim().toLowerCase() : 'true';

    if (rawTeam !== 'red' && rawTeam !== 'green' && rawTeam !== 'blue') {
      errors.push(`Row ${lineNum}: invalid team "${rawTeam}" (must be red, green, or blue).`);
      continue;
    }

    if (!rawQuestion) {
      errors.push(`Row ${lineNum}: question_text cannot be empty.`);
      continue;
    }

    let isActive = true;
    if (rawActive === 'false' || rawActive === '0' || rawActive === 'no') {
      isActive = false;
    } else if (
      rawActive !== '' &&
      rawActive !== 'true' &&
      rawActive !== '1' &&
      rawActive !== 'yes'
    ) {
      errors.push(
        `Row ${lineNum}: invalid is_active "${rawActive}" (use true/false).`
      );
      continue;
    }

    rows.push({
      team: rawTeam,
      question_text: rawQuestion,
      answer_text: rawAnswer || null,
      notes: rawNotes || null,
      is_active: isActive,
    });
  }

  return { rows, errors };
}

