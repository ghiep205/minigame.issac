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
  FileText,
  Music,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { parseQuestionsCsv } from '@/lib/csv';
import {
  AudioClipEditor,
  type PendingAudioClip,
} from '@/components/AudioClipEditor';
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

  const [search, setSearch] = useState('');
  const [teamFilter, setTeamFilter] = useState<'all' | Team>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [formTeam, setFormTeam] = useState<Team>('red');
  const [formQuestionText, setFormQuestionText] = useState('');
  const [formAnswerText, setFormAnswerText] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [pendingAudio, setPendingAudio] = useState<PendingAudioClip>({
    blob: null,
    startSeconds: null,
    durationSeconds: null,
    removed: false,
  });
  const [saving, setSaving] = useState(false);

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
    setPendingAudio({
      blob: null,
      startSeconds: null,
      durationSeconds: null,
      removed: false,
    });
    setModalOpen(true);
  }

  function openEditModal(q: Question) {
    setEditingQuestion(q);
    setFormTeam(q.team);
    setFormQuestionText(q.question_text);
    setFormAnswerText(q.answer_text ?? '');
    setFormNotes(q.notes ?? '');
    setFormIsActive(q.is_active);
    setPendingAudio({
      blob: null,
      startSeconds: q.audio_start_seconds,
      durationSeconds: q.audio_duration_seconds,
      removed: false,
    });
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

    let nextAudioUrl = editingQuestion?.audio_url ?? null;
    let nextAudioStart = editingQuestion?.audio_start_seconds ?? null;
    let nextAudioDuration = editingQuestion?.audio_duration_seconds ?? null;

    if (pendingAudio.removed) {
      nextAudioUrl = null;
      nextAudioStart = null;
      nextAudioDuration = null;
    } else if (pendingAudio.blob) {
      const filePath = `${formTeam}/${crypto.randomUUID()}.wav`;
      const { error: uploadError } = await supabase.storage
        .from('question-audio')
        .upload(filePath, pendingAudio.blob, {
          contentType: 'audio/wav',
          upsert: false,
        });

      if (uploadError) {
        setFeedback({
          type: 'error',
          message: `Audio upload failed: ${uploadError.message}`,
        });
        setSaving(false);
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from('question-audio')
        .getPublicUrl(filePath);

      nextAudioUrl = publicUrlData.publicUrl;
      nextAudioStart = pendingAudio.startSeconds;
      nextAudioDuration = pendingAudio.durationSeconds;
    }

    const payload = {
      team: formTeam,
      question_text: formQuestionText.trim(),
      question_type: nextAudioUrl ? 'audio' : 'oral',
      answer_text: formAnswerText.trim() || null,
      notes: formNotes.trim() || null,
      audio_url: nextAudioUrl,
      audio_start_seconds: nextAudioStart,
      audio_duration_seconds: nextAudioDuration,
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
    <div className="rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.04)] p-6 sm:p-8 space-y-6">
      {/* Header matching reference card */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900">
              Question Bank:{' '}
              <span className="text-sky-600">
                {teamFilter === 'all'
                  ? 'All 3 Teams'
                  : TEAM_CONFIG[teamFilter].label}
              </span>
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              Each team requires at least 15 active oral questions for a full
              45-question session.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setCsvErrors([]);
              setCsvModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-sm font-semibold text-slate-700 transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4 text-sky-600" />
            Import CSV
          </button>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-sm font-semibold text-white transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Add Question
          </button>
        </div>
      </div>

      {/* Featured Sky-Blue Team Pool Card */}
      <div className="rounded-2xl bg-[#EBF6FF] border border-sky-200/70 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 rounded-lg bg-white border border-sky-200 text-xs font-bold text-sky-600">
              1 – 15
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Team Question Pools (Required Minimum: 15 Active / Team)
              </h2>
              <p className="text-xs text-slate-500">
                Randomly selected without repeats when creating a new session
              </p>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-white border border-sky-200/70 text-xs font-semibold text-sky-700">
            {shortTeams.length === 0 ? 'All Teams Ready' : 'Needs More Questions'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {TEAMS.map((t) => {
            const cfg = TEAM_CONFIG[t];
            const c = teamCounts[t];
            return (
              <div
                key={t}
                className="rounded-xl bg-white border border-sky-100 p-4 flex items-center justify-between shadow-2xs"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3.5 h-3.5 rounded-full"
                    style={{ backgroundColor: cfg.hex }}
                  />
                  <div>
                    <p className="font-bold text-slate-900">{cfg.label}</p>
                    <p className="text-xs text-slate-400">{c.total} total</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-slate-900">{c.active}</p>
                  <p
                    className={`text-xs font-semibold ${
                      c.active >= 15 ? 'text-emerald-600' : 'text-amber-600'
                    }`}
                  >
                    {c.active >= 15 ? 'Ready (15+)' : `${c.active}/15 active`}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {shortTeams.length > 0 && (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-3.5 flex items-center gap-3 text-sm text-amber-900">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
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
          className={`rounded-2xl p-3.5 flex items-center justify-between text-sm border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search questions, answers, or notes..."
            className="w-full rounded-xl bg-slate-50 border border-slate-200 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-400"
          />
        </div>
        <select
          value={teamFilter}
          onChange={(e) => {
            setTeamFilter(e.target.value as 'all' | Team);
            setPage(1);
          }}
          className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 font-medium focus:outline-none focus:bg-white focus:border-sky-400"
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
          className="rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-700 font-medium focus:outline-none focus:bg-white focus:border-sky-400"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active Only</option>
          <option value="inactive">Inactive Only</option>
        </select>
      </div>

      {/* Question Rows List */}
      <div className="space-y-2.5">
        {loading ? (
          <div className="rounded-2xl border border-slate-200/80 p-12 flex items-center justify-center gap-2 text-slate-500 text-sm">
            <Loader2 className="w-4 h-4 animate-spin text-sky-500" />
            Loading questions...
          </div>
        ) : questions.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 border border-slate-200/80 p-12 text-center text-sm text-slate-500">
            No questions match the current filters.
          </div>
        ) : (
          questions.map((q, idx) => {
            const cfg = TEAM_CONFIG[q.team];
            const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
            return (
              <div
                key={q.id}
                className="rounded-2xl bg-white border border-slate-200/90 hover:border-sky-200 p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors"
              >
                <div className="flex items-start gap-3.5 flex-1">
                  <span className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                    {rowNum}
                  </span>
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-900">
                      {q.question_text}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-semibold ${cfg.badgeClass}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: cfg.hex }}
                        />
                        {cfg.label}
                      </span>
                      {q.audio_url && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-200 font-semibold">
                          <Music className="w-3 h-3" />
                          {q.audio_duration_seconds
                            ? `${Math.round(q.audio_duration_seconds)}s Audio`
                            : 'Audio'}
                        </span>
                      )}
                      {q.answer_text && (
                        <span>
                          · Answer:{' '}
                          <span className="font-medium text-slate-700">
                            {q.answer_text}
                          </span>
                        </span>
                      )}
                      {q.notes && <span>· {q.notes}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <button
                    onClick={() => handleToggleActive(q)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                      q.is_active
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                        : 'bg-slate-100 text-slate-500 border border-slate-200 hover:text-slate-700'
                    }`}
                  >
                    {q.is_active ? 'Active' : 'Inactive'}
                  </button>
                  <button
                    onClick={() => openEditModal(q)}
                    title="Edit"
                    className="p-2 rounded-xl text-slate-400 hover:text-sky-600 hover:bg-sky-50 cursor-pointer"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(q)}
                    title="Delete"
                    className="p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
        <span>
          Showing {questions.length} of {totalCount} questions (Page {page} of{' '}
          {totalPages})
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-medium cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Prev
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-700 font-medium cursor-pointer"
          >
            Next
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-white border border-slate-200 p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                {editingQuestion ? 'Edit Question' : 'Add New Question'}
              </h2>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuestion} className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Team
                </label>
                <select
                  value={formTeam}
                  onChange={(e) => setFormTeam(e.target.value as Team)}
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 focus:outline-none focus:bg-white focus:border-sky-400"
                >
                  <option value="red">Team Red</option>
                  <option value="green">Team Green</option>
                  <option value="blue">Team Blue</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Question Text *
                </label>
                <textarea
                  required
                  rows={3}
                  value={formQuestionText}
                  onChange={(e) => setFormQuestionText(e.target.value)}
                  placeholder="Enter the oral quiz question..."
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Answer Reference (Optional, shown to MC/Admin only)
                </label>
                <input
                  type="text"
                  value={formAnswerText}
                  onChange={(e) => setFormAnswerText(e.target.value)}
                  placeholder="Expected answer for MC reference"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-400"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Pronunciation hint or context"
                  className="w-full rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-400"
                />
              </div>

              <AudioClipEditor
                key={editingQuestion?.id ?? 'new-question'}
                existingAudioUrl={editingQuestion?.audio_url ?? null}
                existingStartSeconds={editingQuestion?.audio_start_seconds ?? null}
                existingDurationSeconds={
                  editingQuestion?.audio_duration_seconds ?? null
                }
                onChange={setPendingAudio}
              />

              <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-300 text-sky-600"
                />
                Active (eligible for new game sessions)
              </label>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-60 text-sm font-semibold text-white cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-slate-200 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-lg font-bold text-slate-900">
                Bulk Import Questions (CSV)
              </h2>
              <button
                onClick={() => setCsvModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Required header:{' '}
              <code className="text-sky-700 font-semibold">
                team,question_text,answer_text,notes,is_active
              </code>
              . Team must be <code className="text-slate-800">red</code>,{' '}
              <code className="text-slate-800">green</code>, or{' '}
              <code className="text-slate-800">blue</code>.
            </p>

            <div>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleCsvFileChange}
                className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-slate-200 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100"
              />
            </div>

            <textarea
              rows={8}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`team,question_text,answer_text,notes,is_active\nred,"What is the capital of France?",Paris,Geography,true\ngreen,"What is H2O?",Water,Chemistry,true`}
              className="w-full rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs font-mono text-slate-800 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:border-sky-400"
            />

            {csvErrors.length > 0 && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 max-h-36 overflow-y-auto space-y-1 text-xs text-red-700">
                {csvErrors.map((err, idx) => (
                  <p key={idx}>• {err}</p>
                ))}
              </div>
            )}

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setCsvModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={importing || !csvText.trim()}
                onClick={handleImportCsv}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 disabled:opacity-50 text-sm font-semibold text-white cursor-pointer"
              >
                {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                Validate &amp; Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
