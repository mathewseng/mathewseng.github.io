import {
  Apple,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  Dumbbell,
  FilePlus2,
  Goal,
  Lightbulb,
  Moon,
  NotebookText,
  Plus,
  Settings,
  Sun,
  Trophy,
} from "lucide-react";
import { useEffect, useState, type PropsWithChildren } from "react";

import { clsx } from "clsx";

import { NavLink, useLocation } from "../router";
const navigation = [
  { to: "/", label: "Dashboard", icon: ChartNoAxesCombined, end: true },
  { to: "/workouts", label: "Calendar", icon: CalendarDays },
  { to: "/exercises", label: "Exercises", icon: Dumbbell },
  { to: "/goals", label: "Goals", icon: Goal },
  { to: "/suggested", label: "Suggested", icon: Lightbulb },
  { to: "/nutrition", label: "Nutrition", icon: Apple },
  { to: "/notes", label: "Notes", icon: NotebookText },
];

const pageNames: Record<string, string> = {
  "/": "Dashboard",
  "/workouts": "Training calendar",
  "/exercises": "Exercise progress",
  "/goals": "Goals & milestones",
  "/suggested": "Session builder",
  "/nutrition": "Nutrition & recovery",
  "/notes": "Training notes",
  "/add": "Log a workout",
  "/add-nutrition": "Log nutrition",
  "/settings": "Data & settings",
};

function Brand() {
  return (
    <NavLink to="/" className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--accent)] text-sm font-black text-[var(--accent-ink)]">
        F/
      </span>
      <span>
        <strong className="block text-sm font-black tracking-[-0.02em]">
          Form & Function
        </strong>
        <span className="block text-[0.67rem] font-bold tracking-wide text-[var(--muted)]">
          TRAINING LOG
        </span>
      </span>
    </NavLink>
  );
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const Icon = dark ? Sun : Moon;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="button-secondary !h-10 !min-h-10 !w-10 !p-0"
      aria-label={dark ? "Use light mode" : "Use dark mode"}
    >
      <Icon size={17} />
    </button>
  );
}

export default function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("gym-theme");
    return saved ? saved === "dark" : true;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("gym-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[var(--line)] bg-[var(--surface)] p-5 lg:flex lg:flex-col">
        <Brand />
        <nav className="mt-9 grid gap-1" aria-label="Primary navigation">
          {navigation.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                clsx(
                  "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-bold transition-colors",
                  isActive
                    ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                    : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]",
                )
              }
            >
              <Icon size={17} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto">
          <NavLink
            to="/add"
            className="button-primary mb-3 w-full"
            aria-label="Log a new workout"
          >
            <Plus size={17} /> Log workout
          </NavLink>
          <NavLink
            to="/settings"
            className="flex min-h-11 items-center justify-between rounded-xl px-3 text-sm font-bold text-[var(--muted)] hover:bg-[var(--surface-soft)]"
          >
            <span className="flex items-center gap-3">
              <Settings size={17} /> Data & settings
            </span>
            <ChevronRight size={15} />
          </NavLink>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[color-mix(in_srgb,var(--page)_88%,transparent)] px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="mx-auto flex h-16 max-w-[1500px] items-center justify-between">
            <div className="lg:hidden">
              <Brand />
            </div>
            <div className="hidden lg:block">
              <p className="eyebrow">Personal training system</p>
              <p className="mt-0.5 text-sm font-extrabold">
                {pageNames[location.pathname] ?? "Form & Function"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <NavLink
                to="/add"
                className="button-primary !h-10 !min-h-10 !px-3 sm:hidden"
                aria-label="Log workout"
              >
                <FilePlus2 size={17} />
              </NavLink>
              <div className="hidden items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--muted)] sm:flex">
                <Trophy size={15} className="text-[var(--orange)]" />
                Bench goal <span className="text-[var(--ink)]">115 / 140 lb</span>
              </div>
              <ThemeToggle dark={dark} onToggle={() => setDark((value) => !value)} />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_94%,transparent)] px-2 pb-[max(0.4rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl lg:hidden"
        aria-label="Mobile navigation"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {[
            navigation[0],
            navigation[1],
            navigation[2],
            navigation[4],
            { to: "/add", label: "Add", icon: Plus },
          ].map((item) => {
            if (!item) return null;
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={"end" in item ? item.end : false}
                className={({ isActive }) =>
                  clsx(
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[0.62rem] font-extrabold",
                    isActive ? "text-[var(--accent)]" : "text-[var(--muted)]",
                  )
                }
              >
                <Icon size={19} strokeWidth={2.2} />
                {item.label}
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
