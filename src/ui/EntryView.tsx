import { Bookmark, BookmarkCheck, ChevronRight, Lightbulb, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { Entry, WordRef } from "../atlas/types";
import { useAtlas } from "../atlas/context";
import { useIelts } from "../atlas/ielts";
import { useSyllables } from "../atlas/syllables";
import { splitHighlight, splitPair } from "../lib/text";
import { formatInterval, isMastered } from "../store/srs";
import { toggleBookmark, useStore } from "../store/store";
import { Illustration } from "./Illustration";
import { LookupText, LookupWord } from "./Lookup";
import { Speak } from "./Speak";
import { shareWord } from "./share";

export function Highlight({ text, word }: { text: string; word: string }) {
  const parts = splitHighlight(text, word);
  if (!parts) return <>{text}</>;
  return (
    <>
      {parts[0]}
      <mark>{parts[1]}</mark>
      {parts[2]}
    </>
  );
}

/**
 * Some entries carry two transcriptions — `/ˈprɒdʒekt/; /prəˈdjekt/` for the noun
 * and the verb, or `/ˈmɪnɪt/, /maɪˈnjuːt/`. Each one is atomic, but the pair may
 * break between the halves when the tile is narrow.
 */
function Ipa({ text }: { text: string }) {
  const parts = text.split(/(\s*[;,]\s*)/);
  if (parts.length < 3) return <span className="ipa">{text}</span>;
  return (
    <span className="ipa ipa-split">
      {parts.map((part, i) => (i % 2 ? part : <span key={i} className="ipa-part">{part}</span>))}
    </span>
  );
}

export function Pronounce({ entry, refw }: { entry: Entry; refw: WordRef | Entry }) {
  const atlas = useAtlas();
  const accent = useStore((s) => s.settings.accent);
  // Both accents are always offered, the preferred one first. When an accent
  // has no transcription of its own, it borrows the other's rather than
  // hiding the button — the recordings differ even when the IPA does not.
  const items: ["uk" | "us", string, string][] = [
    ["uk", "英", entry.uk || entry.us],
    ["us", "美", entry.us || entry.uk],
  ];
  if (!items[0][2] && !items[1][2]) return null;
  return (
    <div className="pron">
      {(accent === "us" ? [...items].reverse() : items).map(([acc, label, ipa]) => (
        <Speak
          key={acc}
          url={atlas.audio(refw, acc)}
          text={entry.w}
          accent={acc}
          size="sm"
          label={
            <>
              <em>{label}</em>
              <Ipa text={ipa} />
            </>
          }
        />
      ))}
    </div>
  );
}

/**
 * The Chinese line under an example, optionally veiled so the English can be
 * read first. Tapping lifts the blur and tapping again puts it back; the veil
 * lives in this component's state, so closing the card restores it.
 */
function ExZh({ text, veil }: { text: string; veil: boolean }) {
  const [shown, setShown] = useState(false);
  if (!veil)
    return (
      <p className="ex-zh">
        <LookupText text={text} />
      </p>
    );
  const toggle = () => setShown((v) => !v);
  return (
    <p
      className={`ex-zh is-veiled ${shown ? "is-shown" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={shown ? "隐藏中文翻译" : "显示中文翻译"}
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        toggle();
      }}
    >
      <span className="ex-zh-text">{shown ? <LookupText text={text} /> : text}</span>
      {!shown && <span className="ex-zh-hint">点按显示</span>}
    </p>
  );
}

/**
 * Real exam sentences for this word, from the Cambridge IELTS books. There is
 * no recording for them, so the speaker hands the text to the bundled voice;
 * the card has room for one at a time and the rest are a tap away, with the
 * source badge travelling alongside whichever sentence is showing.
 */
function ExamExamples({ entry, veil }: { entry: Entry; veil: boolean }) {
  const list = useIelts(entry.id);
  const accent = useStore((s) => s.settings.accent);
  const [i, setI] = useState(0);
  if (!list.length) return null;
  const at = i % list.length;
  const x = list[at];
  return (
    <section className="block">
      <h3 className="eyebrow">
        真题例句
        <span className="ex-source" title={x.label}>
          {x.src}
        </span>
      </h3>
      <ul className="examples is-exam">
        <li>
          <p className="ex-en" lang="en">
            <LookupText text={x.en} word={entry.w} />
            <Speak url={null} text={x.en} accent={accent} size="sm" className="ex-speak" />
          </p>
          {x.zh && <ExZh text={x.zh} veil={veil} />}
        </li>
      </ul>
      {list.length > 1 && (
        <button type="button" className="ex-more" onClick={() => setI(at + 1)} aria-label="换一句真题例句">
          换一句
          <span>
            {at + 1}/{list.length}
          </span>
          <ChevronRight size={14} strokeWidth={2} />
        </button>
      )}
    </section>
  );
}

export function EntryView({ entry, mode = "detail", eager = true }: { entry: Entry; mode?: "detail" | "intro" | "reveal"; eager?: boolean }) {
  const atlas = useAtlas();
  const ref = atlas.byId.get(entry.id);
  const card = useStore((s) => s.progress.cards[entry.id]);
  const saved = useStore((s) => s.progress.bookmarks.includes(entry.id));
  const accent = useStore((s) => s.settings.accent);
  const veil = useStore((s) => s.settings.blurZh);
  const syl = useSyllables(entry.id);
  const [showSyl, setShowSyl] = useState(false);
  useEffect(() => setShowSyl(false), [entry.id]);
  const topicIdx = atlas.topics.findIndex((t) => t[0] === entry.topic);
  const topic = atlas.topics[topicIdx];
  const exUrls = [atlas.audio(entry, "ex"), atlas.audio(entry, "ex2")];
  const famLinks = entry.fam.map((f) => {
    // "librarian (n.)" prints with its part of speech but is looked up without it.
    const word = f.replace(/\s*\(.*\)\s*$/, "").trim();
    return { label: f, word };
  });
  const status = card ? (isMastered(card) ? "已掌握" : "学习中") : null;

  return (
    <article className={`entry entry-${mode}`}>
      <div className="entry-art">
        <Illustration src={atlas.img(entry)} word={entry.w} topic={topicIdx} eager={eager} alt={`${entry.w} 插画`} />
      </div>
      <div className="entry-body">
        <header className="entry-head">
          <div className="entry-tags">
            <span className={`chip chip-level lv-${entry.cefr}`}>{entry.cefr}</span>
            {topic && <span className="chip">{topic[1]}</span>}
            {status && <span className={`chip chip-status ${status === "已掌握" ? "is-done" : ""}`}>{status}</span>}
          </div>
          {mode === "detail" && (
            <div className="entry-actions">
              <button className={`icon-btn ${saved ? "is-on" : ""}`} onClick={() => toggleBookmark(entry.id)} aria-pressed={saved} aria-label={saved ? "取消收藏" : "收藏"} title={saved ? "取消收藏" : "收藏"}>
                {saved ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}
              </button>
              <button className="icon-btn" onClick={() => shareWord(atlas, entry)} aria-label="生成分享卡片" title="生成分享卡片">
                <Share2 size={19} />
              </button>
            </div>
          )}
        </header>
        {ref && (
          <p className="specimen">
            № {String(ref.order + 1).padStart(4, "0")}
            <i />
            Word Atlas
          </p>
        )}
        <h2 className="headword" lang="en">
          {syl ? (
            <button
              type="button"
              className="hw-syl"
              onClick={() => setShowSyl((v) => !v)}
              aria-pressed={showSyl}
              aria-label={showSyl ? `${entry.w}，恢复原拼写` : `${entry.w}，显示音节分隔`}
            >
              {showSyl ? syl : entry.w}
            </button>
          ) : (
            entry.w
          )}
        </h2>
        <Pronounce entry={entry} refw={ref ?? entry} />

        <ol className="senses">
          {entry.senses.map((s, i) => (
            <li key={i}>
              <span className="pos">{s.pos}</span>
              <span className="zh">
                <LookupText text={s.zh} />
              </span>
              {s.en && (
                <span className="en" lang="en">
                  <LookupText text={s.en} />
                </span>
              )}
            </li>
          ))}
        </ol>

        {entry.ex.length > 0 && (
          <section className="block">
            <h3 className="eyebrow">例句</h3>
            <ul className="examples">
              {entry.ex.map((x, i) => (
                <li key={i}>
                  {entry.ex.length > 1 && <span className={`ex-tag ${i ? "is-ielts" : ""}`}>{i ? "雅思语境" : "日常"}</span>}
                  <p className="ex-en" lang="en">
                    <LookupText text={x.en} word={entry.w} />
                    <Speak url={exUrls[i] ?? null} text={x.en} accent={i === 1 && exUrls[1] ? "us" : accent} size="sm" className="ex-speak" />
                  </p>
                  <ExZh text={x.zh} veil={veil} />
                </li>
              ))}
            </ul>
          </section>
        )}

        <ExamExamples entry={entry} veil={veil} />

        {entry.col.length > 0 && (
          <section className="block">
            <h3 className="eyebrow">常用搭配</h3>
            <ul className="collocations">
              {entry.col.map((c) => {
                const { en, zh } = splitPair(c);
                return (
                  <li key={c}>
                    <span lang="en">
                      <LookupText text={en} />
                    </span>
                    {zh && (
                      <small>
                        <LookupText text={zh} />
                      </small>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {(famLinks.length > 0 || entry.syn.length > 0 || entry.ant.length > 0) && (
          <section className="block relations">
            {famLinks.length > 0 && (
              <div>
                <h3 className="eyebrow">词族</h3>
                <p>
                  {famLinks.map((f) => (
                    <LookupWord key={f.label} label={f.label} token={f.word} />
                  ))}
                </p>
              </div>
            )}
            {entry.syn.length > 0 && (
              <div>
                <h3 className="eyebrow">近义</h3>
                <p>
                  {entry.syn.map((s) => (
                    <LookupWord key={s} label={s} />
                  ))}
                </p>
              </div>
            )}
            {entry.ant.length > 0 && (
              <div>
                <h3 className="eyebrow">反义</h3>
                <p>
                  {entry.ant.map((s) => (
                    <LookupWord key={s} label={s} />
                  ))}
                </p>
              </div>
            )}
          </section>
        )}

        {entry.tip && (
          <aside className="tip">
            <Lightbulb size={17} strokeWidth={1.8} />
            <p>{entry.tip}</p>
          </aside>
        )}

        {entry.note && <p className="usage-note">用法提醒：{entry.note}</p>}

        {mode === "detail" && card && (
          <p className="memory-note">
            {card.due <= Date.now() ? "现在可以复习" : `下次复习 ${formatInterval(card.due - Date.now())}后`} · 记忆稳定度 {card.s < 1 ? "<1" : Math.round(card.s)} 天 · 已复习 {card.reps} 次
          </p>
        )}
      </div>
    </article>
  );
}
