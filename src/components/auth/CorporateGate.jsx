/**
 * CorporateGate — 2FA for cloneforge-corporation.ai
 *
 * Flow:
 *   1. Corporate token + PIN  →  POST /auth/login
 *   2. 6-digit TOTP code      →  POST /auth/totp
 *      "Trust this device"    →  saves device_token in localStorage (30 days)
 *
 * Returning visit with saved device_token → POST /auth/device-token → auto-login
 *
 * Scan QR code in Duo Mobile / Google Authenticator / Authy at first setup.
 */

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Lock, Shield, Smartphone, Eye, EyeOff, Loader2, X, Cpu } from 'lucide-react'

const BRAIN_URL        = import.meta.env.VITE_BRAIN_URL
if (!BRAIN_URL) throw new Error('VITE_BRAIN_URL is not set — check vercel.json build.env')
const DEVICE_TOKEN_KEY = 'cf_corp_device_token'
const SESSION_KEY      = 'cf_corp_session'

// ── API ───────────────────────────────────────────────────────────────────────
const brainHeaders = { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': 'true' }

// Retry with backoff — brain may be mid-redeploy (30-60s gap) on DO App Platform
async function apiPost(path, body, { maxAttempts = 4, baseDelay = 1000 } = {}) {
  let delay = baseDelay
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const r = await fetch(`${BRAIN_URL}${path}`, {
        method: 'POST',
        headers: brainHeaders,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      })
      if (r.status === 503 && attempt < maxAttempts) {
        await new Promise(res => setTimeout(res, delay))
        delay = Math.min(delay * 2, 8000)
        continue
      }
      // Handle HTML error pages from DO (non-JSON 503)
      const text = await r.text()
      let data
      try { data = JSON.parse(text) } catch { throw new Error('Brain is starting — please wait a moment and try again.') }
      if (!r.ok) throw new Error(data.detail || data.error || JSON.stringify(data))
      return data
    } catch (err) {
      lastErr = err
      // Don't retry on auth errors (4xx) — only on network/503
      if (err.message && !err.message.includes('starting') && attempt < maxAttempts) {
        const isNetworkError = err.name === 'TypeError' || err.name === 'AbortError' || err.message === 'Failed to fetch'
        if (isNetworkError) {
          await new Promise(res => setTimeout(res, delay))
          delay = Math.min(delay * 2, 8000)
          continue
        }
      }
      throw lastErr
    }
  }
  throw lastErr || new Error('Brain unavailable — please try again in a moment.')
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useCorporateAuth() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)) } catch { return null }
}

