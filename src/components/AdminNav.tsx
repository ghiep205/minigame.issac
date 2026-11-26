'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  HelpCircle,
  PlaySquare,
  Sliders,
  Monitor,
  LogOut,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface AdminNavProps {
  email: string;
  role?: string | null;
}

const navItems = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard },
  { href: '/admin/questions', label: 'Questions', icon: HelpCircle },
  { href: '/admin/sessions', label: 'Sessions', icon: PlaySquare },
];

export function AdminNav({ email, role }: AdminNavProps) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/admin/login');
    router.refresh();
  }

  return (
    <header className="border-b border-slate-200/80 bg-white/95 sticky top-0 z-30 backdrop-blur">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <Link
            href="/admin"
            className="font-bold text-slate-900 tracking-tight text-lg flex items-center gap-2.5"
          >
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-[#EF4444]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#16A34A]" />
              <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" />
            </span>
            Quiz Admin
          </Link>

          <nav className="hidden md:flex items-center gap-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#EBF6FF] text-sky-700 border border-sky-200/70'
                      : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/70'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <Link
            href="/control"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-xs sm:text-sm font-medium text-slate-700 transition-colors"
          >
            <Sliders className="w-4 h-4 text-sky-600" />
            <span className="hidden sm:inline">MC Control</span>
          </Link>
          <Link
            href="/game"
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100 text-xs sm:text-sm font-medium text-slate-700 transition-colors"
          >
            <Monitor className="w-4 h-4 text-sky-600" />
            <span className="hidden sm:inline">Projector</span>
          </Link>

          <div className="hidden lg:flex flex-col items-end pl-3 border-l border-slate-200">
            <span className="text-xs text-slate-800 font-semibold">{email}</span>
            <span className="text-[11px] uppercase tracking-wider text-sky-600 font-semibold">
              {role || 'unassigned'}
            </span>
          </div>

          <button
            onClick={handleSignOut}
            title="Sign out"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-600 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </div>

      {/* Mobile nav */}
      <div className="md:hidden border-t border-slate-100 px-4 py-2 flex items-center gap-2 overflow-x-auto bg-white">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap ${
                active
                  ? 'bg-[#EBF6FF] text-sky-700 border border-sky-200/70'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </header>
  );
}
