export type Team = 'red' | 'green' | 'blue';

export type SessionStatus = 'pending' | 'playing' | 'paused' | 'completed';

export type QuestionOutcome = 'correct' | 'incorrect' | 'skipped' | 'timeout';

export type SessionQuestionStatus =
  | 'pending'
  | 'active'
  | 'answered_correctly'
  | 'skipped'
  | 'expired';

export interface Question {
  id: string;
  team: Team;
  question_text: string;
  question_type: string;
  answer_text: string | null;
  notes: string | null;
  audio_url: string | null;
  audio_start_seconds: number | null;
  audio_duration_seconds: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GameSession {
  id: string;
  session_name: string;
  game_mode: string;
  questions_per_team: number;
  status: SessionStatus;
  current_team: Team;
  current_question_id: string | null;
  current_session_question_id: string | null;
  current_question_number: number;
  current_started_at: string | null;
  timer_duration: number;
  timer_running: boolean;
  paused_remaining_seconds: number | null;
  audio_playing: boolean;
  audio_started_at: string | null;
  last_result: QuestionOutcome | null;
  last_result_team: Team | null;
  last_result_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionQuestion {
  id: string;
  session_id: string;
  question_id: string;
  team: Team;
  sequence_number: number;
  status: SessionQuestionStatus;
  used_at: string | null;
  result: QuestionOutcome | null;
}

export interface TeamProgress {
  id: string;
  session_id: string;
  team: Team;
  question_count: number;
  completed_count: number;
  correct_count: number;
  skipped_count: number;
}

export interface PublicQuestion {
  id: string;
  team: Team;
  question_text: string;
  question_type: string;
  audio_url: string | null;
  audio_duration_seconds: number | null;
}

export interface PublicGameState {
  session: GameSession | null;
  current_question: PublicQuestion | null;
  team_progress: TeamProgress[];
  server_time: string;
}

export interface AdminProfile {
  id: string;
  email: string;
  role: 'admin' | 'mc';
  created_at: string;
}

export const TEAMS: Team[] = ['red', 'green', 'blue'];

export const TEAM_CONFIG: Record<
  Team,
  {
    name: string;
    label: string;
    hex: string;
    bgClass: string;
    borderClass: string;
    textClass: string;
    softBgClass: string;
    badgeClass: string;
    ringClass: string;
  }
> = {
  red: {
    name: 'Red',
    label: 'Team Red',
    hex: '#EF4444',
    bgClass: 'bg-[#EF4444]',
    borderClass: 'border-[#EF4444]',
    textClass: 'text-[#EF4444]',
    softBgClass: 'bg-red-50',
    badgeClass: 'bg-red-50 text-red-600 border border-red-200',
    ringClass: 'ring-[#EF4444]',
  },
  green: {
    name: 'Green',
    label: 'Team Green',
    hex: '#16A34A',
    bgClass: 'bg-[#16A34A]',
    borderClass: 'border-[#16A34A]',
    textClass: 'text-[#16A34A]',
    softBgClass: 'bg-green-50',
    badgeClass: 'bg-green-50 text-green-700 border border-green-200',
    ringClass: 'ring-[#16A34A]',
  },
  blue: {
    name: 'Blue',
    label: 'Team Blue',
    hex: '#2563EB',
    bgClass: 'bg-[#2563EB]',
    borderClass: 'border-[#2563EB]',
    textClass: 'text-[#2563EB]',
    softBgClass: 'bg-blue-50',
    badgeClass: 'bg-blue-50 text-blue-600 border border-blue-200',
    ringClass: 'ring-[#2563EB]',
  },
};

