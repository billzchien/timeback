import { useState, useEffect, useRef } from 'react';

var LIME   = '#ADFF55';
var BLACK  = '#000000';
var OOO    = 'cubic-bezier(0.4, 0.0, 0.0, 1.0)';
var GRAY15 = '#E3E3E3';
var GRAY45 = '#757575';
var WORK   = "'Work Sans', sans-serif";
var GOUDY  = "'Sorts Mill Goudy', serif";
var FONTS  = "@import url('https://fonts.googleapis.com/css2?family=Sorts+Mill+Goudy:ital@1&family=Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');";
var COL_CSS = [
  ".tb-about-hero { padding: 0 40px; }",
  ".tb-about-col  { padding: 0; }",
  "@media (max-width: 560px) {",
  "  .tb-about-col { padding: 0 40px; }",
  "}",
].join("\n");

function getTab() {
  var p = window.location.pathname;
  if (p === '/about/privacy') return 'privacy';
  if (p === '/about/guide') return 'guide';
  return 'story';
}

export default function About() {
  var [tab, setTab] = useState(getTab);
  var [indicatorPos, setIndicatorPos] = useState({ left: 0, width: 0 });
  var tabBarRef = useRef(null);
  var tabItemRefs = useRef({});

  useEffect(function() {
    function onPop() { setTab(getTab()); }
    window.addEventListener('popstate', onPop);
    return function() { window.removeEventListener('popstate', onPop); };
  }, []);

  useEffect(function() {
    var container = tabBarRef.current;
    var el = tabItemRefs.current[tab];
    if (!container || !el) return;
    var cRect = container.getBoundingClientRect();
    var eRect = el.getBoundingClientRect();
    setIndicatorPos({ left: eRect.left - cRect.left, width: eRect.width });
  }, [tab]);

  function go(t) {
    setTab(t);
    var url = t === 'privacy' ? '/about/privacy' : t === 'guide' ? '/about/guide' : '/about';
    window.history.pushState({}, '', url);
  }

  var tabLbl = {
    fontFamily: WORK, fontSize: 11,
    letterSpacing: 0.5, textTransform: 'uppercase',
    background: 'none', border: 'none', padding: '16px 0 10px 0',
    cursor: 'pointer', outline: 'none',
  };

  return (
    <div style={{ background: '#fff', minHeight: '100vh', userSelect: 'none' }}>
      <style>{FONTS + COL_CSS}</style>

      {/* Hero: lime circle matching login screen size and top position */}
      <div className="tb-about-hero" style={{
        paddingTop: 'max(40px, calc(50vh - 265px))', paddingBottom: 80,
        display: 'flex', justifyContent: 'center', boxSizing: 'border-box',
      }}>
        <a href="/"
          style={{ display: 'block', width: 220, height: 220, borderRadius: 999, background: LIME, flexShrink: 0, textDecoration: 'none', transition: 'transform 200ms ' + OOO }}
          onMouseEnter={function(e) { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.transition = 'transform 200ms ' + OOO; }}
          onMouseLeave={function(e) { e.currentTarget.style.transform = 'scale(1.0)'; e.currentTarget.style.transition = 'transform 200ms ' + OOO; }}
          onMouseDown={function(e) { e.currentTarget.style.transform = 'scale(1.0)'; e.currentTarget.style.transition = 'transform 100ms ' + OOO; }}
          onMouseUp={function(e) { e.currentTarget.style.transform = 'scale(1.2)'; e.currentTarget.style.transition = 'transform 200ms ' + OOO; }}
        />
      </div>

      {/* Content column */}
      <div className="tb-about-col" style={{ width: '100%', maxWidth: 480, margin: '0 auto', boxSizing: 'border-box' }}>

        {/* Tab bar — matches panel tab style */}
        <div ref={tabBarRef} style={{ display: 'flex', gap: 20, position: 'relative', borderBottom: '0.5px solid ' + GRAY15, marginBottom: 40 }}>
          {[['story', 'Story'], ['guide', 'Guide'], ['privacy', 'Privacy Policy']].map(function(pair) {
            var key = pair[0], label = pair[1];
            var active = tab === key;
            return (
              <div key={key}
                ref={function(el) { tabItemRefs.current[key] = el; }}
                onClick={function() { go(key); }}
                style={Object.assign({}, tabLbl, {
                  fontWeight: active ? 600 : 400,
                  color: active ? BLACK : GRAY45,
                })}>
                {label}
              </div>
            );
          })}
          <div style={{
            position: 'absolute', bottom: -0.5,
            left: indicatorPos.left, width: indicatorPos.width,
            height: 0.5, background: BLACK,
            transition: 'left 200ms cubic-bezier(0.4,0,0,1), width 200ms cubic-bezier(0.4,0,0,1)',
          }} />
        </div>

        {tab === 'story' ? <StoryTab /> : tab === 'guide' ? <GuideTab /> : <PrivacyTab />}
      </div>

      <div style={{ height: 80 }} />
    </div>
  );
}

