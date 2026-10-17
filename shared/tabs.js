// Shared tab bar behaviour for the .tabs component in shared/app.css.
// Lifted from the OFC Fantasyland EV page's section tabs.
//
// Classic script: exposes window.Tabs (and module.exports in Node).
//
//   const tabs = Tabs.init(document.getElementById("view-tabs"), {
//     storageKey: "poker.dodge.view",  // optional localStorage key
//     hash: true,                      // optional: mirror the tab id in location.hash
//     onChange(id, tab) {},            // optional: called after a tab activates
//   });
//   tabs.activate("analysis");         // programmatic selection
//   tabs.current                       // the active tab id
//
// Markup: a container with role="tablist" holding buttons with role="tab",
// aria-selected and aria-controls="<panel id>"; each panel has role="tabpanel"
// and the hidden attribute when inactive. A tab's id is its data-tab value,
// else the panel id it controls, else its own id. Arrow keys, Home and End
// move between tabs; the sliding underline is positioned through the
// --tab-left / --tab-width custom properties on the tablist.
(function (root) {
  "use strict";

  function tabId(tab) {
    return tab.dataset.tab || tab.getAttribute("aria-controls") || tab.id;
  }

  function readStorage(key) {
    if (!key) return null;
    try {
      return root.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    if (!key) return;
    try {
      root.localStorage.setItem(key, value);
    } catch (error) {
      // Storage may be unavailable; the hash (if used) still carries the tab.
    }
  }

  function init(tablist, options = {}) {
    if (!tablist) return null;
    const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return null;
    const ids = tabs.map(tabId);
    const doc = tablist.ownerDocument;
    const state = { current: null };

    function panelFor(tab) {
      const id = tab.getAttribute("aria-controls");
      return id ? doc.getElementById(id) : null;
    }

    function moveIndicator(tab) {
      if (!tab || !tab.offsetParent) return;
      tablist.style.setProperty("--tab-left", tab.offsetLeft + "px");
      tablist.style.setProperty("--tab-width", tab.offsetWidth + "px");
      tablist.classList.add("has-indicator");
    }

    function activate(id, { persist = true, focus = false } = {}) {
      if (!ids.includes(id)) id = ids[0];
      state.current = id;
      let active = null;
      tabs.forEach((tab, index) => {
        const on = ids[index] === id;
        tab.setAttribute("aria-selected", String(on));
        tab.tabIndex = on ? 0 : -1;
        tab.classList.toggle("active", on);
        const panel = panelFor(tab);
        if (panel) panel.hidden = !on;
        if (on) active = tab;
      });
      moveIndicator(active);
      if (focus && active) active.focus();
      if (active && typeof active.scrollIntoView === "function" && tablist.scrollWidth > tablist.clientWidth) {
        active.scrollIntoView({ block: "nearest", inline: "nearest" });
      }
      if (persist) {
        if (options.hash) {
          if (root.history && root.history.replaceState) root.history.replaceState(null, "", "#" + id);
          else root.location.hash = id;
        }
        writeStorage(options.storageKey, id);
      }
      if (typeof options.onChange === "function") options.onChange(id, active);
      return id;
    }

    function fromHash() {
      if (!options.hash) return null;
      const value = decodeURIComponent(root.location.hash.replace(/^#/, ""));
      return ids.includes(value) ? value : null;
    }

    function restore() {
      const hash = fromHash();
      if (hash) return hash;
      const saved = readStorage(options.storageKey);
      if (ids.includes(saved)) return saved;
      const selected = tabs.find((tab) => tab.getAttribute("aria-selected") === "true");
      return selected ? tabId(selected) : ids[0];
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(ids[index], { persist: true }));
    });

    tablist.addEventListener("keydown", (event) => {
      const index = tabs.indexOf(doc.activeElement);
      if (index < 0) return;
      const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      const target =
        event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : step ? (index + step + tabs.length) % tabs.length : -1;
      if (target < 0) return;
      event.preventDefault();
      activate(ids[target], { persist: true, focus: true });
    });

    if (options.hash) {
      root.addEventListener("hashchange", () => {
        const id = fromHash();
        if (id && id !== state.current) activate(id, { persist: false });
      });
    }

    const relayout = () => moveIndicator(tabs[ids.indexOf(state.current)]);
    root.addEventListener("resize", relayout);
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(relayout).catch(() => {});

    activate(restore(), { persist: false });

    return {
      activate: (id) => activate(id, { persist: true }),
      get current() {
        return state.current;
      },
      tabs,
      relayout,
    };
  }

  const api = { init };
  root.Tabs = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
