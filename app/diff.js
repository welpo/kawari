const CONTEXT_LINES = 3;
const HUNK_MERGE_GAP = 7;
const SIMILARITY_THRESHOLD = 0.5;
const PUNCT_ONLY_REGEX = /^[{}();,:\[\]<>]+$/;
export function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function normalizeLine(line, opts) {
  let s = line;
  if (opts.quotes) s = s.replace(/["']/g, "'");
  if (opts.all) return s.replace(/\s+/g, "");
  if (opts.amount) return s.replace(/\s+/g, " ").trim();
  if (opts.trailing) return s.replace(/\s+$/, "");
  return s;
}

export function myersDiff(a, b, eq = (x, y) => x === y) {
  const n = a.length,
    m = b.length;
  if (n === 0) return b.map((x) => ({ type: "add", b: x }));
  if (m === 0) return a.map((x) => ({ type: "del", a: x }));
  const max = n + m,
    off = max;
  const v = new Array(2 * max + 1).fill(0);
  v[1 + off] = 0;
  const trace = [];
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x =
        k === -d || (k !== d && v[k - 1 + off] < v[k + 1 + off])
          ? v[k + 1 + off]
          : v[k - 1 + off] + 1;
      let y = x - k;
      while (x < n && y < m && eq(a[x], b[y])) {
        x++;
        y++;
      }
      v[k + off] = x;
      if (x >= n && y >= m) {
        const result = [];
        for (let di = trace.length - 1; di >= 0; di--) {
          const vp = trace[di],
            ki = x - y;
          const pk =
            ki === -di || (ki !== di && vp[ki - 1 + off] < vp[ki + 1 + off])
              ? ki + 1
              : ki - 1;
          const px = di === 0 ? 0 : vp[pk + off],
            py = di === 0 ? 0 : px - pk;
          while (x > px && y > py) {
            x--;
            y--;
            result.unshift({ type: "same", a: a[x], b: b[y] });
          }
          if (di > 0) {
            if (x === px) {
              y--;
              result.unshift({ type: "add", b: b[y] });
            } else {
              x--;
              result.unshift({ type: "del", a: a[x] });
            }
          }
        }
        return result;
      }
    }
  }
  return [];
}

export function patienceDiff(a, b, eq = (x, y) => x === y, keyFn = (x) => x) {
  if (a.length === 0) return b.map((x) => ({ type: "add", b: x }));
  if (b.length === 0) return a.map((x) => ({ type: "del", a: x }));
  const countA = new Map(),
    countB = new Map();
  for (let i = 0; i < a.length; i++) {
    const key = keyFn(a[i]);
    countA.set(key, (countA.get(key) || 0) + 1);
  }
  for (let i = 0; i < b.length; i++) {
    const key = keyFn(b[i]);
    countB.set(key, (countB.get(key) || 0) + 1);
  }
  const uniqueA = [],
    uniqueB = [];
  for (let i = 0; i < a.length; i++) {
    const key = keyFn(a[i]);
    if (countA.get(key) === 1 && countB.get(key) === 1)
      uniqueA.push({ val: a[i], key, idx: i });
  }
  for (let i = 0; i < b.length; i++) {
    const key = keyFn(b[i]);
    if (countA.get(key) === 1 && countB.get(key) === 1)
      uniqueB.push({ val: b[i], key, idx: i });
  }
  if (uniqueA.length === 0) return myersDiff(a, b, eq);
  const lcsUnique = myersDiff(
    uniqueA.map((u) => u.key),
    uniqueB.map((u) => u.key),
  ).filter((d) => d.type === "same");
  if (lcsUnique.length === 0) return myersDiff(a, b, eq);
  const anchors = [];
  let uaIdx = 0,
    ubIdx = 0;
  for (const match of lcsUnique) {
    while (uaIdx < uniqueA.length && uniqueA[uaIdx].key !== match.a) uaIdx++;
    while (ubIdx < uniqueB.length && uniqueB[ubIdx].key !== match.b) ubIdx++;
    if (uaIdx < uniqueA.length && ubIdx < uniqueB.length) {
      anchors.push({ aIdx: uniqueA[uaIdx].idx, bIdx: uniqueB[ubIdx].idx });
      uaIdx++;
      ubIdx++;
    }
  }
  let result = [];
  let prevA = 0,
    prevB = 0;
  for (const anchor of anchors) {
    const segA = a.slice(prevA, anchor.aIdx),
      segB = b.slice(prevB, anchor.bIdx);
    if (segA.length > 0 || segB.length > 0)
      result = result.concat(patienceDiff(segA, segB, eq, keyFn));
    result.push({ type: "same", a: a[anchor.aIdx], b: b[anchor.bIdx] });
    prevA = anchor.aIdx + 1;
    prevB = anchor.bIdx + 1;
  }
  const tailA = a.slice(prevA),
    tailB = b.slice(prevB);
  if (tailA.length > 0 || tailB.length > 0)
    result = result.concat(patienceDiff(tailA, tailB, eq, keyFn));
  return result;
}

