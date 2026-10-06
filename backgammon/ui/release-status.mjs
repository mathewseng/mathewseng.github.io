// SPDX-License-Identifier: GPL-3.0-or-later
// Compare the loaded release's cached response with a fresh HEAD request.
// HEAD bypasses the GET-only offline handler; never mistake a cached GET for
// evidence of what GitHub Pages currently publishes. No storage is changed.
export function releaseHeaders(response) {
  if (!response?.ok) return null;
  const date = Date.parse(response.headers.get("last-modified") || "");
  return {
    date: Number.isFinite(date) ? new Date(date).toISOString() : null,
    etag: response.headers.get("etag") || null,
  };
}
export function releaseComparison(installed, published) {
  if (!published) return "offline";
  if (!installed) return "unknown";
  if (installed.etag && published.etag)
    return installed.etag === published.etag ? "current" : "available";
  if (installed.date && published.date && published.date > installed.date)
    return "available";
  return "unknown";
}
export async function readReleaseStatus({
  version,
  pageURL,
  cacheStorage,
  fetcher = fetch,
  signal,
}) {
  let installed = null,
    published = null;
  const page = new URL(pageURL);
  page.search = "";
  page.hash = "";
  if (page.pathname.endsWith("/")) page.pathname += "index.html";
  const cacheName = `backgammon-assets-${version}`;
  try {
    if (version && (await cacheStorage?.keys())?.includes(cacheName)) {
      const cache = await cacheStorage.open(cacheName);
      installed = releaseHeaders(await cache.match(page.href));
    }
  } catch {
    /* Private browsing or disabled storage: do not invent a date. */
  }
  page.searchParams.set("bg-update-check", Date.now());
  try {
    published = releaseHeaders(
      await fetcher(page, {
        method: "HEAD",
        cache: "no-store",
        signal,
      }),
    );
  } catch {
    /* Cached release information remains useful offline. */
  }
  return {
    version,
    installed,
    published,
    state: releaseComparison(installed, published),
  };
}
export function releaseStatus() {
  const node = (tag, text, attrs = {}) => {
    const n = document.createElement(tag);
    n.textContent = text;
    for (const [key, value] of Object.entries(attrs))
      n.setAttribute(key, value);
    return n;
  };
  const source = document.querySelector('[src*="?bgv="], [href*="?bgv="]');
  const candidate =
    source &&
    new URL(
      source.getAttribute("src") || source.getAttribute("href"),
      location.href,
    ).searchParams.get("bgv");
  const version = /^[a-f0-9]{16}$/.test(candidate || "") ? candidate : null;
  const section = node("section", "", {
    "aria-label": "App version and updates",
    class: "release-status",
  });
  section.style.cssText = "display:grid;gap:8px;margin-bottom:16px";
  const installed = node("p", "Installed update: checking…");
  const published = node("p", "Published update: checking…");
  const status = node("p", "Checking published files…", {
    role: "status",
    class: "muted small",
  });
  const check = node("button", "Check for updates", { type: "button" });
  const refresh = node("a", "Refresh app", {
    href: "/backgammon/refresh/",
  });
  const actions = node("div", "", { class: "row" });
  actions.append(check, refresh);
  section.append(
    node("h3", "App version"),
    installed,
    published,
    status,
    actions,
  );
  for (const child of section.children) child.style.margin = "0";
  refresh.style.padding = "10px 0";
  let controller,
    disposed = false;
  const dateLine = (target, label, value) => {
    target.replaceChildren(document.createTextNode(label + ": "));
    if (!value) {
      target.append("Date unavailable");
      return;
    }
    const time = node(
      "time",
      new Date(value).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "long",
      }),
      { datetime: value },
    );
    target.append(time);
  };
  async function update() {
    controller?.abort();
    controller = new AbortController();
    check.disabled = true;
    status.textContent = "Checking published files…";
    const timer = setTimeout(() => controller.abort(), 6000);
    const result = await readReleaseStatus({
      version,
      pageURL: location.href,
      cacheStorage: globalThis.caches,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (disposed) return;
    dateLine(installed, "Installed update", result.installed?.date);
    dateLine(published, "Published update", result.published?.date);
    const messages = {
      current: "Up to date with the published site.",
      available:
        "Different files are published. Finish your game, then use Refresh app.",
      offline:
        "Couldn’t check the published site. Connect to the internet and try again.",
      unknown:
        "Couldn’t verify the installed version. Refresh app can install the published files.",
    };
    status.textContent = `${messages[result.state]}${version ? ` Version ${version}.` : ""}`;
    check.disabled = false;
  }
  check.onclick = update;
  section.dispose = () => {
    disposed = true;
    controller?.abort();
  };
  update();
  return section;
}
