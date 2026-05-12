import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabase.js';
import PTOTracker from './PTOTracker';
import About from './About';

var LIME    = '#ADFF55';
var INK     = '#141B13';
var GRAY05  = '#F8F8F8';
var GRAY15  = '#E3E3E3';
var GRAY45  = '#757575';
var BLACK   = '#000000';
var CORAL   = '#FF715B';
var WORK    = "'Work Sans', sans-serif";
var GOUDY   = "'Sorts Mill Goudy', serif";
var OOO     = 'cubic-bezier(0.4, 0.0, 0.0, 1.0)';
var FONTS   = "@import url('https://fonts.googleapis.com/css2?family=Sorts+Mill+Goudy:ital@1&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&family=Work+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap');";
var SPIN_KF = "@keyframes tbSpin { to { transform: rotate(360deg); } }";
var PH_CSS  = "input.tb-ob::placeholder { color: " + GRAY45 + "; opacity: 1; }";

var BIG_R   = 220;
var SMALL_R = 40;

// ─── Onboarding date field ────────────────────────────────────────────────────

function OBDateField({ value, onChange, onFocus, onBlur }) {
  var parts = (value || '').split('-');
  var [yyyy, setYyyy] = useState(parts[0] || '');
  var [mm,   setMm]   = useState(parts[1] || '');
  var [dd,   setDd]   = useState(parts[2] || '');
  var mmRef   = useRef(null);
  var ddRef   = useRef(null);
  var yyyyRef = useRef(null);

  useEffect(function() {
    var p = (value || '').split('-');
    setYyyy(p[0] || ''); setMm(p[1] || ''); setDd(p[2] || '');
  }, [value]);

  function tryEmit(y, m, d) {
    if (y.length === 4 && m.length === 2 && d.length === 2) onChange(y + '-' + m + '-' + d);
  }

  var seg = { border: 'none', outline: 'none', fontFamily: WORK, fontSize: 14, fontWeight: 500, background: 'transparent', color: BLACK, textAlign: 'center', padding: 0 };
  var sep = { fontFamily: WORK, fontSize: 14, color: GRAY45, userSelect: 'none' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <input ref={mmRef} type="text" value={mm} maxLength={2} placeholder="MM" className="tb-ob"
        onChange={function(e) { var v = e.target.value.replace(/\D/g,'').slice(0,2); setMm(v); tryEmit(yyyy,v,dd); if (v.length===2) ddRef.current && ddRef.current.focus(); }}
        onFocus={onFocus} onBlur={onBlur}
        style={Object.assign({}, seg, { width: 22 })} />
      <span style={sep}>/</span>
      <input ref={ddRef} type="text" value={dd} maxLength={2} placeholder="DD" className="tb-ob"
        onChange={function(e) { var v = e.target.value.replace(/\D/g,'').slice(0,2); setDd(v); tryEmit(yyyy,mm,v); if (v.length===2) yyyyRef.current && yyyyRef.current.focus(); }}
        onKeyDown={function(e) { if (e.key==='Backspace' && dd==='') mmRef.current && mmRef.current.focus(); }}
        onFocus={onFocus} onBlur={onBlur}
        style={Object.assign({}, seg, { width: 22 })} />
      <span style={sep}>/</span>
      <input ref={yyyyRef} type="text" value={yyyy} maxLength={4} placeholder="YYYY" className="tb-ob"
        onChange={function(e) { var v = e.target.value.replace(/\D/g,'').slice(0,4); setYyyy(v); tryEmit(v,mm,dd); }}
        onKeyDown={function(e) { if (e.key==='Backspace' && yyyy==='') ddRef.current && ddRef.current.focus(); }}
        onFocus={onFocus} onBlur={onBlur}
        style={Object.assign({}, seg, { width: 36 })} />
    </div>
  );
}

// ─── Login screen ─────────────────────────────────────────────────────────────