// ── Gate ──────────────────────────────────────────────────────────────────────
export default function CorporateGate({ onGrant }) {
  const [step, setStep]           = useState('loading')  // loading|credentials|totp
  const [corpToken, setCorpToken] = useState('')
  const [pin, setPin]             = useState('')
  const [totpCode, setTotpCode]   = useState('')
  const [trustDevice, setTrust]   = useState(false)
  const [showPin, setShowPin]     = useState(false)
  const [error, setError]         = useState('')
  const [busy, setBusy]           = useState(false)
  const [accountName, setName]    = useState('')
  const [shake, setShake]         = useState(false)

  const triggerError = (msg) => {
    setError(msg); setShake(true)
    setTimeout(() => setShake(false), 400)
  }

  // On mount: try device token auto-login (with retry — brain may be cold-starting)
  useEffect(() => {
    ;(async () => {
      const dt = localStorage.getItem(DEVICE_TOKEN_KEY)
      if (!dt) { setStep('credentials'); return }
      try {
        const data = await apiPost('/auth/device-token', { device_token: dt })
        grant(data, false)
      } catch (err) {
        // If it's a network error (brain starting), show credentials not an error
        localStorage.removeItem(DEVICE_TOKEN_KEY)
        setStep('credentials')
        // Only show error if it's an auth rejection, not a connection issue
        if (err.message && !err.message.includes('starting') && !err.message.includes('unavailable')) {
          setError(err.message)
        }
      }
    })()
  }, [])

  const grant = (data, saveDevice) => {
    const session = { jwt: data.session_jwt, role: data.role, name: data.name }
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    if (saveDevice && data.device_token) localStorage.setItem(DEVICE_TOKEN_KEY, data.device_token)
    onGrant(session)
  }

  const handleCredentials = async (e) => {
    e?.preventDefault()
    setError(''); setBusy(true)
    try {
      const data = await apiPost('/auth/login', { token: corpToken.trim().toUpperCase(), pin })
      setName(data.name)
      setStep('totp')
    } catch (err) { triggerError(err.message) }
    finally { setBusy(false) }
  }

  const handleTotp = async (e) => {
    e?.preventDefault()
    if (totpCode.length !== 6) { triggerError('Enter your 6-digit code'); return }
    setError(''); setBusy(true)
    try {
      const data = await apiPost('/auth/totp', {
        token: corpToken.trim().toUpperCase(), pin, code: totpCode, trust_device: trustDevice
      })
      grant(data, trustDevice)
    } catch (err) { triggerError(err.message); setTotpCode('') }
    finally { setBusy(false) }
  }

  if (step === 'loading') return (
    <div className="min-h-screen bg-[#040810] flex items-center justify-center">
      <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-[#040810] flex flex-col items-center justify-center px-4">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: 'radial-gradient(circle, #3b82f6 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: 'linear-gradient(#1e3a5f 1px,transparent 1px),linear-gradient(90deg,#1e3a5f 1px,transparent 1px)', backgroundSize: '60px 60px' }} />

      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
        className="relative z-10 flex flex-col items-center gap-6 w-full max-w-sm">

        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ boxShadow: ['0 0 30px #1e40af40','0 0 60px #1e40af60','0 0 30px #1e40af40'] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-700 to-blue-950 flex items-center justify-center">
            <Cpu size={36} className="text-blue-300" />
          </motion.div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-white tracking-tight">CloneForge Corporation</h1>
            <p className="text-xs text-blue-400/70 tracking-[0.2em] uppercase mt-1">Oriel4o — Secure Access</p>
          </div>
        </div>

        {/* Card */}
        <motion.div animate={shake ? { x: [-8,8,-6,6,-3,3,0] } : {}} transition={{ duration: 0.35 }}
          className="w-full bg-slate-900/90 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md flex flex-col gap-5">

          {/* Step indicator */}
          <div className="flex items-center gap-2">
            {[{label:'Credentials',icon:Shield},{label:'Authenticator',icon:Smartphone}].map((s,i) => {
              const active = (i === 0 && step === 'credentials') || (i === 1 && step === 'totp')
              const done   = i === 0 && step === 'totp'
              return (
                <div key={i} className="flex items-center gap-2">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    active ? 'bg-blue-600 text-white' : done ? 'bg-blue-900/60 text-blue-400' : 'bg-slate-800 text-slate-600'}`}>
                    {i+1}
                  </div>
                  <span className={`text-xs transition-colors ${active ? 'text-slate-300' : 'text-slate-600'}`}>{s.label}</span>
                  {i === 0 && <div className={`w-6 h-px mx-1 ${done ? 'bg-blue-600/40' : 'bg-slate-800'}`} />}
                </div>
              )
            })}
          </div>

          <AnimatePresence mode="wait">
            {/* ── Step 1 ── */}
            {step === 'credentials' && (
              <motion.form key="creds" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                onSubmit={handleCredentials} className="flex flex-col gap-3">
                <input autoFocus value={corpToken} onChange={e => { setCorpToken(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleCredentials()}
                  placeholder="CF-CORP-MASTER"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-mono tracking-widest text-slate-100 placeholder:text-slate-600 outline-none focus:border-blue-500 uppercase transition-colors" />
                <div className="relative">
                  <input type={showPin ? 'text' : 'password'} value={pin}
                    onChange={e => { setPin(e.target.value.slice(0,6)); setError('') }}
                    onKeyDown={e => e.key === 'Enter' && handleCredentials()}
                    placeholder="PIN" maxLength={6}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-center text-xl tracking-[0.4em] text-slate-100 placeholder:text-slate-600 outline-none focus:border-blue-500 transition-colors" />
                  <button type="button" onClick={() => setShowPin(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                    {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                <button type="submit" disabled={busy || !corpToken || !pin}
                  className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                  {busy ? 'Verifying…' : 'Continue'}
                </button>
              </motion.form>
            )}

            {/* ── Step 2 ── */}
            {step === 'totp' && (
              <motion.form key="totp" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                onSubmit={handleTotp} className="flex flex-col gap-4">
                <p className="text-xs text-blue-400/80 -mb-1">
                  Welcome, <span className="text-blue-300 font-medium">{accountName}</span>. Open Duo or your authenticator app and enter the 6-digit code for CloneForge Corporation.
                </p>
                <input value={totpCode} onChange={e => { setTotpCode(e.target.value.replace(/\D/g,'').slice(0,6)); setError('') }}
                  placeholder="000000" inputMode="numeric" autoComplete="one-time-code" autoFocus
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-center text-3xl font-mono tracking-[0.6em] text-slate-100 placeholder:text-slate-700 outline-none focus:border-blue-500 transition-colors" />

                {/* Trust device toggle */}
                <label className="flex items-center gap-3 cursor-pointer">
                  <button type="button" onClick={() => setTrust(p => !p)}
                    className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 relative ${trustDevice ? 'bg-blue-600' : 'bg-slate-700'}`}>
                    <div className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-all ${trustDevice ? 'left-6' : 'left-1'}`} />
                  </button>
                  <div>
                    <p className="text-xs text-slate-300 font-medium">Trust this device for 30 days</p>
                    <p className="text-[10px] text-slate-600">Saves a token — skip 2FA on future visits</p>
                  </div>
                </label>

                <div className="flex gap-2">
                  <button type="button" onClick={() => { setStep('credentials'); setError(''); setTotpCode('') }}
                    className="px-4 py-3 rounded-xl border border-slate-700 text-slate-400 text-sm hover:border-slate-500 transition-colors">
                    Back
                  </button>
                  <button type="submit" disabled={busy || totpCode.length !== 6}
                    className="flex-1 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-sm font-medium flex items-center justify-center gap-2 transition-colors">
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                    {busy ? 'Verifying…' : 'Access Brain'}
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>

          {error && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-1.5 text-xs text-red-400 -mt-2">
              <X size={11} /> {error}
            </motion.p>
          )}
        </motion.div>

        <p className="text-xs text-slate-700 text-center">
          CloneForge Corporation · TOTP 2FA · Session: 8 hours · Device token: 30 days
          {' · '}
          <button
            onClick={() => { localStorage.clear(); sessionStorage.clear(); location.reload() }}
            className="underline hover:text-slate-500 transition-colors"
          >
            Clear session
          </button>
        </p>
      </motion.div>
    </div>
  )
}
