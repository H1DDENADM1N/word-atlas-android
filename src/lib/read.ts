import type { Accent, Atlas, Entry, WordRef } from "../atlas/types";
import { play } from "./audio";

/** Which parts of a card should be read out. */
export interface ReadPlan {
  /** The headword itself. */
  word: boolean;
  /** The everyday example (`ex[0]`). */
  daily: boolean;
  /** The IELTS-context example (`ex[1]`), when the entry has one. */
  ielts: boolean;
}

/**
 * Read a word and then the examples the reader asked for, one after another.
 *
 * The chain gives up as soon as playback is interrupted: `play` reports
 * "stopped" when something newer takes the speaker over, so a card that was
 * left behind never keeps talking over the next screen.
 */
export async function readEntry(atlas: Atlas, entry: Entry, refw: WordRef | Entry, accent: Accent, plan: ReadPlan) {
  const say = async (url: string | null, text: string) => (await play(url, text, accent)) !== "stopped";

  if (plan.word && !(await say(atlas.audio(refw, accent), entry.w))) return;
  if (plan.daily && entry.ex[0] && !(await say(atlas.audio(entry, "ex"), entry.ex[0].en))) return;
  if (plan.ielts && entry.ex[1]) await say(atlas.audio(entry, "ex2"), entry.ex[1].en);
}
