import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabase.js";

// (no localStorage key — all data lives in Supabase, scoped per user)
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const ALL_HOLIDAYS = {
  "2026-01-01": "New Year's Day",
  "2026-05-25": "Memorial Day",
  "2026-07-03": "Independence Day (observed)",
  "2026-09-07": "Labor Day",
  "2026-11-26": "Thanksgiving Day",
  "2026-11-27": "Day after Thanksgiving",
  "2026-12-24": "Day before Christmas",
  "2026-12-25": "Christmas Day",
  "2027-01-01": "New Year's Day",
  "2027-05-31": "Memorial Day",
  "2027-07-05": "Independence Day (observed)",
  "2027-09-06": "Labor Day",
  "2027-11-25": "Thanksgiving Day",
  "2027-11-26": "Day after Thanksgiving",
  "2027-12-24": "Day before Christmas",
  "2027-12-27": "Christmas Day (observed)",
};

const OTHER_HOLIDAYS = {
  "2026-01-19": "Martin Luther King Jr. Day",
  "2026-02-16": "Presidents' Day",
  "2026-06-19": "Juneteenth",
  "2026-10-12": "Columbus Day",
  "2026-11-11": "Veterans Day",
  "2027-01-18": "Martin Luther King Jr. Day",
  "2027-02-15": "Presidents' Day",
  "2027-06-19": "Juneteenth",
  "2027-10-11": "Columbus Day",
  "2027-11-11": "Veterans Day",
};

const FY_END = new Date(2026, 7, 31);
function getClRates(cl) {
  var n = parseInt(cl) || 8;
  if (n <= 4)  return { pre5: 9.00, post5: 9.00, post10: 9.00 }; // Accenture Leadership
  if (n <= 7)  return { pre5: 8.33, post5: 8.33, post10: 9.00 }; // CL 5-7
  if (n <= 9)  return { pre5: 7.00, post5: 7.67, post10: 8.33 }; // CL 8-9
  if (n <= 11) return { pre5: 6.67, post5: 7.00, post10: 7.67 }; // CL 10-11
  return       { pre5: 5.67, post5: 6.33, post10: 7.00 };        // CL 12-13
}
const HOURS_PER_DAY = 8;
const CUL_DAYS_TOTAL = 2;

function toDateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function getFederalHolidays(year) {
  var h = new Set();
  function addObs(d) {
    var obs = new Date(d), day = obs.getDay();
    if (day === 6) obs.setDate(obs.getDate() - 1);
    else if (day === 0) obs.setDate(obs.getDate() + 1);
    h.add(toDateStr(obs));
  }
  function nthMon(month, n) {
    var d = new Date(year, month, 1);
    d.setDate(1 + (1 - d.getDay() + 7) % 7 + (n - 1) * 7);
    return d;
  }
  function lastMon(month) {
    var d = new Date(year, month + 1, 0);
    d.setDate(d.getDate() - (d.getDay() - 1 + 7) % 7);
    return d;
  }
  function nthThu(month, n) {
    var d = new Date(year, month, 1);
    d.setDate(1 + (4 - d.getDay() + 7) % 7 + (n - 1) * 7);
    return d;
  }
  addObs(new Date(year, 0, 1));       // New Year's Day
  h.add(toDateStr(nthMon(0, 3)));     // MLK Day
  h.add(toDateStr(nthMon(1, 3)));     // Presidents' Day
  h.add(toDateStr(lastMon(4)));       // Memorial Day
  addObs(new Date(year, 5, 19));      // Juneteenth
  addObs(new Date(year, 6, 4));       // Independence Day
  h.add(toDateStr(nthMon(8, 1)));     // Labor Day
  h.add(toDateStr(nthMon(9, 2)));     // Columbus Day
  addObs(new Date(year, 10, 11));     // Veterans Day
  h.add(toDateStr(nthThu(10, 4)));    // Thanksgiving
  addObs(new Date(year, 11, 25));     // Christmas
  return h;
}

function getPayPeriodEndDates() {
  var endYear = new Date().getFullYear() + 20;
  var holidays = new Set();
  for (var y = 2025; y <= endYear; y++) {
    getFederalHolidays(y).forEach(function(d) { holidays.add(d); });
  }
  var dates = [];
  for (var year = 2025; year < endYear; year++) {
    for (var month = 0; month < 12; month++) {
      [6, 21].forEach(function(dom) {
        var d = new Date(year, month, dom);
        while (d.getDay() === 0 || d.getDay() === 6 || holidays.has(toDateStr(d))) {
          d.setDate(d.getDate() - 1);
        }
        dates.push(new Date(d));
      });
    }
  }
  dates.sort(function(a, b) { return a - b; });
  return dates;
}
const PAY_PERIOD_ENDS = getPayPeriodEndDates();

function dkey(y, m, d) {
  return y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
}
function daysIn(y, m) { return new Date(y, m + 1, 0).getDate(); }
function dayOfWeek(y, m, d) { return new Date(y, m, d).getDay(); }
function isWknd(y, m, d) { var w = dayOfWeek(y, m, d); return w === 0 || w === 6; }
function isHol(key) { return key in ALL_HOLIDAYS; }
function isOtherHol(key) { return key in OTHER_HOLIDAYS; }

function getDatesInRange(startKey, endKey) {
  var today = new Date(); today.setHours(0,0,0,0);
  var start = new Date(startKey + "T12:00:00");
  var end = new Date(endKey + "T12:00:00");
  if (start > end) { var tmp = start; start = end; end = tmp; }
  var dates = [];
  var cur = new Date(start);
  while (cur <= end) {
    var dow = cur.getDay();
    var k = toDateStr(cur);
    if (dow !== 0 && dow !== 6 && !isHol(k) && cur >= today) dates.push(k);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

var DEFAULT_DATA = {};

var mono = "'Space Mono', monospace";
var grotesk = "'Space Grotesk', sans-serif";
var work = "'Work Sans', sans-serif";
var goudy = "'Sorts Mill Goudy', serif";

var T = {
  stat:    { fontFamily: mono,   fontWeight: 400, lineHeight: 1 },

  display: {
    lg: { fontFamily: goudy, fontStyle: "italic", fontSize: 50, lineHeight: 1, letterSpacing: -1 },
    md: { fontFamily: goudy, fontStyle: "italic", fontSize: 22 },
  },

  num:     { fontFamily: grotesk, fontSize: 20, fontWeight: 500 },

  label: {
    get base() { return { fontFamily: work, fontSize: 11, fontWeight: 400, textTransform: "uppercase", letterSpacing: S.labelLetterSpacing }; },
    get alt()  { return { fontFamily: work, fontSize: 11, fontWeight: 500, textTransform: "uppercase", letterSpacing: S.labelLetterSpacing }; },
    sm:   { fontFamily: work, fontSize: 11, fontWeight: 400 },
  },

  body: {
    sm:    { fontFamily: work, fontSize: 12, fontWeight: 400 },
    smAlt: { fontFamily: work, fontSize: 12, fontWeight: 500 },
    base:  { fontFamily: work, fontSize: 14, fontWeight: 400 },
    alt:   { fontFamily: work, fontSize: 14, fontWeight: 500 },
  },
};
// button = label.alt; input = body.alt

// Primitives — raw values. Swap these to re-theme.
var P = {
  white:    "#FFFFFF",
  gray05:   "#F8F8F8",
  gray15:   "#E3E3E3",
  gray25:   "#CECECE",
  gray45:   "#757575",
  black:    "#000000",

  ink:      "#141B13",
  inkDeep:  "#0F170F",

  lime:     "#ADFF55",
  limeDeep: "#70D900",
  lime05:   "#E0FF66",
  lime35:   "#4C9928",
  lime55:   "#386828",
  lime75:   "#263E21",
  mint:     "#C8FFD6",

  yellow:   "#D9FF00",
  yellowHi: "#FCF937",
  coral:    "#FF715B",
  maroon:   "#400000",
};

// Semantic tokens — light + dark variants. `S` is the live token object
// (mutated by applyTheme on every render so module-global reads stay in sync).
var LIGHT_S = {
  bg:            P.white,
  surface:       P.white,
  surfaceAlt:    P.gray05,
  surfaceAltRgb: "248,248,248",
  border:        P.gray15,

  text:          P.black,
  textSubtle:    P.gray45,
  textFaint:     P.gray25,

  iconSubtle:    P.gray45,
  iconOnPto:     P.white,

  today:         P.black,
  todayText:     P.white,

  pto:           P.lime,
  ptoOver:       P.coral,
  ptoOverText:   P.maroon,
  cul:           P.yellow,
  holiday:       P.yellowHi,
  unpaid:        P.limeDeep,

  surfacePopup:  P.white,

  labelLetterSpacing: "0.08em",

  shadowHeader:  "0 1px 12px rgba(0,0,0,0.08)",
  shadowThumb:   "0 1px 4px rgba(0,0,0,0.12)",
};

var DARK_S = {
  bg:            P.ink,
  surface:       P.ink,
  surfaceAlt:    P.inkDeep,
  surfacePopup:  P.inkDeep,
  surfaceAltRgb: "15,23,15",
  border:        P.lime75,

  text:          P.lime,
  textSubtle:    P.lime55,
  textFaint:     P.lime75,

  iconSubtle:    P.lime35,
  iconOnPto:     P.inkDeep,

  today:         P.mint,
  todayText:     P.inkDeep,

  pto:           P.lime,
  ptoOver:       P.coral,
  ptoOverText:   P.coral,
  cul:           P.lime05,
  holiday:       P.lime75,
  unpaid:        P.lime35,

  labelLetterSpacing: "0.1em",

  shadowHeader:  "0 2px 16px rgba(0,0,0,0.4)",
  shadowThumb:   "0 2px 6px rgba(0,0,0,0.4)",
};

var S = Object.assign({}, LIGHT_S);
function applyTheme(mode) {
  var src = mode === "dark" ? DARK_S : LIGHT_S;
  Object.keys(S).forEach(function(k) { if (!(k in src)) delete S[k]; });
  Object.keys(src).forEach(function(k) { S[k] = src[k]; });
  document.documentElement.style.background = src.bg;
}

function DateField({ value, onChange, onFocus, onBlur, isFocused }) {
  var parts = (value || "").split("-");
  var [yyyy, setYyyy] = useState(parts[0] || "");
  var [mm, setMm] = useState(parts[1] || "");
  var [dd, setDd] = useState(parts[2] || "");

  useEffect(function() {
    var p = (value || "").split("-");
    setYyyy(p[0] || ""); setMm(p[1] || ""); setDd(p[2] || "");
  }, [value]);

  var containerRef = useRef(null);
  var mmRef = useRef(null);
  var ddRef = useRef(null);
  var yyyyRef = useRef(null);

  function tryEmit(y, m, d) {
    if (y.length === 4 && m.length === 2 && d.length === 2) onChange(y + "-" + m + "-" + d);
  }
  function handleContainerFocus(e) {
    if (!containerRef.current.contains(e.relatedTarget)) onFocus && onFocus();
  }
  function handleContainerBlur(e) {
    if (!containerRef.current.contains(e.relatedTarget)) onBlur && onBlur();
  }

  var seg = { border: "none", outline: "none", ...T.body.alt, background: "transparent", color: S.text, textAlign: "center", padding: 0 };
  var sep = { ...T.body.base, color: S.textSubtle, userSelect: "none" };

  return (
    <div ref={containerRef} onFocus={handleContainerFocus} onBlur={handleContainerBlur}
      style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <style>{"input.datefield-seg::placeholder { color: " + S.textSubtle + "; opacity: 1; }"}</style>
      <input ref={mmRef} type="text" value={mm} maxLength={2} placeholder="MM" className="datefield-seg"
        onChange={function(e) { var v = e.target.value.replace(/\D/g,"").slice(0,2); setMm(v); tryEmit(yyyy,v,dd); if (v.length===2) ddRef.current && ddRef.current.focus(); }}
        style={Object.assign({}, seg, { width: 22 })} />
      <span style={sep}>/</span>
      <input ref={ddRef} type="text" value={dd} maxLength={2} placeholder="DD" className="datefield-seg"
        onChange={function(e) { var v = e.target.value.replace(/\D/g,"").slice(0,2); setDd(v); tryEmit(yyyy,mm,v); if (v.length===2) yyyyRef.current && yyyyRef.current.focus(); }}
        onKeyDown={function(e) { if (e.key==="Backspace" && dd==="") mmRef.current && mmRef.current.focus(); }}
        style={Object.assign({}, seg, { width: 22 })} />
      <span style={sep}>/</span>
      <input ref={yyyyRef} type="text" value={yyyy} maxLength={4} placeholder="YYYY" className="datefield-seg"
        onChange={function(e) { var v = e.target.value.replace(/\D/g,"").slice(0,4); setYyyy(v); tryEmit(v,mm,dd); }}
        onKeyDown={function(e) { if (e.key==="Backspace" && yyyy==="") ddRef.current && ddRef.current.focus(); }}
        style={Object.assign({}, seg, { width: 36 })} />
    </div>
  );
}

function AnimatedDigit({ digit, slotState }) {
  var d = parseInt(digit, 10);
  var [displayD, setDisplayD] = useState(d);
  var [animating, setAnimating] = useState(false);
  var [targetPct, setTargetPct] = useState(slotState === 'entering' ? -66.666 : -33.333);
  var prevRef = useRef(d);
  var timerRef = useRef(null);

  // entering: slide in from above
  useEffect(function() {
    if (slotState !== 'entering') return;
    var raf = requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        setAnimating(true);
        setTargetPct(-33.333);
        timerRef.current = setTimeout(function() { setAnimating(false); }, 210);
      });
    });
    return function() { cancelAnimationFrame(raf); };
  }, []);

  // exiting: scroll up into nothing (width collapse handled by CSS animation on wrapper)
  useEffect(function() {
    if (slotState !== 'exiting') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    setAnimating(true);
    setTargetPct(0);
  }, [slotState]);

  // merging: staying slot scrolls down to reveal new digit value below it
  useEffect(function() {
    if (slotState !== 'merging') return;
    if (timerRef.current) clearTimeout(timerRef.current);
    prevRef.current = d;
    setAnimating(true);
    setTargetPct(-66.666);
    timerRef.current = setTimeout(function() {
      setDisplayD(d);
      setTargetPct(-33.333);
      setAnimating(false);
    }, 210);
  }, [slotState]);

  // normal digit change (same digit count)
  useEffect(function() {
    if (slotState !== 'normal') return;
    var prev = prevRef.current;
    if (d === prev) return;
    prevRef.current = d;
    if (timerRef.current) clearTimeout(timerRef.current);
    var isInc = (d === prev + 1) || (prev === 9 && d === 0);
    var isDec = (d === prev - 1) || (prev === 0 && d === 9);
    var target = isInc ? 0 : -66.666;
    setAnimating(true);
    setTargetPct(target);
    timerRef.current = setTimeout(function() {
      setAnimating(false);
      setDisplayD(d);
      setTargetPct(-33.333);
    }, 210);
  }, [d, slotState]);

  var above = (displayD + 1) % 10;
  var topItem    = (slotState === 'entering' || slotState === 'exiting') ? '\u00A0' : above;
  // bottom always uses d: for dec animations d===below anyway; for merging d is the new digit;
  // for entering/exiting nothing should appear below
  var bottomItem = (slotState === 'entering' || slotState === 'exiting') ? '\u00A0' : d;

  return (
    // Outer wrapper: collapses width+opacity when exiting so label slides left
    <span style={{
      display: 'inline-block',
      overflow: 'hidden',
      animation: slotState === 'exiting' ? 'digitWidthExit 200ms cubic-bezier(0.4, 0, 0, 1) forwards' : 'none',
    }}>
      <span style={{ display: 'inline-block', overflow: 'hidden', height: '1em' }}>
        <span style={{
          display: 'block',
          transform: 'translateY(' + targetPct + '%)',
          transition: animating ? 'transform 200ms cubic-bezier(0.4, 0, 0, 1)' : 'none',
        }}>
          <span style={{ display: 'block', lineHeight: 1 }}>{topItem}</span>
          <span style={{ display: 'block', lineHeight: 1 }}>{displayD}</span>
          <span style={{ display: 'block', lineHeight: 1 }}>{bottomItem}</span>
        </span>
      </span>
    </span>
  );
}

