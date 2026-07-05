import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Mail, Lock, User, Shield, ArrowRight, MapPin, Plane, ShieldCheck, Database } from 'lucide-react'

/* ── Looping typewriter hook ── */
const PAIRS = [
  { l1: 'Smart Dispatch.', l2: 'Smarter Decisions.' },
  { l1: 'Precision Operations.', l2: 'Every Flight Counts.' },
  { l1: 'Intelligent OFP.', l2: 'Powered by Data.' },
  { l1: 'RTOW · WAT · Fuel.', l2: 'All in One Platform.' },
]

function useLoopTypewriter() {
  const [pairIdx, setPairIdx] = useState(0)
  const [l1, setL1] = useState('')
  const [l2, setL2] = useState('')
  const [phase, setPhase] = useState<'type1' | 'type2' | 'wait' | 'del2' | 'del1'>('type1')
  const [ci, setCi] = useState(0)

  useEffect(() => {
    const pair = PAIRS[pairIdx]
    let t: ReturnType<typeof setTimeout>
    if (phase === 'type1') {
      if (ci < pair.l1.length) {
        t = setTimeout(() => { setL1(pair.l1.slice(0, ci + 1)); setCi(c => c + 1) }, 65)
      } else { t = setTimeout(() => { setPhase('type2'); setCi(0) }, 280) }
    } else if (phase === 'type2') {
      if (ci < pair.l2.length) {
        t = setTimeout(() => { setL2(pair.l2.slice(0, ci + 1)); setCi(c => c + 1) }, 65)
      } else { t = setTimeout(() => setPhase('wait'), 2400) }
    } else if (phase === 'wait') {
      t = setTimeout(() => { setPhase('del2'); setCi(PAIRS[pairIdx].l2.length) }, 0)
    } else if (phase === 'del2') {
      if (ci > 0) {
        t = setTimeout(() => { setL2(pair.l2.slice(0, ci - 1)); setCi(c => c - 1) }, 30)
      } else { t = setTimeout(() => { setPhase('del1'); setCi(pair.l1.length) }, 80) }
    } else if (phase === 'del1') {
      if (ci > 0) {
        t = setTimeout(() => { setL1(pair.l1.slice(0, ci - 1)); setCi(c => c - 1) }, 30)
      } else {
        t = setTimeout(() => { setPairIdx(i => (i + 1) % PAIRS.length); setPhase('type1'); setCi(0) }, 300)
      }
    }
    return () => clearTimeout(t)
  }, [phase, ci, pairIdx])

  return { l1, l2, cur1: phase === 'type1' || phase === 'del1', cur2: phase === 'type2' || phase === 'del2' || phase === 'wait' }
}

