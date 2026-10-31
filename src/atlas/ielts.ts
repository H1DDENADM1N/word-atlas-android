import { useEffect, useState } from "react";
import { embedded } from "./embedded";

/**
 * Real exam sentences, imported from 雅思真题例句词典 by
 * `scripts/atlas/import_ielts.py` into `atlas/ielts.json`.
 *
 * The file keeps the sentences once (`pool`) and points at them from each
 * entry (`words`): 5k links reach barely 1k sentences, so inlining the text
 * per word would multiply it several times over. It is loaded on the first
 * card that needs it rather than at boot — most sessions never open one.
 */
export interface ExamSentence {
  en: string;
  zh: string;
  /** C04T1L1 — Cambridge book, test, listening part / reading passage. */
  src: string;
  /** 「剑4 Test 1 听力 Part 1」, for the tooltip. */
  label: string;
}

interface File {
  v: number;
  source: string;
  pool: Record<string, [string, string, string]>;
  words: Record<string, string[]>;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

let cache: File | null = null;
let pending: Promise<File | null> | null = null;

function load(): Promise<File | null> {
  if (cache) return Promise.resolve(cache);
  if (pending) return pending;
  const local = embedded();
  if (local?.ielts) {
    cache = JSON.parse(local.ielts) as File;
    return Promise.resolve(cache);
  }
  pending = fetch(`${BASE}/atlas/ielts.json`)
    .then((res) => (res.ok ? (res.json() as Promise<File>) : null))
    .then((file) => (cache = file))
    .catch(() => null);
  return pending;
}

/** C04T1L1 -> 「剑4 Test 1 听力 Part 1」. */
export function sourceLabel(src: string): string {
  const book = /C(\d+)/i.exec(src);
  const test = /T(\d+)/i.exec(src);
  const part = /T\d+([LR])(\d*)/i.exec(src);
  const out: string[] = [];
  if (book) out.push(`剑${book[1]}`);
  if (test) out.push(`Test ${test[1]}`);
  if (part) out.push(part[1].toUpperCase() === "R" ? `阅读 Passage ${part[2] || "?"}` : `听力 Part ${part[2] || "?"}`);
  return out.join(" · ") || src;
}

function read(id: string): ExamSentence[] {
  const file = cache;
  if (!file) return [];
  const ids = file.words[id];
  if (!ids) return [];
  return ids.flatMap((sid) => {
    const row = file.pool[sid];
    if (!row) return [];
    const [en, zh, src] = row;
    return [{ en, zh, src, label: sourceLabel(src) }];
  });
}

/** The exam sentences quoting this entry, best first. Empty while loading. */
export function useIelts(id: string): ExamSentence[] {
  const [list, setList] = useState<ExamSentence[]>(() => read(id));
  useEffect(() => {
    let live = true;
    const now = read(id);
    setList(now);
    if (!now.length) {
      void load().then(() => {
        if (live) setList(read(id));
      });
    }
    return () => {
      live = false;
    };
  }, [id]);
  return list;
}