function LoginScreen() {
  function handleGoogle() {
    supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0, userSelect: 'none' }}>
      <style>{FONTS + SPIN_KF}</style>
      <div style={{ width: BIG_R, height: BIG_R, borderRadius: 999, background: LIME, flexShrink: 0, marginBottom: 32 }} />
      <div style={{ fontFamily: GOUDY, fontStyle: 'italic', fontSize: 50, color: BLACK, marginBottom: 12, lineHeight: 1, letterSpacing: -1 }}>Timeback</div>
      <div style={{ fontFamily: WORK, fontSize: 14, color: BLACK, textAlign: 'center', lineHeight: 1.7, marginBottom: 120 }}>
        A PTO planning tool by{' '}
        <a href="https://www.billchien.net" target="_blank" rel="noopener noreferrer"
          style={{ color: BLACK, textDecoration: 'none' }}
          onMouseEnter={function(e) { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.textUnderlineOffset = '3px'; }}
          onMouseLeave={function(e) { e.currentTarget.style.textDecoration = 'none'; }}>Bill Chien</a>
        <br />
        <em style={{ fontStyle: 'italic' }}>for</em> Work &amp; Co friends
      </div>
      <button onClick={handleGoogle} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        height: 48, padding: '0 24px', borderRadius: 999,
        border: '1px solid ' + GRAY15, background: '#fff',
        fontFamily: WORK, fontSize: 12, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: BLACK,
        cursor: 'pointer', outline: 'none',
      }}>
        <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18" height="18" style={{display:'block'}}>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          <path fill="none" d="M0 0h48v48H0z"/>
        </svg>
        Continue with Google
      </button>
      <a href="/about/privacy" style={{
        position: 'fixed', bottom: 20, left: 0, right: 0,
        textAlign: 'center',
        fontFamily: WORK, fontSize: 11, fontWeight: 400, textTransform: 'uppercase', letterSpacing: 1,
        color: GRAY45, textDecoration: 'none',
      }}
        onMouseEnter={function(e) { e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.textUnderlineOffset = '3px'; }}
        onMouseLeave={function(e) { e.currentTarget.style.textDecoration = 'none'; }}
      >Privacy Policy</a>
    </div>
  );
}

// ─── Onboarding screen ────────────────────────────────────────────────────────

