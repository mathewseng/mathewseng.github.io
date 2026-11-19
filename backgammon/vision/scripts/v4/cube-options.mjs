export const cubeReplies = ({ take, pass, beaver }) =>
  Object.entries({ take, pass, beaver }).filter(([, equity]) => Number.isFinite(equity));

export const bestCubeReply = options =>
  cubeReplies(options).reduce((best, reply) => reply[1] < best[1] ? reply : best);