export function getNormalizedReason(left, right, opts) {
  if (left === right) return null;
  const reasons = [];
  // Check if whitespace is a factor:
  // Normalise only quotes. If they still differ, whitespace must be involved.
  if (
    (opts.trailing || opts.amount || opts.all) &&
    normalizeLine(left, { quotes: opts.quotes }) !==
      normalizeLine(right, { quotes: opts.quotes })
  ) {
    reasons.push("whitespace");
  }
  // Check if quotes are a factor:
  // Normalise only whitespace. If they still differ, quotes must be involved.
  if (
    opts.quotes &&
    normalizeLine(left, {
      trailing: opts.trailing,
      amount: opts.amount,
      all: opts.all,
    }) !==
      normalizeLine(right, {
        trailing: opts.trailing,
        amount: opts.amount,
        all: opts.all,
      })
  ) {
    reasons.push("quotes");
  }
  return reasons.length ? reasons : null;
}

export function lineSimilarity(a, b, opts = {}) {
  const wordsA = a.split(/\s+/).filter((s) => s && !PUNCT_ONLY_REGEX.test(s)),
    wordsB = b.split(/\s+/).filter((s) => s && !PUNCT_ONLY_REGEX.test(s));
  if (wordsA.length === 0 && wordsB.length === 0) return 0;
  if (wordsA.length === 0 || wordsB.length === 0) return 0;
  const eq = (x, y) => {
    if (x === y) return true;
    let nx = x,
      ny = y;
    if (opts.quotes) {
      nx = nx.replace(/["']/g, "'");
      ny = ny.replace(/["']/g, "'");
    }
    if (opts.all) {
      nx = nx.replace(/\s+/g, "");
      ny = ny.replace(/\s+/g, "");
    } else if (opts.amount) {
      nx = nx.replace(/\s+/g, " ");
      ny = ny.replace(/\s+/g, " ");
    }
    return nx === ny;
  };
  const d = myersDiff(wordsA, wordsB, eq);
  const same = d.filter((x) => x.type === "same").length;
  return same / Math.max(wordsA.length, wordsB.length);
}

export function findBestPairings(dels, adds, opts) {
  const candidates = [];
  for (let d = 0; d < dels.length; d++) {
    for (let a = 0; a < adds.length; a++) {
      const sim = lineSimilarity(dels[d], adds[a], opts);
      if (sim >= SIMILARITY_THRESHOLD) candidates.push({ d, a, sim });
    }
  }
  candidates.sort((x, y) => y.sim - x.sim);
  const usedDels = new Set(),
    usedAdds = new Set();
  const pairs = [];
  for (const c of candidates) {
    if (!usedDels.has(c.d) && !usedAdds.has(c.a)) {
      const cross = pairs.some(
        (p) =>
          (c.d > p.delIdx && c.a < p.addIdx) ||
          (c.d < p.delIdx && c.a > p.addIdx),
      );
      if (!cross) {
        pairs.push({
          delIdx: c.d,
          addIdx: c.a,
          del: dels[c.d],
          add: adds[c.a],
        });
        usedDels.add(c.d);
        usedAdds.add(c.a);
      }
    }
  }
  const unpairedDels = dels
    .map((line, i) => ({ line, idx: i }))
    .filter((x) => !usedDels.has(x.idx));
  const unpairedAdds = adds
    .map((line, i) => ({ line, idx: i }))
    .filter((x) => !usedAdds.has(x.idx));
  return { pairs, unpairedDels, unpairedAdds };
}

export function wordDiff(a, b, opts = {}) {
  const wordsA = a.split(/(\s+)/),
    wordsB = b.split(/(\s+)/);
  const eq = (x, y) => {
    if (x === y) return true;
    let nx = x,
      ny = y;
    if (opts.quotes) {
      nx = nx.replace(/["']/g, "'");
      ny = ny.replace(/["']/g, "'");
    }
    if (opts.all) {
      nx = nx.replace(/\s+/g, "");
      ny = ny.replace(/\s+/g, "");
    } else if (opts.amount) {
      nx = nx.replace(/\s+/g, " ");
      ny = ny.replace(/\s+/g, " ");
    }
    return nx === ny;
  };
  const d = myersDiff(wordsA, wordsB, eq);
  const leftHtml = [],
    rightHtml = [];
  let same = 0,
    total = 0;
  for (const item of d) {
    const isWord = item.a?.trim() || item.b?.trim();
    if (item.type === "same") {
      leftHtml.push(escapeHtml(item.a));
      rightHtml.push(escapeHtml(item.b));
      if (isWord) {
        same++;
        total++;
      }
    } else if (item.type === "del") {
      leftHtml.push(`<span class="del-word">${escapeHtml(item.a)}</span>`);
      if (isWord) total++;
    } else if (item.type === "add") {
      rightHtml.push(`<span class="add-word">${escapeHtml(item.b)}</span>`);
      if (isWord) total++;
    }
  }
  const similarity = total > 0 ? same / total : 1;
  return {
    leftHtml: leftHtml.join(""),
    rightHtml: rightHtml.join(""),
    similarity,
  };
}

function splitLines(text) {
  if (text === "") return { lines: [], noNewline: false };
  const noNewline = !text.endsWith("\n");
  const lines = text.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return { lines, noNewline };
}

export function lineDiff(textA, textB, opts = {}) {
  const { lines: linesA, noNewline: origNoNewline } = splitLines(textA);
  const { lines: linesB, noNewline: modNoNewline } = splitLines(textB);
  const hasNorm = opts.trailing || opts.amount || opts.all || opts.quotes;
  const eq = hasNorm
    ? (x, y) => normalizeLine(x, opts) === normalizeLine(y, opts)
    : (x, y) => x === y;
  const keyFn = hasNorm ? (x) => normalizeLine(x, opts) : (x) => x;
  const raw = patienceDiff(linesA, linesB, eq, keyFn);
  const result = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i].type === "same") {
      const left = raw[i].a,
        right = raw[i].b;
      const reasons = getNormalizedReason(left, right, opts);
      result.push({
        type: "same",
        left,
        right,
        normalized: !!reasons,
        normReason: reasons,
      });
      i++;
    } else {
      const dels = [],
        adds = [];
      while (i < raw.length && raw[i].type !== "same") {
        if (raw[i].type === "del") dels.push(raw[i++].a);
        else adds.push(raw[i++].b);
      }
      const { pairs } = findBestPairings(dels, adds, opts);
      // Sort pairs by original order. Non-crossing guarantee implies new order follows.
      pairs.sort((a, b) => a.delIdx - b.delIdx);
      const items = [];
      let currDel = 0;
      let currAdd = 0;
      for (const p of pairs) {
        // Flush unpaired adds before this pair.
        while (currAdd < p.addIdx) {
          items.push({ type: "add", line: adds[currAdd++] });
        }
        // Flush unpaired dels before this pair.
        while (currDel < p.delIdx) {
          items.push({ type: "del", line: dels[currDel++] });
        }
        // Emit the pair.
        items.push({ type: "pair", del: p.del, add: p.add });
        currDel = p.delIdx + 1;
        currAdd = p.addIdx + 1;
      }
      // Flush remaining dels and adds.
      while (currDel < dels.length) {
        items.push({ type: "del", line: dels[currDel++] });
      }
      while (currAdd < adds.length) {
        items.push({ type: "add", line: adds[currAdd++] });
      }
      for (const item of items) {
        if (item.type === "pair") {
          const left = item.del,
            right = item.add;
          const normLeft = hasNorm ? normalizeLine(left, opts) : left;
          const normRight = hasNorm ? normalizeLine(right, opts) : right;
          if (normLeft === normRight) {
            result.push({
              type: "same",
              left,
              right,
              normalized: true,
              normReason: getNormalizedReason(left, right, opts),
            });
          } else {
            result.push({
              type: "change",
              left,
              right,
              ...wordDiff(left, right, opts),
            });
          }
        } else if (item.type === "del") {
          result.push({ type: "del", left: item.line, right: null });
        } else {
          result.push({ type: "add", left: null, right: item.line });
        }
      }
    }
  }
  result.origNoNewline = origNoNewline;
  result.modNoNewline = modNoNewline;
  return result;
}

export function buildHunks(
  diff,
  contextLines = CONTEXT_LINES,
  mergeThreshold = HUNK_MERGE_GAP,
) {
  const changeIdx = [];
  for (let i = 0; i < diff.length; i++) {
    if (diff[i].type !== "same") changeIdx.push(i);
  }
  if (changeIdx.length === 0) return [];
  const groups = [[changeIdx[0]]];
  for (let i = 1; i < changeIdx.length; i++) {
    if (changeIdx[i] - changeIdx[i - 1] - 1 < mergeThreshold) {
      groups[groups.length - 1].push(changeIdx[i]);
    } else {
      groups.push([changeIdx[i]]);
    }
  }
  const hunks = [];
  let prevEnd = -1;
  for (const g of groups) {
    const first = g[0],
      last = g[g.length - 1];
    const start = Math.max(prevEnd + 1, first - contextLines);
    const end = Math.min(diff.length - 1, last + contextLines);
    let startOld = 1,
      startNew = 1;
    for (let i = 0; i < start; i++) {
      if (diff[i].type !== "add") startOld++;
      if (diff[i].type !== "del") startNew++;
    }
    hunks.push({
      start,
      end,
      startOld,
      startNew,
      lines: diff.slice(start, end + 1),
    });
    prevEnd = end;
  }
  return hunks;
}

export function createPatch(diff, filename) {
  if (!diff || diff.length === 0) return "";
  const { origNoNewline, modNoNewline } = diff;
  const hunks = buildHunks(diff);
  if (hunks.length === 0 && origNoNewline === modNoNewline) return "";
  if (hunks.length === 0) {
    const lastLine = diff[diff.length - 1];
    const lines = [
      `--- a/${filename}`,
      `+++ b/${filename}`,
      `@@ -${diff.length},1 +${diff.length},1 @@`,
    ];
    lines.push(`-${lastLine.left}`);
    if (origNoNewline) lines.push("\\ No newline at end of file");
    lines.push(`+${lastLine.right}`);
    if (modNoNewline) lines.push("\\ No newline at end of file");
    return lines.join("\n") + "\n";
  }
  let totalOrig = 0,
    totalMod = 0;
  for (const d of diff) {
    if (d.type !== "add") totalOrig++;
    if (d.type !== "del") totalMod++;
  }
  const lines = [`--- a/${filename}`, `+++ b/${filename}`];
  for (const hunk of hunks) {
    let countOld = 0,
      countNew = 0;
    for (const d of hunk.lines) {
      if (d.type === "same") {
        countOld++;
        countNew++;
      } else if (d.type === "del") countOld++;
      else if (d.type === "add") countNew++;
      else if (d.type === "change") {
        countOld++;
        countNew++;
      }
    }
    lines.push(
      `@@ -${hunk.startOld},${countOld} +${hunk.startNew},${countNew} @@`,
    );
    let origPos = hunk.startOld,
      modPos = hunk.startNew;
    for (const d of hunk.lines) {
      if (d.type === "same") {
        const isLastOrig = origPos === totalOrig;
        const isLastMod = modPos === totalMod;
        const origHasNl = !isLastOrig || !origNoNewline;
        const modHasNl = !isLastMod || !modNoNewline;
        if (origHasNl !== modHasNl) {
          lines.push(`-${d.left}`);
          if (isLastOrig && origNoNewline)
            lines.push("\\ No newline at end of file");
          lines.push(`+${d.right}`);
          if (isLastMod && modNoNewline)
            lines.push("\\ No newline at end of file");
        } else {
          lines.push(` ${d.left}`);
          if (isLastOrig && isLastMod && origNoNewline && modNoNewline) {
            lines.push("\\ No newline at end of file");
          }
        }
        origPos++;
        modPos++;
      } else if (d.type === "del") {
        lines.push(`-${d.left}`);
        if (origPos === totalOrig && origNoNewline)
          lines.push("\\ No newline at end of file");
        origPos++;
      } else if (d.type === "add") {
        lines.push(`+${d.right}`);
        if (modPos === totalMod && modNoNewline)
          lines.push("\\ No newline at end of file");
        modPos++;
      } else if (d.type === "change") {
        lines.push(`-${d.left}`);
        if (origPos === totalOrig && origNoNewline)
          lines.push("\\ No newline at end of file");
        lines.push(`+${d.right}`);
        if (modPos === totalMod && modNoNewline)
          lines.push("\\ No newline at end of file");
        origPos++;
        modPos++;
      }
    }
  }
  return lines.join("\n") + "\n";
}
