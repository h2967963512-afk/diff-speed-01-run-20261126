// Fast drop-in for makefun-diff 1.0.0: exact Myers (same greedy, same tie-break),
// line interning + flat V storage (row d at offset d*d) + tight visit loop.
// Unreachable diagonals store INF (a value >= n and with INF-(k+1) >= m), so each
// candidate needs one comparison. Snakes run on trimmed arrays padded with two
// distinct sentinels, so the snake test is a single integer equality, no bounds.
const INF = 0x3fffffff;
let _vbuf = null;
function vbufFor(cap) {
  if (_vbuf === null) { _vbuf = new Int32Array(Math.max(cap, 20_000_000)); return _vbuf; }
  if (_vbuf.length < cap) {
    const nb = new Int32Array(Math.max(cap, (_vbuf.length * 3) >> 1));
    nb.set(_vbuf);
    _vbuf = nb;
  }
  return _vbuf;
}

export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const ids = new Map();
  const ta = tokenize(input.old, ids);
  const tb = tokenize(input.new, ids);
  const a = ta.lines, b = tb.lines, aIds = ta.ids, bIds = tb.ids;
  const n = a.length, m = b.length;
  let prefix = 0;
  while (prefix < n && prefix < m && aIds[prefix] === bIds[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && aIds[n - 1 - suffix] === bIds[m - 1 - suffix]) suffix++;
  const an = n - prefix - suffix, bn = m - prefix - suffix;
  // Trimmed id arrays, each padded with its own sentinel id so a snake's test is
  // one equality with no bounds check (the sentinels differ, so a snake stops at
  // either end, and stops exactly at both ends together too).
  const aS = new Int32Array(an + 1);
  const bS = new Int32Array(bn + 1);
  aS.set(aIds.subarray(prefix, prefix + an));
  bS.set(bIds.subarray(prefix, prefix + bn));
  aS[an] = 1000000000;
  bS[bn] = 1000000001;
  const runs = [];
  if (prefix > 0) runs.push({ kind: 0, count: prefix });
  runs.push(...myersRuns(aS, bS, an, bn));
  if (suffix > 0) runs.push({ kind: 0, count: suffix });
  return buildPatch(a, b, n, m, runs);
}

// Split a text into lines (each with its "\n", the last one without when the text
// does not end in one) and intern each line to an integer id in one pass, so the
// search compares integers, never strings. ids is shared across both texts.
function tokenize(text, ids) {
  const parts = text.split('\n');
  const last = parts.length - 1;
  let count = parts.length;
  if (parts[last] === '') count--;
  const lines = new Array(count);
  const lineIds = new Int32Array(count);
  for (let i = 0; i < count; i++) {
    const line = i < last ? parts[i] + '\n' : parts[i];
    lines[i] = line;
    let id = ids.get(line);
    if (id === undefined) { id = ids.size; ids.set(line, id); }
    lineIds[i] = id;
  }
  return { lines, ids: lineIds };
}

