import {
  Apple,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronRight,
  Dumbbell,
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

import { benchGoal } from "../data/goals";
import { NavLink, useLocation } from "../router";
import { ConfirmProvider } from "./confirm";
import { ToastProvider, ToastViewport } from "./toast";
import { Button, ButtonLink, ProgressBar } from "./ui";

const navigation = [
  { to: "/", label: "Dashboard", icon: ChartNoAxesCombined, end: true },
  { to: "/workouts", label: "Calendar", icon: CalendarDays },
  { to: "/exercises", label: "Exercises", icon: Dumbbell },
  { to: "/goals", label: "Goals", icon: Goal },
  { to: "/suggested", label: "Suggested", icon: Lightbulb },
  { to: "/nutrition", label: "Nutrition", icon: Apple },
  { to: "/notes", label: "Notes", icon: NotebookText },
];

export const pageNames: Record<string, string> = {
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

const THEME_COLORS = { dark: "#08090d", light: "#f4f6fa" };

function Brand({ current, onNavigate }: { current?: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Breadcrumb" className="crumbs">
      <a href="/">
        <span className="mark" aria-hidden="true">
          MS
        </span>
        <span className="hidden sm:inline">Projects</span>
      </a>
      <span aria-hidden="true" className="crumb-sep">
        /
      </span>
      <NavLink to="/" end className="crumb-current" onClick={onNavigate}>
        Gym Tracker
      </NavLink>
      {current ? (
        <>
          <span aria-hidden="true" className="crumb-sep hidden lg:inline">
            /
          </span>
          <span className="hidden text-[var(--ink)] lg:inline">{current}</span>
        </>
      ) : null}
    </nav>
  );
}

function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const Icon = dark ? Sun : Moon;
  return (
    <Button
      size="icon"
      onClick={onToggle}
      aria-label={dark ? "Use light mode" : "Use dark mode"}
      aria-pressed={dark}
    >
      <Icon size={17} aria-hidden="true" />
    </Button>
  );
}

function initialDark(): boolean {
  try {
    const saved = localStorage.getItem("gym-theme");
    if (saved) return saved === "dark";
  } catch {
    // Storage may be unavailable; fall through to the OS preference.
  }
  return !window.matchMedia("(prefers-color-scheme: light)").matches;
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {navigation.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className="nav-row" onClick={onNavigate}>
          <Icon size={17} aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </>
  );
}

export default function AppShell({ children }: PropsWithChildren) {
  const location = useLocation();
  const mainRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDialogElement>(null);
  const [dark, setDark] = useState(initialDark);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pageName = pageNames[location.pathname] ?? "Gym Tracker";

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("gym-theme", dark ? "dark" : "light");
    } catch {
      // A full or blocked storage only loses the preference.
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", dark ? THEME_COLORS.dark : THEME_COLORS.light);
  }, [dark]);

  useEffect(() => {
    document.title = `${pageName} — Gym Tracker`;
    window.requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
  }, [pageName, location.pathname]);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    if (mobileMenuOpen && !menu.open) menu.showModal();
    if (!mobileMenuOpen && menu.open) menu.close();
  }, [mobileMenuOpen]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnDesktop = window.matchMedia("(min-width: 1024px)");
    const handle = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileMenuOpen(false);
    };
    closeOnDesktop.addEventListener("change", handle);
    return () => closeOnDesktop.removeEventListener("change", handle);
  }, [mobileMenuOpen]);

  const closeMenu = () => setMobileMenuOpen(false);
  const benchPercent = Math.round(
    ((benchGoal.currentValue ?? 0) / (benchGoal.targetValue ?? 1)) * 100,
  );

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="min-h-screen">
          <a
            href="#main"
            className="skip-link"
            onClick={(event) => {
              event.preventDefault();
              mainRef.current?.focus();
            }}
          >
            Skip to content
          </a>

          <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] p-5 backdrop-blur-xl lg:flex lg:flex-col">
            <Brand />
            <nav className="mt-8 grid gap-1" aria-label="Primary navigation">
              <NavItems />
            </nav>

            <div className="mt-auto">
              <ButtonLink
                to="/add"
                variant="primary"
                block
                className="mb-3"
                aria-label="Log a new workout"
              >
                <Plus size={17} aria-hidden="true" /> Log workout
              </ButtonLink>
              <NavLink to="/settings" className="nav-row justify-between">
                <span className="flex items-center gap-3">
                  <Settings size={17} aria-hidden="true" /> Data & settings
                </span>
                <ChevronRight size={15} aria-hidden="true" />
              </NavLink>
            </div>
          </aside>

          <div className="lg:pl-64">
            <header className="topbar px-4 sm:px-6 lg:px-8">
              <div className="topbar-inner mx-auto max-w-[1500px]">
                <div className="lg:hidden">
                  <Brand />
                </div>
                <div className="hidden lg:block">
                  <p className="eyebrow">Gym Tracker</p>
                  <p className="mt-0.5 text-sm font-semibold">{pageName}</p>
                </div>
                <div className="topbar-actions">
                  <div className="hidden min-h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-3.5 text-xs font-semibold text-[var(--muted)] sm:flex">
                    <Trophy size={15} className="text-[var(--warn)]" aria-hidden="true" />
                    Bench goal{" "}
                    <span className="text-[var(--ink)]">
                      {benchGoal.currentValue} / {benchGoal.targetValue} lb
                    </span>
                  </div>
                  <ThemeToggle dark={dark} onToggle={() => setDark((value) => !value)} />
                  <Button
                    size="icon"
                    className="lg:hidden"
                    aria-label="Open all navigation"
                    aria-expanded={mobileMenuOpen}
                    aria-controls="mobile-menu"
                    onClick={() => setMobileMenuOpen(true)}
                  >
                    <Menu size={19} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </header>

            <main
              ref={mainRef}
              id="main"
              tabIndex={-1}
              className="mx-auto max-w-[1500px] overflow-x-clip px-4 py-6 pb-28 sm:px-6 sm:py-8 lg:px-8 lg:pb-10"
            >
              <div id="main-content">{children}</div>
            </main>
          </div>

          <dialog
            ref={menuRef}
            id="mobile-menu"
            className="dialog dialog--sheet lg:hidden"
            aria-labelledby="mobile-menu-title"
            onCancel={(event) => {
              event.preventDefault();
              closeMenu();
            }}
            onClick={(event) => {
              if (event.target === event.currentTarget) closeMenu();
            }}
          >
            <div className="dialog-head">
              <h2 id="mobile-menu-title">All training views</h2>
              <Button
                size="icon"
                variant="ghost"
                aria-label="Close navigation menu"
                onClick={closeMenu}
              >
                <X size={19} aria-hidden="true" />
              </Button>
            </div>
            <div className="dialog-body">
              <nav className="grid gap-1" aria-label="All training views">
                <NavItems onNavigate={closeMenu} />
                <NavLink to="/settings" className="nav-row" onClick={closeMenu}>
                  <Settings size={18} aria-hidden="true" />
                  Data & settings
                </NavLink>
              </nav>
              <div className="well mt-5 p-4">
                <p className="eyebrow">{benchGoal.targetValue} lb bench goal</p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <strong className="text-xl font-extrabold">
                    {benchGoal.currentValue} / {benchGoal.targetValue} lb
                  </strong>
                  <span className="text-xs font-bold text-[var(--muted)]">
                    {benchPercent}%
                  </span>
                </div>
                <ProgressBar
                  className="mt-3"
                  value={benchGoal.currentValue ?? 0}
                  max={benchGoal.targetValue ?? 1}
                  label="Bench goal progress"
                />
              </div>
            </div>
            <div className="dialog-foot">
              <ButtonLink to="/add" variant="primary" block onClick={closeMenu}>
                <Plus size={17} aria-hidden="true" /> Log workout
              </ButtonLink>
            </div>
          </dialog>

          <nav className="tab-bar lg:hidden" aria-label="Mobile navigation">
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
                    className="tab-bar-item"
                  >
                    <Icon size={19} strokeWidth={2.2} aria-hidden="true" />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </nav>

          <ToastViewport />
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}
