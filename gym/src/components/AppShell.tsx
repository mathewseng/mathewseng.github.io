import {
  Apple,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  Dumbbell,
  FilePlus2,
  Goal,
  Lightbulb,
  Menu,
  Moon,
  NotebookText,
  Plus,
  Settings,
  Sun,
  Trophy,
  X,
} from "lucide-react";
import { useEffect, useRef, useState, type PropsWithChildren } from "react";

import { clsx } from "clsx";

import { benchGoal } from "../data/goals";
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

function Brand({ onNavigate }: { onNavigate?: () => void } = {}) {
  return (
    <NavLink
      to="/"
      className="flex min-h-11 items-center gap-2.5 sm:gap-3"
      onClick={onNavigate}
    >
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
      className="button-secondary !h-11 !min-h-11 !w-11 !p-0"
      aria-label={dark ? "Use light mode" : "Use dark mode"}
    >
      <Icon size={17} />
    </button>
  );
}

export default function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement>(null);
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("gym-theme");
    return saved ? saved === "dark" : true;
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("gym-theme", dark ? "dark" : "light");
  }, [dark]);

  useEffect(() => {
    document.title = `${pageNames[location.pathname] ?? "Form & Function"} — Form & Function`;
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    const handleMenuKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
        window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
        return;
      }
      if (event.key !== "Tab") return;
      const menu = document.getElementById("mobile-menu");
      const focusable = menu?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!menu || !focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleMenuKeys);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleMenuKeys);
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen">
      <a
        href="#main-content"
        inert={mobileMenuOpen}
        aria-hidden={mobileMenuOpen}
        className="button-primary fixed left-4 top-4 z-[70] -translate-y-24 transition-transform focus:translate-y-0"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>

      <aside
        inert={mobileMenuOpen}
        aria-hidden={mobileMenuOpen}
        className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[var(--line)] bg-[var(--surface)] p-5 lg:flex lg:flex-col"
      >
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

      <div inert={mobileMenuOpen} aria-hidden={mobileMenuOpen} className="lg:pl-64">
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
              <div className="hidden items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs font-bold text-[var(--muted)] sm:flex">
                <Trophy size={15} className="text-[var(--orange)]" />
                Bench goal{" "}
                <span className="text-[var(--ink)]">
                  {benchGoal.currentValue} / {benchGoal.targetValue} lb
                </span>
              </div>
              <ThemeToggle dark={dark} onToggle={() => setDark((value) => !value)} />
              <button
                ref={mobileMenuButtonRef}
                type="button"
                className="button-secondary !h-11 !min-h-11 !w-11 !p-0 lg:hidden"
                aria-label="Open all navigation"
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-menu"
                onClick={() => setMobileMenuOpen(true)}
              >
                <Menu size={19} />
              </button>
            </div>
          </div>
        </header>

        <main
          ref={mainRef}
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1500px] overflow-x-clip px-4 py-6 pb-28 focus:outline-none sm:px-6 sm:py-8 lg:px-8 lg:pb-10"
        >
          {children}
        </main>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/65 backdrop-blur-sm"
            aria-label="Close navigation menu"
            onClick={() => {
              setMobileMenuOpen(false);
              window.requestAnimationFrame(() => mobileMenuButtonRef.current?.focus());
            }}
          />
          <section
            id="mobile-menu"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-menu-title"
            className="surface-raised absolute inset-y-2 right-2 flex w-[min(22rem,calc(100%-1rem))] flex-col overflow-y-auto rounded-3xl p-4 shadow-2xl"
          >
            <h2 id="mobile-menu-title" className="sr-only">
              All training views
            </h2>
            <div className="flex items-center justify-between gap-4">
              <Brand onNavigate={() => setMobileMenuOpen(false)} />
              <button
                type="button"
                autoFocus
                className="button-secondary !h-11 !min-h-11 !w-11 !p-0"
                aria-label="Close navigation menu"
                onClick={() => {
                  setMobileMenuOpen(false);
                  window.requestAnimationFrame(() =>
                    mobileMenuButtonRef.current?.focus(),
                  );
                }}
              >
                <X size={19} />
              </button>
            </div>

            <nav className="mt-6 grid gap-1" aria-label="All training views">
              {navigation.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setMobileMenuOpen(false)}
                  className={({ isActive }) =>
                    clsx(
                      "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-extrabold",
                      isActive
                        ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                        : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]",
                    )
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
              <NavLink
                to="/settings"
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  clsx(
                    "flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-extrabold",
                    isActive
                      ? "bg-[var(--accent)] text-[var(--accent-ink)]"
                      : "text-[var(--muted)] hover:bg-[var(--surface-soft)] hover:text-[var(--ink)]",
                  )
                }
              >
                <Settings size={18} />
                Data & settings
              </NavLink>
            </nav>

            <div className="mt-auto pt-6">
              <div className="mb-3 rounded-2xl bg-[var(--surface-soft)] p-4">
                <p className="eyebrow">145 lb bench goal</p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <strong className="text-xl font-black">
                    {benchGoal.currentValue} / {benchGoal.targetValue} lb
                  </strong>
                  <span className="text-xs font-extrabold text-[var(--muted)]">
                    {Math.round(
                      ((benchGoal.currentValue ?? 0) / (benchGoal.targetValue ?? 1)) *
                        100,
                    )}
                    %
                  </span>
                </div>
              </div>
              <NavLink
                to="/add"
                className="button-primary w-full"
                onClick={() => setMobileMenuOpen(false)}
              >
                <FilePlus2 size={17} /> Log workout
              </NavLink>
            </div>
          </section>
        </div>
      ) : null}

      <nav
        inert={mobileMenuOpen}
        aria-hidden={mobileMenuOpen}
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
                    "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[0.68rem] font-extrabold",
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
