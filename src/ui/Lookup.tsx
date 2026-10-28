import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAtlas } from "../atlas/context";
import { findWord } from "../lib/lookup";
import { registerOverlay } from "../lib/native";
import { openWord } from "../lib/router";
import { splitHighlight } from "../lib/text";
import { useStore } from "../store/store";
import { Illustration } from "./Illustration";
import { Speak } from "./Speak";

const TOKEN = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
/** Punctuation that belongs to the word before it, so a line never starts with it. */
const TRAILING = /^[^\sA-Za-z]+/;
const NARROW = "(max-width: 640px)";

type Selection = { token: string; anchor: HTMLElement };

/**
 * An example sentence whose words can be tapped for a quick gloss.
 *
 * Tapping opens a small card with the illustration, the Chinese meaning, a
 * recording and a way into the full entry — so a sentence can be read without
 * losing the word you came from. Only one card is ever open: every instance
 * listens for `word-atlas:lookup` and closes itself.
 */
export function LookupText({ text, word }: { text: string; word: string }) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const parts = splitHighlight(text, word);
  const from = parts ? parts[0].length : -1;
  const to = parts ? from + parts[1].length : -1;

  useEffect(() => setSelection(null), [text]);
  useEffect(() => {
    const close = () => setSelection(null);
    window.addEventListener("word-atlas:lookup", close);
    return () => window.removeEventListener("word-atlas:lookup", close);
  }, []);

  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const token = match[0];
    const marked = start >= from && start < to;
    const open = (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      // Closes any other card first; ours wins because it is set afterwards.
      window.dispatchEvent(new Event("word-atlas:lookup"));
      setSelection({ token, anchor: e.currentTarget });
    };
    const button = (
      <button
        key={`w-${start}`}
        type="button"
        className="lookup-token"
        aria-label={`查词：${token}`}
        aria-haspopup="dialog"
        onClick={open}
      >
        {token}
      </button>
    );
    const glue = TRAILING.exec(text.slice(start + token.length))?.[0] ?? "";
    const shown = marked ? <mark key={`m-${start}`}>{button}</mark> : button;
    if (glue) {
      nodes.push(
        <span key={`g-${start}`} className="lookup-glue">
          {shown}
          {glue}
        </span>,
      );
      cursor = start + token.length + glue.length;
    } else {
      nodes.push(shown);
      cursor = start + token.length;
    }
  }
  nodes.push(text.slice(cursor));

  return (
    <>
      {nodes}
      {selection &&
        createPortal(
          <LookupCard token={selection.token} anchor={selection.anchor} onClose={() => setSelection(null)} />,
          document.body,
        )}
    </>
  );
}

function LookupCard({ token, anchor, onClose }: { token: string; anchor: HTMLElement; onClose: () => void }) {
  const atlas = useAtlas();
  const accent = useStore((s) => s.settings.accent);
  const ref = findWord(atlas, token);
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const narrow = typeof matchMedia === "function" && matchMedia(NARROW).matches;

  // Escape and the hardware back key close the card, not the entry behind it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    document.addEventListener("keydown", onKey, true);
    const unregister = registerOverlay(() => {
      onClose();
      return true;
    });
    return () => {
      document.removeEventListener("keydown", onKey, true);
      unregister();
    };
  }, [onClose]);

  // The card lives at the end of <body>, so keyboard focus has to be brought to
  // it and handed back to the tapped word when it closes.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    card.current?.focus({ preventScroll: true });
    return () => previous?.focus?.({ preventScroll: true });
  }, []);

  // Anchor to the tapped word: below it when there is room, above it otherwise.
  useLayoutEffect(() => {
    if (narrow) return;
    const el = card.current;
    if (!el) return;
    const place = () => {
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const left = Math.max(12, Math.min(window.innerWidth - w - 12, a.left + a.width / 2 - w / 2));
      const below = a.bottom + 8;
      const top = below + h + 12 <= window.innerHeight ? below : Math.max(12, a.top - h - 8);
      setPos({ left, top });
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(el);
    window.addEventListener("resize", place);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", place);
    };
  }, [anchor, narrow]);

  return (
    <div className="lookup-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={card}
        className="lookup-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`查词：${token}`}
        tabIndex={-1}
        style={narrow ? undefined : { left: pos?.left ?? 12, top: pos?.top ?? 12, visibility: pos ? "visible" : "hidden" }}
      >
        <span className="lookup-grip" aria-hidden="true" />
        <button type="button" className="icon-btn lookup-close" onClick={onClose} aria-label="关闭查词">
          <X size={18} />
        </button>
        {ref ? (
          <>
            <div className="lookup-heading">
              <Illustration src={atlas.img(ref, "thumb")} word={ref.word} topic={ref.topic} className="lookup-thumb" />
              <div>
                <h2 lang="en">{ref.word}</h2>
                {ref.ipa && (
                  <p className="ipa" lang="en">
                    {ref.ipa}
                  </p>
                )}
              </div>
            </div>
            <p className="lookup-meaning">{ref.zh}</p>
            <div className="lookup-actions">
              <Speak url={atlas.audio(ref, accent)} text={ref.word} accent={accent} size="sm" label="播放发音" />
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onClose();
                  openWord(ref.id);
                }}
              >
                查看词卡
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 lang="en">{token}</h2>
            <p className="lookup-meaning">这个词不在词光词库里</p>
          </>
        )}
      </div>
    </div>
  );
}
