/**
 * Find the dictionary entry behind a word tapped in an example sentence.
 *
 * Example sentences are running prose, so what gets tapped is rarely the
 * headword itself: "studied" for study, "taught" for teach, "children" for
 * child. The candidates below are ordered cheapest-first and stop at the first
 * hit, so an exact match never pays for stemming.
 */
import type { Atlas, WordRef } from "../atlas/types";
import { BASE_FORM, normalize } from "./text";

/** Atlas word → entry, keyed by normalised spelling. One index per dataset. */
const indexes = new WeakMap<Atlas, Map<string, WordRef>>();

function indexOf(atlas: Atlas) {
  let m = indexes.get(atlas);
  if (!m) {
    m = new Map();
    for (const w of atlas.words) {
      const k = normalize(w.word);
      if (!m.has(k)) m.set(k, w);
    }
    indexes.set(atlas, m);
  }
  return m;
}

const SUFFIXES = ["ing", "ed", "est", "er", "es", "s"];

/**
 * Plausible dictionary forms for a token, best guess first.
 *
 * The token itself always leads, so an entry called "glasses" wins over the
 * plural reading of "glass".
 */
export function lookupCandidates(raw: string): string[] {
  const token = normalize(raw).replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (!token) return [];
  const out = [token];
  const add = (s: string) => {
    if (s.length > 1 && !out.includes(s)) out.push(s);
  };

  const base = BASE_FORM.get(token);
  if (base) add(base);

  if (token.endsWith("'s")) add(token.slice(0, -2));
  if (/(ies|ied)$/.test(token)) add(`${token.slice(0, -3)}y`);
  if (token.endsWith("ying")) add(`${token.slice(0, -4)}ie`);

  for (const suffix of SUFFIXES) {
    if (!token.endsWith(suffix) || token.length <= suffix.length + 1) continue;
    const stem = token.slice(0, -suffix.length);
    // stopped → stop, running → run
    if (/([bdgmnprt])\1$/.test(stem)) {
      add(stem);
      add(stem.slice(0, -1));
    }
    // happier → happy
    if (stem.endsWith("i") && (suffix === "er" || suffix === "est")) add(`${stem.slice(0, -1)}y`);
    if (suffix === "ing" || suffix === "ed") {
      // making → make, but bringing → bring
      if (!stem.endsWith("ng")) add(`${stem}e`);
      add(stem);
    } else {
      add(stem);
      add(`${stem}e`);
    }
  }
  return out;
}

/** The entry a tapped word belongs to, or null when it is not in the atlas. */
export function findWord(atlas: Atlas, raw: string): WordRef | null {
  const index = indexOf(atlas);
  for (const candidate of lookupCandidates(raw)) {
    const hit = index.get(candidate);
    if (hit) return hit;
  }
  return null;
}
