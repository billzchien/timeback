import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "./supabase.js";

const STORAGE_KEY = "bill-pto-2026-v2";
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

function getPayPeriodEndDates() {
  const dates = [];
  const interval = 365 / 24;
  // Generate 15 fiscal years starting from FY2026 (Sep 2025) to cover future year views
  for (let fy = 0; fy < 15; fy++) {
    const start = new Date(2025 + fy, 8, 1); // Sep 1 of each year
    for (let i = 0; i < 24; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + Math.round(interval * (i + 1)));
      dates.push(d);
    }
  }
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

var DEFAULT_DATA = {
  "2026-01-27": "PTO", "2026-01-28": "PTO", "2026-01-29": "PTO", "2026-01-30": "PTO",
  "2026-02-02": "PTO", "2026-02-03": "PTO", "2026-02-04": "PTO", "2026-02-05": "PTO", "2026-02-06": "PTO",
  "2026-02-09": "PTO", "2026-02-10": "PTO", "2026-02-11": "PTO", "2026-02-12": "PTO", "2026-02-13": "PTO",
  "2026-02-16": "CUL", "2026-02-17": "CUL",
};

var mono = "'Space Mono', monospace";
var grotesk = "'Space Grotesk', sans-serif";
var work = "'Work Sans', sans-serif";
var goudy = "'Sorts Mill Goudy', serif";

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
  ptoOverText:   P.maroon,
  cul:           P.lime05,
  holiday:       P.lime75,
  unpaid:        P.lime35,

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

  var seg = { border: "none", outline: "none", fontFamily: work, fontSize: 14, fontWeight: 500, background: "transparent", color: S.text, textAlign: "center", padding: 0 };
  var sep = { fontFamily: work, fontSize: 14, fontWeight: 400, color: S.textSubtle, userSelect: "none" };

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
  var keyRef = useRef(0);
  var prevValueRef = useRef(value);
  var [slots, setSlots] = useState(function() {
    return String(value).split('').map(function(d, i) {
      return { digit: parseInt(d, 10), key: 's' + i, state: 'normal' };
    });
  });

  useEffect(function() {
    var prev = prevValueRef.current;
    if (value === prev) return;
    prevValueRef.current = value;
    var prevStr = String(prev);
    var currStr = String(value);

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
  }, [value]);

  return (
    <span style={Object.assign({ display: 'inline-flex' }, style)}>
      {slots.map(function(slot) {
        return <AnimatedDigit key={slot.key} digit={slot.digit} slotState={slot.state} />;
      })}
    </span>
  );
}

// Started as soon as the correct code is entered, so data is ready by the time the
// animation finishes and PTOTrackerApp mounts.
var dataPromise = null;

async function prefetchData() {
  var result = { days: null, settings: null };
  try {
    var res = await supabase.from('pto_days').select('*');
    if (!res.error && res.data && res.data.length > 0) {
      var loaded_days = {};
      res.data.forEach(function(row) { loaded_days[row.date] = row.type; });
      result.days = loaded_days;
    } else {
      var r = localStorage.getItem(STORAGE_KEY);
      if (r) {
        var p = JSON.parse(r);
        if (p.days && Object.keys(p.days).length > 0) {
          var rows = Object.keys(p.days).map(function(date) { return { date: date, type: p.days[date] }; });
          await supabase.from('pto_days').upsert(rows);
          result.days = p.days;
        }
      }
    }
    var sRes = await supabase.from('pto_settings').select('data').eq('id', 1).single();
    if (!sRes.error && sRes.data) {
      result.settings = sRes.data.data;
    } else {
      var r2 = localStorage.getItem(STORAGE_KEY);
      if (r2) {
        var p2 = JSON.parse(r2);
        result.settings = p2;
        await supabase.from('pto_settings').upsert({ id: 1, data: p2 });
      }
    }
    var storedName = localStorage.getItem("bill-pto-userName");
    if (storedName && result.settings && !result.settings.userName) result.storedName = storedName;
  } catch(e) {}
  return result;
}

