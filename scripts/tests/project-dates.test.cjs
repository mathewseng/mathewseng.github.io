const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, dirname } = require("node:path");

const updater = import("../update-project-dates.mjs");

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), "project-dates-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  function git(args, env = {}) {
    return execFileSync("git", args, {
      cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    }).trim();
  }
  git(["init", "--quiet"]);
  git(["config", "user.name", "Project dates test"]);
  git(["config", "user.email", "project-dates@example.invalid"]);
  function write(path, content) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  function commit(date) {
    git(["add", "."]);
    git(["-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "Update fixture"], {
      GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
    });
  }
  return { root, git, write, commit };
}

test("creation follows renamed pages and updates use the newest UTC author day", async (t) => {
  const { updateProjectDates } = await updater;
  const repo = repository(t);
  repo.write("old-tool/index.html", "Original project\n");
  repo.commit("2020-01-01T23:30:00-05:00");
  repo.git(["mv", "old-tool", "tool"]);
  repo.commit("2021-02-03T12:00:00+00:00");
  repo.write("tool/app.js", "console.log('new feature');\n");
  repo.commit("2022-03-04T00:30:00+09:00");
  // An authored-in-the-past commit comes later in history. The newest content
  // date must be the maximum author date, not simply git log -1.
  repo.write("tool/styles.css", "body { display: block; }\n");
  repo.commit("2021-12-01T12:00:00+00:00");
  const catalog = { title: "Projects", projects: [{ name: "Tool", path: "/tool/", sourcePaths: ["tool/"] }] };
  const result = updateProjectDates(catalog, { root: repo.root });
  assert.equal(result.projects[0].created, "2020-01-02");
  assert.equal(result.projects[0].updated, "2022-03-03");
  assert.equal(result.title, catalog.title);
  assert.equal(catalog.projects[0].created, undefined, "the caller's catalog is not mutated");
  assert.deepEqual(updateProjectDates(result, { root: repo.root }), result, "refresh is deterministic");
});

test("imported creation dates survive import commits and later local changes", async (t) => {
  const { updateProjectDates } = await updater;
  const repo = repository(t);
  repo.write("poker/tool/index.html", "Imported app\n");
  repo.commit("2026-10-22T12:00:00+00:00");
  const origin = { repository: "owner/source", commit: "import-source", paths: ["old-tool/"], created: "2018-06-12", updated: "2024-04-03" };
  const catalog = { projects: [{ path: "/poker/tool/", sourcePaths: ["poker/tool/"], created: "2026-10-22", updated: "2026-10-22", origin }] };
  const imported = updateProjectDates(catalog, { root: repo.root });
  assert.equal(imported.projects[0].created, "2018-06-12");
  assert.equal(imported.projects[0].updated, "2026-10-22");
  repo.write("poker/tool/app.js", "Updated app\n");
  repo.commit("2026-10-24T12:00:00+00:00");
  const updated = updateProjectDates(imported, { root: repo.root });
  assert.equal(updated.projects[0].created, "2018-06-12");
  assert.equal(updated.projects[0].updated, "2026-10-24");
  assert.deepEqual(updated.projects[0].origin, origin);
});

test("catalog-only changes do not advance project dates", async (t) => {
  const { updateProjectDates } = await updater;
  const repo = repository(t);
  repo.write("tool/index.html", "App\n");
  repo.commit("2023-04-05T12:00:00+00:00");
  const catalog = { projects: [{ path: "/tool/", sourcePaths: ["tool/"] }] };
  const before = updateProjectDates(catalog, { root: repo.root });
  repo.write("shared/site-map.json", JSON.stringify(before));
  repo.commit("2026-10-22T12:00:00+00:00");
  assert.deepEqual(updateProjectDates(before, { root: repo.root }), before);
});

test("untracked imports and unavailable history preserve valid seed dates", async (t) => {
  const { updateProjectDates } = await updater;
  const repo = repository(t);
  repo.write("tool/index.html", "Not committed yet\n");
  const catalog = { projects: [{ path: "/tool/", sourcePaths: ["tool/"], created: "2019-03-04", updated: "2026-10-22" }] };
  assert.deepEqual(updateProjectDates(catalog, { root: repo.root }), catalog);
  rmSync(join(repo.root, ".git"), { recursive: true, force: true });
  assert.deepEqual(updateProjectDates(catalog, { root: repo.root }), catalog);
});