function AnimatedNumber({ value, style }) {
  var isNeg = value < 0;
  var absValue = isNeg ? Math.abs(value) : value;
  var keyRef = useRef(0);
  var prevValueRef = useRef(absValue);
  var [slots, setSlots] = useState(function() {
    return String(absValue).split('').map(function(d, i) {
      return { digit: parseInt(d, 10), key: 's' + i, state: 'normal' };
    });
  });

  useEffect(function() {
    var prev = prevValueRef.current;
    if (absValue === prev) return;
    prevValueRef.current = absValue;
    var prevStr = String(prev);
    var currStr = String(absValue);

    if (prevStr.length === currStr.length) {
      setSlots(function(old) {
        return currStr.split('').map(function(d, i) {
          return { digit: parseInt(d, 10), key: old[i].key, state: 'normal' };
        });
      });
    } else if (currStr.length < prevStr.length) {
      // Lost last digit (e.g. 10→9):
      // - remaining slots (left-aligned) stay and MERGE to new digits
      // - last old slot EXITS with width collapse
      setSlots(function(old) {
        var merging = currStr.split('').map(function(d, i) {
          return { digit: parseInt(d, 10), key: old[i].key, state: 'merging' };
        });
        var exiting = { digit: old[old.length - 1].digit, key: old[old.length - 1].key, state: 'exiting' };
        return merging.concat([exiting]);
      });
      setTimeout(function() {
        setSlots(function(s) {
          return s
            .filter(function(sl) { return sl.state !== 'exiting'; })
            .map(function(sl) { return sl.state === 'merging' ? { digit: sl.digit, key: sl.key, state: 'normal' } : sl; });
        });
      }, 210);
    } else {
      // Gained a leading digit (e.g. 9→10): add entering slot at front
      var newKey = 's' + (++keyRef.current);
      setSlots(function(old) {
        var entering = { digit: parseInt(currStr[0], 10), key: newKey, state: 'entering' };
        var rest = currStr.slice(1).split('').map(function(d, i) {
          return { digit: parseInt(d, 10), key: old[i] ? old[i].key : 's' + (++keyRef.current), state: 'normal' };
        });
        return [entering].concat(rest);
      });
      setTimeout(function() {
        setSlots(function(s) {
          return s.map(function(sl) { return sl.state === 'entering' ? { digit: sl.digit, key: sl.key, state: 'normal' } : sl; });
        });
      }, 210);
    }
  }, [absValue]);

  return (
    <span style={Object.assign({ display: 'inline-flex', alignItems: 'center' }, style)}>
      {isNeg && <span style={{ marginRight: 1 }}>-</span>}
      {slots.map(function(slot) {
        return <AnimatedDigit key={slot.key} digit={slot.digit} slotState={slot.state} />;
      })}
    </span>
  );
}