function OnboardingScreen({ user, onComplete }) {
  var googleName = (user && user.user_metadata && user.user_metadata.full_name)
    ? user.user_metadata.full_name.split(' ')[0]
    : '';
  var [name,      setName]      = useState(googleName);
  var [cl,        setCL]        = useState('');
  var [startStr,  setStartStr]  = useState('');
  var [mlDateStr, setMLDateStr] = useState('');
  var [bal,       setBal]       = useState('');
  var [balDate,   setBalDate]   = useState('');
  var [culBal,    setCulBal]    = useState('');
  var [focused,   setFocused]   = useState(null);
  var [errors,    setErrors]    = useState({});
  var [saving,    setSaving]    = useState(false);
  var [visible,   setVisible]   = useState(false);

  useEffect(function() {
    var raf = requestAnimationFrame(function() {
      requestAnimationFrame(function() { setVisible(true); });
    });
    return function() { cancelAnimationFrame(raf); };
  }, []);

  var isComplete = name.trim() && cl.trim() && startStr && mlDateStr && bal !== '' && balDate && culBal !== '';

  function tile(field) {
    return {
      flex: 1, background: GRAY05, borderRadius: 16, height: 76,
      padding: '0 16px', display: 'flex', flexDirection: 'column', justifyContent: 'center',
      border: errors[field] ? '1px solid ' + CORAL : (focused === field ? '0.5px solid ' + GRAY45 : '0.5px solid transparent'),
    };
  }
  var lbl = { fontFamily: WORK, fontSize: 11, color: GRAY45, marginBottom: 8 };
  var inp = { border: 'none', outline: 'none', fontFamily: WORK, fontSize: 14, fontWeight: 500, width: '100%', background: 'transparent', color: BLACK };
  var sec = { fontFamily: WORK, fontSize: 11, textTransform: 'uppercase', color: GRAY45, letterSpacing: 0.5, marginBottom: 12 };

  function clearErr(field) {
    setErrors(function(p) { var n = Object.assign({}, p); n[field] = false; return n; });
  }

  async function handleSubmit() {
    var errs = {};
    if (!name.trim())  errs.name    = true;
    if (!cl.trim())    errs.cl      = true;
    if (!startStr)     errs.start   = true;
    if (!mlDateStr)    errs.ml      = true;
    if (bal === '')    errs.bal     = true;
    if (!balDate)      errs.balDate = true;
    if (culBal === '') errs.culBal  = true;
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSaving(true);
    var data = {
      userName: name.trim(), editCL: cl.trim(), startStr: startStr, mlDateStr: mlDateStr,
      bal: parseFloat(bal) || 0, balDate: balDate, culBal: parseInt(culBal) || 0,
      weekStart: 'sunday', showHolidays: 'acn', theme: 'system',
      approvedGroups: {}, lockedDates: {},
    };
    await supabase.from('pto_settings').upsert({ user_id: user.id, data: data });
    onComplete();
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', opacity: visible ? 1 : 0, transition: 'opacity 400ms ease', userSelect: 'none' }}>
      <style>{FONTS + SPIN_KF + PH_CSS}</style>
      <div style={{ width: '100%', maxWidth: 480, padding: '0 24px' }}>

        <div style={{ fontFamily: GOUDY, fontStyle: 'italic', fontSize: 50, color: BLACK, marginBottom: 40, lineHeight: 1, letterSpacing: -1 }}>Welcome.</div>

        {/* Profile */}
        <div style={{ marginBottom: 24 }}>
          <div style={sec}>Profile</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={tile('name')}>
              <div style={lbl}>Name</div>
              <input value={name} placeholder="Firstname" className="tb-ob" onChange={function(e) { setName(e.target.value); clearErr('name'); }}
                onFocus={function() { setFocused('name'); }} onBlur={function() { setFocused(null); }} style={inp} />
            </div>
            <div style={tile('start')}>
              <div style={lbl}>Starting Date</div>
              <OBDateField value={startStr} onChange={function(v) { setStartStr(v); clearErr('start'); }} onFocus={function() { setFocused('start'); }} onBlur={function() { setFocused(null); }} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <div style={tile('cl')}>
              <div style={lbl}>Management Level</div>
              <input value={cl} placeholder="13" className="tb-ob" onChange={function(e) { setCL(e.target.value); clearErr('cl'); }}
                onFocus={function() { setFocused('cl'); }} onBlur={function() { setFocused(null); }} style={inp} />
            </div>
            <div style={tile('ml')}>
              <div style={lbl}>Level Effective Date</div>
              <OBDateField value={mlDateStr} onChange={function(v) { setMLDateStr(v); clearErr('ml'); }} onFocus={function() { setFocused('ml'); }} onBlur={function() { setFocused(null); }} />
            </div>
          </div>
        </div>

        {/* Current Balance */}
        <div style={{ marginBottom: 48 }}>
          <div style={sec}>Current Balance</div>
          <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
            <div style={tile('bal')}>
              <div style={lbl}>PTO Hours</div>
              <input type="number" value={bal} placeholder="0" className="tb-ob" onChange={function(e) { setBal(e.target.value); clearErr('bal'); }}
                onFocus={function() { setFocused('bal'); }} onBlur={function() { setFocused(null); }} style={inp} />
            </div>
            <div style={tile('balDate')}>
              <div style={lbl}>As of</div>
              <OBDateField value={balDate} onChange={function(v) { setBalDate(v); clearErr('balDate'); }} onFocus={function() { setFocused('balDate'); }} onBlur={function() { setFocused(null); }} />
            </div>
          </div>
          <div style={tile('culBal')}>
            <div style={lbl}>Cultural Days Remaining</div>
            <input type="number" value={culBal} min={0} max={2} placeholder="2" className="tb-ob" onChange={function(e) { setCulBal(e.target.value); clearErr('culBal'); }}
              onFocus={function() { setFocused('culBal'); }} onBlur={function() { setFocused(null); }} style={inp} />
          </div>
        </div>

        {/* CTA */}
        <button onClick={saving ? undefined : handleSubmit} style={{
          width: '100%', height: 48, borderRadius: 999, border: 'none',
          background: isComplete ? LIME : GRAY05,
          transition: 'background 250ms ease',
          cursor: isComplete && !saving ? 'pointer' : 'default',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: WORK, fontSize: 12, fontWeight: 600, letterSpacing: 1,
          textTransform: 'uppercase', color: BLACK,
        }}>
          {saving
            ? <div style={{ width: 18, height: 18, border: '1px solid ' + INK, borderTopColor: 'transparent', borderRadius: 999, animation: 'tbSpin 0.8s linear infinite' }} />
            : 'Start Planning'}
        </button>
      </div>
    </div>
  );
}

// ─── Transition circle ────────────────────────────────────────────────────────

