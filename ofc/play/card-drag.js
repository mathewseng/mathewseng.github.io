(function (root) {
  "use strict";

  class OFCCardDrag {
    constructor(element, options) {
      this.options = options;
      this.drag = null;
      this.blockUntil = 0;
      element.addEventListener("pointerdown", (event) => this.start(event));
      element.addEventListener("dragstart", (event) => event.preventDefault());
      element.addEventListener("click", (event) => {
        if (performance.now() < this.blockUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
      }, true);
      document.addEventListener("pointermove", (event) => this.move(event), { passive: false });
      document.addEventListener("pointerup", (event) => this.finish(event));
      document.addEventListener("pointercancel", () => this.cancel());
      window.addEventListener("blur", () => this.cancel());
    }

    start(event) {
      this.blockUntil = 0;
      const source = event.target.closest("[data-card-id]");
      if (this.drag || event.button !== 0 || !source || !this.options.canDrag(source.dataset.cardId)) return;
      this.drag = { source, id: source.dataset.cardId, pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      source.setPointerCapture(event.pointerId);
    }

    move(event) {
      const drag = this.drag;
      if (!drag || drag.dropping || drag.pointerId !== event.pointerId) return;
      if (!drag.ghost && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      event.preventDefault();
      if (!drag.ghost) {
        const rect = drag.source.getBoundingClientRect();
        const ghost = drag.source.cloneNode(true);
        ghost.removeAttribute("data-card-id");
        ghost.setAttribute("aria-hidden", "true");
        ghost.classList.add("card-drag-ghost");
        ghost.style.width = rect.width + "px";
        ghost.style.height = rect.height + "px";
        for (const selector of [".card-rank", ".card-suit"]) {
          ghost.querySelector(selector).style.fontSize = getComputedStyle(drag.source.querySelector(selector)).fontSize;
        }
        document.body.append(ghost);
        drag.ghost = ghost;
        drag.source.classList.add("drag-source-hidden");
        drag.lift = ghost.animate([{ transform: "translate(-50%, -50%) scale(1)" }, { transform: "translate(-50%, -50%) scale(1.5)" }], { duration: 250, easing: "ease-in-out", fill: "forwards" });
      }
      // Pointer tracking has no transition; only pickup and drop are animated.
      drag.ghost.style.left = event.clientX + "px";
      drag.ghost.style.top = event.clientY + "px";
      drag.over?.classList.remove("drag-over");
      const target = document.elementFromPoint(event.clientX, event.clientY);
      drag.over = target?.closest("[data-row], #draw-cards");
      if (this.options.resolve(target, drag.id)) drag.over?.classList.add("drag-over");
    }

    finish(event) {
      const drag = this.drag;
      if (!drag || drag.dropping || drag.pointerId !== event.pointerId) return;
      if (!drag.ghost) { this.cancel(); return; }
      event.preventDefault();
      this.blockUntil = performance.now() + 550;
      const destination = this.options.resolve(document.elementFromPoint(event.clientX, event.clientY), drag.id);
      const rect = destination?.rect || drag.source.getBoundingClientRect();
      drag.over?.classList.remove("drag-over");
      const transform = getComputedStyle(drag.ghost).transform;
      drag.lift.cancel();
      drag.dropping = true;
      const animation = drag.ghost.animate([
        { left: drag.ghost.style.left, top: drag.ghost.style.top, width: drag.ghost.style.width, height: drag.ghost.style.height, transform },
        { left: rect.left + rect.width / 2 + "px", top: rect.top + rect.height / 2 + "px", width: rect.width + "px", height: rect.height + "px", transform: "translate(-50%, -50%) scale(1)" },
      ], { duration: 250, easing: "ease-in-out", fill: "forwards" });
      animation.finished.then(() => {
        if (this.drag !== drag) return;
        this.cancel();
        if (destination) this.options.drop(drag.id, destination.target);
      }).catch(() => this.cancel());
    }

    cancel() {
      const drag = this.drag;
      if (!drag) return;
      drag.over?.classList.remove("drag-over");
      drag.source.classList.remove("drag-source-hidden");
      if (drag.source.hasPointerCapture(drag.pointerId)) drag.source.releasePointerCapture(drag.pointerId);
      drag.ghost?.remove();
      this.drag = null;
    }
  }
  root.OFCCardDrag = OFCCardDrag;
})(window);
