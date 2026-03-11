import { lineDiff } from "./diff.js?h=52ba9aad";

onmessage = (event) => {
  const { action, original, modified, options } = event.data;
  if (action === "diff") {
    try {
      const result = lineDiff(original, modified, options);
      postMessage({ action: "diff", status: "ok", result });
    } catch (error) {
      postMessage({ action: "diff", status: "failed", error: String(error) });
    }
  }
};
