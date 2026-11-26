import Link from 'next/link';
import { Monitor, Sliders, ShieldCheck, ArrowRight } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-4xl w-full space-y-10">
        <div className="text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700 text-xs font-medium tracking-wider uppercase text-slate-300">
            Live Event Quiz System
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
            3-Team Live Quiz Arena
          </h1>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            45 oral questions across Team Red, Team Green, and Team Blue with a
            synchronized 25-second countdown timer.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#EF4444]/15 border border-[#EF4444]/40 text-sm font-medium text-[#FCA5A5]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
              Team Red
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#16A34A]/15 border border-[#16A34A]/40 text-sm font-medium text-[#86EFAC]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
              Team Green
            </span>
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#2563EB]/15 border border-[#2563EB]/40 text-sm font-medium text-[#93C5FD]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
              Team Blue
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Link
            href="/game"
            className="group rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-600 p-6 flex flex-col justify-between transition-colors"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200">
                <Monitor className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-white">
                Projector Display
              </h2>
              <p className="text-sm text-slate-400">
                16:9 live stage screen with large question typography, 25s
                timer, and real-time team progress.
              </p>
            </div>
            <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-200 group-hover:text-white">
              Open /game <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          <Link
            href="/control"
            className="group rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-600 p-6 flex flex-col justify-between transition-colors"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200">
                <Sliders className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-white">
                MC Control Panel
              </h2>
              <p className="text-sm text-slate-400">
                Run the live game: start/pause timer, mark answers correct or
                incorrect, and advance turns safely.
              </p>
            </div>
            <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-200 group-hover:text-white">
              Open /control <ArrowRight className="w-4 h-4" />
            </div>
          </Link>

          <Link
            href="/admin"
            className="group rounded-xl bg-slate-900/90 border border-slate-800 hover:border-slate-600 p-6 flex flex-col justify-between transition-colors"
          >
            <div className="space-y-3">
              <div className="w-11 h-11 rounded-lg bg-slate-800 flex items-center justify-center text-slate-200">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h2 className="text-xl font-semibold text-white">
                Admin Dashboard
              </h2>
              <p className="text-sm text-slate-400">
                Manage the question bank, bulk import CSVs, and configure game
                sessions.
              </p>
            </div>
            <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-slate-200 group-hover:text-white">
              Open /admin <ArrowRight className="w-4 h-4" />
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
