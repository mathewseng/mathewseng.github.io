import { lazy, Suspense } from "react";

import AppShell from "./components/AppShell";
import { Navigate, useLocation } from "./router";
import { AppStateProvider } from "./state/AppState";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Workouts = lazy(() => import("./pages/Workouts"));
const Exercises = lazy(() => import("./pages/Exercises"));
const Goals = lazy(() => import("./pages/Goals"));
const Suggested = lazy(() => import("./pages/Suggested"));
const Nutrition = lazy(() => import("./pages/Nutrition"));
const Notes = lazy(() => import("./pages/Notes"));
const AddWorkout = lazy(() => import("./pages/AddWorkout"));
const AddNutrition = lazy(() => import("./pages/AddNutrition"));
const Settings = lazy(() => import("./pages/Settings"));

function PageLoading() {
  return (
    <div className="grid min-h-[60vh] place-items-center" role="status">
      <div className="text-center">
        <span className="mx-auto block h-10 w-10 animate-pulse rounded-2xl bg-[var(--accent)]" />
        <p className="mt-3 text-xs font-extrabold text-[var(--muted)]">
          Loading training view…
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const pages: Record<string, React.ReactNode> = {
    "/": <Dashboard />,
    "/workouts": <Workouts />,
    "/exercises": <Exercises />,
    "/goals": <Goals />,
    "/suggested": <Suggested />,
    "/nutrition": <Nutrition />,
    "/notes": <Notes />,
    "/add": <AddWorkout />,
    "/add-nutrition": <AddNutrition />,
    "/settings": <Settings />,
  };

  return (
    <AppStateProvider>
      <AppShell>
        <Suspense fallback={<PageLoading />}>
          {pages[pathname] ?? <Navigate to="/" replace />}
        </Suspense>
      </AppShell>
    </AppStateProvider>
  );
}