// kinds: 0 keep, 1 delete, 2 insert. V rows in flat buffer: row d at d*d, index k+d.
function myersRuns(aS, bS, n, m) {
  if (n === 0 && m === 0) return [];
  const km = n - m; // only diagonal km can reach both ends
  const maxEdit = n + m;
  let V = vbufFor(1024 * 1024);
  let D = -1;
  // d = 0
  {
    let x = 0;
    while (aS[x] === bS[x]) x++;
    V[0] = x;
    if (x >= n && x >= m) D = 0; // diagonal 0: y = x, so both ends iff x >= max(n, m)
  }
  for (let d = 1; D < 0 && d <= maxEdit; d++) {
    const need = (d + 1) * (d + 1);
    if (need > V.length) V = vbufFor(need);
    const base = d * d;
    const pbase = (d - 1) * (d - 1);
    const poff = d - 1;
    // k = -d: only insertion (from diagonal -d+1)
    {
      const xp = V[pbase + (-d + 1) + poff];
      let x = INF;
      if (xp - (-d + 1) < m) x = xp; // xp==INF fails this (INF-.. >= m); xp<n not needed: x=xp<=n
      if (x !== INF) {
        let y = x + d;
        while (aS[x] === bS[y]) { x++; y++; }
        V[base] = x;
      } else V[base] = INF;
    }
    // interior k = -d+2 .. d-2 step 2. Carry the insertion candidate: for k, the
    // insertion source is V[ip+2], which is the deletion source of k+2.
    let ip = pbase + (-d + 1) + poff; // prev index of diagonal k-1 for k=-d+2
    let xpIns = V[ip + 2];
    for (let k = -d + 2; k <= d - 2; k += 2, ip += 2) {
      const xpDel = V[ip];
      // del valid iff xpDel < n (INF fails; n fails: old exhausted)
      // ins valid iff xpIns-(k+1) < m (INF fails; m fails: new exhausted)
      let x;
      if (xpDel < n && (xpIns - (k + 1) >= m || xpDel + 1 >= xpIns)) x = xpDel + 1;
      else if (xpIns - (k + 1) < m) x = xpIns;
      else { V[base + k + d] = INF; if (k + 2 <= d - 2) xpIns = V[ip + 4]; continue; }
      let y = x - k;
      while (aS[x] === bS[y]) { x++; y++; }
      V[base + k + d] = x;
      if (k + 2 <= d - 2) xpIns = V[ip + 4];
    }
    // k = d: only deletion (from diagonal d-1)
    {
      const xp = V[pbase + (d - 1) + poff];
      if (xp < n) {
        let x = xp + 1;
        let y = x - d;
        while (aS[x] === bS[y]) { x++; y++; }
        V[base + 2 * d] = x;
      } else V[base + 2 * d] = INF;
    }
    // Only diagonal km can have reached both ends; x>=n there means y>=m too.
    if (km >= -d && km <= d && ((km + d) & 1) === 0 && V[base + km + d] >= n) D = d;
  }
  if (D < 0) throw new Error('makefun-diff: the search ended without reaching both ends');
  const kFinal = km;
  const ops = [];
  let k = kFinal;
  for (let d = D; d >= 1; d--) {
    const base = d * d;
    const pbase = (d - 1) * (d - 1);
    const poff = d - 1;
    const x = V[base + k + d];
    let delValid = false, insValid = false, xDel = -1, xIns = -1;
    if (k - 1 >= -(d - 1) && k - 1 <= d - 1) {
      const xp = V[pbase + (k - 1) + poff];
      if (xp < n) { delValid = true; xDel = xp + 1; }
    }
    if (k + 1 >= -(d - 1) && k + 1 <= d - 1) {
      const xp = V[pbase + (k + 1) + poff];
      if (xp - (k + 1) < m) { insValid = true; xIns = xp; }
    }
    const isDel = delValid && (!insValid || xDel >= xIns);
    const preX = isDel ? xDel : xIns;
    const snake = x - preX;
    if (snake > 0) ops.push({ kind: 0, count: snake });
    ops.push({ kind: isDel ? 1 : 2, count: 1 });
    k = isDel ? k - 1 : k + 1;
  }
  const s0 = V[0];
  if (s0 > 0) ops.push({ kind: 0, count: s0 });
  ops.reverse();
  const runs = [];
  for (const o of ops) {
    const last = runs[runs.length - 1];
    if (last !== undefined && last.kind === o.kind) last.count += o.count;
    else runs.push({ kind: o.kind, count: o.count });
  }
  return runs;
}

function buildPatch(a, b, n, m, runs) {
  const KEEP = 0, DELETE = 1, INSERT = 2;
  const changes = [];
  let o = 0, p = 0, deleted = 0, inserted = 0;
  for (const r of runs) {
    if (r.kind === KEEP) { o += r.count; p += r.count; continue; }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === DELETE) { c.dels += r.count; o += r.count; deleted += r.count; }
    else { c.ins += r.count; p += r.count; inserted += r.count; }
  }
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h !== undefined ? h[h.length - 1] : undefined;
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 6) h.push(c);
    else hunks.push([c]);
  }
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  const written = (op, line) => line.endsWith('\n') ? op + line : op + line + '\n%\n';
  for (const h of hunks) {
    const first = h[0], last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - 3);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(3, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written('=', a[at]));
      for (let i = 0; i < c.dels; i++) out.push(written('-', a[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written('+', b[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', a[at]));
  }
  return out.join('');
}
