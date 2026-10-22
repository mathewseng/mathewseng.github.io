// Keep project dates tied to their source history, including dates carried over
// from imported repositories. The catalog itself is not a project source.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

function calendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
}

function authorDate(value) {
  // Git's %aI is an ISO timestamp with an explicit timezone. Do not use its
  // first ten characters: commits near midnight may have a different UTC day.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : null;
}

function localPath(value) {
  return typeof value === "string" && value.trim() && !/^[a-z][a-z\d+.-]*:/i.test(value)
    ? value.replace(/^\/+/, "").split(/[?#]/, 1)[0]
    : null;
}

function defaultHistoryPath(project) {
  const path = localPath(project.path);
  if (!path) return null;
  return path.endsWith("/") ? `${path}index.html` : path;
}

/** Trace a project's primary file through renames, but not into a copied
 * template's history. Returns its earliest recorded UTC day or undefined.
 */
export function getCreationDate(path, { root = repositoryRoot } = {}) {
  const file = localPath(path);
  if (!file) return undefined;
  let log;
  try {
    log = execFileSync("git", ["log", "--follow", "--format=%x1e%aI", "--name-status", "-z", "--", `:(literal)${file}`], {
      cwd: resolve(root), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    return undefined;
  }
  const dates = [];
  for (const record of log.split("\x1e").slice(1)) {
    const fields = record.split("\0");
    const date = authorDate(fields[0]);
    if (date) dates.push(date);
    let copied = false;
    // -z keeps status fields distinct from filenames (including whitespace).
    // A copy records two paths; a rename records two paths but stays in this
    // project's ancestry. Include the copy commit before ending the trace.
    for (let index = 1; index < fields.length;) {
      const status = fields[index++].trim();
      if (!status) continue;
      if (/^C\d*$/.test(status)) copied = true;
      index += /^[CR]\d*$/.test(status) ? 2 : 1;
    }
    if (copied) break;
  }
  return dates.sort()[0];
}

/** Return a catalog with dates refreshed from the available committed history.
 * Existing/origin dates are retained when history is shallow, unavailable or
 * not yet committed. No filesystem timestamps or wall-clock time are used.
 */
export function updateProjectDates(map, { root = repositoryRoot } = {}) {
  const cache = new Map();
  const creationCache = new Map();
  function history(paths, follow = false) {
    if (!paths.length) return [];
    const args = ["log", ...(follow ? ["--follow"] : []), "--format=%aI", "--", ...paths.map((path) => `:(literal)${path}`)];
    const key = JSON.stringify(args);
    if (cache.has(key)) return cache.get(key);
    let dates = [];
    try {
      dates = execFileSync("git", args, {
        cwd: resolve(root), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024,
      }).trim().split("\n").map(authorDate).filter(Boolean);
    } catch {
      // An empty repo or a source archive has no usable history. Its explicit
      // seed dates are still meaningful, as are seeds older than a shallow clone.
    }
    cache.set(key, dates);
    return dates;
  }

  return {
    ...map,
    projects: (map.projects || []).map((project) => {
      const historyPath = localPath(project.historyPath) || defaultHistoryPath(project);
      const sourcePaths = [...new Set((project.sourcePaths || []).map(localPath).filter(Boolean))];
      const createdDates = [project.created, project.origin?.created].map(calendarDate).filter(Boolean);
      if (historyPath && !creationCache.has(historyPath)) creationCache.set(historyPath, getCreationDate(historyPath, { root }));
      const creationDate = creationCache.get(historyPath);
      // --follow can omit a file introduced by a merge. Fall back to the
      // declared project history only when primary-file history is unavailable.
      createdDates.push(...(creationDate ? [creationDate] : history(sourcePaths)));
      const created = createdDates.sort()[0];
      const updatedDates = [project.updated, project.origin?.updated, created].map(calendarDate).filter(Boolean);
      updatedDates.push(...history(sourcePaths));
      const updated = updatedDates.sort().at(-1);
      return { ...project, ...(created ? { created } : {}), ...(updated ? { updated } : {}) };
    }),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const filename = resolve(repositoryRoot, "shared/site-map.json");
  const catalog = JSON.parse(readFileSync(filename, "utf8"));
  const next = `${JSON.stringify(updateProjectDates(catalog), null, 2)}\n`;
  if (readFileSync(filename, "utf8") !== next) writeFileSync(filename, next);
}
