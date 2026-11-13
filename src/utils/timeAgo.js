// src/utils/timeAgo.js
//
// ONE shared "time ago" formatter + live component for every web page
// (Home, Explore, Post, TextPostView, comments, stories, profiles).
//
//   timeAgo(date)      -> "now" · "5m" · "2h" · "3d" · "12 Nov" · "12 Nov 2025"
//   timeAgoLong(date)  -> "Just now" · "5m ago" · "2h ago" · "3d ago" · "12 Nov"
//   <TimeAgo date={p.createdAt} />        renders timeAgo()
//   <TimeAgo long date={slide.createdAt}/> renders timeAgoLong()
//
// <TimeAgo> re-renders itself on a single shared 30s timer, so labels keep
// moving forward ("now" -> "1m" -> "2m") without a page refresh and without
// every component running its own interval.

import { createElement, useSyncExternalStore } from "react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parse(d) {
  if (!d) return null;
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t;
}

function shortDate(t) {
  const sameYear = t.getFullYear() === new Date().getFullYear();
  return `${t.getDate()} ${MONTHS[t.getMonth()]}${sameYear ? "" : ` ${t.getFullYear()}`}`;
}

export function timeAgo(d) {
  const t = parse(d);
  if (!t) return "";
  const mins = Math.max(0, Math.floor((Date.now() - t.getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return shortDate(t);
}

export function timeAgoLong(d) {
  const t = parse(d);
  if (!t) return "";
  const s = timeAgo(d);
  if (s === "now") return "Just now";
  return /^\d+[mhd]$/.test(s) ? `${s} ago` : s;
}

// ── shared 30s ticker ───────────────────────────────────────────────────────
let tick = 0;
let timer = null;
const listeners = new Set();

function subscribe(fn) {
  listeners.add(fn);
  if (!timer) {
    timer = setInterval(() => {
      tick += 1;
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const getTick = () => tick;

/** Call inside any component that needs to re-render as time passes. */
export function useTimeTick() {
  return useSyncExternalStore(subscribe, getTick, getTick);
}

export function TimeAgo({ date, long = false, style, className }) {
  useTimeTick();
  const text = long ? timeAgoLong(date) : timeAgo(date);
  if (!text) return null;
  const t = parse(date);
  return createElement("span", { style, className, title: t ? t.toLocaleString() : undefined }, text);
}

export default timeAgo;