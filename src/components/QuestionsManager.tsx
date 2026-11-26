'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Upload,
  Pencil,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { parseQuestionsCsv } from '@/lib/csv';
import { TEAM_CONFIG, TEAMS, type Question, type Team } from '@/types/quiz';

const PAGE_SIZE = 15;

interface TeamCounts {
  red: { total: number; active: number };
  green: { total: number; active: number };
  blue: { total: number; active: number };
}

const emptyCounts: TeamCounts = {
  red: { total: 0, active: 0 },
  green: { total: 0, active: 0 },
  blue: { total: 0, active: 0 },
};

export function QuestionsManager() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [teamCounts, setTeamCounts] = useState<TeamCounts>(emptyCounts);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<'all' | Team>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Feedback
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Add/Edit Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formTeam, setFormTeam] = useState<Team>('red');
  const [formQuestionText, setFormQuestionText] = useState('');
  const [formAnswerText, setFormAnswerText] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  // CSV Modal
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [csvErrors, setCsvErrors] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  const loadCounts = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('questions')
      .select('team, is_active');

    if (error) {
      setFeedback({ type: 'error', message: error.message });
      return;
    }

    const next: TeamCounts = {
      red: { total: 0, active: 0 },
      green: { total: 0, active: 0 },
      blue: { total: 0, active: 0 },
    };

    for (const row of data ?? []) {
      const t = row.team as Team;
      if (next[t]) {
        next[t].total += 1;
        if (row.is_active) next[t].active += 1;
      }
    }
    setTeamCounts(next);
  }, []);

  const loadQuestions = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('questions')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (teamFilter !== 'all') {
      query = query.eq('team', teamFilter);
    }
    if (statusFilter === 'active') {
      query = query.eq('is_active', true);
    } else if (statusFilter === 'inactive') {
      query = query.eq('is_active', false);
    }
    if (search.trim()) {
      const term = `%${search.trim()}%`;
      query = query.or(
        `question_text.ilike.${term},answer_text.ilike.${term},notes.ilike.${term}`
      );
    }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, count, error } = await query.range(from, to);

    if (error) {
      setFeedback({ type: 'error', message: error.message });
    } else {
      setQuestions((data ?? []) as Question[]);
      setTotalCount(count ?? 0);
    }
    setLoading(false);
  }, [page, search, teamFilter, statusFilter]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadCounts();
    }, 0);
    return () => clearTimeout(t);
  }, [loadCounts]);

  useEffect(() => {
    const t = setTimeout(() => {
      void loadQuestions();
    }, 0);
    return () => clearTimeout(t);
  }, [loadQuestions]);

  function openCreateModal() {
    setEditingQuestion(null);
    setFormTeam('red');
    setFormQuestionText('');
    setFormAnswerText('');
    setFormNotes('');
    setFormIsActive(true);
    setModalOpen(true);
  }

  function openEditModal(q: Question) {
    setEditingQuestion(q);
    setFormTeam(q.team);
    setFormQuestionText(q.question_text);
    setFormAnswerText(q.answer_text ?? '');
    setFormNotes(q.notes ?? '');
    setFormIsActive(q.is_active);
    setModalOpen(true);
  }

  async function handleSaveQuestion(e: React.FormEvent) {
    e.preventDefault();
    if (!formQuestionText.trim()) {
      setFeedback({ type: 'error', message: 'Question text is required.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    const supabase = createClient();

    const payload = {
      team: formTeam,
      question_text: formQuestionText.trim(),
      question_type: 'oral',
      answer_text: formAnswerText.trim() || null,
      notes: formNotes.trim() || null,
      is_active: formIsActive,
    };

    if (editingQuestion) {
      const { error } = await supabase
        .from('questions')
        .update(payload)
        .eq('id', editingQuestion.id);

      if (error) {
        setFeedback({ type: 'error', message: `Failed to update: ${error.message}` });
      } else {
        setFeedback({ type: 'success', message: 'Question updated successfully.' });
        setModalOpen(false);
        await Promise.all([loadQuestions(), loadCounts()]);
      }
    } else {
      const { error } = await supabase.from('questions').insert(payload);
      if (error) {
        setFeedback({ type: 'error', message: `Failed to create: ${error.message}` });
      } else {
        setFeedback({ type: 'success', message: 'Question created successfully.' });
        setModalOpen(false);
        setPage(1);
        await Promise.all([loadQuestions(), loadCounts()]);
      }
    }
    setSaving(false);
  }

  async function handleToggleActive(q: Question) {
    setFeedback(null);
    const supabase = createClient();
    const { error } = await supabase
      .from('questions')
      .update({ is_active: !q.is_active })
      .eq('id', q.id);

    if (error) {
      setFeedback({ type: 'error', message: `Failed to update status: ${error.message}` });
    } else {
      setFeedback({
        type: 'success',
        message: `Question ${!q.is_active ? 'activated' : 'deactivated'}.`,
      });
      await Promise.all([loadQuestions(), loadCounts()]);
    }
  }

  async function handleDelete(q: Question) {
    if (!window.confirm('Delete this question permanently?')) return;
    setFeedback(null);
    const supabase = createClient();
    const { error } = await supabase.from('questions').delete().eq('id', q.id);

    if (error) {
      setFeedback({
        type: 'error',
        message: `Cannot delete question (it may be referenced by a game session): ${error.message}`,
      });
    } else {
      setFeedback({ type: 'success', message: 'Question deleted.' });
      await Promise.all([loadQuestions(), loadCounts()]);
    }
  }

  async function handleCsvFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCsvText(text);
    setCsvErrors([]);
  }

  async function handleImportCsv() {
    setCsvErrors([]);
    setFeedback(null);
    const parsed = parseQuestionsCsv(csvText);

    if (parsed.errors.length > 0) {
      setCsvErrors(parsed.errors);
      return;
    }

    if (parsed.rows.length === 0) {
      setCsvErrors(['No valid rows found to import.']);
      return;
    }

    setImporting(true);
    const supabase = createClient();
    const { error } = await supabase.from('questions').insert(
      parsed.rows.map((r) => ({
        ...r,
        question_type: 'oral',
      }))
    );

    if (error) {
      setCsvErrors([`Database insert failed: ${error.message}`]);
    } else {
      setCsvModalOpen(false);
      setCsvText('');
      setFeedback({
        type: 'success',
        message: `Successfully imported ${parsed.rows.length} questions.`,
      });
      setPage(1);
      await Promise.all([loadQuestions(), loadCounts()]);
    }
    setImporting(false);
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const shortTeams = TEAMS.filter((t) => teamCounts[t].active < 15);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Question Bank</h1>
          <p className="text-sm text-slate-400">
            Create, edit, activate, or bulk-import questions for each team.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setCsvErrors([]);
              setCsvModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-white transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-medium text-white transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Question
          </button>
        </div>
      </div>

      {/* Team Count Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {TEAMS.map((t) => {
          const cfg = TEAM_CONFIG[t];
          const c = teamCounts[t];
          return (
            <div
              key={t}
              className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span
                  className="w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: cfg.hex }}
                />
                <div>
                  <p className="font-semibold text-white">{cfg.label}</p>
                  <p className="text-xs text-slate-400">{c.total} total</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xl font-bold text-white">{c.active}</p>
                <p
                  className={`text-xs ${
                    c.active >= 15 ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {c.active >= 15 ? 'Ready (15+)' : `${c.active}/15 active`}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {shortTeams.length > 0 && (
        <div className="rounded-xl bg-amber-950/40 border border-amber-700/60 p-3.5 flex items-center gap-3 text-sm text-amber-100">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
          <span>
            Minimum 15 active questions required per team for a full session.
            Short:{' '}
            {shortTeams
              .map((t) => `${TEAM_CONFIG[t].label} (${teamCounts[t].active}/15)`)
              .join(', ')}
            .
          </span>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl p-3.5 flex items-center justify-between text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-700/60 text-emerald-100'
              : 'bg-red-950/50 border-red-700/60 text-red-100'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 p-4 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search questions, answers, or notes..."
            className="w-full rounded-lg bg-slate-950 border border-slate-700 pl-10 pr-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>
        <select
          value={teamFilter}
          onChange={(e) => {
            setTeamFilter(e.target.value as 'all' | Team);
            setPage(1);
          }}
          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Teams</option>
          <option value="red">Team Red</option>
          <option value="green">Team Green</option>
          <option value="blue">Team Blue</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as 'all' | 'active' | 'inactive');
            setPage(1);
          }}
          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center gap-2 text-slate-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading questions...
          </div>
        ) : questions.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-400">
            No questions match the current filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wider text-slate-400 bg-slate-950/50">
                  <th className="py-3 px-4">Team</th>
                  <th className="py-3 px-4">Question</th>
                  <th className="py-3 px-4">Answer Ref</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-sm">
                {questions.map((q) => {
                  const cfg = TEAM_CONFIG[q.team];
                  return (
                    <tr key={q.id} className="hover:bg-slate-800/30">
                      <td className="py-3.5 px-4 whitespace-nowrap align-top">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${cfg.badgeClass}`}
                        >
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: cfg.hex }}
                          />
                          {cfg.name}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-md align-top">
                        <p className="text-slate-100 font-medium">
                          {q.question_text}
                        </p>
                        {q.notes && (
                          <p className="text-xs text-slate-400 mt-1">
                            Note: {q.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 max-w-xs text-slate-300 align-top">
                        {q.answer_text || (
                          <span className="text-slate-500 italic">—</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap align-top">
                        <button
                          onClick={() => handleToggleActive(q)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                            q.is_active
                              ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25'
                              : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-slate-200'
                          }`}
                        >
                          {q.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-right align-top">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openEditModal(q)}
                            title="Edit"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(q)}
                            title="Delete"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>
            Showing {questions.length} of {totalCount} questions (Page {page} of{' '}
            {totalPages})
          </span>
          <div className="flex items-center gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 cursor-pointer"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-slate-700 p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {editingQuestion ? 'Edit Question' : 'Add New Question'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  Team
                </label>
                <select
                  value={formTeam}
                  onChange={(e) => setFormTeam(e.target.value as Team)}
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="red">Team Red</option>
                  <option value="green">Team Green</option>
                  <option value="blue">Team Blue</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  Question Text *
                </label>
                <textarea
                  required
                  rows={3}
                  value={formQuestionText}
                  onChange={(e) => setFormQuestionText(e.target.value)}
                  placeholder="Enter the oral quiz question..."
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  Answer Reference (Optional, shown to MC/Admin only)
                </label>
                <input
                  type="text"
                  value={formAnswerText}
                  onChange={(e) => setFormAnswerText(e.target.value)}
                  placeholder="Expected answer for MC reference"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-300">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Pronunciation hint or context"
                  className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <label className="flex items-center gap-2.5 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-700 bg-slate-950"
                />
                Active (eligible for new game sessions)
              </label>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-sm font-medium text-white cursor-pointer"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingQuestion ? 'Save Changes' : 'Create Question'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {csvModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-xl bg-slate-900 border border-slate-700 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                Bulk Import Questions (CSV)
              </h2>
              <button
                onClick={() => setCsvModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Required header:{' '}
              <code className="text-slate-200">
                team,question_text,answer_text,notes,is_active
              </code>
              . Team must be <code className="text-slate-200">red</code>,{' '}
              <code className="text-slate-200">green</code>, or{' '}
              <code className="text-slate-200">blue</code>.
            </p>

            <div>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                className="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-white hover:file:bg-slate-700"
              />
            </div>

            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`team,question_text,answer_text,notes,is_active\nred,"What is the capital of France?",Paris,Geography,true\ngreen,"What is H2O?",Water,Chemistry,true`}
              className="w-full rounded-lg bg-slate-950 border border-slate-700 p-3 text-xs font-mono text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500"
            />

            {csvErrors.length > 0 && (
              <div className="rounded-lg bg-red-950/50 border border-red-700/60 p-3 max-h-36 overflow-y-auto space-y-1 text-xs text-red-200">
                {csvErrors.map((err, idx) => (
                  <p key={idx}>• {err}</p>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCsvModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-sm font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importing || !csvText.trim()}
                onClick={handleImportCsv}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-sm font-medium text-white cursor-pointer"
              >
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                Validate & Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
