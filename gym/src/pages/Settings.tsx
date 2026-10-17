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

import { useConfirm } from "../components/confirm";
import { useToast } from "../components/toast";
import {
  Badge,
  Button,
  MetricCard,
  PageHeader,
  SectionHeading,
  Surface,
} from "../components/ui";
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
  const toast = useToast();
  const confirm = useConfirm();
  const fileInput = useRef<HTMLInputElement>(null);
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
    toast("Settings saved in this browser.", "good");
  }

  async function copyMarkdown() {
    try {
      await navigator.clipboard.writeText(exportAllMarkdown(combinedData));
      toast("All Markdown copied.", "good");
    } catch {
      toast("The clipboard is not available; download the Markdown instead.", "alert");
    }
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = importLocalData(text);
      toast(
        `Backup restored: ${parsed.workouts.length} workouts and ${parsed.nutritionEntries.length} nutrition entries.`,
        "good",
      );
    } catch (caught) {
      toast(
        caught instanceof Error ? caught.message : "The backup could not be restored.",
        "alert",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function clearData() {
    const confirmed = await confirm({
      title: "Clear all local gym data?",
      description:
        "Local workouts, nutrition, notes, goals and preferences are removed from this browser. Committed history stays. Export a backup first if you may need it.",
      confirmLabel: "Clear local data",
      tone: "danger",
    });
    if (!confirmed) return;
    clearAllLocalData();
    toast("Local browser data cleared.");
  }

  return (
    <>
      <PageHeader
        eyebrow="Data vault"
        title="Data & settings"
        description="New entries live in this browser. Export them before changing devices, clearing storage, or relying on them long-term."
      />

      {(recoveredFromInvalidData || storageError) && (
        <Surface className="surface-danger mb-5 flex items-start gap-3 p-4">
          <AlertTriangle
            size={17}
            className="mt-0.5 shrink-0 text-[var(--bad)]"
            aria-hidden="true"
          />
          <div>
            <p className="text-sm font-bold">Local data needs attention</p>
            <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
              {storageError ??
                "Invalid browser data was ignored so the seeded history could still load. Restore a known-good backup if available."}
            </p>
          </div>
        </Surface>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard
          label="Local workouts"
          value={`${localData.workouts.length}`}
          detail={`${workouts.length} workouts including committed seed history.`}
          icon={HardDrive}
        />
        <MetricCard
          label="Local nutrition"
          value={`${localData.nutritionEntries.length}`}
          detail="Dated entries only; undated observations remain in seed data."
          icon={Database}
        />
        <MetricCard
          label="Schema"
          value={`v${SCHEMA_VERSION}`}
          detail="Versioned import with validation and migration support."
          icon={ShieldCheck}
          accent="var(--accent-soft)"
        />
      </section>

      <section className="mt-7">
        <SectionHeading
          title="Export & restore"
          description="JSON is the complete machine-readable backup. Markdown is the review-and-commit format."
        />
        <div className="grid gap-4 xl:grid-cols-2">
          <Surface className="p-5">
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 place-items-center rounded-md bg-[var(--accent)] text-[var(--on-accent)]"
                aria-hidden="true"
              >
                <FileJson size={18} />
              </span>
              <div>
                <h3 className="text-sm font-bold">JSON backup</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Best for complete restore
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button
                variant="primary"
                onClick={() =>
                  downloadText(
                    `gym-local-backup-${today()}.json`,
                    exportDataAsJson(localData),
                    "application/json",
                  )
                }
              >
                <Download size={15} aria-hidden="true" /> Local-only backup
              </Button>
              <Button
                onClick={() =>
                  downloadText(
                    `gym-complete-snapshot-${today()}.json`,
                    exportDataAsJson(combinedData),
                    "application/json",
                  )
                }
              >
                <Download size={15} aria-hidden="true" /> Full snapshot
              </Button>
              <Button
                className="sm:col-span-2"
                onClick={() => fileInput.current?.click()}
              >
                <Upload size={15} aria-hidden="true" /> Restore local backup
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                aria-label="Backup file to restore"
                onChange={(event) => void importFile(event.target.files?.[0])}
              />
            </div>
            <div className="well mt-4 flex items-start gap-2 p-3">
              <Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <p className="text-xs leading-5 text-[var(--muted)]">
                A malformed import fails before replacing valid browser data. Restoring a
                valid backup replaces the local entries in this browser.
              </p>
            </div>
          </Surface>

          <Surface className="p-5">
            <div className="flex items-center gap-3">
              <span
                className="grid h-10 w-10 place-items-center rounded-md bg-[var(--surface-3)]"
                aria-hidden="true"
              >
                <FileText size={18} />
              </span>
              <div>
                <h3 className="text-sm font-bold">Markdown export</h3>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  Readable and ready to commit
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button variant="primary" onClick={copyMarkdown}>
                <Clipboard size={15} aria-hidden="true" /> Copy all Markdown
              </Button>
              <Button
                onClick={() =>
                  downloadText(
                    `gym-workouts-${today()}.md`,
                    workoutsToMarkdown(workouts),
                    "text/markdown",
                  )
                }
              >
                <Download size={15} aria-hidden="true" /> Workouts
              </Button>
              <Button
                className="sm:col-span-2"
                onClick={() =>
                  downloadText(
                    `gym-nutrition-${today()}.md`,
                    nutritionEntriesToMarkdown(nutritionEntries),
                    "text/markdown",
                  )
                }
              >
                <Download size={15} aria-hidden="true" /> Nutrition
              </Button>
            </div>
            <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
              The Markdown export matches the repository's LOGS.md format, so a day's
              entry can be committed as it is.
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
            <Badge tone="warn">{creatineNotice.reportedDose} reported</Badge>
            <p className="mt-3 text-xs leading-6 text-[var(--muted)]">
              {creatineNotice.message} {creatineNotice.safety}
            </p>
            <label className="check mt-4">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
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
            <Button variant="primary" className="mt-4" onClick={saveSettings}>
              <Check size={14} aria-hidden="true" /> Save preference
            </Button>
          </Surface>
        </div>

        <div>
          <SectionHeading
            title="Reset local data"
            description="Committed history stays; browser-created entries are removed."
          />
          <Surface className="p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle
                size={18}
                className="mt-0.5 shrink-0 text-[var(--bad)]"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-bold">This cannot be undone here</p>
                <p className="mt-1 text-xs leading-5 text-[var(--muted)]">
                  Export a JSON backup first. Clearing removes local workouts, nutrition,
                  notes, goals, and preferences from this browser.
                </p>
              </div>
            </div>
            <Button variant="danger" className="mt-5" onClick={() => void clearData()}>
              <RotateCcw size={14} aria-hidden="true" /> Clear local data
            </Button>
          </Surface>
        </div>
      </section>
    </>
  );
}
