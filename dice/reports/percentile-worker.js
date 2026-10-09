import { createPercentileTracker } from "./percentile.mjs";
const tracker = createPercentileTracker();
self.onmessage = ({ data }) => {
  try {
    tracker.append(data.game);
    self.postMessage({
      revision: data.revision,
      result: tracker.percentile(data.pnl),
    });
  } catch (error) {
    self.postMessage({ revision: data.revision, error: error.message });
  }
};