test("shallow history cannot replace an older stored creation date", async (t) => {
  const { updateProjectDates } = await updater;
  const repo = repository(t);
  repo.write("tool/index.html", "Version one\n");
  repo.commit("2018-01-02T12:00:00+00:00");
  repo.write("tool/index.html", "Version two\n");
  repo.commit("2025-01-02T12:00:00+00:00");
  // A shallow boundary accurately simulates checkout's truncated history
  // without a network clone or dependencies on the default branch name.
  writeFileSync(join(repo.root, ".git/shallow"), `${repo.git(["rev-parse", "HEAD"])}\n`);
  const result = updateProjectDates({ projects: [{ path: "/tool/", sourcePaths: ["tool/"], created: "2018-01-02", updated: "2024-01-01" }] }, { root: repo.root });
  assert.equal(result.projects[0].created, "2018-01-02");
  assert.equal(result.projects[0].updated, "2025-01-02");
});

test("external source-only projects use explicit history and multiple source paths", async (t) => {
  const { updateProjectDates } = await updater;
  const repo = repository(t);
  repo.write("python-project/main.py", "print('original')\n");
  repo.commit("2020-01-01T12:00:00+00:00");
  repo.write("python-project-data/data.txt", "data\n");
  repo.commit("2024-06-07T12:00:00+00:00");
  const result = updateProjectDates({ projects: [{ path: "https://github.com/owner/repo/tree/main/python-project", historyPath: "python-project/main.py", sourcePaths: ["python-project/", "python-project-data/"] }] }, { root: repo.root });
  assert.equal(result.projects[0].created, "2020-01-01");
  assert.equal(result.projects[0].updated, "2024-06-07");
});

test("creation falls back to source history for a file introduced during a merge", async (t) => {
  const { updateProjectDates } = await updater;
  const repo = repository(t);
  repo.write("base.txt", "Shared base\n");
  repo.commit("2020-01-01T12:00:00+00:00");
  const originalBranch = repo.git(["branch", "--show-current"]);
  repo.git(["checkout", "--quiet", "-b", "topic"]);
  repo.write("topic.txt", "Independent topic\n");
  repo.commit("2021-01-01T12:00:00+00:00");
  repo.git(["checkout", "--quiet", originalBranch]);
  repo.write("main.txt", "Independent main work\n");
  repo.commit("2022-01-01T12:00:00+00:00");
  repo.git(["merge", "--no-ff", "--no-commit", "topic"]);
  repo.write("python-project/main.py", "print('introduced during merge')\n");
  repo.commit("2023-01-01T12:00:00+00:00");
  assert.equal(repo.git(["log", "--follow", "--format=%aI", "--", "python-project/main.py"]), "", "the fixture exercises missing --follow history");
  const result = updateProjectDates({ projects: [{ path: "https://github.com/owner/repo/tree/main/python-project", historyPath: "python-project/main.py", sourcePaths: ["python-project/"] }] }, { root: repo.root });
  assert.equal(result.projects[0].created, "2023-01-01");
  assert.equal(result.projects[0].updated, "2023-01-01");
});

test("creation stops at a Git copy event but continues through subsequent renames", async (t) => {
  const { updateProjectDates, getCreationDate } = await updater;
  const repo = repository(t);
  const template = Array.from({ length: 100 }, (_, index) => `<p>Template content line ${index}</p>`).join("\n") + "\n";
  repo.write("template/index.html", template);
  repo.commit("2018-01-01T12:00:00+00:00");
  repo.write("tool/index.html", template);
  repo.write("template/index.html", `${template}<p>Template change</p>\n`);
  repo.commit("2022-03-10T12:00:00+00:00");
  repo.git(["mv", "tool", "renamed-tool"]);
  repo.commit("2023-01-01T12:00:00+00:00");
  repo.write("renamed-tool/index.html", `${template}<p>Project-specific feature</p>\n`);
  repo.commit("2024-01-01T12:00:00+00:00");
  const log = repo.git(["log", "--follow", "--format=%aI", "--name-status", "--", "renamed-tool/index.html"]);
  assert.match(log, /C\d+\s+template\/index\.html\s+tool\/index\.html/, "the fixture exercises a real Git-detected copy");
  assert.match(log, /R\d+\s+tool\/index\.html\s+renamed-tool\/index\.html/, "the fixture also exercises a real rename");
  assert.match(log, /2018-01-01/, "plain --follow includes the template's older ancestry");
  assert.equal(getCreationDate("renamed-tool/index.html", { root: repo.root }), "2022-03-10");
  const result = updateProjectDates({ projects: [{ path: "/renamed-tool/", sourcePaths: ["renamed-tool/"] }] }, { root: repo.root });
  assert.equal(result.projects[0].created, "2022-03-10", "a copied project starts at its copy commit");
  assert.equal(result.projects[0].updated, "2024-01-01");
});
