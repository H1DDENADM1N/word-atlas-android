import { useEffect, useState } from "react";
import { embedded } from "./embedded";

/**
 * Syllable breaks, imported from OALDPEX by
 * `scripts/atlas/import_syllables.py` into `atlas/syllables.json`.
 *
 * The dictionary keeps them on the headword element — `syllable="ex·hib·ition"`
 * — and its own script swaps the text on click. We do the same, so the dots a
 * learner sees here are the ones the printed dictionary uses, not a guess.
 *
 * Only 4,672 of the 7,298 entries carry the attribute; the rest get `null` and
 * the card leaves the headword alone rather than inventing a split.
 */
interface File {
  v: number;
  source: string;
  dots: Record<string, string>;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

let cache: File | null = null;
let pending: Promise<File | null> | null = null;

function load(): Promise<File | null> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  const local = embedded();
  if (local?.syllables) {
    cache = JSON.parse(local.syllables) as File;
    return Promise.resolve(cache);
  }
  pending = fetch(`${BASE}/atlas/syllables.json`)
    .then((res) => (res.ok ? (res.json() as Promise<File>) : null))
    .then((file) => (cache = file))
    .catch(() => null);
  return pending;
}

function read(id: string): string | null {
  return cache?.dots[id] ?? null;
}

/** The dotted spelling of this entry, or null while loading / when unknown. */
export function useSyllables(id: string): string | null {
  const [dots, setDots] = useState<string | null>(() => read(id));
  useEffect(() => {
    let live = true;
    setDots(read(id));
    if (!cache) {
      void load().then(() => {
        if (live) setDots(read(id));
      });
    }
    return () => {
      live = false;
    };
  }, [id]);
  return dots;
}
