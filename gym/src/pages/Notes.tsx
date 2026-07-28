import {
  Activity,
  AlertTriangle,
  BarChart3,
  CircleAlert,
  Dumbbell,
  HeartPulse,
  NotebookText,
  ShieldCheck,
  Wrench,
} from "lucide-react";

import { Badge, PageHeader, Surface } from "../components/ui";
import { trainingNotes } from "../data/notes";

const icons = {
  equipment: Wrench,
  "exercise-standard": ShieldCheck,
  programming: BarChart3,
  recovery: HeartPulse,
  "data-quality": CircleAlert,
  safety: AlertTriangle,
};

const tones = {
  equipment: "neutral",
  "exercise-standard": "accent",
  programming: "accent",
  recovery: "warm",
  "data-quality": "quality",
  safety: "danger",
} as const;

export default function Notes() {
  return (
    <>
      <PageHeader
        eyebrow="Source-of-truth notes"
        title="Standards, context, and caveats"
        description="The details that make a number comparable—or tell you when it should not be compared at all."
      />

      <Surface
        raised
        className="mb-5 overflow-hidden bg-[var(--accent)] p-5 text-[var(--accent-ink)] sm:p-6"
      >
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-3xl">
            <Badge className="!border-white/15 !bg-white/10 !text-current">
              <NotebookText size={12} /> Living reference
            </Badge>
            <h2 className="mt-4 text-2xl font-black tracking-[-0.04em]">
              Good tracking remembers the setup.
            </h2>
            <p className="mt-2 text-sm leading-6 opacity-75">
              A 95 lb Smith bench, a free-weight barbell bench, and a different Smith
              machine are not automatically the same record. These notes preserve the
              conditions around the work.
            </p>
          </div>
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/10">
            <Dumbbell size={24} />
          </span>
        </div>
      </Surface>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {trainingNotes.map((note) => {
          const Icon = icons[note.category];
          return (
            <Surface key={note.id} as="article" className="p-5">
              <div className="flex items-start justify-between gap-3">
                <Badge tone={tones[note.category]}>
                  {note.category.replaceAll("-", " ")}
                </Badge>
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--surface-soft)]">
                  <Icon size={16} />
                </span>
              </div>
              <h2 className="mt-5 text-lg font-black tracking-[-0.025em]">
                {note.title}
              </h2>
              <ul className="mt-4 space-y-3">
                {note.points.map((point) => (
                  <li
                    key={point}
                    className="flex items-start gap-2.5 text-xs leading-5 text-[var(--muted)]"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]" />
                    {point}
                  </li>
                ))}
              </ul>
            </Surface>
          );
        })}
      </div>

      <Surface className="mt-5 flex items-start gap-3 border-dashed p-5">
        <Activity size={17} className="mt-0.5 shrink-0 text-[var(--orange)]" />
        <p className="text-xs leading-5 text-[var(--muted)]">
          Stop an exercise for sharp pain. Seek qualified medical care for persistent or
          worsening back pain, radiating pain, numbness, weakness, loss of coordination,
          chest pain, fainting, severe shortness of breath, or other concerning symptoms.
        </p>
      </Surface>
    </>
  );
}
