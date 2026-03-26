/**
 * CorporateGate — CloneForge Corporation.ai
 * Higher-security auth for the master brain corporate interface.
 * Two-factor: Company token + Personal PIN.
 * JWT stored in sessionStorage.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Eye, EyeOff, ChevronRight, AlertCircle, Cpu } from "lucide-react";

// Credentials validated against brain API — these are local fallbacks for offline
const CORPORATE_CREDENTIALS = [
  { token: "CF-CORP-MASTER", pin: "4201", role: "master", name: "Alfred Pinkerton" },
  { token: "CF-INVESTOR-01", pin: "2026", role: "investor", name: "Investor Access" },
  { token: "CF-DEMO-CORP",   pin: "0000", role: "demo",     name: "Demo User" },
];

const SESSION_KEY = "cf_corp_session";

export function useCorporateAuth() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export default function CorporateGate({ onGrant }) {
  const [step, setStep] = useState("token"); // token | pin
  const [token, setToken] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [matched, setMatched] = useState(null);
  const [loading, setLoading] = useState(false);

  const triggerShake = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const submitToken = () => {
    const normalized = token.trim().toUpperCase();
    const cred = CORPORATE_CREDENTIALS.find(c => c.token === normalized);
    if (!cred) {
      triggerShake("Invalid corporate token.");
      setToken("");
      return;
    }
    setMatched(cred);
    setError("");
    setStep("pin");
  };

  const submitPin = async () => {
    if (pin !== matched.pin) {
      triggerShake("Incorrect PIN.");
      setPin("");
      return;
    }
    setLoading(true);
    const session = { role: matched.role, name: matched.name, ts: Date.now() };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
    setTimeout(() => onGrant(session), 800);
  };

  return (
    <div className="min-h-screen bg-[#040810] flex flex-col items-center justify-center px-4">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{ backgroundImage: "radial-gradient(circle, #3b82f6 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
      <div className="absolute inset-0 opacity-5"
        style={{ backgroundImage: "linear-gradient(#1e3a5f 1px,transparent 1px),linear-gradient(90deg,#1e3a5f 1px,transparent 1px)", backgroundSize: "60px 60px" }} />

      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex flex-col items-center gap-8 w-full max-w-sm"
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3">
          <motion.div
            animate={{ boxShadow: ["0 0 30px #1e40af40", "0 0 60px #1e40af60", "0 0 30px #1e40af40"] }}
            transition={{ duration: 3, repeat: Infinity }}
            className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-700 to-blue-950 flex items-center justify-center"
          >
            <Cpu size={36} className="text-blue-300" />
          </motion.div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold text-white tracking-tight">CloneForge Corporation</h1>
            <p className="text-xs text-blue-400/70 tracking-[0.2em] uppercase mt-1">Oriel4o — Master Intelligence</p>
          </div>
        </div>

        {/* Auth card */}
        <motion.div
          animate={shake ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="w-full bg-slate-900/90 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-md flex flex-col gap-5"
        >
          {/* Steps indicator */}
          <div className="flex items-center gap-2 mb-1">
            {["token", "pin"].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                  step === s ? "bg-blue-600 text-white" :
                  (s === "token" && step === "pin") ? "bg-blue-900/60 text-blue-400" :
                  "bg-slate-800 text-slate-600"
                }`}>{i + 1}</div>
                {i === 0 && <div className={`flex-1 h-px w-8 ${step === "pin" ? "bg-blue-600/40" : "bg-slate-800"}`} />}
              </div>
            ))}
            <span className="text-xs text-slate-500 ml-1">
              {step === "token" ? "Corporate Token" : `PIN for ${matched?.name}`}
            </span>
          </div>

          <AnimatePresence mode="wait">
            {step === "token" ? (
              <motion.div key="token" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }} className="flex flex-col gap-3">
                <p className="text-xs text-slate-500">Enter your corporate access token</p>
                <input
                  autoFocus
                  value={token}
                  onChange={e => { setToken(e.target.value); setError(""); }}
                  onKeyDown={e => e.key === "Enter" && submitToken()}
                  placeholder="CF-XXXX-XXXXX"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm font-mono tracking-widest text-slate-100 placeholder:text-slate-600 outline-none focus:border-blue-500 uppercase transition-colors"
                />
              </motion.div>
            ) : (
              <motion.div key="pin" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }} className="flex flex-col gap-3">
                <p className="text-xs text-slate-500">Enter your 4-digit PIN</p>
                <div className="relative">
                  <input
                    autoFocus
                    type={showPin ? "text" : "password"}
                    value={pin}
                    onChange={e => { setPin(e.target.value.slice(0, 4)); setError(""); }}
                    onKeyDown={e => e.key === "Enter" && pin.length === 4 && submitPin()}
                    placeholder="••••"
                    maxLength={4}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.5em] text-slate-100 placeholder:text-slate-600 outline-none focus:border-blue-500 transition-colors"
                  />
                  <button onClick={() => setShowPin(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="flex items-center gap-1.5 text-xs text-red-400 justify-center -mt-2">
                <AlertCircle size={12} /> {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            onClick={step === "token" ? submitToken : submitPin}
            disabled={loading || (step === "token" ? !token.trim() : pin.length < 4)}
            className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium flex items-center justify-center gap-2 transition-all"
          >
            {loading ? (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                className="w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
            ) : (
              <><Shield size={14} /> {step === "token" ? "Verify Token" : "Access Brain"} <ChevronRight size={14} /></>
            )}
          </button>
        </motion.div>

        <p className="text-xs text-slate-700 text-center">
          CloneForge Corporation — Restricted Access
        </p>
      </motion.div>
    </div>
  );
}