export default function PTOTracker({ user, initialSettings }) {
  var [theme, setTheme] = useState("system");
  var [systemDark, setSystemDark] = useState(function() {
    return typeof window !== "undefined" && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(function() {
    if (typeof window === "undefined" || !window.matchMedia) return;
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    function onChange(e) { setSystemDark(e.matches); }
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else if (mq.addListener) mq.addListener(onChange);
    return function() {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else if (mq.removeListener) mq.removeListener(onChange);
    };
  }, []);
  var resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;
  applyTheme(resolvedTheme);

  return <PTOTrackerApp user={user} theme={theme} setTheme={setTheme} initialSettings={initialSettings} />;
}

function oooEase(x) {
  var p1x = 0.4, p1y = 0.0, p2x = 0.0, p2y = 1.0;
  function sx(t) { return 3*(1-t)*(1-t)*t*p1x + 3*(1-t)*t*t*p2x + t*t*t; }
  function sy(t) { return 3*(1-t)*(1-t)*t*p1y + 3*(1-t)*t*t*p2y + t*t*t; }
  function sdx(t) { return 3*(1-t)*(1-t)*p1x + 6*(1-t)*t*(p2x-p1x) + 3*t*t*(1-p2x); }
  var u = x;
  for (var i = 0; i < 10; i++) { var d = sdx(u); if (Math.abs(d) < 1e-6) break; u -= (sx(u)-x)/d; }
  return sy(u);
}
function smoothScrollTop(el, duration) {
  if (!el || el.scrollTop === 0) return;
  var from = el.scrollTop, startTime = performance.now();
  function tick(now) {
    var t = Math.min((now - startTime) / duration, 1);
    el.scrollTop = from * (1 - oooEase(t));
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function smoothScrollTo(container, targetEl, duration) {
  if (!container || !targetEl) return;
  var from = container.scrollTop;
  var to = Math.max(0, from + targetEl.getBoundingClientRect().top - container.getBoundingClientRect().top - 64);
  if (Math.abs(to - from) < 1) return;
  var startTime = performance.now();
  function tick(now) {
    var t = Math.min((now - startTime) / duration, 1);
    container.scrollTop = from + (to - from) * oooEase(t);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

function PTOTrackerApp({ user, theme, setTheme, initialSettings }) {
  var demoMode = !!initialSettings;
  var minViewYear = Math.max(2026, new Date().getFullYear() - 5);
  var [fadeIn, setFadeIn] = useState(false);
  var [days, setDays] = useState(DEFAULT_DATA);
  var [viewYear, setViewYear] = useState(function() { var t = new Date(); return t.getMonth() >= 8 ? t.getFullYear() + 1 : t.getFullYear(); });
  var [loaded, setLoaded] = useState(false);

  // Fade in once data is loaded: double-RAF ensures the browser paints opacity:0 first
  useEffect(function() {
    if (!loaded) return;
    var id = requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        setFadeIn(true);
        smoothScrollTo(calendarScrollRef.current, document.getElementById("month-current"), 600);
      });
    });
    return function() { cancelAnimationFrame(id); };
  }, [loaded]);
  var [active, setActive] = useState(null);
  var [showProj, setShowProj] = useState(false);
  var [showSettings, setShowSettings] = useState(false);
  var [bal, setBal] = useState(0);
  var [balDate, setBalDate] = useState(new Date().toISOString().slice(0,10));
  var [toast, setToast] = useState(null);
  var [toastVisible, setToastVisible] = useState(false);
  var [showPanel, setShowPanel] = useState(false);
  var [panelTab, setPanelTab] = useState("overview");
  var [sheetDragY, setSheetDragY] = useState(0);
  var sheetDragStart = useRef(null);
  var defaultName = (user && user.user_metadata && user.user_metadata.full_name) ? user.user_metadata.full_name.split(' ')[0] : '';
  var [userName, setUserName] = useState(defaultName);
  var [editName, setEditName] = useState(defaultName);
  var [editCL, setEditCL] = useState('');
  var [editBal, setEditBal] = useState(0);
  var [editBalDate, setEditBalDate] = useState(new Date().toISOString().slice(0,10));
  var [culBal, setCulBal] = useState(CUL_DAYS_TOTAL);
  var [startStr, setStartStr] = useState('');
  var [editStart, setEditStart] = useState('');
  var [mlDateStr, setMlDateStr] = useState("");
  var [editMLDate, setEditMLDate] = useState("");
  var [settingsDirty, setSettingsDirty] = useState(false);
  var [focusedField, setFocusedField] = useState(null);
  var [justToggled, setJustToggled] = useState({});
  var [tooltip, setTooltip] = useState(null);
  var [tooltipShift, setTooltipShift] = useState(0);
  var prevDaysRef = useRef(null);
  var userChangedSettingsRef = useRef(false);
  var tooltipDivRef = useRef(null);
  var tabBarRef = useRef(null);
  var tabItemRefs = useRef({});
  var yearNavRef = useRef(null);
  var [dotBtnTop, setDotBtnTop] = useState(32);
  var [indicatorPos, setIndicatorPos] = useState({ left: 0, width: 0 });
  var MOBILE_BP = 768;
  var [isMobile, setIsMobile] = useState(typeof window !== "undefined" ? window.innerWidth <= MOBILE_BP : false);
  var [writeSelectedGroups, setWriteSelectedGroups] = useState([]);
  var [approvedGroups, setApprovedGroups] = useState({});
  var [lockedDates, setLockedDates] = useState({});
  var [weekStart, setWeekStart] = useState("sunday");
  var [showHolidays, setShowHolidays] = useState("acn");
  var [calFading, setCalFading] = useState(false);
  var [fy26Rollover, setFy26Rollover] = useState(null); // null = not yet decided, true = applies, false = CA/CO/MT/NE exception
  var [showFy26Modal, setShowFy26Modal] = useState(false);
  var [modKeyDown, setModKeyDown] = useState(false);
  var didDragRef = useRef(false);
  var dragRef = useRef({ isDragging: false, anchor: null, hasMoved: false, dates: [] });
  var [dragPreviewDates, setDragPreviewDates] = useState([]);
  var [dragMode, setDragMode] = useState("add");
  // Derived — no state needed
  var historyRef = useRef([]);
  var redoRef = useRef([]);
  var daysRef = useRef(days);
  var lockedDatesRef = useRef(lockedDates);
  useEffect(function() { lockedDatesRef.current = lockedDates; }, [lockedDates]);
  var calendarScrollRef = useRef(null);
  var [headerScrolled, setHeaderScrolled] = useState(false);

  // Immediate Supabase upsert with current state + overrides. Avoids the
  // useEffect-deferred upsert race where a fast refresh cancels the request.
  function persistSettings(overrides) {
    var data = {
      bal: bal, balDate: balDate, culBal: culBal, userName: userName, editCL: editCL,
      approvedGroups: approvedGroups, lockedDates: lockedDates, startStr: startStr,
      mlDateStr: mlDateStr, weekStart: weekStart, showHolidays: showHolidays, theme: theme
    };
    if (overrides) Object.assign(data, overrides);
    if (!demoMode) supabase.from('pto_settings').upsert({ user_id: user.id, data: data }).then(function() {});
  }

  useEffect(function() { daysRef.current = days; }, [days]);

  useEffect(function() {
    var el = calendarScrollRef.current;
    if (!el) return;
    function onScroll() { setHeaderScrolled(el.scrollTop > 0); }
    el.addEventListener("scroll", onScroll, { passive: true });
    return function() { el.removeEventListener("scroll", onScroll); };
  }, []);

  useLayoutEffect(function() {
    if (!tooltipDivRef.current) { setTooltipShift(0); return; }
    var rect = tooltipDivRef.current.getBoundingClientRect();
    var margin = 8;
    var shift = 0;
    if (rect.left < margin) shift = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) shift = window.innerWidth - margin - rect.right;
    setTooltipShift(shift);
  }, [tooltip]);


  useEffect(function() {
    function onKeyDown(e) {
      if (e.metaKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) {
          if (redoRef.current.length > 0) {
            var nextState = redoRef.current[redoRef.current.length - 1];
            redoRef.current = redoRef.current.slice(0, -1);
            historyRef.current = historyRef.current.slice(-19).concat([Object.assign({}, daysRef.current)]);
            setDays(nextState);
          }
        } else {
          if (historyRef.current.length > 0) {
            var prev = historyRef.current[historyRef.current.length - 1];
            historyRef.current = historyRef.current.slice(0, -1);
            redoRef.current = redoRef.current.slice(-19).concat([Object.assign({}, daysRef.current)]);
            setDays(prev);
          }
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return function() { window.removeEventListener("keydown", onKeyDown); };
  }, []);

  useEffect(function() {
    function onDown(e) { if (e.altKey) setModKeyDown(true); }
    function onUp(e) { if (!e.altKey) setModKeyDown(false); }
    function onBlur() { setModKeyDown(false); }
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return function() {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);


  useEffect(function() {
    function onMouseUp() {
      if (!dragRef.current.isDragging) return;
      dragRef.current.isDragging = false;
      var dates = dragRef.current.dates || [];
      setDragPreviewDates([]);
      if (!dragRef.current.hasMoved || dates.length === 0) return;
      didDragRef.current = true;
      var mode = dragRef.current.dragMode;
      if (mode === "to-unpaid") {
        pushHistory();
        setDays(function(prev) {
          var u = Object.assign({}, prev);
          dates.forEach(function(k) { if (u[k] === "PLAN") u[k] = "PLAN_UNPAID"; });
          return u;
        });
      } else if (mode === "to-plan") {
        pushHistory();
        setDays(function(prev) {
          var u = Object.assign({}, prev);
          dates.forEach(function(k) { if (u[k] === "PLAN_UNPAID") u[k] = "PLAN"; });
          return u;
        });
      } else if (mode === "lock" || mode === "unlock") {
        var isLocking = mode === "lock";
        var newLocked = Object.assign({}, lockedDatesRef.current);
        var currDays = daysRef.current;
        dates.forEach(function(k) {
          var t = currDays[k];
          if (t === "PLAN" || t === "PLAN_CUL" || t === "PLAN_UNPAID") {
            if (isLocking) newLocked[k] = true;
            else delete newLocked[k];
          }
        });
        userChangedSettingsRef.current = true;
        setLockedDates(newLocked);
      } else if (mode === "remove") {
        pushHistory();
        setDays(function(prev) {
          var u = Object.assign({}, prev);
          dates.forEach(function(k) {
            if (u[k] === "PLAN" || u[k] === "PLAN_CUL" || u[k] === "PLAN_UNPAID") delete u[k];
          });
          return u;
        });
      } else {
        var culAvail = Math.max(0, statsRef.current ? statsRef.current.culRemaining : 0);
        var ptoAvail = Math.max(0, statsRef.current ? statsRef.current.totalAvailDays : 0);
        var culDates = dates.slice(0, culAvail);
        var ptoDates = dates.slice(culAvail, culAvail + ptoAvail);
        var hasExcess = dates.length > culDates.length + ptoDates.length;
        setDays(function(prev) {
          var u = Object.assign({}, prev);
          culDates.forEach(function(k) { u[k] = "PLAN_CUL"; });
          ptoDates.forEach(function(k) { u[k] = "PLAN"; });
          return u;
        });
        if (hasExcess) notify("All PTO planned for the year");
      }
    }
    document.addEventListener("mouseup", onMouseUp);
    return function() { document.removeEventListener("mouseup", onMouseUp); };
  }, [pushHistory]);

  useEffect(function() {
    function handleResize() {
      setIsMobile(window.innerWidth <= MOBILE_BP);
      if (yearNavRef.current) {
        var rect = yearNavRef.current.getBoundingClientRect();
        setDotBtnTop(rect.top);
      }
    }
    requestAnimationFrame(handleResize);
    window.addEventListener("resize", handleResize);
    return function() { window.removeEventListener("resize", handleResize); };
  }, [showPanel, loaded]);

  useEffect(function() {
    async function loadData() {
      if (demoMode) {
        var p = initialSettings;
        if (p.bal !== undefined) setBal(p.bal);
        if (p.balDate) setBalDate(p.balDate);
        if (p.culBal !== undefined) setCulBal(p.culBal);
        if (p.userName) setUserName(p.userName);
        if (p.editCL) setEditCL(p.editCL);
        if (p.startStr) setStartStr(p.startStr);
        if (p.mlDateStr) setMlDateStr(p.mlDateStr);
        setLoaded(true);
        return;
      }
      try {
        var res = await supabase.from('pto_days').select('*').eq('user_id', user.id);
        if (!res.error && res.data && res.data.length > 0) {
          var cutoff = minViewYear + "-01-01";
          var loaded_days = {};
          var oldDates = [];
          res.data.forEach(function(row) {
            if (row.date >= cutoff) { loaded_days[row.date] = row.type; }
            else { oldDates.push(row.date); }
          });
          if (oldDates.length > 0) await supabase.from('pto_days').delete().eq('user_id', user.id).in('date', oldDates);
          prevDaysRef.current = loaded_days;
          setDays(loaded_days);
        }
        var sRes = await supabase.from('pto_settings').select('data').eq('user_id', user.id).single();
        if (!sRes.error && sRes.data) {
          var p2 = sRes.data.data;
          if (p2.bal !== undefined) setBal(p2.bal);
          if (p2.balDate) setBalDate(p2.balDate);
          if (p2.culBal !== undefined) setCulBal(p2.culBal);
          if (p2.userName) setUserName(p2.userName);
          if (p2.editCL) setEditCL(p2.editCL);
          if (p2.approvedGroups) setApprovedGroups(p2.approvedGroups);
          if (p2.lockedDates) setLockedDates(p2.lockedDates);
          if (p2.startStr) setStartStr(p2.startStr);
          if (p2.mlDateStr) setMlDateStr(p2.mlDateStr);
          if (p2.weekStart) setWeekStart(p2.weekStart);
          if (p2.showHolidays) setShowHolidays(p2.showHolidays);
          if (p2.theme === "light" || p2.theme === "dark" || p2.theme === "system") setTheme(p2.theme);
          if (p2.fy26Rollover !== undefined) {
            setFy26Rollover(p2.fy26Rollover);
          } else {
            // First time seeing this user after policy — show the modal (only before Jan 1, 2027)
            if (new Date() < new Date(2027, 0, 1)) setShowFy26Modal(true);
          }
        }
      } catch(e) {}
      setLoaded(true);
    }
    loadData();
  }, []);

  useEffect(function() {
    if (!loaded) return;
    // Sync days changes to Supabase
    async function syncDays() {
      var prev = prevDaysRef.current || {};
      var curr = days;
      var toUpsert = [];
      Object.keys(curr).forEach(function(date) {
        if (prev[date] !== curr[date]) toUpsert.push({ date: date, type: curr[date] });
      });
      var toDelete = Object.keys(prev).filter(function(date) { return !(date in curr); });
      if (!demoMode && toUpsert.length > 0) await supabase.from('pto_days').upsert(toUpsert.map(function(r) { return Object.assign({ user_id: user.id }, r); }));
      if (!demoMode && toDelete.length > 0) await supabase.from('pto_days').delete().eq('user_id', user.id).in('date', toDelete);
      prevDaysRef.current = Object.assign({}, curr);
    }
    syncDays();
  }, [days, loaded]);

  useEffect(function() {
    if (!loaded) return;
    var data = { bal: bal, balDate: balDate, culBal: culBal, userName: userName, editCL: editCL, approvedGroups: approvedGroups, lockedDates: lockedDates, startStr: startStr, mlDateStr: mlDateStr, weekStart: weekStart, showHolidays: showHolidays, theme: theme, fy26Rollover: fy26Rollover };
    if (userChangedSettingsRef.current) {
      userChangedSettingsRef.current = false;
      if (!demoMode) supabase.from('pto_settings').upsert({ user_id: user.id, data: data }).then(function() {});
    }
  }, [bal, balDate, culBal, loaded, userName, editCL, approvedGroups, lockedDates, startStr, mlDateStr, weekStart, showHolidays, theme, fy26Rollover]);

  // Sync edit fields when settings tab opens
  useEffect(function() {
    if (panelTab === "settings") {
      setEditName(userName);
      setEditBal(bal);
      setEditBalDate(balDate);
      setEditStart(startStr);
      setEditMLDate(mlDateStr);
      setSettingsDirty(false);
    }
  }, [panelTab, userName, bal, balDate, startStr]);

  // Slide tab indicator to active tab
  useEffect(function() {
    var container = tabBarRef.current;
    var el = tabItemRefs.current[panelTab];
    if (container && el) {
      var cr = container.getBoundingClientRect();
      var er = el.getBoundingClientRect();
      setIndicatorPos({ left: er.left - cr.left, width: er.width });
    }
  }, [panelTab, showPanel]);


  var notify = useCallback(function(msg) {
    setToast(msg);
    setToastVisible(true);
    setTimeout(function() {
      setToastVisible(false);
      setTimeout(function() { setToast(null); }, 200);
    }, 1800);
  }, []);

  var pushHistory = useCallback(function() {
    historyRef.current = historyRef.current.slice(-19).concat([Object.assign({}, daysRef.current)]);
    redoRef.current = [];
  }, []);

  var toggle = useCallback(function(key, type) {
    pushHistory();
    setDays(function(prev) {
      var cur = prev[key] || "";
      var next = cur === type ? "" : type;
      var u = Object.assign({}, prev);
      if (next === "") { delete u[key]; } else { u[key] = next; }
      return u;
    });
    setActive(null);
  }, [pushHistory]);

  var stats = useMemo(function() {
    var asOf = new Date(balDate);       // user's snapshot reference date
    var today = new Date(); today.setHours(0,0,0,0);
    var milestoneD = new Date(startStr); milestoneD.setFullYear(milestoneD.getFullYear() + 5);
    var milestone10D = new Date(startStr); milestone10D.setFullYear(milestone10D.getFullYear() + 10);
    var clRates = getClRates(editCL);
    var prevClRates = getClRates(parseInt(editCL) + 1);
    var mlDate = mlDateStr ? (function() { var d = new Date(mlDateStr); d.setHours(0,0,0,0); return d; })() : null;
    function rateForPP(pp) {
      var rates = (mlDate && pp < mlDate) ? prevClRates : clRates;
      return pp >= milestone10D ? rates.post10 : pp >= milestoneD ? rates.post5 : rates.pre5;
    }
    var entries = Object.entries(days);
    var fyStart = new Date(viewYear - 1, 8, 1);
    var fyEnd = new Date(viewYear, 7, 31);

    // FY counters
    var ptoUsed = 0, ptoPlanned = 0, culUsed = 0, culPlanned = 0;
    var culByYear = {};
    entries.forEach(function(entry) {
      var k = entry[0], t = entry[1];
      var d = new Date(k); var y = d.getFullYear();
      var inFY = d >= fyStart && d <= fyEnd;
      if (t === "PTO" && inFY) ptoUsed++;
      if (t === "PLAN" && inFY) ptoPlanned++;
      if (t === "CUL" && y === viewYear) culUsed++;
      if (t === "PLAN_CUL" && y === viewYear) culPlanned++;
      if (t === "CUL" || t === "PLAN_CUL") culByYear[y] = (culByYear[y] || 0) + 1;
    });

    // Auto-compute current balance: walk FY by FY from snapshot to today,
    // applying the 200-hr carryover cap at each Aug 31 boundary crossed.
    var currentBal = (function() {
      var runBal = bal;
      var segStart = asOf;
      var fyEndYear = asOf.getMonth() >= 8 ? asOf.getFullYear() + 1 : asOf.getFullYear();
      var nextFYEnd = new Date(fyEndYear, 7, 31);
      while (nextFYEnd < today) {
        PAY_PERIOD_ENDS.forEach(function(pp) {
          if (pp > segStart && pp <= nextFYEnd) runBal += rateForPP(pp);
        });
        entries.forEach(function(entry) {
          var k = entry[0], t = entry[1];
          if (t === "PTO") { var d = new Date(k); if (d > segStart && d <= nextFYEnd) runBal -= HOURS_PER_DAY; }
        });
        if (!(fy26Rollover === true && nextFYEnd.getFullYear() === 2026)) runBal = Math.min(runBal, 200);
        segStart = nextFYEnd;
        nextFYEnd = new Date(nextFYEnd.getFullYear() + 1, 7, 31);
      }
      PAY_PERIOD_ENDS.forEach(function(pp) {
        if (pp > segStart && pp <= today) runBal += rateForPP(pp);
      });
      entries.forEach(function(entry) {
        var k = entry[0], t = entry[1];
        if (t === "PTO") { var d = new Date(k); if (d > segStart && d <= today) runBal -= HOURS_PER_DAY; }
      });
      return runBal;
    })();

    // Future accruals: today → FY end
    var futAcc = 0;
    PAY_PERIOD_ENDS.forEach(function(pp) {
      if (pp > today && pp <= fyEnd)
        futAcc += rateForPP(pp);
    });

    // Planned PTO remaining after today (in FY)
    var ptoAfter = 0;
    entries.forEach(function(entry) {
      var k = entry[0], t = entry[1];
      if (t === "PLAN") {
        var d = new Date(k);
        if (d > today && d >= fyStart && d <= fyEnd) ptoAfter++;
      }
    });


    // Feasibility for each future PLAN date, anchored at today + currentBal
    var feasibility = {};
    var futurePlans = entries
      .filter(function(e) { return e[1] === "PLAN" && new Date(e[0]) > today; })
      .sort(function(a, b) { return a[0] < b[0] ? -1 : 1; });

    futurePlans.forEach(function(entry) {
      var pd = entry[0];
      var planD = new Date(pd);
      var acc = 0;
      PAY_PERIOD_ENDS.forEach(function(pp) {
        if (pp > today && pp <= planD) acc += rateForPP(pp);
      });
      var usedBy = 0;
      futurePlans.forEach(function(e) { if (new Date(e[0]) <= planD) usedBy++; });
      feasibility[pd] = (currentBal + acc - usedBy * HOURS_PER_DAY) >= 0;
    });

    var EOCY = new Date(viewYear, 11, 31);

    // FY-end carry-over projection (anchored at today)
    var balFYEnd = new Date(today.getFullYear() + (today.getMonth() >= 8 ? 1 : 0), 7, 31);
    var accToBalFYEnd = 0;
    PAY_PERIOD_ENDS.forEach(function(pp) {
      if (pp > today && pp <= balFYEnd)
        accToBalFYEnd += rateForPP(pp);
    });
    var ptoBeforeBalFYEnd = 0;
    entries.forEach(function(entry) {
      var k = entry[0], t = entry[1];
      if (t === "PLAN") {
        var d = new Date(k);
        if (d > today && d <= balFYEnd) ptoBeforeBalFYEnd++;
      }
    });
    var balanceAtFYEnd = currentBal + accToBalFYEnd - ptoBeforeBalFYEnd * HOURS_PER_DAY;
    var fy26CapExempt = fy26Rollover === true && balFYEnd.getFullYear() === 2026;
    var carriedOver = fy26CapExempt ? balanceAtFYEnd : Math.min(balanceAtFYEnd, 200);

    // eoy / avail: FY-walk from current FY end to fyEnd, capping at 200 at each Aug 31
    var eoy, avail;
    if (fyEnd <= balFYEnd) {
      eoy = currentBal + futAcc - ptoAfter * HOURS_PER_DAY;
      avail = Math.floor((currentBal + futAcc) / HOURS_PER_DAY) - ptoAfter;
    } else {
      var runEoy = carriedOver;
      var curEoyBound = balFYEnd;
      while (true) {
        var nextEoyBound = new Date(curEoyBound.getFullYear() + 1, 7, 31);
        var eoySegEnd = nextEoyBound <= fyEnd ? nextEoyBound : fyEnd;
        PAY_PERIOD_ENDS.forEach(function(pp) {
          if (pp > curEoyBound && pp <= eoySegEnd)
            runEoy += rateForPP(pp);
        });
        entries.forEach(function(entry) {
          var k = entry[0], t = entry[1];
          if (t === "PLAN") { var d = new Date(k); if (d > curEoyBound && d <= eoySegEnd) runEoy -= HOURS_PER_DAY; }
        });
        if (eoySegEnd >= fyEnd) break;
        if (!(fy26Rollover === true && nextEoyBound.getFullYear() === 2026)) runEoy = Math.min(runEoy, 200);
        curEoyBound = nextEoyBound;
      }
      eoy = runEoy;
      avail = Math.floor(runEoy / HOURS_PER_DAY);
    }

    var eocyDays;
    if (EOCY <= balFYEnd) {
      var directAcc = 0; var directPTO = 0;
      PAY_PERIOD_ENDS.forEach(function(pp) {
        if (pp > today && pp <= EOCY) directAcc += rateForPP(pp);
      });
      entries.forEach(function(entry) {
        var k = entry[0], t = entry[1];
        if (t === "PLAN") { var d = new Date(k); if (d > today && d <= EOCY) directPTO++; }
      });
      eocyDays = Math.floor((currentBal + directAcc) / HOURS_PER_DAY) - directPTO;
    } else {
      // Walk FY by FY so the 200-hr carryover cap is applied at each Aug 31 boundary
      var runBal = carriedOver;
      var curFYEnd = balFYEnd;
      while (true) {
        var nextFYEnd = new Date(curFYEnd.getFullYear() + 1, 7, 31);
        var segEnd = nextFYEnd <= EOCY ? nextFYEnd : EOCY;
        PAY_PERIOD_ENDS.forEach(function(pp) {
          if (pp > curFYEnd && pp <= segEnd)
            runBal += rateForPP(pp);
        });
        entries.forEach(function(entry) {
          var k = entry[0], t = entry[1];
          if (t === "PLAN") { var d = new Date(k); if (d > curFYEnd && d <= segEnd) runBal -= HOURS_PER_DAY; }
        });
        if (segEnd >= EOCY) break;
        if (!(fy26Rollover === true && nextFYEnd.getFullYear() === 2026)) runBal = Math.min(runBal, 200);
        curFYEnd = nextFYEnd;
      }
      eocyDays = Math.floor(runBal / HOURS_PER_DAY);
    }

    // Total available days through Dec 31 — no carryover cap, just raw pool.
    // Naturally resets on Sep 1 because currentBal already has the Aug 31 cap applied.
    var accToEOCY = 0;
    PAY_PERIOD_ENDS.forEach(function(pp) {
      if (pp > today && pp <= EOCY) accToEOCY += rateForPP(pp);
    });
    var plannedToEOCY = 0;
    entries.forEach(function(entry) {
      var k = entry[0], t = entry[1];
      if (t === "PLAN") { var d = new Date(k); if (d > today && d <= EOCY) plannedToEOCY++; }
    });
    var totalAvailDays = Math.floor((currentBal + accToEOCY) / HOURS_PER_DAY) - plannedToEOCY;

    return {
      ptoUsed: ptoUsed, ptoPlanned: ptoPlanned,
      culUsed: culUsed, culPlanned: culPlanned,
      culRemaining: (new Date(balDate).getFullYear() === viewYear ? culBal : CUL_DAYS_TOTAL) - culUsed - culPlanned,
      culByYear: culByYear,
      balHrs: currentBal, futAcc: futAcc, eoy: eoy,
      eoyDays: eoy / HOURS_PER_DAY, avail: avail,
      eocyDays: eocyDays, totalAvailDays: totalAvailDays,
      feasibility: feasibility,
    };
  }, [days, bal, balDate, viewYear, startStr, editCL, mlDateStr]);

  var statsRef = useRef(stats);
  useEffect(function() { statsRef.current = stats; }, [stats]);

  // Group future PLAN/PLAN_CUL dates into consecutive blocks (weekends/holidays don't break a group)
  var writePlanGroups = useMemo(function() {
    var today = new Date(); today.setHours(0,0,0,0);
    var plannedDates = Object.entries(days)
      .filter(function(e) { return (e[1] === "PLAN" || e[1] === "PLAN_CUL" || e[1] === "PLAN_UNPAID") && new Date(e[0] + "T12:00:00") > today; })
      .map(function(e) { return e[0]; })
      .sort();
    if (plannedDates.length === 0) return [];
    var groups = [];
    var currentGroup = [plannedDates[0]];
    for (var i = 1; i < plannedDates.length; i++) {
      var d = new Date(plannedDates[i - 1] + "T12:00:00");
      d.setDate(d.getDate() + 1);
      var limit = new Date(plannedDates[i] + "T12:00:00");
      var hasGap = false;
      while (d < limit) {
        var dow = d.getDay();
        var dk = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
        if (dow !== 0 && dow !== 6 && !isHol(dk)) { hasGap = true; break; }
        d.setDate(d.getDate() + 1);
      }
      if (hasGap) { groups.push(currentGroup); currentGroup = [plannedDates[i]]; }
      else { currentGroup.push(plannedDates[i]); }
    }
    groups.push(currentGroup);
    return groups;
  }, [days]);

  // Auto-select all groups whenever the group list changes
  useEffect(function() {
    setWriteSelectedGroups(function(prev) {
      return prev.filter(function(i) { return i < writePlanGroups.length; });
    });
  }, [writePlanGroups.length]);

  var highlightedDates = useMemo(function() {
    if (panelTab !== "write" || !showPanel) return [];
    return writeSelectedGroups.reduce(function(acc, idx) {
      return acc.concat(writePlanGroups[idx] || []);
    }, []);
  }, [writeSelectedGroups, writePlanGroups, panelTab, showPanel]);

  function triggerPop(key) {
    setJustToggled(function(prev) { return Object.assign({}, prev, { [key]: true }); });
    setTimeout(function() {
      setJustToggled(function(prev) { var u = Object.assign({}, prev); delete u[key]; return u; });
    }, 300);
  }

  function getGroupSubRunLines(group) {
    if (!group || group.length === 0) return [];
    var subRuns = [], cur = [group[0]];
    for (var i = 1; i < group.length; i++) {
      var prev = new Date(group[i - 1] + "T12:00:00");
      var next = new Date(group[i] + "T12:00:00");
      if ((next - prev) / 86400000 === 1) { cur.push(group[i]); }
      else { subRuns.push(cur); cur = [group[i]]; }
    }
    subRuns.push(cur);
    return subRuns.map(function(run) {
      var s = run[0].split("-"), e = run[run.length - 1].split("-");
      var sm = MONTHS[parseInt(s[1]) - 1].slice(0, 3).toUpperCase();
      var em = MONTHS[parseInt(e[1]) - 1].slice(0, 3).toUpperCase();
      var sd = parseInt(s[2]), ed = parseInt(e[2]);
      if (run.length === 1) return sm + " " + sd;
      return sm + " " + sd + " \u2013 " + (s[1] !== e[1] ? em + " " : "") + ed;
    });
  }

  function generateEmailText() {
    var currentYear = new Date().getFullYear();
    var selected = writeSelectedGroups.slice().sort(function(a, b) { return a - b; });
    var dateLines = [];
    var lastYear = null;
    selected.forEach(function(idx) {
      var group = writePlanGroups[idx];
      if (!group) return;
      var year = parseInt(group[0].split("-")[0]);
      if (year !== lastYear) {
        if (lastYear !== null) dateLines.push("");
        if (year !== currentYear) dateLines.push(String(year));
        lastYear = year;
      }
      getGroupSubRunLines(group).forEach(function(line) { dateLines.push(line); });
    });
    return "Hello!\n\nPlanning the following days off:\n" + dateLines.join("\n") + "\n\nBest,\n" + userName;
  }

  function handleDateOption(key, option) {
    var today = new Date();
    today.setHours(0,0,0,0);
    var dateObj = new Date(key);
    dateObj.setHours(0,0,0,0);
    var isPast = dateObj < today;

    if (option === "pto") {
      if (!isPast && stats.totalAvailDays <= 0) { notify("All PTO planned for the year"); return; }
      var type = isPast ? "PTO" : "PLAN";
      toggle(key, type);
      if (!isPast) triggerPop(key);
    } else if (option === "cul") {
      var culType = isPast ? "CUL" : "PLAN_CUL";
      toggle(key, culType);
      if (!isPast) triggerPop(key);
    }
    setActive(null);
  }

  function renderDay(year, month, day) {
    var key = dkey(year, month, day);
    var type = days[key] || "";
    var hol = isHol(key);
    var otherHol = !hol && !type && isOtherHol(key) && showHolidays !== "acn";
    var wk = isWknd(year, month, day);
    var isAct = active === key;
    var isPreview = false;
    var now = new Date();
    var isToday = now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
    var isPast = new Date(year, month, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Determine cell style
    var cellBg = "transparent";
    var cellColor = S.text;
    var cellBorder = "none";

    if (isToday) {
      cellBg = S.today;
      cellColor = S.todayText;
    } else if (type === "PTO" || type === "CUL") {
      // Used days (past) — match past-weekend treatment
      cellBg = S.surfaceAlt;
      cellColor = S.text;
    } else if (type === "PLAN") {
      // Check feasibility
      var feas = stats.feasibility[key];
      if (feas === false) {
        cellBg = S.ptoOver;
        cellColor = P.maroon;
      } else {
        cellBg = S.pto;
        cellColor = P.inkDeep;
      }
    } else if (type === "PLAN_CUL") {
      cellBg = S.cul;
      cellColor = P.inkDeep;
    } else if (type === "PLAN_UNPAID") {
      cellBg = "transparent";
      cellColor = S.text;
    } else if (type === "UNPAID") {
      cellBg = "transparent";
      cellColor = S.textSubtle;
    } else if (hol || otherHol) {
      cellBg = isPast ? S.surfaceAlt : S.holiday;
      cellColor = S.text;
    } else if (wk) {
      cellBg = S.surfaceAlt;
      cellColor = S.text;
    }


    // Past dates: dim the number regardless of type
    if (isPast && !isToday) cellColor = S.textSubtle;

    // Determine current "option" for the popup
    var currentOption = "unused";
    if (type === "PTO" || type === "PLAN") currentOption = "pto";
    else if (type === "CUL" || type === "PLAN_CUL") currentOption = "cul";

    // Hypothetical PTO feasibility for unassigned future dates
    var ptoFeasible = true;
    var dateObj = new Date(year, month, day);
    var asOfDate = new Date(balDate);
    if (!type && dateObj > asOfDate) {
      var milestoneD = new Date(startStr); milestoneD.setFullYear(milestoneD.getFullYear() + 5);
      var milestone10D = new Date(startStr); milestone10D.setFullYear(milestone10D.getFullYear() + 10);
      var hClRates = getClRates(editCL);
      var hPrevClRates = getClRates(parseInt(editCL) + 1);
      var hMlDate = mlDateStr ? (function() { var d = new Date(mlDateStr); d.setHours(0,0,0,0); return d; })() : null;
      var hypAcc = 0;
      PAY_PERIOD_ENDS.forEach(function(pp) {
        if (pp > asOfDate && pp <= dateObj) {
          var rates = (hMlDate && pp < hMlDate) ? hPrevClRates : hClRates;
          hypAcc += pp >= milestone10D ? rates.post10 : pp >= milestoneD ? rates.post5 : rates.pre5;
        }
      });
      var hypUsed = 0;
      Object.entries(days).forEach(function(e2) {
        var k2 = e2[0], t2 = e2[1];
        if (t2 === "PTO" || t2 === "PLAN") {
          var d2 = new Date(k2);
          if (d2 > asOfDate && d2 <= dateObj) hypUsed++;
        }
      });
      ptoFeasible = (bal + hypAcc - (hypUsed + 1) * HOURS_PER_DAY) >= 0;
    }

    // Drag preview
    var dragIdx = dragPreviewDates.indexOf(key);
    var isDragPreview = dragIdx !== -1;
    var isPlanned = type === "PLAN" || type === "PLAN_CUL" || type === "PLAN_UNPAID";
    var isDragRemovePreview  = isDragPreview && dragMode === "remove"    && isPlanned;
    var isDragCmdPreview     = isDragPreview && dragMode === "to-unpaid" && type === "PLAN"
                            || isDragPreview && dragMode === "to-plan"   && type === "PLAN_UNPAID";
    var isDragLockPreview    = isDragPreview && (dragMode === "lock" || dragMode === "unlock") && isPlanned;
    if (isDragPreview && dragMode === "add") {
      var isDragCulPreview = dragIdx < stats.culRemaining;
      cellBg = isDragCulPreview ? S.cul : S.pto;
      cellColor = P.inkDeep;
    }

    return (
      <div
        key={key}
        onMouseDown={function(e) {
          if (hol || wk || isPast || e.button !== 0) return;
          var mode;
          if (e.metaKey) {
            if (type === "PLAN") mode = "to-unpaid";
            else if (type === "PLAN_UNPAID") mode = "to-plan";
            else return;
          } else if (e.altKey) {
            if (type === "PLAN" || type === "PLAN_CUL" || type === "PLAN_UNPAID") {
              mode = lockedDates[key] ? "unlock" : "lock";
            } else return;
          } else {
            mode = (type === "PLAN" || type === "PLAN_CUL" || type === "PLAN_UNPAID") ? "remove" : "add";
          }
          dragRef.current.isDragging = true;
          dragRef.current.anchor = key;
          dragRef.current.hasMoved = false;
          dragRef.current.dates = [key];
          dragRef.current.current = key;
          dragRef.current.dragMode = mode;
          setDragMode(mode);
        }}
        onDragStart={function(e) { e.preventDefault(); }}
        onClick={function(e) {
          e.stopPropagation();
          if (didDragRef.current) { didDragRef.current = false; return; }
          if (hol || wk) { setActive(null); return; }
          if (isPast && !e.altKey) { setActive(null); return; }
          // L+click: toggle locked state on future planned dates
          if (e.altKey && (type === "PLAN" || type === "PLAN_CUL" || type === "PLAN_UNPAID")) {
            var now0 = new Date(); now0.setHours(0,0,0,0);
            if (new Date(year, month, day) >= now0) {
              var nextLocked = Object.assign({}, lockedDates);
              if (nextLocked[key]) { delete nextLocked[key]; } else { nextLocked[key] = true; }
              setLockedDates(nextLocked);
              persistSettings({ lockedDates: nextLocked });
              return;
            }
          }
          // Cmd+click: toggle between PLAN and PLAN_UNPAID
          if (e.metaKey) {
            if (type === "PLAN") {
              var clickedDate = new Date(year, month, day);
              var fyStartYear = clickedDate.getMonth() >= 8 ? clickedDate.getFullYear() : clickedDate.getFullYear() - 1;
              var fyS = new Date(fyStartYear, 8, 1);
              var fyE = new Date(fyStartYear + 1, 7, 31);
              var unpaidInFY = Object.keys(days).filter(function(k) {
                var t = days[k]; var d = new Date(k + "T12:00:00");
                return (t === "PLAN_UNPAID" || t === "UNPAID") && d >= fyS && d <= fyE;
              }).length;
              if (unpaidInFY >= 5) return;
              pushHistory();
              setDays(function(prev) { var u = Object.assign({}, prev); u[key] = "PLAN_UNPAID"; return u; });
              setActive(null);
            } else if (type === "PLAN_UNPAID") {
              pushHistory();
              setDays(function(prev) { var u = Object.assign({}, prev); u[key] = "PLAN"; return u; });
              setActive(null);
            }
            return;
          }
          if (type) {
            if (lockedDates[key]) return;
            // Already assigned — clear it directly
            pushHistory();
            setDays(function(prev) { var u = Object.assign({}, prev); delete u[key]; return u; });
            var nextLockedClear = Object.assign({}, lockedDates);
            delete nextLockedClear[key];
            userChangedSettingsRef.current = true;
            setLockedDates(nextLockedClear);
            persistSettings({ lockedDates: nextLockedClear });
            setActive(null);
          } else {
            var culExhausted = stats.culRemaining <= 0;
            if (culExhausted) {
              // CUL cap reached — assign PTO directly, no popup
              if (!isPast && stats.totalAvailDays <= 0) { notify("All PTO planned for the year"); }
              else { var directType = isPast ? "PTO" : "PLAN"; toggle(key, directType); if (!isPast) triggerPop(key); }
            } else {
              // Show popup to choose PTO or CUL
              setActive(isAct ? null : key);
            }
          }
        }}
        data-date={key}
        data-holiday={hol || otherHol ? "true" : undefined}
        onMouseEnter={function() {
          if (hol || otherHol) setTooltip(key);
          if (!dragRef.current.isDragging) return;
          var newDates = getDatesInRange(dragRef.current.anchor, key);
          dragRef.current.current = key;
          dragRef.current.hasMoved = dragRef.current.anchor !== key;
          if (dragRef.current.dragMode !== "unlock") {
            newDates = newDates.filter(function(k) { return !lockedDates[k]; });
          }
          if (dragRef.current.dragMode === "add") {
            var culAvail = Math.max(0, stats.culRemaining);
            var ptoAvail = Math.max(0, stats.totalAvailDays);
            newDates = newDates.slice(0, culAvail + ptoAvail);
          }
          dragRef.current.dates = newDates;
          setDragPreviewDates(newDates.slice());
        }}
        onMouseLeave={hol || otherHol ? function() { setTooltip(null); } : null}
        style={{
          position: "relative", width: "100%", aspectRatio: "1",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 999, cursor: (hol || wk || (isPast && !modKeyDown)) ? "default" : "pointer",
          ...T.body.sm,
          color: cellColor,
          background: "transparent",
          userSelect: "none",
        }}
      >
        <div style={{
          position: "absolute", inset: 0, borderRadius: 999,
          background: isDragPreview ? cellBg : (type === "PLAN_UNPAID" || type === "UNPAID") ? "transparent" : cellBg,
          border: highlightedDates.indexOf(key) !== -1 ? "1px solid " + S.unpaid : "none",
          boxShadow: isAct ? "0 0 0 0.5px " + S.border : "none",
          transition: isDragPreview ? "none" : "background 0.15s, box-shadow 0.15s",
          animation: justToggled[key] ? "dayCellPop 100ms cubic-bezier(0.4, 0, 0, 1) both" : "none",
          opacity: isDragRemovePreview ? 0.2 : isDragCmdPreview ? 0.35 : (isDragPreview && dragMode === "add") ? 0.6 : 1,
        }} />
        {(type === "PLAN_UNPAID" || type === "UNPAID") && (
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="49" fill="none"
              stroke={type === "PLAN_UNPAID" ? S.pto : S.border}
              strokeWidth={type === "PLAN_UNPAID" ? (S.bg === P.ink ? 0.8 : 1.2) : 0.8}
              strokeDasharray="4 3"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        )}
        <span style={{ position: "relative", color: cellColor, transition: "color 0.15s" }}>{day}</span>
        {(lockedDates[key] || (isDragLockPreview && dragMode === "lock")) && (
          <div style={{ position: "absolute", width: 1.5, height: 1.5, borderRadius: 999, background: cellColor, left: "50%", transform: "translateX(-50%)", top: "calc(50% + 9px)", pointerEvents: "none", opacity: isDragLockPreview ? 0.4 : 1 }} />
        )}
        {isAct ? (
          <div onClick={function(e) { e.stopPropagation(); }} style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            marginTop: 4, background: S.surfacePopup,
            borderRadius: 12, padding: 8, zIndex: 100,
            boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
            width: 160,
            transformOrigin: "top center",
            animation: "popupBounce 0.2s cubic-bezier(0.4, 0, 0, 1) both",
          }}>
            {[
              { opt: "pto", label: "PTO DAY", circleBg: ptoFeasible ? S.pto : S.ptoOver, circleBorder: "none", labelColor: ptoFeasible ? null : S.ptoOver },
              { opt: "cul", label: "CUL DAY", circleBg: S.cul, circleBorder: "none", labelColor: null },
            ].map(function(item) {
              var isSelected = currentOption === item.opt;
              return (
                <div key={item.opt}
                  onClick={function() { handleDateOption(key, item.opt); }}
                  onMouseEnter={function(e) { e.currentTarget.style.color = item.labelColor || S.text; }}
                  onMouseLeave={function(e) { if (!isSelected) e.currentTarget.style.color = item.labelColor || S.textSubtle; }}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 8px", cursor: "pointer", borderRadius: 8,
                    color: isSelected ? S.text : (item.labelColor || S.textSubtle),
                    ...(isSelected ? T.label.alt : T.label.base),
                  }}>
                  <div style={{
                    width: 24, height: 24, borderRadius: 999,
                    background: item.circleBg, border: item.circleBorder,
                    flexShrink: 0,
                  }} />
                  {item.label}
                </div>
              );
            })}
          </div>
        ) : null}
        {tooltip === key ? (
          <div ref={tooltipDivRef} style={{
            position: "absolute", top: "calc(100% + 6px)", left: "50%",
            transform: "translateX(calc(-50% + " + tooltipShift + "px))",
            background: S.surface, color: S.textSubtle,
            padding: "6px 12px", borderRadius: 10,
            ...T.body.sm,
            pointerEvents: "none", zIndex: 200,
            boxShadow: "0 2px 10px rgba(0,0,0,0.08)",
            border: "0.5px solid " + S.border,
            whiteSpace: "nowrap",
          }}>{ALL_HOLIDAYS[key] || OTHER_HOLIDAYS[key]}</div>
        ) : null}
      </div>
    );
  }


  var todayStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div style={{ display: "flex", fontFamily: work, color: S.text, background: S.bg, minHeight: "100vh", maxWidth: "100vw", overflow: "hidden", opacity: fadeIn ? 1 : 0, transition: "opacity 200ms cubic-bezier(0.4,0,0,1)", userSelect: "none" }}
      onClick={function() { setActive(null); }}
      onMouseMove={function(e) {
        setTooltip(function(curr) {
          if (!curr) return null;
          return e.target.closest('[data-holiday="true"]') ? curr : null;
        });
      }}>

      {active && <div onClick={function() { setActive(null); }} style={{ position: "fixed", inset: 0, zIndex: 99 }} />}

      {toast ? <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: S.text, color: S.bg, padding: "10px 20px", borderRadius: 999, ...T.body.sm, zIndex: 1000, whiteSpace: "nowrap", animation: toastVisible ? "toastIn 200ms cubic-bezier(0.4, 0, 0, 1) both" : "toastOut 200ms cubic-bezier(0.4, 0, 0, 1) both" }}>{toast}</div> : null}

      {/* FY26 Rollover Policy Modal */}
      {showFy26Modal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "rgba(0,0,0,0.4)" }}>
          <div style={{ background: S.bg, borderRadius: 40, padding: 24, maxWidth: 380, width: "100%", boxShadow: S.bg === P.ink ? "0 4px 16px rgba(0,0,0,0.4)" : "0 4px 16px rgba(0,0,0,0.08)", animation: "popupBounce 0.2s cubic-bezier(0.4, 0, 0, 1) both" }}
            onClick={function(e) { e.stopPropagation(); }}>
            <div style={{ ...T.display.lg, color: S.text, marginBottom: 40 }}>News</div>
            <div style={{ marginBottom: 40 }}>
              <p style={{ ...T.body.alt, color: S.text, lineHeight: 1.6, margin: "0 0 1em 0" }}>Accenture is removing the 200-hr rollover cap this fiscal year for US and Canada employees. Your full balance could carry into FY27.</p>
              <p style={{ ...T.body.base, color: S.text, lineHeight: 1.6, margin: "0 0 1em 0" }}>This policy does not apply in California, Colorado, Montana, and Nebraska, where local law governs.</p>
              <p style={{ ...T.body.base, color: S.text, lineHeight: 1.6, margin: 0 }}>Are you based in CA, CO, MT, or NE?</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={function() { setFy26Rollover(false); setShowFy26Modal(false); userChangedSettingsRef.current = true; }}
                style={{ flex: 1, height: 52, borderRadius: 999, border: "0.5px solid " + S.border, background: S.bg, color: S.text, cursor: "pointer", ...T.label.alt }}>
                Yes, I am
              </button>
              <button
                onClick={function() { setFy26Rollover(true); setShowFy26Modal(false); userChangedSettingsRef.current = true; }}
                style={{ flex: 1, height: 52, borderRadius: 999, border: "none", background: S.text, color: S.bg, cursor: "pointer", ...T.label.alt }}>
                No, apply it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panel toggle - 4 dot grid (fixed position, desktop only) */}
      {!isMobile && (
        <div onClick={function(e) { e.stopPropagation(); setShowPanel(!showPanel); }}
          onMouseEnter={function(e){ if (!showPanel) e.currentTarget.style.background = S.border; }}
          onMouseLeave={function(e){ if (!showPanel) e.currentTarget.style.background = showPanel ? S.text : S.surfaceAlt; }}
          onMouseDown={function(e){ e.currentTarget.style.background = S.text; }}
          onMouseUp={function(e){ e.currentTarget.style.background = showPanel ? S.text : S.border; }}
          style={{
            position: "fixed", top: dotBtnTop, right: 40, zIndex: 700,
            width: 48, height: 48, borderRadius: 999,
            background: showPanel ? S.text : S.surfaceAlt,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
          }}>
          <div style={{ display: "grid", gridTemplateColumns: "3.5px 3.5px", gap: 3, transform: showPanel ? "rotate(360deg)" : "rotate(0deg)", transition: "transform 400ms cubic-bezier(0.4, 0, 0, 1)" }}>
            {[0,1,2,3].map(function(i) {
              return <div key={i} style={{ width: 3.5, height: 3.5, borderRadius: 999, background: showPanel ? S.iconOnPto : S.iconSubtle }} />;
            })}
          </div>
        </div>
      )}

      {/* Main Content Area - independent scroll */}
      <div style={{ flex: 1, minWidth: 0, height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>

        {/* Top Section */}
        <div style={{ flexShrink: 0, zIndex: 600, background: S.bg, boxShadow: headerScrolled ? S.shadowHeader : "none", transition: "box-shadow 200ms cubic-bezier(0.4, 0, 0, 1)" }}>
          <div style={{ padding: isMobile ? "20px 20px 24px 20px" : "24px 40px 24px 40px" }}>
            {/* Mobile stats row (compact) - hidden when panel active */}
            {isMobile && (function() {
              return (
                <div style={{ display: "flex", marginBottom: showPanel ? 0 : 40, maxHeight: showPanel ? 0 : 120, opacity: showPanel ? 0 : 1, overflow: "hidden", transition: "max-height 400ms cubic-bezier(0.4, 0, 0, 1), opacity 400ms cubic-bezier(0.4, 0, 0, 1), margin-bottom 400ms cubic-bezier(0.4, 0, 0, 1)" }}>
                  <div style={{ width: "50%", display: "flex", alignItems: "baseline", gap: 8 }}>
                    <AnimatedNumber value={stats.totalAvailDays} style={{ ...T.stat, fontSize: 44 }} />
                    <div style={{ position: "relative", top: -6 }}>
                      <div style={{ position: "absolute", bottom: "100%", marginBottom: 3, ...T.label.alt, color: S.text, lineHeight: 1, whiteSpace: "nowrap" }}>PTO Days</div>
                      <div style={{ ...T.label.base, color: S.textSubtle, lineHeight: 1, whiteSpace: "nowrap" }}>Thru Dec 31</div>
                    </div>
                  </div>
                  <div style={{ width: "50%", display: "flex", alignItems: "baseline", gap: 8 }}>
                    <AnimatedNumber value={stats.culRemaining} style={{ ...T.stat, fontSize: 44 }} />
                    <div style={{ position: "relative", top: -6 }}>
                      <div style={{ position: "absolute", bottom: "100%", marginBottom: 3, ...T.label.alt, color: S.text, lineHeight: 1, whiteSpace: "nowrap" }}>CUL Days</div>
                      <div style={{ ...T.label.base, color: S.textSubtle, lineHeight: 1, whiteSpace: "nowrap" }}>As of today</div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Top Bar - desktop: stats left + nav right; mobile: nav row */}
            <div style={{ display: "flex", justifyContent: isMobile ? "center" : "space-between", alignItems: "center", flexWrap: isMobile ? "nowrap" : "wrap", gap: isMobile ? 8 : 20 }}>
              {/* Desktop stats (already rendered above on mobile) */}
              {!isMobile && (function() {
                return (
                  <div style={{ display: "flex", gap: 40 }}>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                      <AnimatedNumber value={stats.totalAvailDays} style={{ ...T.stat, fontSize: 54 }} />
                      <div style={{ position: "relative", marginBottom: 12 }}>
                        <div style={{ position: "absolute", bottom: "100%", marginBottom: 3, ...T.label.alt, color: S.text, lineHeight: 1, whiteSpace: "nowrap" }}>PTO Days</div>
                        <div style={{ ...T.label.base, color: S.textSubtle, lineHeight: 1, whiteSpace: "nowrap" }}>Thru Dec 31</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                      <AnimatedNumber value={stats.culRemaining} style={{ ...T.stat, fontSize: 54 }} />
                      <div style={{ position: "relative", marginBottom: 12 }}>
                        <div style={{ position: "absolute", bottom: "100%", marginBottom: 3, ...T.label.alt, color: S.text, lineHeight: 1, whiteSpace: "nowrap" }}>CUL Days</div>
                        <div style={{ ...T.label.base, color: S.textSubtle, lineHeight: 1, whiteSpace: "nowrap" }}>As of today</div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Year nav row */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: isMobile ? "100%" : "auto", marginRight: isMobile ? 0 : (showPanel ? 0 : 56), transition: "margin-right 400ms cubic-bezier(0.4, 0, 0, 1)" }}>
                {/* Mobile: dot button inline before year nav */}
                {isMobile && (
                  <div onClick={function(e) { e.stopPropagation(); setShowPanel(!showPanel); }}
                    style={{
                      width: 54, height: 54, borderRadius: 999,
                      background: showPanel ? S.text : S.surfaceAlt,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer", flexShrink: 0,
                    }}>
                    <div style={{ display: "grid", gridTemplateColumns: "3.5px 3.5px", gap: 3, transform: showPanel ? "rotate(360deg)" : "rotate(0deg)", transition: "transform 400ms cubic-bezier(0.4, 0, 0, 1)" }}>
                      {[0,1,2,3].map(function(i) {
                        return <div key={i} style={{ width: 3.5, height: 3.5, borderRadius: 999, background: showPanel ? S.iconOnPto : S.iconSubtle }} />;
                      })}
                    </div>
                  </div>
                )}
                {/* Year nav pill */}
                <div ref={yearNavRef} style={{
                  display: "flex", alignItems: "center",
                  background: S.surfaceAlt, borderRadius: 999, height: isMobile ? 54 : 48,
                  padding: "0",
                  flex: isMobile ? 1 : "none",
                }}>
                  <div onClick={function() { if (viewYear > minViewYear) { setViewYear(viewYear - 1); smoothScrollTop(calendarScrollRef.current, 400); } }}
                    onMouseEnter={function(e){ if (viewYear > minViewYear) { e.currentTarget.style.background = S.border; e.currentTarget.style.color = S.iconSubtle; } }}
                    onMouseLeave={function(e){ e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = viewYear <= minViewYear ? S.textFaint : S.iconSubtle; }}
                    onMouseDown={function(e){ if (viewYear > minViewYear) { e.currentTarget.style.background = S.text; e.currentTarget.style.color = S.bg; } }}
                    onMouseUp={function(e){ if (viewYear > minViewYear) { e.currentTarget.style.background = S.border; e.currentTarget.style.color = S.iconSubtle; } }}
                    style={{ width: isMobile ? 54 : 48, height: isMobile ? 54 : 48, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: viewYear <= minViewYear ? "default" : "pointer", userSelect: "none", color: viewYear <= minViewYear ? S.textFaint : S.iconSubtle }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span style={{ ...T.num, width: isMobile ? "auto" : 72, flex: isMobile ? 1 : "none", textAlign: "center" }}>{viewYear}</span>
                  <div onClick={function() { setViewYear(viewYear + 1); smoothScrollTop(calendarScrollRef.current, 400); }}
                    onMouseEnter={function(e){ e.currentTarget.style.background = S.border; e.currentTarget.style.color = S.iconSubtle; }}
                    onMouseLeave={function(e){ e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = S.iconSubtle; }}
                    onMouseDown={function(e){ e.currentTarget.style.background = S.text; e.currentTarget.style.color = S.bg; }}
                    onMouseUp={function(e){ e.currentTarget.style.background = S.border; e.currentTarget.style.color = S.iconSubtle; }}
                    style={{ width: isMobile ? 54 : 48, height: isMobile ? 54 : 48, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", userSelect: "none", color: S.iconSubtle }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M5 2L10 7L5 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Calendar Grid */}
        <div ref={calendarScrollRef} style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: isMobile ? "24px 20px 40px 20px" : "64px 40px 40px 40px" }} onClick={function(e) { e.stopPropagation(); if (showPanel) { setShowPanel(false); setPreviewDates([]); setPreviewCulDates([]); setPreviewExistingDates([]); } }}>
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(max(260px, calc(25% - 36px)), 1fr))",
            gap: "48px 48px",
            opacity: calFading ? 0 : 1,
            transition: "opacity 150ms cubic-bezier(0.4, 0, 0, 1)",
          }}>
            {MONTHS.map(function(mName, mi) {
              var dim = daysIn(viewYear, mi);
              var fd = dayOfWeek(viewYear, mi, 1);
              var mondayOffset = weekStart === "sunday" ? fd : (fd === 0 ? 6 : fd - 1);

              // Build cells with prev/next month dates
              var cells = [];
              // Previous month filler dates
              if (mondayOffset > 0) {
                var prevDim = daysIn(viewYear, mi === 0 ? 11 : mi - 1);
                for (var i = mondayOffset - 1; i >= 0; i--) {
                  var prevDay = prevDim - i;
                  cells.push(
                    <div key={"p" + prevDay} style={{
                      aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                      ...T.body.sm, color: S.border, userSelect: "none",
                    }}>{prevDay}</div>
                  );
                }
              }
              // Current month dates
              for (var d = 1; d <= dim; d++) cells.push(renderDay(viewYear, mi, d));
              // Next month filler dates
              var totalCells = cells.length;
              var rows = Math.ceil(totalCells / 7);
              var remaining = rows * 7 - totalCells;
              for (var n = 1; n <= remaining; n++) {
                cells.push(
                  <div key={"n" + n} style={{
                    aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center",
                    ...T.body.sm, color: S.border, userSelect: "none",
                  }}>{n}</div>
                );
              }

              var isCurrentMonth = viewYear === new Date().getFullYear() && mi === new Date().getMonth();
              return (
                <div key={mName} id={isCurrentMonth ? "month-current" : undefined}>
                  <div style={{ ...T.display.md, color: S.text, marginBottom: 24 }}>
                    {mName}
                  </div>
                  {/* Weekday headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 4 }}>
                    {(weekStart === "sunday" ? ["S","M","T","W","T","F","S"] : ["M","T","W","T","F","S","S"]).map(function(w, wi) {
                      return <div key={wi} style={{ display: "flex", alignItems: "center", justifyContent: "center", ...T.label.base, color: S.textSubtle, padding: "4px 0" }}>{w}</div>;
                    })}
                  </div>
                  {/* Date cells */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8 }}>
                    {cells}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Panel - mobile: bottom sheet, desktop: side panel */}
      <div style={isMobile ? {
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 800,
        height: showPanel ? "50vh" : 0,
        overflow: "hidden",
        background: S.surfaceAlt,
        borderRadius: showPanel ? "20px 20px 0 0" : "0",
        boxShadow: showPanel ? "0 -4px 24px rgba(0,0,0,0.08)" : "none",
        transition: sheetDragY > 0 ? "none" : "height 400ms cubic-bezier(0.4, 0, 0, 1)",
        transform: isMobile && sheetDragY > 0 ? "translateY(" + sheetDragY + "px)" : "none",
      } : {
        width: showPanel ? 360 : 0, flexShrink: 0, height: "100vh",
        overflow: "hidden",
        transition: "width 400ms cubic-bezier(0.4, 0, 0, 1)",
      }}>
        <div onClick={function(e) { e.stopPropagation(); }} style={isMobile ? {
          height: "100%",
          background: S.surfaceAlt,
          display: "flex", flexDirection: "column",
          boxSizing: "border-box",
          position: "relative",
        } : {
          width: 360, height: "100vh",
          background: S.surfaceAlt,
          display: "flex", flexDirection: "column",
          boxSizing: "border-box",
          position: "relative",
        }}>
          {/* Tab bar - mobile: sticky outside scroll container */}
          {isMobile && (
            <div
              onTouchStart={function(e) {
                sheetDragStart.current = e.touches[0].clientY;
                setSheetDragY(0);
              }}
              onTouchMove={function(e) {
                var dy = e.touches[0].clientY - sheetDragStart.current;
                if (dy > 0) setSheetDragY(dy);
              }}
              onTouchEnd={function() {
                if (sheetDragY > 80) {
                  setSheetDragY(0);
                  setShowPanel(false);
                  setPreviewDates([]);
                  setPreviewCulDates([]);
                  setPreviewExistingDates([]);
                } else {
                  setSheetDragY(0);
                }
                sheetDragStart.current = null;
              }}
              ref={tabBarRef} style={{ display: "flex", gap: 20, position: "relative", borderBottom: "0.5px solid " + S.border, background: S.surfaceAlt, flexShrink: 0, flexDirection: "column", padding: "0" }}
            >
              <div style={{ display: "flex", justifyContent: "center", paddingTop: 10, paddingBottom: 4 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: S.border }} />
              </div>
              <div style={{ display: "flex", gap: 20, padding: "0 20px", position: "relative" }}>
              {[
                { key: "overview", label: "BALANCE" },
                { key: "write", label: "PLAN" },
                { key: "settings", label: "SETTINGS" },
              ].map(function(tab) {
                var isActive = panelTab === tab.key;
                return (
                  <div key={tab.key}
                    ref={function(el) { tabItemRefs.current[tab.key] = el; }}
                    onClick={function() { setPanelTab(tab.key); }}
                    style={{
                      ...(isActive ? T.label.alt : T.label.base),
                      cursor: "pointer",
                      color: isActive ? S.text : S.textSubtle,
                      paddingBottom: 10, paddingTop: 16,
                    }}>
                    {tab.label}
                  </div>
                );
              })}
              <div style={{
                position: "absolute", bottom: -0.5,
                left: indicatorPos.left, width: indicatorPos.width,
                height: 0.5, background: S.text,
                transition: "left 200ms cubic-bezier(0.4, 0, 0, 1), width 200ms cubic-bezier(0.4, 0, 0, 1)",
              }} />
              </div>
            </div>
          )}

          {/* Sticky panel header + tab bar - desktop only */}
          {!isMobile && (
            <div style={{ flexShrink: 0, padding: "36px 24px 0 24px", background: S.surfaceAlt }}>
              <div style={{ marginBottom: 54 }}>
                <div style={{ ...T.display.lg, marginBottom: 8 }}>{userName}</div>
                <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>Management Level {editCL}</div>
                <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>{"Since " + new Date(startStr + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}</div>
              </div>
              <div ref={tabBarRef} style={{ display: "flex", gap: 20, marginBottom: 0, position: "relative", borderBottom: "0.5px solid " + S.border }}>
                {[
                  { key: "overview", label: "BALANCE" },
                  { key: "write", label: "PLAN" },
                  { key: "settings", label: "SETTINGS" },
                ].map(function(tab) {
                  var isActive = panelTab === tab.key;
                  return (
                    <div key={tab.key}
                      ref={function(el) { tabItemRefs.current[tab.key] = el; }}
                      onClick={function() { setPanelTab(tab.key); }}
                      style={{
                        ...(isActive ? T.label.alt : T.label.base),
                        cursor: "pointer",
                        color: isActive ? S.text : S.textSubtle,
                        paddingBottom: 10,
                      }}>
                      {tab.label}
                    </div>
                  );
                })}
                <div style={{
                  position: "absolute", bottom: -0.5,
                  left: indicatorPos.left, width: indicatorPos.width,
                  height: 0.5, background: S.text,
                  transition: "left 200ms cubic-bezier(0.4, 0, 0, 1), width 200ms cubic-bezier(0.4, 0, 0, 1)",
                }} />
              </div>
            </div>
          )}

          {/* Scrollable content area */}
          <div style={{ flex: 1, overflowY: "auto", padding: isMobile
            ? ("20px 20px " + (((panelTab === "settings" && settingsDirty) || (panelTab === "write" && writeSelectedGroups.length > 0)) ? "120px" : "20px") + " 20px")
            : ("0 24px " + (((panelTab === "settings" && settingsDirty) || (panelTab === "write" && writeSelectedGroups.length > 0)) ? "160px" : "24px") + " 24px")
          }}>

            {/* Overview Tab */}
            {panelTab === "overview" ? (
              <div style={{ paddingTop: isMobile ? 28 : 40 }}>
                {/* Balance Section — first: no top border */}
                <div style={{ marginBottom: 48 }}>
                  <div style={{ ...T.label.base, color: S.textSubtle, marginBottom: 20 }}>{"Balance FY" + viewYear}</div>
                  {(function() {
                    var carryHrs = Math.min(Math.max(0, stats.eoy), 200);
                    var lostHrs = Math.max(0, stats.eoy - 200);
                    return (
                      <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                        <div style={{ display: "flex", gap: 24 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ ...T.num, color: stats.balHrs < 0 ? S.ptoOverText : S.text }}>
                              {(stats.balHrs / HOURS_PER_DAY).toFixed(1)}
                            </div>
                            <div style={{ ...T.body.smAlt, color: stats.balHrs < 0 ? S.ptoOverText : S.text, lineHeight: 1.5 }}>
                              {"days or " + stats.balHrs + " hrs"}
                            </div>
                            <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>
                              {"as of today"}
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ ...T.num, color: stats.eoy < 0 ? S.ptoOverText : S.text }}>
                              {stats.eoyDays.toFixed(1)}
                            </div>
                            <div style={{ ...T.body.smAlt, color: stats.eoy < 0 ? S.ptoOverText : S.text, lineHeight: 1.5 }}>
                              {"days or " + stats.eoy.toFixed(1) + " hrs"}
                            </div>
                            <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>
                              remain by Aug 31
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 24 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ ...T.num, color: S.text }}>
                              {(carryHrs / HOURS_PER_DAY).toFixed(1)}
                            </div>
                            <div style={{ ...T.body.smAlt, color: S.text, lineHeight: 1.5 }}>
                              {"days or " + carryHrs.toFixed(1) + " hrs"}
                            </div>
                            <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>
                              will carry over
                            </div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ ...T.num, color: lostHrs > 0 ? S.ptoOver : S.text }}>
                              {(lostHrs / HOURS_PER_DAY).toFixed(1)}
                            </div>
                            <div style={{ ...T.body.smAlt, color: lostHrs > 0 ? S.ptoOver : S.text, lineHeight: 1.5 }}>
                              {"days or " + lostHrs.toFixed(1) + " hrs"}
                            </div>
                            <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>
                              will NOT carry over
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Accrual Rate Section */}
                <div style={{ borderTop: "0.5px solid " + S.border, paddingTop: 8, marginBottom: 48 }}>
                  <div style={{ ...T.label.base, color: S.textSubtle, marginBottom: 20 }}>Accrual Rate</div>
                  {(function() {
                    var now = new Date(); now.setHours(0,0,0,0);
                    var ms = new Date(startStr); ms.setFullYear(ms.getFullYear() + 5);
                    var past5 = now >= ms;
                    var dispRates = getClRates(editCL);
                    var rateA = past5 ? dispRates.post5 : dispRates.pre5;
                    var labelA = past5 ? "after 5yr" : "before 5yr";
                    var rateB = past5 ? dispRates.post10 : dispRates.post5;
                    var labelB = past5 ? "after 10yr" : "after 5yr";
                    return (
                      <div style={{ display: "flex", gap: 24 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ ...T.num }}>{rateA}</div>
                          <div style={{ ...T.body.sm, color: S.text, lineHeight: 1.5 }}>hrs per pay</div>
                          <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>{labelA}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ ...T.num }}>{rateB}</div>
                          <div style={{ ...T.body.sm, color: S.text, lineHeight: 1.5 }}>hrs per pay</div>
                          <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>{labelB}</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Used Vacation Days Section */}
                <div style={{ borderTop: "0.5px solid " + S.border, paddingTop: 8, marginBottom: 48 }}>
                  <div style={{ ...T.label.base, color: S.textSubtle, marginBottom: 20 }}>Used Vacation Days</div>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...T.num }}>{stats.ptoUsed}</div>
                      <div style={{ ...T.body.sm, color: S.text, lineHeight: 1.5 }}>PTO days</div>
                      <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>FY {viewYear}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ ...T.num }}>{stats.culUsed}</div>
                      <div style={{ ...T.body.sm, color: S.text, lineHeight: 1.5 }}>CUL days</div>
                      <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.5 }}>{viewYear}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}


            {/* Settings Tab */}
            {panelTab === "settings" ? (
              <div style={{ paddingTop: isMobile ? 28 : 40 }}>
                {/* INFO section — first: no top border */}
                {!demoMode ? <div style={{ marginBottom: 48 }}>
                  <div style={{ ...T.label.base, color: S.textSubtle, marginBottom: 12 }}>Profile</div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "name" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 8 }}>Name</div>
                      <input type="text" value={editName}
                        onChange={function(e) { setEditName(e.target.value); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("name"); }}
                        onBlur={function() { setFocusedField(null); }}
                        style={{ border: "none", outline: "none", ...T.body.alt, width: "100%", background: "transparent", color: S.text }} />
                    </div>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "milestone" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 8 }}>Starting Date</div>
                      <DateField value={editStart} isFocused={focusedField === "milestone"}
                        onChange={function(v) { setEditStart(v); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("milestone"); }}
                        onBlur={function() { setFocusedField(null); }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "cl" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 8 }}>Management Level</div>
                      <input type="text" value={editCL}
                        onChange={function(e) { setEditCL(e.target.value); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("cl"); }}
                        onBlur={function() { setFocusedField(null); }}
                        style={{ border: "none", outline: "none", ...T.body.alt, width: "100%", background: "transparent", color: S.text }} />
                    </div>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "mlDate" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 8 }}>Level Effective Date</div>
                      <DateField value={editMLDate} isFocused={focusedField === "mlDate"}
                        onChange={function(v) { setEditMLDate(v); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("mlDate"); }}
                        onBlur={function() { setFocusedField(null); }} />
                    </div>
                  </div>
                </div> : null}

                {/* CURRENT BALANCE section */}
                {!demoMode ? <div style={{ marginBottom: 48 }}>
                  <div style={{ ...T.label.base, color: S.textSubtle, marginBottom: 12 }}>Current Balance</div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "bal" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 8 }}>PTO Hours</div>
                      <input type="number" value={editBal}
                        onChange={function(e) { setEditBal(parseFloat(e.target.value) || 0); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("bal"); }}
                        onBlur={function() { setFocusedField(null); }}
                        style={{ border: "none", outline: "none", ...T.body.alt, width: "100%", background: "transparent", color: S.text }} />
                    </div>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "balDate" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 8 }}>As of</div>
                      <DateField value={editBalDate} isFocused={focusedField === "balDate"}
                        onChange={function(v) { setEditBalDate(v); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("balDate"); }}
                        onBlur={function() { setFocusedField(null); }} />
                    </div>
                  </div>
                </div> : null}

                {/* FY26 ROLLOVER section — hidden after Jan 1, 2027 */}
                {!demoMode && new Date() < new Date(2027, 0, 1) && fy26Rollover !== null ? (
                  <div style={{ marginBottom: 48 }}>
                    <div style={{ ...T.label.base, color: S.textSubtle, marginBottom: 12 }}>Policy</div>
                    <div
                      onClick={function() {
                        var next = fy26Rollover === true ? false : true;
                        setFy26Rollover(next);
                        userChangedSettingsRef.current = true;
                      }}
                      style={{ background: S.surface, borderRadius: 16, padding: "14px 16px", cursor: "pointer" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 6 }}>FY26 No Rollover Cap</div>
                      <div style={{ ...T.body.base, display: "flex", alignItems: "center" }}>
                        <span style={{ color: fy26Rollover === true ? S.text : S.textSubtle, fontWeight: fy26Rollover === true ? 500 : 400 }}>Applies to me</span>
                        <span style={{ color: S.textSubtle, margin: "0 6px" }}>/</span>
                        <span
                          style={{ color: fy26Rollover === false ? S.text : S.textSubtle, fontWeight: fy26Rollover === false ? 500 : 400, position: "relative" }}
                          onMouseEnter={function(e) { var tt = e.currentTarget.querySelector('.fy26-tooltip'); if (tt) tt.style.opacity = 1; }}
                          onMouseLeave={function(e) { var tt = e.currentTarget.querySelector('.fy26-tooltip'); if (tt) tt.style.opacity = 0; }}>
                          Doesn’t apply to me
                          <span className="fy26-tooltip" style={{ position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)", background: S.bg, color: S.textSubtle, padding: "6px 12px", borderRadius: 10, ...T.body.sm, pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 2px 10px rgba(0,0,0,0.08)", border: "0.5px solid " + S.border, opacity: 0, transition: "opacity 0.15s", zIndex: 10 }}>If you’re based in CA, CO, MT or NE</span>
                        </span>
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* CALENDAR VIEW section */}
                <div style={{ marginBottom: 48 }}>
                  <div style={{ ...T.label.base, color: S.textSubtle, marginBottom: 12 }}>Display</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div
                      onClick={function() {
                        var next = weekStart === "monday" ? "sunday" : "monday";
                        setCalFading(true);
                        setTimeout(function() {
                          setWeekStart(next);
                          persistSettings({ weekStart: next });
                          userChangedSettingsRef.current = true;
                          setCalFading(false);
                        }, 150);
                      }}
                      style={{ background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 8 }}>Week starts on</div>
                      <div style={{ ...T.body.base }}>
                        <span style={{ color: weekStart === "sunday" ? S.text : S.textSubtle, fontWeight: weekStart === "sunday" ? 500 : 400 }}>Sunday</span>
                        <span style={{ color: S.textSubtle, margin: "0 4px", fontWeight: 400 }}>/</span>
                        <span style={{ color: weekStart === "monday" ? S.text : S.textSubtle, fontWeight: weekStart === "monday" ? 500 : 400 }}>Monday</span>
                      </div>
                    </div>
                    <div
                      onClick={function() { var next = showHolidays === "all" ? "acn" : "all"; setShowHolidays(next); persistSettings({ showHolidays: next }); userChangedSettingsRef.current = true; }}
                      style={{ background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 8 }}>Show US Holidays</div>
                      <div style={{ ...T.body.base }}>
                        <span style={{ color: showHolidays === "acn" ? S.text : S.textSubtle, fontWeight: showHolidays === "acn" ? 500 : 400 }}>{demoMode ? "Company only" : "ACN only"}</span>
                        <span style={{ color: S.textSubtle, margin: "0 4px", fontWeight: 400 }}>/</span>
                        <span style={{ color: showHolidays === "all" ? S.text : S.textSubtle, fontWeight: showHolidays === "all" ? 500 : 400 }}>All holidays</span>
                      </div>
                    </div>
                    <div
                      onClick={function() {
                        var order = ["light", "dark", "system"];
                        var next = order[(order.indexOf(theme) + 1) % order.length];
                        setTheme(next);
                        persistSettings({ theme: next });
                        userChangedSettingsRef.current = true;
                      }}
                      style={{ background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer" }}>
                      <div style={{ ...T.label.sm, color: S.textSubtle, marginBottom: 8 }}>Theme</div>
                      <div style={{ ...T.body.base }}>
                        <span style={{ color: theme === "light" ? S.text : S.textSubtle, fontWeight: theme === "light" ? 500 : 400 }}>Light</span>
                        <span style={{ color: S.textSubtle, margin: "0 4px", fontWeight: 400 }}>/</span>
                        <span style={{ color: theme === "dark" ? S.text : S.textSubtle, fontWeight: theme === "dark" ? 500 : 400 }}>Dark</span>
                        <span style={{ color: S.textSubtle, margin: "0 4px", fontWeight: 400 }}>/</span>
                        <span style={{ color: theme === "system" ? S.text : S.textSubtle, fontWeight: theme === "system" ? 500 : 400 }}>System</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ACCOUNT links */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <a
                    href="https://timeback.fyi/about"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontFamily: work, fontSize: 11, textTransform: "uppercase", color: S.textSubtle, letterSpacing: 0.5, cursor: "pointer", width: "fit-content", textDecoration: "none" }}
                    onMouseEnter={function(e) { e.currentTarget.style.textDecoration = "underline"; e.currentTarget.style.textUnderlineOffset = "3px"; }}
                    onMouseLeave={function(e) { e.currentTarget.style.textDecoration = "none"; }}
                  >About</a>
                  {!demoMode && <div
                    style={{ ...T.label.base, color: S.textSubtle, cursor: "pointer", width: "fit-content" }}
                    onClick={async function() {
                      if (!window.confirm("Delete your account and all data? This cannot be undone.")) return;
                      try {
                        const { data, error } = await supabase.functions.invoke('delete-account');
                        console.log('delete-account response:', { data, error });
                        if (error) { alert('Failed to delete account: ' + error.message); return; }
                      } catch (e) {
                        console.error('delete-account exception:', e);
                        alert('Failed to delete account: ' + e.message);
                        return;
                      }
                      await supabase.auth.signOut();
                    }}
                    onMouseEnter={function(e) { e.currentTarget.style.textDecoration = "underline"; e.currentTarget.style.textUnderlineOffset = "3px"; }}
                    onMouseLeave={function(e) { e.currentTarget.style.textDecoration = "none"; }}
                  >Delete Account</div>}
                  {demoMode
                    ? <a href="/" style={{ ...T.label.base, color: S.textSubtle, cursor: "pointer", width: "fit-content", textDecoration: "none" }}
                        onMouseEnter={function(e) { e.currentTarget.style.textDecoration = "underline"; e.currentTarget.style.textUnderlineOffset = "3px"; }}
                        onMouseLeave={function(e) { e.currentTarget.style.textDecoration = "none"; }}
                      >Sign Up</a>
                    : <div
                        style={{ ...T.label.base, color: S.textSubtle, cursor: "pointer", width: "fit-content" }}
                        onClick={function() { supabase.auth.signOut(); }}
                        onMouseEnter={function(e) { e.currentTarget.style.textDecoration = "underline"; e.currentTarget.style.textUnderlineOffset = "3px"; }}
                        onMouseLeave={function(e) { e.currentTarget.style.textDecoration = "none"; }}
                      >Log Out</div>
                  }
                </div>
              </div>
            ) : null}

            {/* Write Tab */}
            {panelTab === "write" ? (
              <div style={{ paddingTop: isMobile ? 28 : 40 }}>
                {writePlanGroups.length === 0 ? (
                  <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.4 }}>No planned dates yet.</div>
                ) : (
                  <div>
                  <div style={{ ...T.label.base, color: S.textSubtle, marginBottom: 16 }}>Planned Dates</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {writePlanGroups.map(function(group, idx) {
                      var isSelected = writeSelectedGroups.indexOf(idx) !== -1;
                      var isApproved = !!approvedGroups[group[0]];
                      var s = group[0].split("-"), e = group[group.length - 1].split("-");
                      var sm = MONTHS[parseInt(s[1]) - 1].slice(0, 3);
                      var em = MONTHS[parseInt(e[1]) - 1].slice(0, 3);
                      var sd = parseInt(s[2]), ed = parseInt(e[2]);
                      var dateRange = group.length === 1 ? (sm + " " + sd) : (sm + " " + sd + " \u2013 " + (s[1] !== e[1] ? em + " " : "") + ed);
                      var ptoCount = group.filter(function(d) { return days[d] === "PLAN"; }).length;
                      var culCount = group.filter(function(d) { return days[d] === "PLAN_CUL"; }).length;
                      var ulCount = group.filter(function(d) { return days[d] === "PLAN_UNPAID"; }).length;
                      var subtitle = [];
                      if (ptoCount > 0) subtitle.push(ptoCount + (ptoCount === 1 ? " PTO" : " PTOs"));
                      if (culCount > 0) subtitle.push(culCount + " CUL");
                      if (ulCount > 0) subtitle.push(ulCount + " UL");
                      var longPressTimer = { id: null };
                      function toggleApproved() {
                        var nextApproved = Object.assign({}, approvedGroups);
                        if (nextApproved[group[0]]) { delete nextApproved[group[0]]; } else { nextApproved[group[0]] = true; }
                        persistSettings({ approvedGroups: nextApproved });
                        userChangedSettingsRef.current = true;
                        setApprovedGroups(function(prev) {
                          var u = Object.assign({}, prev);
                          if (u[group[0]]) { delete u[group[0]]; } else {
                            u[group[0]] = true;
                            setWriteSelectedGroups(function(p) { return p.filter(function(i) { return i !== idx; }); });
                          }
                          return u;
                        });
                      }
                      return (
                        <div key={idx}
                          onTouchStart={function() {
                            longPressTimer.id = setTimeout(function() {
                              longPressTimer.id = null;
                              toggleApproved();
                            }, 500);
                          }}
                          onTouchEnd={function() {
                            if (longPressTimer.id) { clearTimeout(longPressTimer.id); longPressTimer.id = null; }
                          }}
                          onTouchMove={function() {
                            if (longPressTimer.id) { clearTimeout(longPressTimer.id); longPressTimer.id = null; }
                          }}
                          onClick={function(ev) {
                            var groupYear = parseInt(group[0].split("-")[0]);
                            if (ev.metaKey) {
                              toggleApproved();
                              return;
                            }
                            if (isApproved) return;
                            setWriteSelectedGroups(function(prev) {
                              return prev.indexOf(idx) !== -1 ? prev.filter(function(i) { return i !== idx; }) : prev.concat([idx]);
                            });
                            if (groupYear !== viewYear) setViewYear(groupYear);
                            setTimeout(function() {
                              var el = document.querySelector('[data-date="' + group[0] + '"]');
                              if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                            }, groupYear !== viewYear ? 50 : 0);
                          }}
                          style={{
                            background: isApproved ? S.pto : S.surface,
                            borderRadius: 16, height: 76, padding: "0 16px",
                            display: "flex", alignItems: "center", justifyContent: "space-between",
                            cursor: isApproved ? "default" : "pointer",
                            border: isSelected ? "0.5px solid " + S.textSubtle : "0.5px solid transparent",
                          }}>
                          <div>
                            <div style={{ ...T.body.base, color: isApproved ? P.inkDeep : S.text, marginBottom: 8 }}>{dateRange}</div>
                            <div style={{ ...T.body.sm, color: isApproved ? P.inkDeep : S.textSubtle }}>{subtitle.join(", ")}</div>
                          </div>
                          <div style={{
                            width: 24, height: 24, borderRadius: 999, flexShrink: 0,
                            border: (isSelected || isApproved) ? "none" : "1.5px solid " + S.border,
                            background: isApproved ? S.surface : (isSelected ? S.text : "transparent"),
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {(isSelected || isApproved) ? (
                              <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
                                <path d="M1 4L4 7L10 1" stroke={isApproved ? S.unpaid : S.surface} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ ...T.body.sm, color: S.textSubtle, lineHeight: 1.4, marginTop: 16 }}>Select planned dates to draft a request email. Hold &#8984; and click to approve.</div>
                  </div>
                )}

                {writeSelectedGroups.length > 0 && writePlanGroups.length > 0 ? (
                  <div style={{ marginTop: 48 }}>
                    <div style={{ ...T.label.base, color: S.textSubtle, marginBottom: 16 }}>Request Email Draft</div>
                    <div style={{ background: S.surface, borderRadius: 16, padding: "16px 20px", userSelect: "text" }}>
                      {generateEmailText().split("\n").map(function(line, i) {
                        var isYearLine = /^\d{4}$/.test(line);
                        var isDateLine = !isYearLine && writeSelectedGroups.some(function(idx) {
                          return getGroupSubRunLines(writePlanGroups[idx]).indexOf(line) !== -1;
                        });
                        return (
                          <div key={i} style={{
                            ...T.body.base, lineHeight: 1.8,
                            color: isYearLine ? S.textSubtle : S.text,
                            fontWeight: isDateLine ? 600 : 400,
                            minHeight: line === "" ? "1em" : undefined,
                          }}>{line || "\u00a0"}</div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

          </div>{/* end scrollable content */}

          {/* Sticky CTA footer — shown for Settings (when dirty) and Write (when groups selected) */}
          {(panelTab === "settings" && settingsDirty) || (panelTab === "write" && writeSelectedGroups.length > 0 && writePlanGroups.length > 0) ? (
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0,
              background: "linear-gradient(to bottom, rgba(" + S.surfaceAltRgb + ",0) 0%, rgba(" + S.surfaceAltRgb + ",0.85) 45%, " + S.surfaceAlt + " 65%)",
              padding: isMobile ? "60px 20px 20px 20px" : "80px 24px 24px 24px",
            }}>
              {panelTab === "write" ? (
                <button
                  onClick={function() {
                    navigator.clipboard.writeText(generateEmailText()).then(function() { notify("Copied!"); });
                  }}
                  style={{
                    width: "100%", height: 48, borderRadius: 999,
                    background: S.text, border: "none",
                    ...T.label.alt, color: S.bg, cursor: "pointer",
                  }}>
                  Copy email
                </button>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  {/* Cancel button */}
                  <button
                    onClick={function() {
                      setEditName(userName);
                      setEditBal(bal);
                      setEditBalDate(balDate);
                      setEditStart(startStr);
                      setSettingsDirty(false);
                    }}
                    style={{
                      flex: 1, height: 48, borderRadius: 999,
                      background: S.surface, border: "1px solid " + S.border,
                      ...T.label.alt, color: S.text, cursor: "pointer",
                    }}>
                    Cancel
                  </button>
                  {/* Primary action button */}
                  <button
                    onClick={function() {
                      userChangedSettingsRef.current = true;
                      setUserName(editName);
                      setBal(editBal);
                      setBalDate(editBalDate);
                      setStartStr(editStart);
                      setMlDateStr(editMLDate);
                      setSettingsDirty(false);
                      persistSettings({ userName: editName, bal: editBal, balDate: editBalDate, startStr: editStart, mlDateStr: editMLDate });
                    }}
                    style={{
                      flex: 1, height: 48, borderRadius: 999,
                      background: S.text, border: "none",
                      ...T.label.alt, color: S.bg, cursor: "pointer",
                    }}>
                    Update
                  </button>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>

      <style>{"@import url('https://fonts.googleapis.com/css2?family=Sorts+Mill+Goudy:ital@1&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');\
        * { box-sizing: border-box; }\
        button:hover { opacity: 0.85; }\
        *::-webkit-scrollbar { display: none; }\
        * { -ms-overflow-style: none; scrollbar-width: none; }\
        @keyframes digitWidthExit {\
          from { max-width: 2ch; opacity: 1; }\
          to   { max-width: 0; opacity: 0; }\
        }\
        @keyframes dayCellPop {\
          0%   { transform: scale(0.9); }\
          70%  { transform: scale(1.2); }\
          100% { transform: scale(1); }\
        }\
        @keyframes popupBounce {\
          0%   { opacity: 0; transform: translateX(-50%) scale(0.9); }\
          100% { opacity: 1; transform: translateX(-50%) scale(1); }\
        }\
@keyframes toastIn {\
          0%   { opacity: 0; transform: translateX(-50%) translateY(12px); }\
          100% { opacity: 1; transform: translateX(-50%) translateY(0); }\
        }\
        @keyframes toastOut {\
          0%   { opacity: 1; transform: translateX(-50%) translateY(0); }\
          100% { opacity: 0; transform: translateX(-50%) translateY(12px); }\
        }\
      "
      }</style>
    </div>
  );
}