/* ── Radar SVG ── */
function Radar() {
  return (
    <div style={{ filter: 'drop-shadow(0 0 12px rgba(99,190,255,0.50))' }}>
      <svg viewBox="0 0 160 160" width="140" height="140">
        <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(125,180,255,0.20)" strokeWidth="1"/>
        <circle cx="80" cy="80" r="52" fill="none" stroke="rgba(125,180,255,0.18)" strokeWidth="1"/>
        <circle cx="80" cy="80" r="32" fill="none" stroke="rgba(125,180,255,0.22)" strokeWidth="1"/>
        <circle cx="80" cy="80" r="14" fill="none" stroke="rgba(125,180,255,0.28)" strokeWidth="1"/>
        <line x1="80" y1="8" x2="80" y2="152" stroke="rgba(125,180,255,0.12)" strokeWidth="0.8"/>
        <line x1="8" y1="80" x2="152" y2="80" stroke="rgba(125,180,255,0.12)" strokeWidth="0.8"/>
        <line x1="30" y1="30" x2="130" y2="130" stroke="rgba(125,180,255,0.08)" strokeWidth="0.8"/>
        <line x1="130" y1="30" x2="30" y2="130" stroke="rgba(125,180,255,0.08)" strokeWidth="0.8"/>
        <defs>
          <radialGradient id="sg3" cx="0" cy="0.5" r="1">
            <stop offset="0%" stopColor="rgba(99,190,255,0)"/>
            <stop offset="100%" stopColor="rgba(99,190,255,0.55)"/>
          </radialGradient>
        </defs>
        <g style={{ transformOrigin: '80px 80px', animation: 'rdrSp 3s linear infinite' }}>
          <path d="M80,80 L80,8 A72,72 0 0,1 138,116 Z" fill="url(#sg3)"/>
        </g>
        <circle cx="108" cy="48" r="2.5" fill="#7DB4FF" style={{ animation: 'blpA 3s 0s ease-in-out infinite' }}/>
        <circle cx="55" cy="106" r="2" fill="#7DB4FF" style={{ animation: 'blpA 3s 1.2s ease-in-out infinite' }}/>
        <circle cx="98" cy="92" r="1.8" fill="#7DB4FF" style={{ animation: 'blpA 3s 2.4s ease-in-out infinite' }}/>
        <circle cx="80" cy="80" r="3.5" fill="#7ECFFF"/>
        <circle cx="80" cy="80" r="6" fill="none" stroke="#7ECFFF" strokeWidth="0.8" opacity="0.6"/>
      </svg>
    </div>
  )
}

/* ── Animated background flight routes ── */
function BgRoutes() {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', overflow: 'hidden' }}
      viewBox="0 0 500 700" preserveAspectRatio="xMidYMid slice">
      <path d="M 20 80 Q 180 200 460 520" fill="none" stroke="rgba(125,207,255,0.22)" strokeWidth="1.2" strokeDasharray="7 11"/>
      <g><animateMotion dur="14s" repeatCount="indefinite" path="M 20 80 Q 180 200 460 520"/>
        <path d="M-5,0 L2,-3.5 L2,3.5Z" fill="rgba(125,207,255,0.72)" transform="rotate(45)"/></g>

      <path d="M 30 650 Q 220 400 490 120" fill="none" stroke="rgba(125,207,255,0.16)" strokeWidth="1" strokeDasharray="7 11"/>
      <g><animateMotion dur="18s" repeatCount="indefinite" begin="-6s" path="M 30 650 Q 220 400 490 120"/>
        <path d="M-4.5,0 L2,-3 L2,3Z" fill="rgba(125,207,255,0.62)" transform="rotate(-50)"/></g>

      <path d="M 0 350 Q 200 280 500 380" fill="none" stroke="rgba(125,207,255,0.13)" strokeWidth="1" strokeDasharray="7 11"/>
      <g><animateMotion dur="20s" repeatCount="indefinite" begin="-10s" path="M 0 350 Q 200 280 500 380"/>
        <path d="M-4,0 L1.5,-2.5 L1.5,2.5Z" fill="rgba(125,207,255,0.55)" transform="rotate(10)"/></g>

      <path d="M 380 0 Q 300 250 200 700" fill="none" stroke="rgba(125,207,255,0.11)" strokeWidth="1" strokeDasharray="7 11"/>
      <g><animateMotion dur="22s" repeatCount="indefinite" begin="-3s" path="M 380 0 Q 300 250 200 700"/>
        <path d="M-3.5,0 L1.5,-2 L1.5,2Z" fill="rgba(125,207,255,0.50)" transform="rotate(20)"/></g>
    </svg>
  )
}