function LockScreen({ onUnlock }) {
  var [digits, setDigits] = useState([]);
  var [phase, setPhase] = useState('idle'); // 'idle' | 'collapsing' | 'loading' | 'shrinking'
  var inputRef = useRef(null);

  useEffect(function() {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  var isComplete = digits.length === 4;
  var hasAny = digits.length > 0;
  var activeIndex = digits.length < 4 ? digits.length : -1;
  var isAnimating = phase !== 'idle';

  function focusInput() {
    if (inputRef.current && !isAnimating) inputRef.current.focus();
  }

  function handleChange(e) {
    if (isAnimating) return;
    var raw = e.target.value.replace(/\D/g, '');
    var val = raw.slice(0, 4);
    setDigits(val.split('').filter(Boolean));
    if (raw.length > 4) e.target.value = val;
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && isComplete && !isAnimating) handleSubmit();
  }

  function handleSubmit() {
    if (!isComplete || isAnimating) return;
    if (digits.join('') === '1960') {
      dataPromise = prefetchData();
      setPhase('collapsing');
      setTimeout(function() {
        setPhase('loading');
        setTimeout(function() {
          setPhase('shrinking');
          setTimeout(onUnlock, 400);
        }, 1500);
      }, 600);
    } else {
      setDigits([]);
      if (inputRef.current) { inputRef.current.value = ''; inputRef.current.focus(); }
    }
  }

  // Row is 5×48 + 4×8 = 272px wide; center at x=136.
  // Each input circle i has center at 24 + i*56; arrow center at 248.
  // translateX needed to reach center: 136 - center.
  var collapseX = [112, 56, 0, -56]; // for input circles 0-3
  var arrowCollapseX = -112;          // for the arrow button

  return (
    <div onClick={focusInput} style={{
      position: 'fixed', inset: 0, background: S.bg, zIndex: 9999,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <style>{'@keyframes lockSpin { to { transform: rotate(360deg); } }'}</style>

      {/* Hidden input captures keyboard; pointerEvents:none keeps it invisible */}
      <input ref={inputRef} type="tel" inputMode="numeric" pattern="[0-9]*" maxLength={4}
        onChange={handleChange} onKeyDown={handleKeyDown}
        style={{
          position: 'absolute', opacity: 0, caretColor: 'transparent',
          width: 1, height: 1, top: 0, left: 0, pointerEvents: 'none',
        }} />

      {/* ENTER CODE label */}
      <div style={{
        marginBottom: 40,
        fontFamily: work, fontSize: 12, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: 1, color: S.text,
        opacity: isAnimating ? 0 : 1,
        transition: phase === 'collapsing' ? 'opacity 250ms cubic-bezier(0.4,0,0,1)' : 'none',
        userSelect: 'none',
      }}>ENTER CODE</div>

      {/* Five circles */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {[0, 1, 2, 3].map(function(i) {
          return (
            <div key={i} onClick={function(e) { e.stopPropagation(); focusInput(); }} style={{
              width: 48, height: 48, borderRadius: 999,
              background: S.surfaceAlt,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
              transform: isAnimating ? 'translateX(' + collapseX[i] + 'px)' : 'translateX(0)',
              opacity: isAnimating ? 0 : 1,
              transition: isAnimating
                ? 'transform 500ms cubic-bezier(0.4,0,0,1), opacity 350ms cubic-bezier(0.4,0,0,1)'
                : 'none',
            }}>
              {digits[i] && (
                <span style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 20, color: S.text, userSelect: 'none' }}>
                  {digits[i]}
                </span>
              )}
            </div>
          );
        })}

        {/* Arrow / confirm button */}
        <div onClick={function(e) { e.stopPropagation(); handleSubmit(); }} style={{
          width: 48, height: 48, borderRadius: 999,
          background: (isAnimating || hasAny) ? S.pto : S.surfaceAlt,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: isComplete ? 'pointer' : 'default',
          flexShrink: 0,
          transform: phase === 'shrinking'
            ? 'translateX(' + arrowCollapseX + 'px) scale(0)'
            : (phase === 'collapsing' || phase === 'loading')
              ? 'translateX(' + arrowCollapseX + 'px) scale(1)'
              : 'translateX(0) scale(1)',
          transition: phase === 'shrinking'
            ? 'transform 350ms cubic-bezier(0.4,0,0,1)'
            : 'background 150ms cubic-bezier(0.4,0,0,1), transform 500ms cubic-bezier(0.4,0,0,1)',
        }}>
          {(phase === 'loading' || phase === 'shrinking') ? (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
              style={{ animation: 'lockSpin 700ms linear infinite' }}>
              <circle cx="8" cy="8" r="5.5" stroke="rgba(0,0,0,0.15)" strokeWidth="1"/>
              <path d="M8 2.5 A5.5 5.5 0 0 1 13.5 8" stroke={S.iconSubtle} strokeWidth="1" strokeLinecap="round"/>
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M5 2L10 7L5 12" stroke={S.iconSubtle} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PTOTracker() {
  var alreadyUnlocked = sessionStorage.getItem('pto-unlocked') === '1';
  var [unlocked, setUnlocked] = useState(alreadyUnlocked);

  var [theme, setTheme] = useState(function() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        if (p && (p.theme === "light" || p.theme === "dark" || p.theme === "system")) return p.theme;
      }
    } catch(e) {}
    return "system";
  });
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

  if (!unlocked) {
    return (
      <LockScreen onUnlock={function() {
        sessionStorage.setItem('pto-unlocked', '1');
        setUnlocked(true);
      }} />
    );
  }
  return <PTOTrackerApp theme={theme} setTheme={setTheme} />;
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

function PTOTrackerApp({ theme, setTheme }) {
  var [fadeIn, setFadeIn] = useState(false);
  var [days, setDays] = useState(DEFAULT_DATA);
  var [viewYear, setViewYear] = useState(2026);
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
  var [showOpps, setShowOpps] = useState(false);
  var [previewDates, setPreviewDates] = useState([]);
  var [previewCulDates, setPreviewCulDates] = useState([]);
  var [previewExistingDates, setPreviewExistingDates] = useState([]);
  var [showSettings, setShowSettings] = useState(false);
  var [bal, setBal] = useState(-12);
  var [balDate, setBalDate] = useState("2026-04-01");
  var [toast, setToast] = useState(null);
  var [toastVisible, setToastVisible] = useState(false);
  var [showPanel, setShowPanel] = useState(false);
  var [panelTab, setPanelTab] = useState("reco");
  var [sheetDragY, setSheetDragY] = useState(0);
  var sheetDragStart = useRef(null);
  var [userName, setUserName] = useState("Bill");
  var [editName, setEditName] = useState("Bill");
  var [editCL, setEditCL] = useState("8");
  var [editBal, setEditBal] = useState(-12);
  var [editBalDate, setEditBalDate] = useState("2026-04-01");
  var [startStr, setStartStr] = useState("2021-08-02");
  var [editStart, setEditStart] = useState("2021-08-02");
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
  var [sliderDays, setSliderDays] = useState(null);
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
  var [modKeyDown, setModKeyDown] = useState(false);
  // Derived — no state needed
  var historyRef = useRef([]);
  var redoRef = useRef([]);
  var daysRef = useRef(days);
  var calendarScrollRef = useRef(null);
  var [headerScrolled, setHeaderScrolled] = useState(false);

  // Immediate Supabase upsert with current state + overrides. Avoids the
  // useEffect-deferred upsert race where a fast refresh cancels the request.
  function persistSettings(overrides) {
    var data = {
      bal: bal, balDate: balDate, userName: userName, editCL: editCL,
      approvedGroups: approvedGroups, lockedDates: lockedDates, startStr: startStr,
      mlDateStr: mlDateStr, weekStart: weekStart, showHolidays: showHolidays, theme: theme
    };
    if (overrides) Object.assign(data, overrides);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch(e) {}
    supabase.from('pto_settings').upsert({ id: 1, data: data }).then(function() {});
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
      try {
        // Use prefetched data if available (started during lock screen animation)
        var result = dataPromise ? await dataPromise : await prefetchData();
        dataPromise = null;
        if (result.days) {
          prevDaysRef.current = result.days;
          setDays(result.days);
        }
        if (result.settings) {
          var p2 = result.settings;
          if (p2.bal !== undefined) setBal(p2.bal);
          if (p2.balDate) setBalDate(p2.balDate);
          if (p2.userName) setUserName(p2.userName);
          if (p2.editCL) setEditCL(p2.editCL);
          if (p2.approvedGroups) setApprovedGroups(p2.approvedGroups);
          if (p2.lockedDates) setLockedDates(p2.lockedDates);
          if (p2.startStr) setStartStr(p2.startStr);
          if (p2.mlDateStr) setMlDateStr(p2.mlDateStr);
          if (p2.weekStart) setWeekStart(p2.weekStart);
          if (p2.showHolidays) setShowHolidays(p2.showHolidays);
          if (p2.theme === "light" || p2.theme === "dark" || p2.theme === "system") setTheme(p2.theme);
        }
        if (result.storedName) setUserName(result.storedName);
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
      if (toUpsert.length > 0) await supabase.from('pto_days').upsert(toUpsert);
      if (toDelete.length > 0) await supabase.from('pto_days').delete().in('date', toDelete);
      prevDaysRef.current = Object.assign({}, curr);
    }
    syncDays();
  }, [days, loaded]);

  useEffect(function() {
    if (!loaded) return;
    var data = { bal: bal, balDate: balDate, userName: userName, editCL: editCL, approvedGroups: approvedGroups, lockedDates: lockedDates, startStr: startStr, mlDateStr: mlDateStr, weekStart: weekStart, showHolidays: showHolidays, theme: theme };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      localStorage.setItem("bill-pto-userName", userName);
    } catch(e) {}
    // Note: Supabase upserts now happen immediately in click handlers via
    // persistSettings(). This effect only mirrors localStorage. We keep the
    // ref-gated upsert as a safety net for any state changes routed through
    // setX without a paired persistSettings() call.
    if (userChangedSettingsRef.current) {
      userChangedSettingsRef.current = false;
      supabase.from('pto_settings').upsert({ id: 1, data: data }).then(function() {});
    }
  }, [bal, balDate, loaded, userName, editCL, approvedGroups, lockedDates, startStr, mlDateStr, weekStart, showHolidays, theme]);

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

  // Scroll calendar to first preview date when opportunity is selected
  useEffect(function() {
    if (previewDates.length === 0) return;
    var firstKey = previewDates.slice().sort()[0];
    var el = document.querySelector('[data-date="' + firstKey + '"]');
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [previewDates]);

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

    // Auto-compute current balance: snapshot + accruals to today − days taken since snapshot
    var accToToday = 0;
    PAY_PERIOD_ENDS.forEach(function(pp) {
      if (pp > asOf && pp <= today)
        accToToday += rateForPP(pp);
    });
    var takenSinceSnapshot = 0;
    entries.forEach(function(entry) {
      var k = entry[0], t = entry[1];
      if (t === "PTO") {
        var d = new Date(k);
        if (d > asOf && d <= today) takenSinceSnapshot++;
      }
    });
    var currentBal = bal + accToToday - takenSinceSnapshot * HOURS_PER_DAY;

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
    var carriedOver = Math.min(balanceAtFYEnd, 200);

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
        runEoy = Math.min(runEoy, 200);
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
        runBal = Math.min(runBal, 200);
        curFYEnd = nextFYEnd;
      }
      eocyDays = Math.floor(runBal / HOURS_PER_DAY);
    }

    return {
      ptoUsed: ptoUsed, ptoPlanned: ptoPlanned,
      culUsed: culUsed, culPlanned: culPlanned,
      culRemaining: CUL_DAYS_TOTAL - culUsed - culPlanned,
      culByYear: culByYear,
      balHrs: currentBal, futAcc: futAcc, eoy: eoy,
      eoyDays: eoy / HOURS_PER_DAY, avail: avail,
      eocyDays: eocyDays,
      feasibility: feasibility,
    };
  }, [days, bal, balDate, viewYear, startStr, editCL, mlDateStr]);

  var opps = useMemo(function() {
    var r = [];
    var MS_PER_DAY = 86400000;

    function addDays(date, n) {
      var d = new Date(date.getTime());
      d.setDate(d.getDate() + n);
      return d;
    }
    function toKey(d) {
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    function dateIsWknd(d) { var w = d.getDay(); return w === 0 || w === 6; }
    function dateIsHol(d) { return toKey(d) in ALL_HOLIDAYS; }

    Object.entries(ALL_HOLIDAYS).forEach(function(entry) {
      var k = entry[0], name = entry[1];
      var parts = k.split("-").map(Number);
      var holDate = new Date(parts[0], parts[1] - 1, parts[2]);
      if (dateIsWknd(holDate)) return; // skip Sat/Sun holidays

      // Available PTO weekdays before holiday (closest first), stopping at another holiday
      var before = [];
      var cur = addDays(holDate, -1);
      while (before.length < 15) {
        if (dateIsHol(cur)) break;
        if (!dateIsWknd(cur)) before.push(toKey(cur));
        cur = addDays(cur, -1);
      }

      // Available PTO weekdays after holiday (closest first), stopping at another holiday
      var after = [];
      cur = addDays(holDate, 1);
      while (after.length < 15) {
        if (dateIsHol(cur)) break;
        if (!dateIsWknd(cur)) after.push(toKey(cur));
        cur = addDays(cur, 1);
      }

      // Try every (n before, m after) combo; keep minimum-cost config per break size
      var sizeMap = {};
      for (var n = 0; n <= before.length; n++) {
        for (var m = 0; m <= after.length; m++) {
          if (n + m === 0) continue;
          var cost = n + m;
          if (cost > 15) continue;

          var ptoDates = before.slice(0, n).concat(after.slice(0, m));

          // Find the calendar span of the break
          var allTs = ptoDates.map(function(dk) {
            var p = dk.split("-").map(Number); return new Date(p[0], p[1]-1, p[2]).getTime();
          });
          allTs.push(holDate.getTime());

          var minD = new Date(Math.min.apply(null, allTs));
          var maxD = new Date(Math.max.apply(null, allTs));

          // Extend span through adjacent weekends AND consecutive holidays
          var safety = 0;
          while (safety++ < 30) {
            var prev = addDays(minD, -1);
            if (dateIsWknd(prev) || dateIsHol(prev)) { minD = prev; } else { break; }
          }
          safety = 0;
          while (safety++ < 30) {
            var next = addDays(maxD, 1);
            if (dateIsWknd(next) || dateIsHol(next)) { maxD = next; } else { break; }
          }

          var size = Math.round((maxD.getTime() - minD.getTime()) / MS_PER_DAY) + 1;
          if (size < 4 || size > 20) continue;

          if (!sizeMap[size] || cost < sizeMap[size].cost) {
            sizeMap[size] = { cost: cost, ptoDates: ptoDates, startDate: toKey(minD), endDate: toKey(maxD) };
          }
        }
      }

      Object.entries(sizeMap).forEach(function(se) {
        var size = parseInt(se[0]), info = se[1];
        r.push({ date: k, name: name, size: size, ptoDates: info.ptoDates, startDate: info.startDate, endDate: info.endDate });
      });
    });

    return r.sort(function(a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.size - b.size;
    });
  }, []);

  // Group opportunities by break size; hide any whose PTO dates are all already marked
  // or that require more PTO than the user has available
  var groupedOpps = useMemo(function() {
    var MS = 86400000;
    function dk2Date(dk) { var p = dk.split("-").map(Number); return new Date(p[0], p[1]-1, p[2]); }
    function date2dk(d) { return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,"0") + "-" + String(d.getDate()).padStart(2,"0"); }
    function isOffDay(dk) { // weekend, holiday, or already-planned/used leave
      var d = dk2Date(dk); var w = d.getDay();
      if (w === 0 || w === 6) return true;
      if (dk in ALL_HOLIDAYS) return true;
      var t = days[dk];
      return t === "PTO" || t === "CUL" || t === "PLAN" || t === "PLAN_CUL" || t === "UNPAID" || t === "PLAN_UNPAID";
    }

    var today0 = new Date(); today0.setHours(0,0,0,0);
    var milD = new Date(startStr); milD.setFullYear(milD.getFullYear() + 5);
    var mil10D = new Date(startStr); mil10D.setFullYear(mil10D.getFullYear() + 10);
    var gClRates = getClRates(editCL);
    var gPrevClRates = getClRates(parseInt(editCL) + 1);
    var gMlDate = mlDateStr ? (function() { var d = new Date(mlDateStr); d.setHours(0,0,0,0); return d; })() : null;
    function rateForPPG(pp) {
      var rates = (gMlDate && pp < gMlDate) ? gPrevClRates : gClRates;
      return pp >= mil10D ? rates.post10 : pp >= milD ? rates.post5 : rates.pre5;
    }
    var currentBal = stats.balHrs;

    // Locked future PLAN dates the user has committed to — must stay feasible
    var lockedPlanDates = Object.keys(lockedDates).filter(function(ld) {
      return days[ld] === "PLAN" && new Date(ld) > today0;
    }).sort();

    // All existing future PLAN dates (for usedBy simulation)
    var allFuturePlanDates = Object.entries(days)
      .filter(function(e) { return e[1] === "PLAN" && new Date(e[0]) > today0; })
      .map(function(e) { return e[0]; })
      .sort();

    var groups = {};
    opps.filter(function(o) {
      if (new Date(o.date) < today0) return false;
      var holYear = parseInt(o.date.split("-")[0]);
      var touchesViewYear = holYear === viewYear || o.ptoDates.some(function(d) { return parseInt(d.split("-")[0]) === viewYear; });
      if (!touchesViewYear) return false;
      var newDates = o.ptoDates.filter(function(d) {
        return days[d] !== "PTO" && days[d] !== "CUL" && days[d] !== "PLAN" && days[d] !== "PLAN_CUL";
      }).sort();
      var unplanned = newDates.length;
      if (unplanned > Math.max(0, stats.avail)) return false;
      if (unplanned === 0) return false;

      // Ensure adding these dates doesn't push any locked PLAN day into the red
      if (lockedPlanDates.length > 0) {
        for (var li = 0; li < lockedPlanDates.length; li++) {
          var ld = lockedPlanDates[li];
          var ldDate = new Date(ld);
          var acc = 0;
          PAY_PERIOD_ENDS.forEach(function(pp) {
            if (pp > today0 && pp <= ldDate)
              acc += rateForPPG(pp);
          });
          var additional = newDates.filter(function(d) { return d <= ld; }).length;
          // Only blame this opp if it actually contributes dates before `ld`.
          // Without this guard, an existing over-commit blocks every future opp.
          if (additional === 0) continue;
          var usedBy = allFuturePlanDates.filter(function(d) { return d <= ld; }).length;
          if ((currentBal + acc - (usedBy + additional) * HOURS_PER_DAY) < 0) return false;
        }
      }

      return true;
    }).forEach(function(o) {
      // Recalculate effective break size by extending the span through adjacent off-days
      var minD = dk2Date(o.startDate);
      var maxD = dk2Date(o.endDate);
      var safety = 0;
      while (safety++ < 60) {
        var prev = new Date(minD.getTime() - MS);
        if (isOffDay(date2dk(prev))) { minD = prev; } else { break; }
      }
      safety = 0;
      while (safety++ < 60) {
        var next = new Date(maxD.getTime() + MS);
        if (isOffDay(date2dk(next))) { maxD = next; } else { break; }
      }
      var effectiveSize = Math.round((maxD.getTime() - minD.getTime()) / MS) + 1;

      // Collect already-planned days within the effective span that are NOT in ptoDates.
      // Days in ptoDates are already counted in the PTO total — including them here would double-count.
      var alreadyPlanned = [];
      var scanD = new Date(minD.getTime());
      while (scanD.getTime() <= maxD.getTime()) {
        var scanKey = date2dk(scanD);
        if ((days[scanKey] === "PLAN" || days[scanKey] === "PLAN_CUL") && o.ptoDates.indexOf(scanKey) === -1)
          alreadyPlanned.push(scanKey);
        scanD = new Date(scanD.getTime() + MS);
      }

      var key = effectiveSize + " DAYS";
      if (!groups[key]) groups[key] = [];
      groups[key].push(Object.assign({}, o, {
        effectiveStart: date2dk(minD),
        effectiveEnd: date2dk(maxD),
        alreadyPlannedInSpan: alreadyPlanned,
      }));
    });
    return groups;
  }, [opps, days, viewYear, stats, lockedDates, startStr, editCL, mlDateStr]);

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
    var isPreview = previewDates.indexOf(key) !== -1;
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
        cellColor = S.ptoOverText;
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

    // Preview override — bg at 50% opacity, text stays solid
    if (isPreview && !type && !hol) {
      cellBg = (previewCulDates.indexOf(key) !== -1 ? S.cul : S.pto) + "80";
      cellColor = P.inkDeep;
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

    return (
      <div
        key={key}
        onClick={function(e) {
          e.stopPropagation();
          if (hol || wk) return;
          if (isPast && !e.altKey) return;
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
            var culExhausted = (stats.culByYear[year] || 0) >= CUL_DAYS_TOTAL;
            if (culExhausted) {
              // CUL cap reached for this year — assign PTO directly, no popup
              var directType = isPast ? "PTO" : "PLAN";
              toggle(key, directType);
              if (!isPast) triggerPop(key);
            } else {
              // Show popup to choose PTO or CUL
              setActive(isAct ? null : key);
            }
          }
        }}
        data-date={key}
        data-holiday={hol || otherHol ? "true" : undefined}
        onMouseEnter={hol || otherHol ? function() { setTooltip(key); } : null}
        onMouseLeave={hol || otherHol ? function() { setTooltip(null); } : null}
        style={{
          position: "relative", width: "100%", aspectRatio: "1",
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 999, cursor: (hol || wk || (isPast && !modKeyDown)) ? "default" : "pointer",
          fontSize: 12, fontFamily: work, fontWeight: 400,
          color: cellColor,
          background: "transparent",
          userSelect: "none",
        }}
      >
        <div style={{
          position: "absolute", inset: 0, borderRadius: 999,
          background: (type === "PLAN_UNPAID" || type === "UNPAID") ? "transparent" : cellBg,
          border: highlightedDates.indexOf(key) !== -1 ? "1px solid " + S.unpaid
                : previewExistingDates.indexOf(key) !== -1 ? "1px solid " + S.unpaid
                : "none",
          boxShadow: isAct ? "0 0 0 0.5px " + S.border : "none",
          transition: "background 0.15s, box-shadow 0.15s",
          animation: justToggled[key] ? "dayCellPop 100ms cubic-bezier(0.4, 0, 0, 1) both" : "none",
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
        {lockedDates[key] && (
          <div style={{ position: "absolute", width: 1.5, height: 1.5, borderRadius: 999, background: cellColor, left: "50%", transform: "translateX(-50%)", top: "calc(50% + 9px)", pointerEvents: "none" }} />
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
              { opt: "pto", label: "PTO DAY", circleBg: ptoFeasible ? S.pto : S.ptoOver, circleBorder: "none", labelColor: ptoFeasible ? null : S.ptoOverText },
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
                    fontWeight: isSelected ? 600 : 400,
                    fontFamily: work, fontSize: 11, textTransform: "uppercase",
                    letterSpacing: 0.3,
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
            fontSize: 12, fontFamily: work, fontWeight: 400,
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

      {toast ? <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", background: S.text, color: S.bg, padding: "10px 20px", borderRadius: 999, fontSize: 13, fontFamily: work, zIndex: 1000, whiteSpace: "nowrap", animation: toastVisible ? "toastIn 200ms cubic-bezier(0.4, 0, 0, 1) both" : "toastOut 200ms cubic-bezier(0.4, 0, 0, 1) both" }}>{toast}</div> : null}

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
            {isMobile && (
              <div style={{ display: "flex", marginBottom: showPanel ? 0 : 40, maxHeight: showPanel ? 0 : 120, opacity: showPanel ? 0 : 1, overflow: "hidden", transition: "max-height 400ms cubic-bezier(0.4, 0, 0, 1), opacity 400ms cubic-bezier(0.4, 0, 0, 1), margin-bottom 400ms cubic-bezier(0.4, 0, 0, 1)" }}>
                <div style={{ width: "50%", display: "flex", alignItems: "baseline", gap: 8 }}>
                  <AnimatedNumber value={stats.eocyDays} style={{ fontFamily: mono, fontWeight: 400, fontSize: 44, lineHeight: 1 }} />
                  <div style={{ position: "relative", top: -6 }}>
                    <div style={{ position: "absolute", bottom: "100%", marginBottom: 3, fontFamily: work, fontSize: 11, fontWeight: 600, color: S.text, textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 1, whiteSpace: "nowrap" }}>PTO</div>
                    <div style={{ fontFamily: work, fontSize: 11, fontWeight: 600, color: S.text, textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 1, whiteSpace: "nowrap" }}>Days</div>
                  </div>
                </div>
                <div style={{ width: "50%", display: "flex", alignItems: "baseline", gap: 8 }}>
                  <AnimatedNumber value={stats.culRemaining} style={{ fontFamily: mono, fontWeight: 400, fontSize: 44, lineHeight: 1 }} />
                  <div style={{ position: "relative", top: -6 }}>
                    <div style={{ position: "absolute", bottom: "100%", marginBottom: 3, fontFamily: work, fontSize: 11, fontWeight: 600, color: S.text, textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 1, whiteSpace: "nowrap" }}>CUL</div>
                    <div style={{ fontFamily: work, fontSize: 11, fontWeight: 600, color: S.text, textTransform: "uppercase", letterSpacing: 0.3, lineHeight: 1, whiteSpace: "nowrap" }}>Days</div>
                  </div>
                </div>
              </div>
            )}

            {/* Top Bar - desktop: stats left + nav right; mobile: nav row */}
            <div style={{ display: "flex", justifyContent: isMobile ? "center" : "space-between", alignItems: "center", flexWrap: isMobile ? "nowrap" : "wrap", gap: isMobile ? 8 : 20 }}>
              {/* Desktop stats (already rendered above on mobile) */}
              {!isMobile && (
                <div style={{ display: "flex", gap: 40 }}>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    <AnimatedNumber value={stats.eocyDays} style={{ fontFamily: mono, fontWeight: 400, fontSize: 54, lineHeight: 1 }} />
                    <div style={{ position: "relative", marginBottom: 12 }}>
                      <div style={{ position: "absolute", bottom: "100%", marginBottom: 3, fontFamily: work, fontSize: 11, fontWeight: 600, color: S.text, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1, whiteSpace: "nowrap" }}>PTO</div>
                      <div style={{ fontFamily: work, fontSize: 11, fontWeight: 600, color: S.text, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1, whiteSpace: "nowrap" }}>Days</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 8 }}>
                    <AnimatedNumber value={stats.culRemaining} style={{ fontFamily: mono, fontWeight: 400, fontSize: 54, lineHeight: 1 }} />
                    <div style={{ position: "relative", marginBottom: 12 }}>
                      <div style={{ position: "absolute", bottom: "100%", marginBottom: 3, fontFamily: work, fontSize: 11, fontWeight: 600, color: S.text, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1, whiteSpace: "nowrap" }}>CUL</div>
                      <div style={{ fontFamily: work, fontSize: 11, fontWeight: 600, color: S.text, textTransform: "uppercase", letterSpacing: 0.4, lineHeight: 1, whiteSpace: "nowrap" }}>Days</div>
                    </div>
                  </div>
                </div>
              )}

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
                  <div onClick={function() { setViewYear(viewYear - 1); smoothScrollTop(calendarScrollRef.current, 400); }}
                    onMouseEnter={function(e){ e.currentTarget.style.background = S.border; e.currentTarget.style.color = S.iconSubtle; }}
                    onMouseLeave={function(e){ e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = S.iconSubtle; }}
                    onMouseDown={function(e){ e.currentTarget.style.background = S.text; e.currentTarget.style.color = S.bg; }}
                    onMouseUp={function(e){ e.currentTarget.style.background = S.border; e.currentTarget.style.color = S.iconSubtle; }}
                    style={{ width: isMobile ? 54 : 48, height: isMobile ? 54 : 48, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", userSelect: "none", color: S.iconSubtle }}>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <span style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 20, padding: "0 16px", flex: isMobile ? 1 : "none", textAlign: "center" }}>{viewYear}</span>
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
                      fontSize: 12, fontFamily: work, fontWeight: 400, color: S.border, userSelect: "none",
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
                    fontSize: 12, fontFamily: work, fontWeight: 400, color: S.border, userSelect: "none",
                  }}>{n}</div>
                );
              }

              var isCurrentMonth = viewYear === new Date().getFullYear() && mi === new Date().getMonth();
              return (
                <div key={mName} id={isCurrentMonth ? "month-current" : undefined}>
                  <div style={{ fontFamily: goudy, fontStyle: "italic", fontSize: 22, color: S.text, marginBottom: 24 }}>
                    {mName}
                  </div>
                  {/* Weekday headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 8, marginBottom: 4 }}>
                    {(weekStart === "sunday" ? ["S","M","T","W","T","F","S"] : ["M","T","W","T","F","S","S"]).map(function(w, wi) {
                      return <div key={wi} style={{ display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontFamily: work, fontWeight: 500, color: S.textSubtle, textTransform: "uppercase", padding: "4px 0" }}>{w}</div>;
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
                { key: "reco", label: "PLAN" },
                { key: "write", label: "DRAFT" },
                { key: "overview", label: "BALANCE" },
                { key: "settings", label: "SETTINGS" },
              ].map(function(tab) {
                var isActive = panelTab === tab.key;
                return (
                  <div key={tab.key}
                    ref={function(el) { tabItemRefs.current[tab.key] = el; }}
                    onClick={function() { setPanelTab(tab.key); }}
                    style={{
                      fontFamily: work, fontSize: 11, textTransform: "uppercase",
                      letterSpacing: 0.5, cursor: "pointer",
                      fontWeight: isActive ? 600 : 400,
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
                <div style={{ fontFamily: goudy, fontStyle: "italic", fontSize: 50, lineHeight: 1, marginBottom: 8, letterSpacing: -1 }}>{userName}</div>
                <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.5 }}>Management Level {editCL}</div>
                <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.5 }}>{"Since " + new Date(startStr + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" })}</div>
              </div>
              <div ref={tabBarRef} style={{ display: "flex", gap: 20, marginBottom: 0, position: "relative", borderBottom: "0.5px solid " + S.border }}>
                {[
                  { key: "reco", label: "PLAN" },
                  { key: "write", label: "DRAFT" },
                  { key: "overview", label: "BALANCE" },
                  { key: "settings", label: "SETTINGS" },
                ].map(function(tab) {
                  var isActive = panelTab === tab.key;
                  return (
                    <div key={tab.key}
                      ref={function(el) { tabItemRefs.current[tab.key] = el; }}
                      onClick={function() { setPanelTab(tab.key); }}
                      style={{
                        fontFamily: work, fontSize: 11, textTransform: "uppercase",
                        letterSpacing: 0.5, cursor: "pointer",
                        fontWeight: isActive ? 600 : 400,
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
            ? ("20px 20px " + (((panelTab === "reco" && previewDates.length > 0) || (panelTab === "settings" && settingsDirty) || (panelTab === "write" && writeSelectedGroups.length > 0)) ? "120px" : "20px") + " 20px")
            : ("0 24px " + (((panelTab === "reco" && previewDates.length > 0) || (panelTab === "settings" && settingsDirty) || (panelTab === "write" && writeSelectedGroups.length > 0)) ? "160px" : "24px") + " 24px")
          }}>

            {/* Overview Tab */}
            {panelTab === "overview" ? (
              <div style={{ paddingTop: isMobile ? 28 : 40 }}>
                {/* Balance Section — first: no top border */}
                <div style={{ marginBottom: 48 }}>
                  <div style={{ fontFamily: work, fontSize: 11, textTransform: "uppercase", color: S.textSubtle, letterSpacing: 0.5, marginBottom: 20 }}>{"Balance FY" + viewYear}</div>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 20, color: stats.balHrs < 0 ? S.ptoOverText : S.text }}>
                        {(stats.balHrs / HOURS_PER_DAY).toFixed(1)}
                      </div>
                      <div style={{ fontFamily: work, fontSize: 12, fontWeight: 500, color: stats.balHrs < 0 ? S.ptoOverText : S.text, lineHeight: 1.5 }}>
                        {"days / " + stats.balHrs + " hrs"}
                      </div>
                      <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.5 }}>
                        {"as of today"}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 20, color: stats.eoy < 0 ? S.ptoOverText : S.text }}>
                        {stats.eoyDays.toFixed(1)}
                      </div>
                      <div style={{ fontFamily: work, fontSize: 12, fontWeight: 500, color: stats.eoy < 0 ? S.ptoOverText : S.text, lineHeight: 1.5 }}>
                        {"days / " + stats.eoy.toFixed(1) + " hrs"}
                      </div>
                      <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.5 }}>
                        by Aug 31
                      </div>
                    </div>
                  </div>
                </div>

                {/* Accrual Rate Section */}
                <div style={{ borderTop: "0.5px solid " + S.border, paddingTop: 8, marginBottom: 48 }}>
                  <div style={{ fontFamily: work, fontSize: 11, textTransform: "uppercase", color: S.textSubtle, letterSpacing: 0.5, marginBottom: 20 }}>Accrual Rate</div>
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
                          <div style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 20 }}>{rateA}</div>
                          <div style={{ fontFamily: work, fontSize: 12, color: S.text, lineHeight: 1.5 }}>hrs per pay</div>
                          <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.5 }}>{labelA}</div>
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 20 }}>{rateB}</div>
                          <div style={{ fontFamily: work, fontSize: 12, color: S.text, lineHeight: 1.5 }}>hrs per pay</div>
                          <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.5 }}>{labelB}</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* Used Vacation Days Section */}
                <div style={{ borderTop: "0.5px solid " + S.border, paddingTop: 8, marginBottom: 48 }}>
                  <div style={{ fontFamily: work, fontSize: 11, textTransform: "uppercase", color: S.textSubtle, letterSpacing: 0.5, marginBottom: 20 }}>Used Vacation Days</div>
                  <div style={{ display: "flex", gap: 24 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 20 }}>{stats.ptoUsed}</div>
                      <div style={{ fontFamily: work, fontSize: 12, color: S.text, lineHeight: 1.5 }}>PTO days</div>
                      <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.5 }}>FY {viewYear}</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: grotesk, fontWeight: 500, fontSize: 20 }}>{stats.culUsed}</div>
                      <div style={{ fontFamily: work, fontSize: 12, color: S.text, lineHeight: 1.5 }}>CUL days</div>
                      <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.5 }}>{viewYear}</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Reco Tab */}
            {panelTab === "reco" ? (function() {
              var availSizes = Object.keys(groupedOpps).map(function(k) { return parseInt(k); }).sort(function(a,b){return a-b;});
              var minDays = availSizes.length > 0 ? availSizes[0] : 4;
              var maxDays = availSizes.length > 0 ? availSizes[availSizes.length-1] : 20;
              var effectiveDays = sliderDays === null ? minDays : Math.max(minDays, Math.min(maxDays, sliderDays));
              var thumbPct = maxDays > minDays ? (effectiveDays - minDays) / (maxDays - minDays) : 0;
              var currentOpps = groupedOpps[effectiveDays + " DAYS"] || [];
              var thumbStyle = { left: (thumbPct * 100) + "%", transform: "translateX(" + (-thumbPct * 100) + "%)" };
              return (
                <div style={{ paddingTop: isMobile ? 28 : 40 }}>
                  {availSizes.length === 0 ? (
                    <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.4 }}>No opportunities available with your current balance.</div>
                  ) : (
                    <div>
                      {/* Single container card: Days Off + slider */}
                      <div style={{ background: S.surface, borderRadius: 16, padding: "14px 14px 20px", marginBottom: 8 }}>
                        <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, marginBottom: 16 }}>Days off</div>
                        {/* Numbers row */}
                        <div style={{ position: "relative", height: 26, marginBottom: 14 }}>
                          {effectiveDays > minDays && (
                            <div style={{ position: "absolute", left: 0, fontFamily: grotesk, fontWeight: 500, fontSize: 20, color: S.textFaint, lineHeight: 1 }}>{minDays}</div>
                          )}
                          {effectiveDays < maxDays && (
                            <div style={{ position: "absolute", right: 0, fontFamily: grotesk, fontWeight: 500, fontSize: 20, color: S.textFaint, lineHeight: 1 }}>{maxDays}</div>
                          )}
                          <div style={Object.assign({ position: "absolute", fontFamily: grotesk, fontWeight: 500, fontSize: 20, color: S.text, lineHeight: 1 }, thumbStyle)}>{effectiveDays}</div>
                        </div>
                        {/* Slider */}
                        <input type="range" className="reco-slider"
                          min={minDays} max={maxDays} step={1} value={effectiveDays}
                          onChange={function(e) { setSliderDays(parseInt(e.target.value)); }}
                        />
                      </div>
                      {/* Opportunity cards — no section header */}
                      {currentOpps.length > 0 ? (
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                          {currentOpps.map(function(o) {
                            var isPreviewing = o.ptoDates.length > 0 && o.ptoDates.every(function(d) { return previewDates.indexOf(d) !== -1; });
                            var sp = (o.effectiveStart || o.startDate || o.date).split("-");
                            var ep = (o.effectiveEnd || o.endDate || o.date).split("-");
                            var sm = MONTHS[parseInt(sp[1])-1].slice(0, 3);
                            var sd = parseInt(sp[2]);
                            var em = MONTHS[parseInt(ep[1])-1].slice(0, 3);
                            var ed = parseInt(ep[2]);
                            var dateRange = sm + " " + sd + " – " + (sp[1] !== ep[1] ? em + " " : "") + ed;
                            return (
                              <div key={o.date + "-" + o.size}
                                onClick={function() {
                                  if (isPreviewing) { setPreviewDates([]); setPreviewCulDates([]); setPreviewExistingDates([]); }
                                  else {
                                    var culCount = Math.min(Math.max(0, stats.culRemaining), o.ptoDates.length);
                                    setPreviewCulDates(o.ptoDates.slice(0, culCount));
                                    setPreviewDates(o.ptoDates);
                                    var alreadyPlannedPtoDates = o.ptoDates.filter(function(d) { return days[d] === "PLAN" || days[d] === "PLAN_CUL"; });
                                    setPreviewExistingDates((o.alreadyPlannedInSpan || []).concat(alreadyPlannedPtoDates));
                                    var oppYear = parseInt(o.date.split("-")[0]); if (oppYear !== viewYear) setViewYear(oppYear);
                                  }
                                }}
                                style={{ background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer", border: isPreviewing ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                                <div style={{ fontFamily: work, fontSize: 14, color: S.text, marginBottom: 8 }}>{dateRange}</div>
                                {(function() {
                                  var existing = o.alreadyPlannedInSpan || [];
                                  var existingPTO = existing.filter(function(d) { return days[d] === "PLAN"; }).length;
                                  var existingCUL = existing.filter(function(d) { return days[d] === "PLAN_CUL"; }).length;
                                  var culCount = Math.min(Math.max(0, stats.culRemaining), o.ptoDates.length);
                                  var ptoCount = (o.ptoDates.length - culCount) + existingPTO;
                                  var totalCUL = culCount + existingCUL;
                                  var parts = [];
                                  if (ptoCount > 0) parts.push(ptoCount + " PTO" + (ptoCount > 1 ? "s" : ""));
                                  if (totalCUL > 0) parts.push(totalCUL + " CUL" + (totalCUL > 1 ? "s" : ""));
                                  return <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle }}>{parts.join(", ")}</div>;
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.4 }}>No opportunities for {effectiveDays} days off.</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })() : null}

            {/* Settings Tab */}
            {panelTab === "settings" ? (
              <div style={{ paddingTop: isMobile ? 28 : 40 }}>
                {/* INFO section — first: no top border */}
                <div style={{ marginBottom: 48 }}>
                  <div style={{ fontFamily: work, fontSize: 11, textTransform: "uppercase", color: S.textSubtle, letterSpacing: 0.5, marginBottom: 12 }}>Info</div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "name" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ fontFamily: work, fontSize: 11, color: S.textSubtle, marginBottom: 8 }}>Name</div>
                      <input type="text" value={editName}
                        onChange={function(e) { setEditName(e.target.value); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("name"); }}
                        onBlur={function() { setFocusedField(null); }}
                        style={{ border: "none", outline: "none", fontFamily: work, fontSize: 14, fontWeight: 500, width: "100%", background: "transparent", color: S.text }} />
                    </div>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "cl" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ fontFamily: work, fontSize: 11, color: S.textSubtle, marginBottom: 8 }}>Management Level</div>
                      <input type="text" value={editCL}
                        onChange={function(e) { setEditCL(e.target.value); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("cl"); }}
                        onBlur={function() { setFocusedField(null); }}
                        style={{ border: "none", outline: "none", fontFamily: work, fontSize: 14, fontWeight: 500, width: "100%", background: "transparent", color: S.text }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "milestone" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ fontFamily: work, fontSize: 11, color: S.textSubtle, marginBottom: 8 }}>Starting Date</div>
                      <DateField value={editStart} isFocused={focusedField === "milestone"}
                        onChange={function(v) { setEditStart(v); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("milestone"); }}
                        onBlur={function() { setFocusedField(null); }} />
                    </div>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "mlDate" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ fontFamily: work, fontSize: 11, color: S.textSubtle, marginBottom: 8 }}>ML Effective Date</div>
                      <DateField value={editMLDate} isFocused={focusedField === "mlDate"}
                        onChange={function(v) { setEditMLDate(v); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("mlDate"); }}
                        onBlur={function() { setFocusedField(null); }} />
                    </div>
                  </div>
                </div>

                {/* CURRENT BALANCE section */}
                <div style={{ marginBottom: 48 }}>
                  <div style={{ fontFamily: work, fontSize: 11, textTransform: "uppercase", color: S.textSubtle, letterSpacing: 0.5, marginBottom: 12 }}>Current Balance</div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "bal" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ fontFamily: work, fontSize: 11, color: S.textSubtle, marginBottom: 8 }}>Hours</div>
                      <input type="number" value={editBal}
                        onChange={function(e) { setEditBal(parseFloat(e.target.value) || 0); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("bal"); }}
                        onBlur={function() { setFocusedField(null); }}
                        style={{ border: "none", outline: "none", fontFamily: work, fontSize: 14, fontWeight: 500, width: "100%", background: "transparent", color: S.text }} />
                    </div>
                    <div style={{ flex: 1, background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", border: focusedField === "balDate" ? "0.5px solid " + S.textSubtle : "0.5px solid transparent" }}>
                      <div style={{ fontFamily: work, fontSize: 11, color: S.textSubtle, marginBottom: 8 }}>As of Date</div>
                      <DateField value={editBalDate} isFocused={focusedField === "balDate"}
                        onChange={function(v) { setEditBalDate(v); setSettingsDirty(true); }}
                        onFocus={function() { setFocusedField("balDate"); }}
                        onBlur={function() { setFocusedField(null); }} />
                    </div>
                  </div>
                </div>

                {/* CALENDAR VIEW section */}
                <div style={{ marginBottom: 48 }}>
                  <div style={{ fontFamily: work, fontSize: 11, textTransform: "uppercase", color: S.textSubtle, letterSpacing: 0.5, marginBottom: 12 }}>Display</div>
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
                      <div style={{ fontFamily: work, fontSize: 11, color: S.textSubtle, marginBottom: 8 }}>Week starts on</div>
                      <div style={{ fontFamily: work, fontSize: 14 }}>
                        <span style={{ color: weekStart === "sunday" ? S.text : S.textSubtle, fontWeight: weekStart === "sunday" ? 500 : 400 }}>Sunday</span>
                        <span style={{ color: S.textSubtle, margin: "0 4px", fontWeight: 400 }}>/</span>
                        <span style={{ color: weekStart === "monday" ? S.text : S.textSubtle, fontWeight: weekStart === "monday" ? 500 : 400 }}>Monday</span>
                      </div>
                    </div>
                    <div
                      onClick={function() { var next = showHolidays === "all" ? "acn" : "all"; setShowHolidays(next); persistSettings({ showHolidays: next }); userChangedSettingsRef.current = true; }}
                      style={{ background: S.surface, borderRadius: 16, height: 76, padding: "0 16px", display: "flex", flexDirection: "column", justifyContent: "center", cursor: "pointer" }}>
                      <div style={{ fontFamily: work, fontSize: 11, color: S.textSubtle, marginBottom: 8 }}>Show US Holidays</div>
                      <div style={{ fontFamily: work, fontSize: 14 }}>
                        <span style={{ color: showHolidays === "acn" ? S.text : S.textSubtle, fontWeight: showHolidays === "acn" ? 500 : 400 }}>ACN only</span>
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
                      <div style={{ fontFamily: work, fontSize: 11, color: S.textSubtle, marginBottom: 8 }}>Theme</div>
                      <div style={{ fontFamily: work, fontSize: 14 }}>
                        <span style={{ color: theme === "light" ? S.text : S.textSubtle, fontWeight: theme === "light" ? 500 : 400 }}>Light</span>
                        <span style={{ color: S.textSubtle, margin: "0 4px", fontWeight: 400 }}>/</span>
                        <span style={{ color: theme === "dark" ? S.text : S.textSubtle, fontWeight: theme === "dark" ? 500 : 400 }}>Dark</span>
                        <span style={{ color: S.textSubtle, margin: "0 4px", fontWeight: 400 }}>/</span>
                        <span style={{ color: theme === "system" ? S.text : S.textSubtle, fontWeight: theme === "system" ? 500 : 400 }}>System</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Write Tab */}
            {panelTab === "write" ? (
              <div style={{ paddingTop: isMobile ? 28 : 40 }}>
                {writePlanGroups.length === 0 ? (
                  <div style={{ fontFamily: work, fontSize: 12, color: S.textSubtle, lineHeight: 1.4 }}>No planned dates yet.</div>
                ) : (
                  <div>
                  <div style={{ fontFamily: work, fontSize: 11, textTransform: "uppercase", color: S.textSubtle, letterSpacing: 0.5, marginBottom: 16 }}>Planned Dates</div>
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
                            <div style={{ fontFamily: work, fontSize: 14, color: isApproved ? P.inkDeep : S.text, marginBottom: 8 }}>{dateRange}</div>
                            <div style={{ fontFamily: work, fontSize: 12, color: isApproved ? P.inkDeep : S.textSubtle }}>{subtitle.join(", ")}</div>
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
                  </div>
                )}

                {writeSelectedGroups.length > 0 && writePlanGroups.length > 0 ? (
                  <div style={{ marginTop: 48 }}>
                    <div style={{ fontFamily: work, fontSize: 11, textTransform: "uppercase", color: S.textSubtle, letterSpacing: 0.5, marginBottom: 16 }}>Text</div>
                    <div style={{ background: S.surface, borderRadius: 16, padding: "16px 20px", userSelect: "text" }}>
                      {generateEmailText().split("\n").map(function(line, i) {
                        var isYearLine = /^\d{4}$/.test(line);
                        var isDateLine = !isYearLine && writeSelectedGroups.some(function(idx) {
                          return getGroupSubRunLines(writePlanGroups[idx]).indexOf(line) !== -1;
                        });
                        return (
                          <div key={i} style={{
                            fontFamily: work, fontSize: 13, lineHeight: 1.8,
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

          {/* Sticky CTA footer — shown for Reco (when previewing), Settings (when dirty), and Write (when groups selected) */}
          {(panelTab === "reco" && previewDates.length > 0) || (panelTab === "settings" && settingsDirty) || (panelTab === "write" && writeSelectedGroups.length > 0 && writePlanGroups.length > 0) ? (
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
                    fontFamily: work, fontSize: 13, fontWeight: 600, color: S.bg, cursor: "pointer",
                    textTransform: "uppercase", letterSpacing: 0.5,
                  }}>
                  Copy
                </button>
              ) : (
                <div style={{ display: "flex", gap: 10 }}>
                  {/* Cancel button */}
                  <button
                    onClick={function() {
                      if (panelTab === "reco") {
                        setPreviewDates([]); setPreviewCulDates([]); setPreviewExistingDates([]);
                      } else {
                        setEditName(userName);
                        setEditBal(bal);
                        setEditBalDate(balDate);
                        setEditStart(startStr);
                        setSettingsDirty(false);
                      }
                    }}
                    style={{
                      flex: 1, height: 48, borderRadius: 999,
                      background: S.surface, border: "1px solid " + S.border,
                      fontFamily: work, fontSize: 13, fontWeight: 600, color: S.text, cursor: "pointer",
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>
                    Cancel
                  </button>
                  {/* Primary action button */}
                  <button
                    onClick={function() {
                      if (panelTab === "reco") {
                        pushHistory();
                        var u = Object.assign({}, days);
                        previewDates.forEach(function(k) {
                          u[k] = previewCulDates.indexOf(k) !== -1 ? "PLAN_CUL" : "PLAN";
                        });
                        setDays(u);
                        setPreviewDates([]); setPreviewCulDates([]); setPreviewExistingDates([]);
                        notify("Plan applied");
                      } else {
                        userChangedSettingsRef.current = true;
                        setUserName(editName);
                        setBal(editBal);
                        setBalDate(editBalDate);
                        setStartStr(editStart);
                        setMlDateStr(editMLDate);
                        setSettingsDirty(false);
                        persistSettings({ userName: editName, bal: editBal, balDate: editBalDate, startStr: editStart, mlDateStr: editMLDate });
                      }
                    }}
                    style={{
                      flex: 1, height: 48, borderRadius: 999,
                      background: S.text, border: "none",
                      fontFamily: work, fontSize: 13, fontWeight: 600, color: S.bg, cursor: "pointer",
                      textTransform: "uppercase", letterSpacing: 0.5,
                    }}>
                    {panelTab === "reco" ? "Apply" : "Update"}
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
      " +
        "input[type='range'].reco-slider { -webkit-appearance: none; appearance: none; width: 100%; height: 1px; background: " + S.border + "; border-radius: 1px; outline: none; cursor: pointer; margin: 0; display: block; }" +
        "input[type='range'].reco-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; background: " + S.surface + "; border: 1px solid " + S.border + "; box-shadow: " + S.shadowThumb + "; cursor: grab; }" +
        "input[type='range'].reco-slider::-webkit-slider-thumb:active { cursor: grabbing; }" +
        "input[type='range'].reco-slider::-moz-range-thumb { width: 18px; height: 18px; border-radius: 50%; background: " + S.surface + "; border: 1px solid " + S.border + "; box-shadow: " + S.shadowThumb + "; cursor: grab; border-box: border-box; }"
      }</style>
    </div>
  );
}
