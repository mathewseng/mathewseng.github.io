// SPDX-License-Identifier: GPL-3.0-or-later
// Pending offers are twice the live cube. Beavers/raccoons accept that
// offer before offering another redouble; a drop pays the live cube only.
export function presentCubeAction(source, action) {
  const current = source.cube.value, offered = current * 2;
  const accepts = ["take", "beaver", "raccoon"].includes(action);
  const cubeValue = accepts ? offered : current;
  const choices = {
    roll: { icon: null, label: "No double", displayLabel: "", description: `Keep the cube at ${current}.` },
    "skip-roll": { icon: null, label: "No double · pass", displayLabel: "No double · pass",
      description: `Keep the cube at ${current} and pass without rolling; all six bar entries are blocked.` },
    double: { icon: "double", label: `Double ${current} → ${offered}`, displayLabel: `${current} → ${offered}`,
      description: `Offer ${offered}; the cube stays at ${current} until accepted.` },
    take: { icon: "take", label: `Take ${offered}`,
      description: `Accept the cube at ${offered}.` },
    pass: { icon: "drop", label: `Drop ${offered} · concede ${current}`,
      description: `Decline ${offered} and concede ${current} ${current === 1 ? "point" : "points"}.` },
    beaver: { icon: "redouble", label: `Beaver ${offered} → ${offered * 2}`,
      description: `Accept ${offered} and immediately offer ${offered * 2}.` },
    raccoon: { icon: "redouble", label: `Raccoon ${offered} → ${offered * 2}`,
      description: `Accept ${offered} and immediately offer ${offered * 2}.` },
  };
  if (!choices[action]) throw new Error(`Unknown cube action: ${action}`);
  return { cubeValue, ...choices[action], displayLabel: choices[action].displayLabel ?? choices[action].label };
}
