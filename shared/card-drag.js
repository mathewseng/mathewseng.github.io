// Shared pointer drag for playing cards, promoted from ofc/play/card-drag.js.
// Drags a card out of any [data-card-id] element under `element` as a ghost
// that follows the pointer, highlights the drop target under it and animates
// the ghost into the drop position. Styles: .card-drag-ghost, .drag-over and
// .drag-source-hidden in shared/app.css.
//
// Classic script: exposes window.CardDrag (and module.exports in Node).
//
//   new CardDrag(container, {
//     canDrag(id) { return true; },                 // may this card move?
//     resolve(target, id) {                          // element under the pointer → drop target or null
//       const row = target?.closest("[data-row]");
//       return row ? { target: row, rect: row.getBoundingClientRect() } : null;
//     },
//     drop(id, target) {},                           // called after the drop animation
//     targets: "[data-row], [data-drop]",            // optional: selector for elements that take .drag-over
//   });
//
// A drag starts after the pointer moves 5px; clicks within 550ms of a drop are
// swallowed so the drop does not also count as a tap on the destination.
(function (root) {
  "use strict";

  class CardDrag {
    constructor(element, options) {
      this.options = Object.assign({ targets: "[data-drop], [data-row]" }, options);
      this.drag = null;
      this.blockUntil = 0;
      const doc = element.ownerDocument;
      element.addEventListener("pointerdown", (event) => this.start(event));
      element.addEventListener("dragstart", (event) => event.preventDefault());
      element.addEventListener(
        "click",
        (event) => {
          if (performance.now() < this.blockUntil) {
            event.preventDefault();
            event.stopImmediatePropagation();
          }
        },
        true,
      );
      doc.addEventListener("pointermove", (event) => this.move(event), { passive: false });
      doc.addEventListener("pointerup", (event) => this.finish(event));
      doc.addEventListener("pointercancel", () => this.cancel());
      root.addEventListener("blur", () => this.cancel());
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
        ghost.removeAttribute("id");
        ghost.setAttribute("aria-hidden", "true");
        ghost.classList.add("card-drag-ghost");
        // The shared card face scales with the card's own width, so the ghost only
        // needs the source card's size; the lift and drop animations scale the face too.
        ghost.style.setProperty("--card-width", rect.width + "px");
        ghost.style.width = rect.width + "px";
        ghost.style.height = rect.height + "px";
        drag.source.ownerDocument.body.append(ghost);
        drag.ghost = ghost;
        drag.source.classList.add("drag-source-hidden");
        drag.lift = ghost.animate(
          [{ transform: "translate(-50%, -50%) scale(1)" }, { transform: "translate(-50%, -50%) scale(1.5)" }],
          { duration: 250, easing: "ease-in-out", fill: "forwards" },
        );
      }
      // Pointer tracking has no transition; only pickup and drop are animated.
      drag.ghost.style.left = event.clientX + "px";
      drag.ghost.style.top = event.clientY + "px";
      if (drag.over) drag.over.classList.remove("drag-over");
      const target = drag.source.ownerDocument.elementFromPoint(event.clientX, event.clientY);
      drag.over = target ? target.closest(this.options.targets) : null;
      if (this.options.resolve(target, drag.id) && drag.over) drag.over.classList.add("drag-over");
    }

    finish(event) {
      const drag = this.drag;
      if (!drag || drag.dropping || drag.pointerId !== event.pointerId) return;
      if (!drag.ghost) {
        this.cancel();
        return;
      }
      event.preventDefault();
      this.blockUntil = performance.now() + 550;
      const doc = drag.source.ownerDocument;
      const destination = this.options.resolve(doc.elementFromPoint(event.clientX, event.clientY), drag.id);
      const rect = (destination && destination.rect) || drag.source.getBoundingClientRect();
      if (drag.over) drag.over.classList.remove("drag-over");
      const transform = getComputedStyle(drag.ghost).transform;
      drag.lift.cancel();
      drag.dropping = true;
      const animation = drag.ghost.animate(
        [
          { left: drag.ghost.style.left, top: drag.ghost.style.top, width: drag.ghost.style.width, height: drag.ghost.style.height, transform },
          {
            left: rect.left + rect.width / 2 + "px",
            top: rect.top + rect.height / 2 + "px",
            width: rect.width + "px",
            height: rect.height + "px",
            transform: "translate(-50%, -50%) scale(1)",
          },
        ],
        { duration: 250, easing: "ease-in-out", fill: "forwards" },
      );
      animation.finished
        .then(() => {
          if (this.drag !== drag) return;
          this.cancel();
          if (destination) this.options.drop(drag.id, destination.target);
        })
        .catch(() => this.cancel());
    }

    cancel() {
      const drag = this.drag;
      if (!drag) return;
      if (drag.over) drag.over.classList.remove("drag-over");
      drag.source.classList.remove("drag-source-hidden");
      if (drag.source.hasPointerCapture && drag.source.hasPointerCapture(drag.pointerId)) drag.source.releasePointerCapture(drag.pointerId);
      if (drag.ghost) drag.ghost.remove();
      this.drag = null;
    }
  }

  root.CardDrag = CardDrag;
  if (typeof module !== "undefined" && module.exports) module.exports = CardDrag;
})(typeof window !== "undefined" ? window : globalThis);
