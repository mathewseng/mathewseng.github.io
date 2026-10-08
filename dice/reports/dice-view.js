// Solid, six-sided dice. Animation only presents the already sampled outcome.
const PIPS = [
  [],
  [5],
  [1, 9],
  [1, 5, 9],
  [1, 3, 7, 9],
  [1, 3, 5, 7, 9],
  [1, 3, 4, 6, 7, 9],
];
const ORIENTATION = [
  null,
  [0, 0],
  [0, -90],
  [-90, 0],
  [90, 0],
  [0, 90],
  [0, 180],
];
const tilt = (i) => (i % 2 ? 7 : -8);
const orientation = (face, i, x = 0, y = 0, z = 0) =>
  `rotateZ(${tilt(i) + z}deg) rotateX(-16deg) rotateY(-18deg) rotateX(${ORIENTATION[face][0] + x}deg) rotateY(${ORIENTATION[face][1] + y}deg)`;

export function createDiceView(container) {
  let animations = [],
    timers = [],
    generation = 0;
  function cancel() {
    generation++;
    timers.forEach(clearTimeout);
    animations.forEach((animation) => animation.cancel());
    timers = [];
    animations = [];
  }
  function show(values, matchFace = null) {
    cancel();
    if (container.children.length !== values.length) {
      container.innerHTML = values
        .map(
          () =>
            `<div class="die"><div class="die-shadow"></div><div class="die-body"><div class="die-cube">${PIPS.slice(
              1,
            )
              .map(
                (pips, face) =>
                  `<div class="die-face face-${face + 1}">${Array.from({ length: 9 }, (_, j) => `<i class="pip ${pips.includes(j + 1) ? "on" : ""}"></i>`).join("")}</div>`,
              )
              .join("")}</div></div></div>`,
        )
        .join("");
    }
    [...container.children].forEach((die, i) => {
      die.classList.remove("is-rolling", "is-waiting");
      die.classList.toggle("match", values[i] === matchFace);
      die.dataset.face = values[i];
      die.dataset.state = "settled";
      die.querySelector(".die-cube").style.transform = orientation(
        values[i],
        i,
      );
    });
  }
  function roll(values, { speed, onReveal, onComplete }) {
    cancel();
    const token = generation,
      dice = [...container.children];
    let completed = 0;
    dice.forEach((die) => {
      die.classList.remove("match");
      die.classList.add("is-waiting");
      die.dataset.state = "waiting";
      delete die.dataset.face;
    });
    function start(i) {
      if (token !== generation) return;
      const die = dice[i],
        face = values[i];
      const body = die.querySelector(".die-body"),
        cube = die.querySelector(".die-cube");
      const size = die.clientWidth,
        direction = i % 2 ? -1 : 1;
      const timing = {
        duration: speed === "suspense" ? 200 : 460,
        fill: "forwards",
      };
      die.classList.remove("is-waiting");
      die.classList.add("is-rolling");
      die.dataset.state = "rolling";
      // Two low bounces, lateral travel, and diminishing rotation. Each face
      // remains attached to the cube throughout; no random swapping of pips.
      const travel = body.animate(
        [
          {
            transform: `translate3d(${-size * 0.18 * direction}px, ${-size * 0.12}px, 0)`,
            offset: 0,
          },
          {
            transform: `translate3d(${-size * 0.08 * direction}px, ${-size * 0.62}px, 0)`,
            offset: 0.25,
            easing: "ease-in",
          },
          {
            transform: `translate3d(${size * 0.12 * direction}px, 0, 0)`,
            offset: 0.57,
            easing: "ease-out",
          },
          {
            transform: `translate3d(${size * 0.08 * direction}px, ${-size * 0.17}px, 0)`,
            offset: 0.74,
            easing: "ease-in",
          },
          { transform: "translate3d(0, 0, 0)", offset: 1 },
        ],
        timing,
      );
      const turn = cube.animate(
        [
          {
            transform: orientation(
              face,
              i,
              -360,
              -270 * direction,
              -35 * direction,
            ),
            offset: 0,
          },
          {
            transform: orientation(
              face,
              i,
              -120,
              -90 * direction,
              18 * direction,
            ),
            offset: 0.57,
          },
          {
            transform: orientation(
              face,
              i,
              -25,
              -12 * direction,
              -4 * direction,
            ),
            offset: 0.84,
          },
          { transform: orientation(face, i), offset: 1 },
        ],
        { ...timing, easing: "cubic-bezier(.18,.65,.35,1)" },
      );
      const shadow = die.querySelector(".die-shadow").animate(
        [
          { transform: "scale(.9)", opacity: 0.3, offset: 0 },
          { transform: "scale(.7)", opacity: 0.16, offset: 0.25 },
          { transform: "scale(1)", opacity: 0.5, offset: 0.57 },
          { transform: "scale(.88)", opacity: 0.3, offset: 0.74 },
          { transform: "scale(1)", opacity: 0.5, offset: 1 },
        ],
        timing,
      );
      animations.push(travel, turn, shadow);
      travel.onfinish = () => {
        if (token !== generation) return;
        die.classList.remove("is-rolling");
        die.dataset.face = face;
        die.dataset.state = "settled";
        cube.style.transform = orientation(face, i);
        onReveal(i);
        completed++;
        if (completed === dice.length) onComplete();
        else if (speed === "suspense") start(i + 1);
      };
    }
    if (speed === "suspense") start(0);
    else
      dice.forEach((_, i) => timers.push(setTimeout(() => start(i), i * 12)));
  }
  return { show, roll };
}
