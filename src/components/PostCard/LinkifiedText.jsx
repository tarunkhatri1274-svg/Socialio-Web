// LinkifiedText.jsx  (WEB version)
// Put at: src/components/PostCard/LinkifiedText.jsx
import React, { useState, useMemo } from "react";

// http(s)://..., www.... or bare domains like example.com/page
const URL_REGEX =
  /((?:https?:\/\/|www\.)[^\s]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|in|org|net|io|me|co|app|dev|tv|ly|link|gg|xyz|info|shop|store|online|site)(?:\/[^\s]*)?)/gi;

const TRAILING_PUNCT = /[.,!?;:)\]}'"]+$/;

// Find all links in the text -> [{ start, end, url }]
function findLinks(text) {
  const links = [];
  const re = new RegExp(URL_REGEX.source, "gi");
  let m;
  while ((m = re.exec(text)) !== null) {
    const start = m.index;

    // skip emails (abc@gmail.com) and words glued to a previous character
    const prev = start > 0 ? text[start - 1] : "";
    if (prev === "@" || /[a-z0-9]/i.test(prev)) continue;

    // strip trailing punctuation like "." or ")"
    const raw = m[0].replace(TRAILING_PUNCT, "");
    if (!raw) continue;

    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    links.push({ start, end: start + raw.length, url });
  }
  return links;
}

const defaultLinkStyle = {
  color: "#1a73e8",
  fontWeight: 600,
  textDecoration: "none",
  cursor: "pointer",
  wordBreak: "break-all",
};

const defaultMoreStyle = {
  color: "#8e8e8e",
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

// Turns a string into normal text + blue <a> links
function renderPieces(text, links, linkStyle) {
  const out = [];
  let cursor = 0;
  links.forEach((l, i) => {
    if (l.start > cursor) out.push(text.slice(cursor, l.start));
    out.push(
      <a
        key={`l${i}`}
        href={l.url}
        target="_blank"
        rel="noopener noreferrer"
        style={linkStyle}
        // parent cards navigate on click — don't let a link click trigger that
        onClick={(e) => e.stopPropagation()}
      >
        {text.slice(l.start, l.end)}
      </a>
    );
    cursor = l.end;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return out;
}

/**
 * Renders inline (fragment) — wrap it in your own <p>/<div>/<span>.
 * Props:
 *  text       - the bio / caption string
 *  limit      - characters shown before "... more" (default 120)
 *  moreStyle  - style of the more / less button
 *  linkStyle  - override link style (default blue)
 */
export default function LinkifiedText({
  text,
  limit = 120,
  moreStyle,
  linkStyle,
}) {
  const [expanded, setExpanded] = useState(false);
  const links = useMemo(() => (text ? findLinks(text) : []), [text]);
  if (!text) return null;

  const lStyle = { ...defaultLinkStyle, ...(linkStyle || {}) };
  const btnStyle = moreStyle || defaultMoreStyle;
  const isLong = text.length > limit;

  // ── Full text (short, or expanded) ──
  if (!isLong || expanded) {
    return (
      <>
        {renderPieces(text, links, lStyle)}
        {isLong && (
          <span
            onClick={(e) => { e.stopPropagation(); setExpanded(false); }}
            style={btnStyle}
          >
            {" "}less
          </span>
        )}
      </>
    );
  }

  // ── Truncated: never cut a link in half ──
  let cut = limit;
  const hit = links.find((l) => l.start < cut && l.end > cut);
  if (hit) cut = hit.start;

  const shown = text.slice(0, cut).trimEnd();
  const shownLinks = links.filter((l) => l.end <= shown.length);

  return (
    <>
      {renderPieces(shown, shownLinks, lStyle)}...
      <span
        onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
        style={btnStyle}
      >
        {" "}more
      </span>
    </>
  );
}