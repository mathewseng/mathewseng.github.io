// SPDX-License-Identifier: GPL-3.0-or-later
// Depths use GNUbg's convention: zero is direct neural evaluation.
export const ROLLOUT_POLICIES = Object.freeze({
  basic: Object.freeze({id:'basic', name:'Basic', checkerPlies:0, cubePlies:0, truncationPlies:0, lateAfterPlies:0, lateCheckerPlies:0, lateCubePlies:0}),
  balanced: Object.freeze({id:'balanced', name:'Balanced', checkerPlies:1, cubePlies:1, truncationPlies:0, lateAfterPlies:0, lateCheckerPlies:1, lateCubePlies:1}),
  strong: Object.freeze({id:'strong', name:'Strong', checkerPlies:2, cubePlies:2, truncationPlies:0, lateAfterPlies:0, lateCheckerPlies:2, lateCubePlies:2}),
  'short-deep': Object.freeze({id:'short-deep', name:'Short/deep', checkerPlies:2, cubePlies:2, truncationPlies:5, lateAfterPlies:2, lateCheckerPlies:1, lateCubePlies:2}),
});
export const DEFAULT_ROLLOUT_POLICY = 'balanced';
export function rolloutPolicy(id=DEFAULT_ROLLOUT_POLICY) {
  if (!Object.hasOwn(ROLLOUT_POLICIES,id)) throw new Error('Unknown rollout policy.');
  return ROLLOUT_POLICIES[id];
}
export function rolloutPolicyLabel(id=DEFAULT_ROLLOUT_POLICY) {
  const p=rolloutPolicy(id);
  if(p.truncationPlies)return 'GNUbg 2/2 checker/cube for first 2 turns, then 1/2; truncate at 5 turns with 2-ply evaluation; normal move filters; variance reduction; ISAAC; independent batches';
  return `GNUbg ${p.checkerPlies}-ply checker / ${p.cubePlies}-ply cube; normal move filters; variance reduction; ISAAC; independent batches; no ply truncation`;
}