function StoryTab() {
  var h1 = { fontFamily: GOUDY, fontStyle: 'italic', fontSize: 50, lineHeight: 1.1, letterSpacing: -1, color: BLACK, margin: '0 0 40px 0' };
  var p  = { fontFamily: WORK, fontSize: 14, color: BLACK, lineHeight: 1.7, margin: '0 0 20px 0' };

  return (
    <div>
      <p style={h1}>PTO is a serious business, for all of us.</p>
      <p style={p}>Lindsey told me that during my first year at Work &amp; Co, when I forgot to take time off. I know — we care about our work, sometimes too much.</p>
      <p style={p}>I didn&#x2019;t realize how quickly PTO could run out until I made a personal commitment to return home (China) every year for Chinese New Year, to spend time with family — the way many of us do for Christmas.</p>
      <p style={p}>In the old days, planning PTO was simple. A set number of days, spend them whenever you want.</p>
      <p style={p}>Then everything changed.</p>
      <p style={p}>We now have two different cycles — fiscal year and calendar year — for two different types of time off. We can&#x2019;t use PTO before it accrues (yes, I got warned for going into negative balance). Checking your balance is inconvenient. All of this makes vacation planning unnecessarily hard.</p>
      <p style={p}>I often say to my colleagues: we design great products for our clients, but we rarely think about ourselves. I had to do something about it — just like when I created Bill&#x2019;s Tool Box.</p>
      <p style={p}>I needed an app that could forecast my balance, help me plan time off months in advance, and still follow company policy.</p>
      <p style={p}>My first version was a Google Sheet, which I&#x2019;m glad to find people actually using. Now, the timing couldn&#x2019;t be better to take it further — following a trend I&#x2019;ve been curious about: vibe coding. No business case, no timeline, no bothering anyone else. Just a designer, a vision, and a workstation.</p>
      <p style={p}>Timeback was born on a weekend when I decided to try Claude Code. Many days of back and forth to get things looking and feeling right. I was so excited watching my imagination come to life.</p>
      <p style={p}>Now, I want to share that with you. Enjoy!</p>
      <a href="https://www.billchien.net/" target="_blank" rel="noopener noreferrer"
        onMouseEnter={function(e) { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.textUnderlineOffset = '3px'; }}
        onMouseLeave={function(e) { e.currentTarget.style.textDecoration = 'none'; }}
        style={{ display: 'block', fontFamily: WORK, fontSize: 14, fontWeight: 500, color: BLACK, lineHeight: 1.75, margin: '0 0 4px 0', textDecoration: 'none' }}>Bill Chien</a>
      <p style={{ fontFamily: WORK, fontSize: 14, color: BLACK, lineHeight: 1.75, margin: '0 0 40px 0' }}>May 12, 2026</p>
    </div>
  );
}

