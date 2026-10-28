import { useSyncExternalStore } from "react";
import { transition } from "./motion";

export type Route =
  | { page: "today" }
  | { page: "atlas"; topic?: string; level?: string; q?: string; view?: string }
  | { page: "learn" }
  | { page: "practice" }
  | { page: "me" }
  | { page: "about" };

export interface Location {
  route: Route;
  /** Word sheet open on top of the route. */
  word: string | null;
}

function parse(hash: string): Location {
  const [path, query = ""] = hash.replace(/^#/, "").split("?");
  const params = new URLSearchParams(query);
  const word = params.get("w");
  const seg = path.split("/").filter(Boolean);
  let route: Route = { page: "today" };
  if (seg[0] === "atlas")
    route = { page: "atlas", topic: params.get("topic") || undefined, level: params.get("level") || undefined, q: params.get("q") || undefined, view: params.get("view") || undefined };
  else if (seg[0] === "learn") route = { page: "learn" };
  else if (seg[0] === "practice") route = { page: "practice" };
  else if (seg[0] === "me") route = { page: "me" };
  else if (seg[0] === "about") route = { page: "about" };
  else if (seg[0] === "w" && seg[1]) return { route: { page: "atlas" }, word: decodeURIComponent(seg[1]) };
  return { route, word };
}

export function href(route: Route, word?: string | null) {
  const params = new URLSearchParams();
  if (route.page === "atlas") {
    if (route.topic) params.set("topic", route.topic);
    if (route.level) params.set("level", route.level);
    if (route.q) params.set("q", route.q);
    if (route.view) params.set("view", route.view);
  }
  if (word) params.set("w", word);
  const q = params.toString();
  return `#/${route.page === "today" ? "" : route.page}${q ? `?${q}` : ""}`;
}

let loc = parse(location.hash);
/** In-app entries pushed on top of the entry page; drives the hardware back key. */
let depth = 0;
const subs = new Set<() => void>();

const same = (a: Location, b: Location) =>
  a.word === b.word && href(a.route) === href(b.route);

function apply(next: Location) {
  const pageChange = next.route.page !== loc.route.page;
  const update = () => {
    loc = next;
    subs.forEach((f) => f());
    window.dispatchEvent(new Event("wa:loc"));
  };
  // Crossfade between pages; the word sheet animates on its own.
  if (pageChange && !next.word) transition(update);
  else update();
}

window.addEventListener("hashchange", () => {
  const next = parse(location.hash);
  if (same(next, loc)) return;
  apply(next);
});
window.addEventListener("popstate", () => {
  const next = parse(location.hash);
  if (same(next, loc)) return;
  depth = Math.max(0, depth - 1);
  apply(next);
});

/** Number of in-app history entries behind the current one. */
export const historyDepth = () => depth;

export const useLocation = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => loc,
  );

export function go(route: Route, word?: string | null, replace = false) {
  const h = href(route, word);
  if (replace) history.replaceState(null, "", h);
  else {
    history.pushState(null, "", h);
    depth++;
  }
  apply(parse(h));
}

export const openWord = (id: string) => go(loc.route, id);
/** Closing replaces the current entry so the back key never reopens the sheet. */
export const closeWord = () => go(loc.route, null, true);
export const currentLocation = () => loc;
