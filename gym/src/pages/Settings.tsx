import {
  AlertTriangle,
  Check,
  Clipboard,
  Database,
  Download,
  FileJson,
  FileText,
  HardDrive,
  Info,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useRef, useState } from "react";

import { Badge, PageHeader, SectionHeading, Surface } from "../components/ui";
import { goals as seedGoals } from "../data/goals";
import { creatineNotice } from "../data/nutrition";
import {
  exportAllMarkdown,
  nutritionEntriesToMarkdown,
  workoutsToMarkdown,
} from "../lib/markdownExport";
import { exportDataAsJson, SCHEMA_VERSION, type PersistedGymData } from "../lib/storage";
import { useAppState } from "../state/AppState";

function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Settings() {
  const {
    workouts,
    nutritionEntries,
    localData,
    recoveredFromInvalidData,
    storageError,
    importLocalData,
    replaceLocalData,
    clearAllLocalData,
  } = useAppState();
  const fileInput = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [acknowledged, setAcknowledged] = useState(
    localData.settings.creatineNoticeAcknowledged === true,
  );
  const [creatineTarget, setCreatineTarget] = useState<number | undefined>(
    typeof localData.settings.creatineTargetG === "number"
      ? localData.settings.creatineTargetG
      : undefined,
  );

  const combinedData: PersistedGymData = {
    ...localData,
    workouts,
    nutritionEntries,
    goals: localData.goals.length ? localData.goals : seedGoals,
  };

  function saveSettings() {
    replaceLocalData({
      ...localData,
      settings: {
        ...localData.settings,
        creatineNoticeAcknowledged: acknowledged,
        creatineTargetG: acknowledged ? creatineTarget : undefined,
      },
    });
    setMessage("Settings saved in this browser.");
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(exportAllMarkdown(combinedData));
    setMessage("All Markdown copied.");
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setError(undefined);
    setMessage(undefined);
    try {
      const text = await file.text();
      const parsed = importLocalData(text);
      setMessage(
        `Backup restored: ${parsed.workouts.length} workouts and ${parsed.nutritionEntries.length} nutrition entries.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "The backup could not be restored.",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Data vault"
        title="Back up what belongs to you."
        description="Your new entries live in this browser. Export them before changing devices, clearing storage, or relying on them long-term."
      />

      {(recoveredFromInvalidData || storageError) && (
        <Surface className="mb-5 flex items-start gap-3 border-[color-mix(in_srgb,var(--danger)_35%,var(--line))] bg-red-500/8 p-4">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[var(--danger)]" />
          <div>
            <p className="text-sm font-extrabold">Local data needs attention</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              {storageError ??
                "Invalid browser data was ignored so the seeded history could still load. Restore a known-good backup if available."}
            </p>
          </div>
        </Surface>
      )}

      <section className="grid gap-4 lg:grid-cols-3">
        <Surface className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Local workouts</p>
              <p className="mt-3 text-4xl font-black tracking-[-0.055em]">
                {localData.workouts.length}
              </p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--surface-soft)]">
              <HardDrive size={18} />
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            {workouts.length} workouts including committed seed history.
          </p>
        </Surface>
        <Surface className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Local nutrition</p>
              <p className="mt-3 text-4xl font-black tracking-[-0.055em]">
                {localData.nutritionEntries.length}
              </p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--surface-soft)]">
              <Database size={18} />
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            Dated entries only; undated observations remain in seed data.
          </p>
        </Surface>
        <Surface className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="eyebrow">Schema</p>
              <p className="mt-3 text-4xl font-black tracking-[-0.055em]">
                v{SCHEMA_VERSION}
              </p>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--acid-soft)]">
              <ShieldCheck size={18} />
            </span>
          </div>
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
            Versioned import with validation and migration support.
          </p>
        </Surface>
      </section>

      <section className="mt-7">
        <SectionHeading
          title="Export & restore"
          description="JSON is the complete machine-readable backup. Markdown is the review-and-commit format."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <Surface className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--accent-ink)]">
                <FileJson size={18} />
              </span>
              <div>
                <h3 className="text-sm font-extrabold">JSON backup</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Best for complete restore
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="button-primary text-xs"
                onClick={() =>
                  downloadText(
                    `gym-local-backup-${today()}.json`,
                    exportDataAsJson(localData),
                    "application/json",
                  )
                }
              >
                <Download size={15} /> Local-only backup
              </button>
              <button
                type="button"
                className="button-secondary text-xs"
                onClick={() =>
                  downloadText(
                    `gym-complete-snapshot-${today()}.json`,
                    exportDataAsJson(combinedData),
                    "application/json",
                  )
                }
              >
                <Download size={15} /> Full snapshot
              </button>
              <button
                type="button"
                className="button-secondary text-xs sm:col-span-2"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={15} /> Restore local backup
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={(event) => void importFile(event.target.files?.[0])}
              />
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl bg-[var(--surface-soft)] p-3">
              <Info size={14} className="mt-0.5 shrink-0" />
              <p className="text-[0.68rem] leading-5 text-[var(--muted)]">
                A malformed import fails before replacing valid browser data. Restoring a
                valid backup replaces the local entries in this browser.
              </p>
            </div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--surface-soft)]">
                <FileText size={18} />
              </span>
              <div>
                <h3 className="text-sm font-extrabold">Markdown export</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Readable and ready to commit
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                className="button-primary text-xs"
                onClick={copyMarkdown}
              >
                <Clipboard size={15} /> Copy all Markdown
              </button>
              <button
                type="button"
                className="button-secondary text-xs"
                onClick={() =>
                  downloadText(
                    `gym-workouts-${today()}.md`,
                    workoutsToMarkdown(workouts),
                    "text/markdown",
                  )
                }
              >
                <Download size={15} /> Workouts
              </button>
              <button
                type="button"
                className="button-secondary text-xs sm:col-span-2"
                onClick={() =>
                  downloadText(
                    `gym-nutrition-${today()}.md`,
                    nutritionEntriesToMarkdown(nutritionEntries),
                    "text/markdown",
                  )
                }
              >
                <Download size={15} /> Nutrition
              </button>
            </div>
            <p className="mt-4 text-[0.68rem] leading-5 text-[var(--muted)]">
              When you send me your next daily workout, I’ll add it to LOGS.md and the
              structured seed data, rerun the checks, and push the updated site to main.
            </p>
          </Surface>
        </div>
      </section>

      <section className="mt-7 grid gap-4 xl:grid-cols-2">
        <div>
          <SectionHeading
            title="Creatine plan"
            description="A personal target can only be stored after you acknowledge the neutral dose context."
          />
          <Surface className="p-5">
            <Badge tone="warm">{creatineNotice.reportedDose} reported</Badge>
            <p className="mt-3 text-xs leading-6 text-[var(--muted)]">
              {creatineNotice.message} {creatineNotice.safety}
            </p>
            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] p-3">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-1"
              />
              <span className="text-xs leading-5">
                I understand this is background information, not personalized medical
                dosing.
              </span>
            </label>
            <label className="mt-4 block">
              <span className="label">Personal target (g/day)</span>
              <input
                className="field"
                type="number"
                min="0"
                step="0.1"
                disabled={!acknowledged}
                value={creatineTarget ?? ""}
                onChange={(event) =>
                  setCreatineTarget(
                    event.target.value === "" ? undefined : Number(event.target.value),
                  )
                }
                placeholder={acknowledged ? "Optional" : "Acknowledge notice first"}
              />
            </label>
            <button
              type="button"
              className="button-primary mt-4 text-xs"
              onClick={saveSettings}
            >
              <Check size={14} /> Save preference
            </button>
          </Surface>
        </div>

        <div>
          <SectionHeading
            title="Reset local data"
            description="Committed history stays; browser-created entries are removed."
          />
          <Surface className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" />
              <div>
                <p className="text-sm font-extrabold">This cannot be undone here</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Export a JSON backup first. Clearing removes local workouts, nutrition,
                  notes, goals, and preferences from this browser.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="button-danger mt-5 text-xs"
              onClick={() => {
                if (
                  window.confirm(
                    "Permanently clear all local gym data from this browser? Export a backup first if you may need it.",
                  )
                ) {
                  clearAllLocalData();
                  setMessage("Local browser data cleared.");
                }
              }}
            >
              <RotateCcw size={14} /> Clear local data
            </button>
          </Surface>
        </div>
      </section>

      {message || error ? (
        <div
          className={
            error
              ? "fixed bottom-24 right-4 z-50 max-w-sm rounded-2xl border border-red-500/30 bg-[var(--surface-raised)] p-4 text-sm font-bold text-[var(--danger)] shadow-2xl lg:bottom-6"
              : "fixed bottom-24 right-4 z-50 max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--surface-raised)] p-4 text-sm font-bold shadow-2xl lg:bottom-6"
          }
          role="status"
        >
          {error ?? message}
        </div>
      ) : null}
    </>
  );
}