function GuideTab() {
  var h1 = { fontFamily: GOUDY, fontStyle: 'italic', fontSize: 50, lineHeight: 1.1, letterSpacing: -1, color: BLACK, margin: '0 0 48px 0' };
  var h2 = { fontFamily: GOUDY, fontStyle: 'italic', fontSize: 22, fontWeight: 400, lineHeight: 1.2, color: BLACK, margin: '0 0 8px 0' };
  var ul = { fontFamily: WORK, fontSize: 14, color: BLACK, lineHeight: 1.7, margin: '0 0 32px 0', paddingLeft: 20 };

  return (
    <div>
      <p style={h1}>Here&#x2019;s the manual.</p>
      <h2 style={h2}>Plan a day off</h2>
      <ul style={ul}>
        <li>Click any empty weekday to plan a day — PTO or Cultural Day</li>
        <li>Click a planned day to clear it</li>
      </ul>
      <h2 style={h2}>Navigate calendar years</h2>
      <ul style={ul}>
        <li>Use the year navigation to move between calendar years</li>
        <li>The balance on top reflects the days available in the current selected calendar year</li>
      </ul>
      <h2 style={h2}>Planned PTO day color</h2>
      <ul style={ul}>
        <li>Green — your projected balance covers this day</li>
        <li>Red — you won&#x2019;t have enough balance when this day arrives</li>
      </ul>
      <h2 style={h2}>Convert planned PTO to unpaid leave</h2>
      <ul style={ul}>
        <li>&#x2318; Command + Click a planned PTO day to change it to unpaid leave</li>
        <li>&#x2318; Command + Click again to change it back</li>
      </ul>
      <h2 style={h2}>Lock a planned day</h2>
      <ul style={ul}>
        <li>A planned day can be locked so it can&#x2019;t be cleared with a single click</li>
        <li>&#x2325; Option + Click a planned day to lock it</li>
        <li>&#x2325; Option + Click again to unlock</li>
      </ul>
      <h2 style={h2}>Others</h2>
      <ul style={ul}>
        <li>It is important to keep your information accurate to minimize forecast mistakes</li>
        <li>If you&#x2019;re unsure whether your balance is still accurate after an event like personal leave, update your balance snapshot in settings based on the PTO balance reflected on your pay slip</li>
      </ul>
      <p style={{ fontFamily: WORK, fontStyle: 'italic', fontSize: 14, color: BLACK, margin: '0 0 40px 0' }}>The end.</p>
    </div>
  );
}

function PrivacyTab() {
  var h1    = { fontFamily: GOUDY, fontStyle: 'italic', fontSize: 50, lineHeight: 1.1, letterSpacing: -1, color: BLACK, margin: '0 0 48px 0' };
  var h2    = { fontFamily: GOUDY, fontStyle: 'italic', fontSize: 22, fontWeight: 400, lineHeight: 1.2, color: BLACK, margin: '0 0 8px 0' };
  var p     = { fontFamily: WORK, fontSize: 14, color: BLACK, lineHeight: 1.7, margin: '0 0 32px 0' };
  var small = { fontFamily: WORK, fontSize: 12, color: GRAY45, margin: '0 0 32px 0' };

  return (
    <div>
      <p style={h1}>Timeback helps you plan your time off, and your data stays private, period.</p>
      <h2 style={h2}>What&#x2019;s collected</h2>
      <p style={p}>Your name and email (via Google Sign-In), plus any PTO data you enter — dates, balances, and settings.</p>
      <h2 style={h2}>How your data is used</h2>
      <p style={p}>Only to run the app. Your data powers your calendar and balance calculations. It is never sold, shared, or used for advertising — ever.</p>
      <h2 style={h2}>Where your data is stored</h2>
      <p style={p}>Securely in <a href="https://supabase.com/" target="_blank" rel="noopener noreferrer" style={{ color: BLACK }}>Supabase</a>, isolated to your account. Other users cannot see your data, and the developer will never view or use it.</p>
      <h2 style={h2}>Google sign-in</h2>
      <p style={p}>Google is used only for authentication. Timeback does not access Gmail, Google Calendar, or any other Google services.</p>
      <h2 style={h2}>Deleting your data</h2>
      <p style={p}>You&#x2019;re in full control. Permanently delete your account and all associated data anytime from the Settings tab.</p>
      <p style={{ fontFamily: WORK, fontStyle: 'italic', fontSize: 14, color: BLACK, margin: '0 0 16px 0' }}>The end.</p>
      <p style={small}>Last updated: May 12, 2026</p>
    </div>
  );
}
