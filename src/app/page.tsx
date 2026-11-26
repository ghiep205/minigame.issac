import Link from 'next/link';
import { Monitor, Sliders, ShieldCheck, ArrowRight, Sparkles } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#F4F7FB] text-slate-900 flex flex-col items-center justify-center p-6">
      <div className="max-w-5xl w-full rounded-3xl bg-white border border-slate-200/80 shadow-[0_4px_24px_rgba(15,23,42,0.05)] p-8 sm:p-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                3-Team Live Quiz Arena
              </h1>
              <p className="text-sm text-slate-500 mt-1">
                45 oral questions across Team Red, Team Green, and Team Blue with a
                synchronized 25-second countdown timer.
              </p>
            </div>
          </div>

          <span className="inline-flex items-center self-start px-3.5 py-1.5 rounded-full bg-sky-50 border border-sky-200/70 text-xs font-semibold text-sky-700">
            Live Event System
          </span>
        </div>

        {/* Highlight Team Strip */}
        <div className="rounded-2xl bg-[#EBF6FF] border border-sky-200/70 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-800">
              3 Competing Teams (15 Questions / Team)
            </span>
            <span className="px-3 py-1 rounded-full bg-white border border-sky-200/70 text-xs font-medium text-sky-700">
              25s / Question
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-xl bg-white border border-sky-100 px-4 py-3 flex items-center justify-between shadow-2xs">
              <span className="font-semibold text-slate-800">Team Red</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#EF4444]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
                #EF4444
              </span>
            </div>
            <div className="rounded-xl bg-white border border-sky-100 px-4 py-3 flex items-center justify-between shadow-2xs">
              <span className="font-semibold text-slate-800">Team Green</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#16A34A]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
                #16A34A
              </span>
            </div>
            <div className="rounded-xl bg-white border border-sky-100 px-4 py-3 flex items-center justify-between shadow-2xs">
              <span className="font-semibold text-slate-800">Team Blue</span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#2563EB]">
                <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
                #2563EB
              </span>
            </div>
          </div>
        </div>

        {/* Route Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            href="/game"
            className="group rounded-2xl bg-white border border-slate-200/90 hover:border-sky-300 hover:shadow-sm p-6 flex flex-col justify-between transition-all"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <Monitor className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Projector Display
              </h2>
              <p className="text-sm text-slate-500">
                16:9 live stage screen with large question typography, 25s
                timer, and real-time team progress.
              </p>
            </div>
            <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 group-hover:text-sky-700">
              Open /game <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          <Link
            href="/control"
            className="group rounded-2xl bg-white border border-slate-200/90 hover:border-sky-300 hover:shadow-sm p-6 flex flex-col justify-between transition-all"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <Sliders className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                MC Control Panel
              </h2>
              <p className="text-sm text-slate-500">
                Run the live game: start/pause timer, mark answers correct or
                incorrect, and advance turns safely.
              </p>
            </div>
            <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 group-hover:text-sky-700">
              Open /control <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          <Link
            href="/admin"
            className="group rounded-2xl bg-white border border-slate-200/90 hover:border-sky-300 hover:shadow-sm p-6 flex flex-col justify-between transition-all"
          >
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">
                Admin Dashboard
              </h2>
              <p className="text-sm text-slate-500">
                Manage the question bank, bulk import CSVs, and configure game
                sessions.
              </p>
            </div>
            <div className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-sky-600 group-hover:text-sky-700">
              Open /admin <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