function TransitionCircle({ circleSize, circleVisible, showSpinner }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <style>{FONTS + SPIN_KF}</style>
      <div style={{
        width: circleSize,
        height: circleSize,
        borderRadius: 999,
        background: LIME,
        flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: circleVisible ? 'scale(1)' : 'scale(0)',
        transition: [
          'width 700ms '    + OOO,
          'height 700ms '   + OOO,
          'transform 350ms ' + OOO,
        ].join(', '),
      }}>
        {showSpinner && (
          <div style={{ width: 16, height: 16, border: '1px solid ' + INK, borderTopColor: 'transparent', borderRadius: 999, animation: 'tbSpin 0.8s linear infinite' }} />
        )}
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

var PREVIEW_USER = {
  id: 'preview-user',
  email: 'bill@preview.local',
  user_metadata: { full_name: 'Bill Chien' },
};

export default function Router() {
  var previewScreen = new URLSearchParams(window.location.search).get('preview');
  if (previewScreen === 'login')      return <LoginScreen />;
  if (previewScreen === 'onboarding') return <><style>{FONTS + SPIN_KF + PH_CSS}</style><OnboardingScreen user={PREVIEW_USER} onComplete={function() {}} /></>;
  if (previewScreen === 'app')        return <PTOTracker user={PREVIEW_USER} />;

  var path = window.location.pathname;
  if (path === '/about' || path.startsWith('/about/')) return <About />;

  return <AuthApp />;
}

function AuthApp() {

  // 'init' | 'login' | 'transition' | 'onboarding' | 'app'
  var [phase,       setPhase]       = useState('init');
  var [session,     setSession]     = useState(null);
  var [isNewUser,   setIsNewUser]   = useState(false);
  var [circleSize,  setCircleSize]  = useState(BIG_R);
  var [circleVis,   setCircleVis]   = useState(true);
  var [showSpinner, setShowSpinner] = useState(false);
  var timers = useRef([]);
  var phaseRef = useRef('init');

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function after(ms, fn) {
    var id = setTimeout(fn, ms);
    timers.current.push(id);
  }

  function setPhaseSync(p) { phaseRef.current = p; setPhase(p); }

  function startTransition(userId) {
    clearTimers();
    setPhaseSync('transition');
    setCircleSize(BIG_R);
    setCircleVis(true);
    setShowSpinner(false);

    // Prefetch settings while animating
    var settingsCheck = supabase.from('pto_settings')
      .select('user_id').eq('user_id', userId).maybeSingle()
      .then(function(res) { return !res.data; }); // true = new user

    // Let browser paint big circle, then shrink
    after(50, function() { setCircleSize(SMALL_R); });

    // After shrink (700ms), show spinner and wait for data
    after(750, function() {
      setShowSpinner(true);
      Promise.all([
        settingsCheck,
        new Promise(function(r) { after(500, r); }),
      ]).then(function(results) {
        var newUser = results[0];
        setIsNewUser(newUser);
        setCircleVis(false);        // Scale circle to 0 (350ms)
        after(400, function() {
          setPhaseSync(newUser ? 'onboarding' : 'app');
        });
      });
    });
  }

  useEffect(function() {
    supabase.auth.getSession().then(function(res) {
      var sess = res.data.session;
      if (sess) {
        setSession(sess);
        startTransition(sess.user.id);
      } else {
        setPhaseSync('login');
      }
    });

    var sub = supabase.auth.onAuthStateChange(function(event, sess) {
      if (event === 'SIGNED_IN' && sess) {
        // Only run the transition if we're on the login screen — tab-switching
        // also fires SIGNED_IN (token refresh) and would wipe onboarding data.
        if (phaseRef.current === 'login' || phaseRef.current === 'init') {
          setSession(sess);
          startTransition(sess.user.id);
        } else {
          setSession(sess);
        }
      }
      if (event === 'SIGNED_OUT') {
        clearTimers();
        setSession(null);
        setIsNewUser(false);
        setPhaseSync('login');
      }
    });

    return function() {
      clearTimers();
      sub.data.subscription.unsubscribe();
    };
  }, []);

  if (phase === 'init' || phase === 'transition') {
    return <TransitionCircle circleSize={circleSize} circleVisible={circleVis} showSpinner={showSpinner} />;
  }
  if (phase === 'login') return <LoginScreen />;
  if (phase === 'onboarding') {
    return <OnboardingScreen user={session.user} onComplete={function() { setPhaseSync('app'); }} />;
  }
  return <PTOTracker user={session.user} />;
}
