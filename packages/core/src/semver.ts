const RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;

export function isSemver(v: string): boolean {
  return RE.test(v);
}

/** Returns -1, 0 or 1. Throws on invalid input. Build metadata is ignored. */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = RE.exec(a);
  const pb = RE.exec(b);
  if (!pa || !pb) throw new Error("invalid semver");
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  const ra = pa[4];
  const rb = pb[4];
  if (!ra && !rb) return 0;
  if (!ra) return 1;
  if (!rb) return -1;
  const xa = ra.split(".");
  const xb = rb.split(".");
  for (let i = 0; i < Math.max(xa.length, xb.length); i++) {
    const p = xa[i];
    const q = xb[i];
    if (p === undefined) return -1;
    if (q === undefined) return 1;
    const np = /^\d+$/.test(p);
    const nq = /^\d+$/.test(q);
    if (np && nq) {
      const d = Number(p) - Number(q);
      if (d !== 0) return d < 0 ? -1 : 1;
    } else if (np) return -1;
    else if (nq) return 1;
    else if (p !== q) return p < q ? -1 : 1;
  }
  return 0;
}