/* ════ Main Login Component ════ */
export default function Login() {
  const navigate = useNavigate()
  const [showPw, setShowPw] = useState(false)
  const [role, setRole] = useState<'dispatcher' | 'administrator'>('dispatcher')
  const [remember, setRemember] = useState(false)
  const [time, setTime] = useState(new Date())
  const { l1, l2, cur1, cur2 } = useLoopTypewriter()

  const [isSignUp, setIsSignUp] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setFieldErrors({})
    setIsLoading(true)

    const endpoint = isSignUp ? 'http://localhost:4000/api/auth/register' : 'http://localhost:4000/api/auth/login'
    const backendRole = role === 'administrator' ? 'admin' : 'dispatcher'
    const payload = isSignUp ? { username, password, role: backendRole } : { username, password }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()

      if (!res.ok) {
        // Parse Zod field-level errors if present
        if (data.errors && Array.isArray(data.errors)) {
          const fe: Record<string, string> = {}
          data.errors.forEach((err: any) => {
            if (err.path && err.path[0]) fe[err.path[0]] = err.message
          })
          setFieldErrors(fe)
          setError('Please fix the errors below and try again.')
        } else {
          // Map common status codes to friendly messages
          const msg = data.message || data.error || 'Something went wrong'
          if (res.status === 401) setError('Incorrect username or password. Please try again.')
          else if (res.status === 403) setError('Your account is deactivated. Contact an administrator.')
          else if (res.status === 409) setError('That username is already taken. Please choose another.')
          else setError(msg)
        }
        return
      }

      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      navigate('/dashboard')
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setError('Cannot reach the server. Make sure the backend is running on port 4000.')
      } else {
        setError(err.message || 'An unexpected error occurred.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const p2 = (n: number) => String(n).padStart(2, '0')
  const utcStr = `${p2(time.getUTCHours())}:${p2(time.getUTCMinutes())}:${p2(time.getUTCSeconds())} UTC`
  const dateStr = time.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600&display=swap');
        @keyframes rdrSp   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes blpA    { 0%,100%{opacity:0} 40%{opacity:1} 70%{opacity:0.5} }
        @keyframes livDot  { 0%,100%{box-shadow:0 0 0 0 rgba(52,211,153,0.5)} 50%{box-shadow:0 0 0 6px rgba(52,211,153,0)} }
        @keyframes bgKn    { from{transform:scale(1.04) translateY(0)} to{transform:scale(1.10) translateY(-14px)} }
        @keyframes fdD     { from{opacity:0;transform:translateY(-14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fdU     { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes fdL     { from{opacity:0;transform:translateX(-16px)} to{opacity:1;transform:translateX(0)} }
        @keyframes rnRot   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes onD     { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.5)} 50%{box-shadow:0 0 0 5px rgba(16,185,129,0)} }
        @keyframes curBl   { 50%{opacity:0} }

        .lg-root { min-height:100vh; width:100%; display:flex; font-family:'Inter',system-ui,sans-serif; overflow:hidden; }

        /* ── LEFT ── */
        .lp  { position:relative; width:50%; min-height:100vh; overflow:hidden; color:white; flex-shrink:0; }
        .lbg { position:absolute; inset:0; background-image:url('/assets/aircraft-hero.jpg'); background-size:cover; background-position:center 35%; animation:bgKn 18s ease-in-out infinite alternate; }
        /* LIGHTER overlay so aircraft image shows through */
        .lov { position:absolute; inset:0; background:linear-gradient(160deg,rgba(4,20,64,0.62) 0%,rgba(6,30,85,0.55) 30%,rgba(10,48,115,0.45) 62%,rgba(5,24,72,0.65) 100%); }
        .lcon { position:relative; z-index:10; display:flex; flex-direction:column; min-height:100vh; padding:2.8rem 3rem; }

        /* Brand */
        .brand { display:flex; align-items:center; gap:1rem; animation:fdD 0.7s ease both; margin-bottom:0.4rem; }
        .brand-icon { width:44px; height:44px; background:linear-gradient(135deg,#7ECFFF,#3B7EFF); border-radius:11px; display:flex; align-items:center; justify-content:center; box-shadow:0 0 22px rgba(99,190,255,0.55); flex-shrink:0; }
        .brand-name { font-size:2.7rem; font-weight:900; letter-spacing:0.03em; line-height:1; color:#fff; margin:0; text-shadow:0 2px 24px rgba(0,0,0,0.25); }
        .brand-sub  { font-size:0.70rem; font-weight:600; letter-spacing:0.30em; color:rgba(220,235,255,0.82); margin:0; }
        .brand-rule { width:3.2rem; height:2px; background:linear-gradient(90deg,#7ECFFF,transparent); border-radius:2px; margin-top:1.2rem; margin-bottom:1.8rem; animation:fdD 0.7s 0.3s ease both; }

        /* Taglines */
        .tg-h2 { font-size:2.1rem; font-weight:800; line-height:1.22; margin:0 0 0.9rem; min-height:2.8em; }
        .tg-l1 { display:block; color:#fff; text-shadow:0 1px 12px rgba(0,0,0,0.20); }
        .tg-l2 { display:block; color:#7ECFFF; }
        .tc { display:inline-block; width:2.5px; height:0.9em; background:#7ECFFF; margin-left:2px; vertical-align:middle; animation:curBl 0.85s step-start infinite; }
        .tg-p { font-size:0.87rem; line-height:1.76; color:rgba(220,235,255,0.90); max-width:24rem; margin:0 0 1.7rem; }

        /* Features */
        .fl { display:flex; flex-direction:column; gap:0.6rem; margin-bottom:1.6rem; }
        .fi { display:flex; align-items:center; gap:0.65rem; font-size:0.82rem; color:rgba(220,235,255,0.92); opacity:0; animation:fdL 0.5s ease both; }
        .fi:nth-child(1){animation-delay:.6s} .fi:nth-child(2){animation-delay:.9s}
        .fi:nth-child(3){animation-delay:1.2s} .fi:nth-child(4){animation-delay:1.5s}
        .fd2 { width:6px; height:6px; border-radius:50%; background:#7ECFFF; box-shadow:0 0 7px #7ECFFF; flex-shrink:0; }

        /* Route strip */
        .rs { display:flex; align-items:center; gap:0.5rem; font-size:0.75rem; color:rgba(220,235,255,0.82); margin-bottom:1.4rem; opacity:0; animation:fdL 0.6s 1.8s ease both; }
        .rd { flex:1; border-top:1px dashed rgba(200,220,255,0.35); }

        /* Stats bar — proper glassmorphism */
        .sb {
          display:flex; align-items:center; justify-content:space-between;
          background:rgba(255,255,255,0.10);
          backdrop-filter:blur(18px);
          -webkit-backdrop-filter:blur(18px);
          border:1px solid rgba(255,255,255,0.22);
          border-radius:14px;
          padding:.9rem 1.3rem;
          opacity:0;
          animation:fdU 0.6s 2.1s ease both;
          box-shadow:0 4px 24px rgba(0,0,0,0.12);
        }
        .sv { font-size:.87rem; font-weight:700; color:#fff; font-family:'JetBrains Mono',monospace; text-shadow:0 1px 4px rgba(0,0,0,0.20); }
        .sl { font-size:.57rem; color:rgba(220,235,255,0.72); letter-spacing:.07em; text-transform:uppercase; margin-top:1px; }
        .ss { width:1px; height:2rem; background:rgba(255,255,255,0.20); }

        /* Radar */
        .rdc { position:absolute; top:2.6rem; right:2.6rem; z-index:20; display:flex; flex-direction:column; align-items:center; gap:.4rem; }
        .ld  { width:6px; height:6px; border-radius:50%; background:#34D399; animation:livDot 1.4s ease-in-out infinite; }
        .cs  { font-size:.98rem; font-weight:700; color:#fff; letter-spacing:.06em; font-family:'JetBrains Mono',monospace; text-shadow:0 1px 6px rgba(0,0,0,0.25); }
        .fi2 { font-size:.68rem; color:rgba(220,235,255,0.85); font-family:'JetBrains Mono',monospace; }
        /* small "5Y-DWN" live pill — no "Live Tracking" text */
        .live-pill { display:flex; align-items:center; gap:.35rem; background:rgba(255,255,255,0.12); backdrop-filter:blur(10px); border:1px solid rgba(255,255,255,0.25); border-radius:20px; padding:.22rem .65rem; font-size:.58rem; font-weight:700; letter-spacing:.12em; color:rgba(220,235,255,0.95); text-transform:uppercase; }

        /* ── RIGHT ── */
        .rp { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding:2rem 2.5rem; background:#EEF2FF; position:relative; overflow:hidden; height:100vh; }
        .rp::before { content:''; position:absolute; width:500px; height:500px; background:radial-gradient(circle,rgba(30,94,255,.07) 0%,transparent 70%); top:-120px; right:-120px; border-radius:50%; pointer-events:none; }
        .rp::after  { content:''; position:absolute; width:380px; height:380px; background:radial-gradient(circle,rgba(126,207,255,.08) 0%,transparent 70%); bottom:-80px; left:-80px; border-radius:50%; pointer-events:none; }

        /* System online badge */
        .ob { position:absolute; top:1.2rem; right:1.5rem; display:flex; align-items:center; gap:.4rem; background:white; border:1px solid rgba(30,94,255,.12); border-radius:20px; padding:.3rem .85rem; font-size:.70rem; font-weight:600; color:#14213D; box-shadow:0 2px 8px rgba(0,0,0,.06); z-index:20; }
        .od { width:7px; height:7px; border-radius:50%; background:#10B981; animation:onD 1.4s ease-in-out infinite; }

        /* Card wrapper */
        .rw  { position:relative; display:flex; align-items:center; justify-content:center; z-index:10; width:100%; }

        /* Card — wide and short */
        .card { position:relative; z-index:10; width:100%; max-width:560px; background:rgba(255,255,255,.97); backdrop-filter:blur(24px); border-radius:22px; border:1px solid rgba(30,94,255,.09); box-shadow:0 4px 6px rgba(0,0,0,.04),0 18px 50px rgba(30,94,255,.11),0 0 0 1px rgba(255,255,255,.8) inset; padding:2rem 2.4rem; }

        /* Card header */
        .cli  { display:flex; align-items:center; gap:.7rem; margin-bottom:1rem; }
        .cii  { width:40px; height:40px; background:linear-gradient(135deg,#1E5EFF,#3B8FFF); border-radius:10px; display:flex; align-items:center; justify-content:center; box-shadow:0 4px 12px rgba(30,94,255,.28); flex-shrink:0; }
        .cin  { font-size:.80rem; font-weight:800; letter-spacing:.12em; color:#14213D; margin:0; }
        .cis  { font-size:.58rem; font-weight:500; color:#64748B; letter-spacing:.18em; margin:0; }
        .ct   { font-size:1.5rem; font-weight:800; color:#0F172A; margin:0 0 .15rem; }
        .cs2  { font-size:.80rem; color:#64748B; margin:0 0 1.2rem; }

        /* Two-col form layout */
        .fg2  { display:grid; grid-template-columns:1fr 1fr; gap:0 1rem; }
        .fg2 .iw { margin-bottom:.75rem; }

        /* Form fields */
        .fl2  { display:block; font-size:.74rem; font-weight:600; color:#334155; margin-bottom:.3rem; }
        .iw   { position:relative; margin-bottom:.75rem; }
        .iic  { position:absolute; left:.75rem; top:50%; transform:translateY(-50%); color:#94A3B8; pointer-events:none; }
        .fi3  { width:100%; padding:.6rem .78rem .6rem 2.35rem; border-radius:9px; border:1.5px solid #E2E8F0; background:white; font-size:.83rem; color:#0F172A; font-family:'Inter',sans-serif; outline:none; transition:border-color .2s,box-shadow .2s; box-sizing:border-box; }
        .fi3:focus { border-color:#1E5EFF; box-shadow:0 0 0 3px rgba(30,94,255,.12); }
        .pt   { position:absolute; right:.75rem; top:50%; transform:translateY(-50%); background:none; border:none; cursor:pointer; color:#94A3B8; padding:0; line-height:0; transition:color .15s; }
        .pt:hover { color:#475569; }

        /* Forgot + remember in one row */
        .pw-row { display:flex; align-items:center; justify-content:space-between; margin-top:-.2rem; margin-bottom:.75rem; }
        .rem  { display:flex; align-items:center; gap:.4rem; font-size:.76rem; color:#475569; cursor:pointer; user-select:none; }
        .rem input { accent-color:#1E5EFF; cursor:pointer; }
        .fra  { font-size:.76rem; font-weight:600; color:#1E5EFF; text-decoration:none; }
        .fra:hover { text-decoration:underline; }

        /* Role + submit in same row on wide card */
        .bot-row { display:grid; grid-template-columns:1fr auto; gap:0 1rem; align-items:end; margin-bottom:.7rem; }
        .rg   { display:grid; grid-template-columns:1fr 1fr; gap:.5rem; }
        .rb   { display:flex; align-items:center; justify-content:center; gap:.4rem; padding:.58rem .5rem; border-radius:9px; border:1.5px solid #E2E8F0; background:white; font-size:.80rem; font-weight:600; color:#475569; cursor:pointer; transition:all .2s; font-family:'Inter',sans-serif; }
        .rb:hover { border-color:#1E5EFF; color:#1E5EFF; }
        .rb.ac { background:linear-gradient(135deg,#1E5EFF,#3B8FFF); border-color:transparent; color:white; box-shadow:0 4px 12px rgba(30,94,255,.28); }

        /* Sign in */
        .sb2  { width:100%; display:flex; align-items:center; justify-content:center; gap:.5rem; padding:.76rem 1.4rem; border-radius:11px; border:none; background:linear-gradient(135deg,#1E5EFF 0%,#3B8FFF 100%); color:white; font-size:.88rem; font-weight:700; font-family:'Inter',sans-serif; cursor:pointer; box-shadow:0 6px 18px rgba(30,94,255,.34); transition:all .2s; white-space:nowrap; }
        .sb2:hover { transform:translateY(-1px); box-shadow:0 10px 24px rgba(30,94,255,.42); }

        /* SSO */
        .dr   { display:flex; align-items:center; gap:.7rem; margin:.65rem 0; }
        .db   { flex:1; height:1px; background:#E2E8F0; }
        .dt   { font-size:.68rem; color:#94A3B8; white-space:nowrap; }
        .bot2row { display:grid; grid-template-columns:1fr 1fr; gap:.75rem; align-items:center; }
        .ss3  { width:100%; display:flex; align-items:center; justify-content:center; gap:.5rem; padding:.62rem 1rem; border-radius:11px; border:1.5px solid #E2E8F0; background:white; color:#334155; font-size:.82rem; font-weight:600; font-family:'Inter',sans-serif; cursor:pointer; transition:all .2s; }
        .ss3:hover { border-color:#1E5EFF; color:#1E5EFF; background:#F8FAFF; }
        .sur  { text-align:center; font-size:.76rem; color:#64748B; }
        .sua  { color:#1E5EFF; font-weight:700; text-decoration:none; }
        .sua:hover { text-decoration:underline; }

        @media(max-width:900px) {
          .lg-root { flex-direction:column; overflow:auto; }
          .lp  { width:100%; min-height:420px; }
          .rp  { height:auto; padding:2rem 1rem 3rem; }
          .card{ max-width:95%; }
          .fg2 { grid-template-columns:1fr; }
          .bot-row { grid-template-columns:1fr; }
          .sb2 { width:100%; }
          .bot2row { grid-template-columns:1fr; }
        }
      `}</style>

      <div className="lg-root">

        {/* ════ LEFT PANEL ════ */}
        <div className="lp">
          <div className="lbg"/>
          <div className="lov"/>
          <BgRoutes/>

          {/* Radar — top right, no "Live Tracking" text */}
          <div className="rdc">
            <div className="live-pill"><span className="ld"/>5Y-DWN</div>
            <Radar/>
            <p className="cs">FL350 &nbsp;290KT</p>
          </div>

          <div className="lcon">
            {/* Brand */}
            <div className="brand">
              <div className="brand-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                  <path d="M12 0 L14 9 L23 9 L15.5 14.5 L18 23 L12 17.5 L6 23 L8.5 14.5 L1 9 L10 9 Z"/>
                </svg>
              </div>
              <div>
                <p className="brand-name">ORCA AVIATION</p>
                <p className="brand-sub">EFB PLATFORM</p>
              </div>
            </div>
            <div className="brand-rule"/>

            {/* Looping typewriter */}
            <h2 className="tg-h2">
              <span className="tg-l1">{l1}{cur1 && <span className="tc"/>}</span>
              <span className="tg-l2">{l2}{cur2 && <span className="tc"/>}</span>
            </h2>
            <p className="tg-p">Intelligent performance data extraction from the Dash 8 Flight Manual.</p>

            {/* Feature bullets */}
            <div className="fl">
              {['RTOW & Performance Calculations','WAT Analysis & Weight Intelligence','OFP Generation & Nav-logs','Live METAR · TAF · Weather Intelligence'].map(f => (
                <div className="fi" key={f}><span className="fd2"/>{f}</div>
              ))}
            </div>

            {/* Route strip */}
            <div className="rs">
              <MapPin size={13} style={{ color: '#7ECFFF' }}/><span>EGPD</span>
              <span className="rd"/>
              <Plane size={12} style={{ color: '#7ECFFF' }}/>
              <span className="rd"/>
              <MapPin size={13} style={{ color: '#7ECFFF' }}/><span>FTTC</span>
            </div>

            {/* Glassmorphism stats bar */}
            <div className="sb">
              <div><div className="sv">{utcStr}</div><div className="sl">{dateStr}</div></div>
              <div className="ss"/>
              <div><div className="sv">24/7</div><div className="sl">Monitoring</div></div>
              <div className="ss"/>
              <div><div className="sv">99.8%</div><div className="sl">Accuracy</div></div>
              <div className="ss"/>
              <div><div className="sv">Secure</div><div className="sl">Enterprise</div></div>
            </div>
          </div>
        </div>

        {/* ════ RIGHT PANEL ════ */}
        <div className="rp">
          <div className="ob"><span className="od"/>System Online</div>

          <div className="rw">
            <div className="card">
              {/* Card logo + header in one row */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'1rem' }}>
                <div className="cli" style={{ marginBottom:0 }}>
                  <div className="cii">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                      <path d="M12 0 L14 9 L23 9 L15.5 14.5 L18 23 L12 17.5 L6 23 L8.5 14.5 L1 9 L10 9 Z"/>
                    </svg>
                  </div>
                  <div><p className="cin">ORCA AVIATION</p><p className="cis">EFB PLATFORM</p></div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <p className="ct" style={{ marginBottom:0, marginTop:0, fontSize:'1.3rem' }}>
                    {isSignUp ? 'Create Account' : 'Welcome Back'}
                  </p>
                  <p className="cs2" style={{ marginBottom:0 }}>
                    {isSignUp ? 'Sign up for a new account' : 'Sign in to your account to continue'}
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit}>
                {/* Global error banner */}
                {error && (
                  <div style={{ display:'flex', alignItems:'flex-start', gap:'0.5rem', backgroundColor: '#FEF2F2', color: '#B91C1C', padding: '0.7rem 0.9rem', borderRadius: '9px', marginBottom: '1rem', fontSize: '0.78rem', fontWeight: 600, border: '1px solid #FECACA', lineHeight: 1.5 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink:0, marginTop:'1px' }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {error}
                  </div>
                )}

                {/* Username + Password in two columns */}
                <div className="fg2">
                  <div>
                    <label className="fl2">Username or Email</label>
                    <div className="iw">
                      <span className="iic"><User size={15}/></span>
                      <input
                        type="text"
                        className="fi3"
                        placeholder="john_doe or john@example.com"
                        value={username}
                        onChange={e => { setUsername(e.target.value); setFieldErrors(fe => ({ ...fe, username: '' })) }}
                        style={fieldErrors.username ? { borderColor: '#EF4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.12)' } : {}}
                        required
                        autoComplete="username"
                      />
                    </div>
                    {fieldErrors.username
                      ? <p style={{ margin:'0.2rem 0 0', fontSize:'0.71rem', color:'#DC2626', fontWeight:600 }}>{fieldErrors.username}</p>
                      : isSignUp && <p style={{ margin:'0.2rem 0 0', fontSize:'0.71rem', color:'#64748B' }}>Use a short handle (e.g. john_doe) or your email address.</p>
                    }
                  </div>
                  <div>
                    <label className="fl2">Password</label>
                    <div className="iw">
                      <span className="iic"><Lock size={15}/></span>
                      <input
                        type={showPw ? 'text' : 'password'}
                        className="fi3"
                        style={{ paddingRight: '2.3rem', ...(fieldErrors.password ? { borderColor: '#EF4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.12)' } : {}) }}
                        placeholder={isSignUp ? 'min. 6 characters' : 'your password'}
                        value={password}
                        onChange={e => { setPassword(e.target.value); setFieldErrors(fe => ({ ...fe, password: '' })) }}
                        required
                        autoComplete={isSignUp ? 'new-password' : 'current-password'}
                      />
                      <button type="button" className="pt" onClick={() => setShowPw(!showPw)}>
                        {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                      </button>
                    </div>
                    {fieldErrors.password && <p style={{ margin:'0.2rem 0 0', fontSize:'0.71rem', color:'#DC2626', fontWeight:600 }}>{fieldErrors.password}</p>}
                  </div>
                </div>

                {!isSignUp && (
                  <div className="pw-row">
                    <label className="rem">
                      <input type="checkbox" checked={remember} onChange={() => setRemember(!remember)}/>
                      Remember me
                    </label>
                    <a href="#" className="fra">Forgot password?</a>
                  </div>
                )}

                {/* Role selector + Sign In button in same row */}
                <div className="bot-row" style={{ marginTop: isSignUp ? '0.5rem' : undefined }}>
                  {isSignUp ? (
                    <div>
                      <label className="fl2">Account Role</label>
                      <div className="rg">
                        <button type="button" className={`rb${role === 'dispatcher' ? ' ac' : ''}`} onClick={() => setRole('dispatcher')}><User size={14}/>Dispatcher</button>
                        <button type="button" className={`rb${role === 'administrator' ? ' ac' : ''}`} onClick={() => setRole('administrator')}><Shield size={14}/>Admin</button>
                      </div>
                    </div>
                  ) : (
                    <div />
                  )}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="sb2"
                    style={{ marginBottom:0, height:'fit-content', alignSelf:'flex-end', opacity: isLoading ? 0.75 : 1, cursor: isLoading ? 'not-allowed' : 'pointer' }}
                  >
                    {isLoading
                      ? <><span style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,255,255,0.4)', borderTopColor:'white', borderRadius:'50%', animation:'rnRot 0.7s linear infinite' }}/> Processing…</>
                      : <>{isSignUp ? 'Create Account' : 'Sign In'} <ArrowRight size={16}/></>
                    }
                  </button>
                </div>

                <div className="dr"><div className="db"/><span className="dt">or continue with</span><div className="db"/></div>
                <div className="bot2row">
                  <button type="button" className="ss3"><ShieldCheck size={15}/>SSO Login</button>
                  <p className="sur" style={{ margin:0 }}>
                    {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
                    <a href="#" className="sua" onClick={(e) => { e.preventDefault(); setIsSignUp(!isSignUp); setError(null); setFieldErrors({}); }}>
                      {isSignUp ? 'Sign in' : 'Sign up'}
                    </a>
                  </p>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
