import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Volume2, Radio } from 'lucide-react'
import { streamChat, streamAgentMessage, synthesizeVoice, playAudioB64 } from '../../api/brain'

const PULSE_VARIANTS = {
  idle:      { scale: 1,    opacity: 0.6 },
  listening: { scale: 1.15, opacity: 1   },
  thinking:  { scale: 1.05, opacity: 0.8 },
  speaking:  { scale: 1.2,  opacity: 1   },
}

// When activeAgent is set, orb routes voice to that agent and uses their voice
export default function VoiceOrb({
  onTranscript,
  onResponse,
  onSources,
  conversationHistory,
  activeAgent,       // { id, name, voiceKey } | null
  onAgentResponse,   // (agentId, text, done) => void
}) {
  const [orbState, setOrbState]     = useState('idle')
  const [continuous, setContinuous] = useState(false)
  const [transcript, setTranscript] = useState('')

  const recognitionRef = useRef(null)
  const orbStateRef    = useRef('idle')
  const continuousRef  = useRef(false)
  const finalTimerRef  = useRef(null)
  const lastFinalRef   = useRef('')
  const activeAgentRef = useRef(null)

  useEffect(() => { orbStateRef.current = orbState },        [orbState])
  useEffect(() => { continuousRef.current = continuous },    [continuous])
  useEffect(() => { activeAgentRef.current = activeAgent },  [activeAgent])

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return
    try { recognitionRef.current.start(); setOrbState('listening'); setTranscript('') } catch {}
  }, [])

  useEffect(() => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.continuous = false
    rec.interimResults = true
    rec.lang = 'en-US'

    rec.onresult = (e) => {
      const text = Array.from(e.results).map(r => r[0].transcript).join('').trim()
      setTranscript(text)
      if (e.results[e.results.length - 1].isFinal) {
        clearTimeout(finalTimerRef.current)
        finalTimerRef.current = setTimeout(() => {
          const words = text.split(/\s+/).filter(Boolean)
          if (words.length >= 2 && text !== lastFinalRef.current) {
            lastFinalRef.current = text
            handleFinalTranscript(text)
          }
        }, 400)
      }
    }

    rec.onend = () => {
      clearTimeout(finalTimerRef.current)
      if (orbStateRef.current === 'listening') setOrbState('idle')
    }

    recognitionRef.current = rec
  }, []) // eslint-disable-line

  // ── Core handler — routes to Oriel or active agent ────────────────────────
  const handleFinalTranscript = async (text) => {
    if (!text.trim()) return
    const agent = activeAgentRef.current

    setOrbState('thinking')
    onTranscript?.(text, agent?.id || null)

    let fullResponse = ''
    const voiceKey = agent ? agent.voiceKey : 'oriel'

    try {
      if (agent) {
        // ── Agent conversation mode ───────────────────────────────────────
        for await (const event of streamAgentMessage(agent.id, text)) {
          if (event.type === 'token') {
            fullResponse += event.data
            onAgentResponse?.(agent.id, fullResponse, false)
          } else if (event.type === 'done') {
            onAgentResponse?.(agent.id, fullResponse, true)
            break
          }
        }
      } else {
        // ── Oriel main chat ───────────────────────────────────────────────
        const messages = [...conversationHistory, { role: 'user', content: text }]
        for await (const event of streamChat(messages)) {
          if (event.type === 'sources') {
            onSources?.(event.data)
          } else if (event.type === 'token') {
            fullResponse += event.data
            onResponse?.(fullResponse, false)
          } else if (event.type === 'done') {
            onResponse?.(fullResponse, true)
            break
          }
        }
      }
    } catch (err) {
      console.error('Brain stream error:', err)
      const errMsg = `Connection issue — ${err.message}`
      agent ? onAgentResponse?.(agent.id, errMsg, true) : onResponse?.(errMsg, true)
      setOrbState('idle'); setTranscript('')
      if (continuousRef.current) setTimeout(() => startListening(), 1500)
      return
    }

    if (!fullResponse) {
      setOrbState('idle'); setTranscript('')
      if (continuousRef.current) setTimeout(() => startListening(), 800)
      return
    }

    // ── Speak with appropriate voice ──────────────────────────────────────
    setOrbState('speaking')
    try {
      const b64 = await synthesizeVoice(fullResponse.slice(0, 400), voiceKey)
      await playAudioB64(b64)
    } catch (e) {
      console.warn('TTS failed:', e)
    }

    setOrbState('idle'); setTranscript('')

    // In continuous mode, auto-resume — captures agent's follow-up question answer
    if (continuousRef.current) setTimeout(() => startListening(), 700)
  }

  const toggleListen = () => {
    if (orbState === 'listening') {
      recognitionRef.current?.stop(); setOrbState('idle')
    } else if (orbState === 'idle') {
      startListening()
    }
  }

  const toggleContinuous = () => {
    const next = !continuous
    setContinuous(next)
    if (next && orbState === 'idle') startListening()
    else if (!next && orbState === 'listening') { recognitionRef.current?.stop(); setOrbState('idle') }
  }

  const stateColors = activeAgent
    ? {
        idle:      ['#1a4a2e', '#0d2a1a'],
        listening: ['#1e6b3a', '#0f3d20'],
        thinking:  ['#6b3a7d', '#3d1f4a'],
        speaking:  ['#2a6b1a', '#163d0d'],
      }
    : {
        idle:      ['#1e3a5f', '#0f2040'],
        listening: ['#1a5276', '#0e3460'],
        thinking:  ['#7d3c98', '#4a235a'],
        speaking:  ['#117a65', '#0b5345'],
      }
  const [c1, c2] = stateColors[orbState]

  const label = activeAgent
    ? (orbState === 'idle' ? activeAgent.name.toUpperCase() :
       orbState === 'listening' ? 'LISTENING…' :
       orbState === 'thinking'  ? 'THINKING…'  : 'SPEAKING…')
    : (orbState === 'idle' && !continuous ? 'ORIEL' :
       orbState === 'idle' && continuous  ? 'WAITING…' :
       orbState === 'listening'            ? 'LISTENING…' :
       orbState === 'thinking'             ? 'THINKING…'  : 'SPEAKING…')

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Active agent banner */}
      <AnimatePresence>
        {activeAgent && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-900/20 text-xs text-emerald-400"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            In conversation with <strong>{activeAgent.name}</strong>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glow rings */}
      <div className="relative flex items-center justify-center">
        {['speaking', 'listening'].includes(orbState) && (
          <>
            <motion.div className="absolute rounded-full border border-blue-400/20"
              animate={{ scale: [1,1.4,1], opacity: [0.3,0,0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              style={{ width: 200, height: 200 }} />
            <motion.div className="absolute rounded-full border border-blue-300/15"
              animate={{ scale: [1,1.6,1], opacity: [0.2,0,0.2] }}
              transition={{ duration: 2.5, repeat: Infinity, delay: 0.3 }}
              style={{ width: 200, height: 200 }} />
          </>
        )}
        {continuous && orbState === 'idle' && (
          <motion.div className="absolute rounded-full border border-cyan-400/30"
            animate={{ scale: [1,1.2,1], opacity: [0.4,0.1,0.4] }}
            transition={{ duration: 3, repeat: Infinity }}
            style={{ width: 200, height: 200 }} />
        )}

        {/* Core orb */}
        <motion.button
          onClick={toggleListen}
          variants={PULSE_VARIANTS}
          animate={orbState}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
          className="relative w-48 h-48 rounded-full flex items-center justify-center cursor-pointer select-none"
          style={{
            background: `radial-gradient(circle at 35% 35%, ${c1}, ${c2})`,
            boxShadow: `0 0 60px ${c1}80, 0 0 120px ${c1}30`,
          }}
          disabled={orbState === 'thinking' || orbState === 'speaking'}
        >
          <motion.div className="absolute inset-4 rounded-full"
            animate={{ opacity: orbState === 'thinking' ? [0.3,0.8,0.3] : 0.2 }}
            transition={{ duration: 1.2, repeat: Infinity }}
            style={{ background: `radial-gradient(circle, ${c1}cc, transparent)` }} />

          <div className="relative z-10 flex flex-col items-center gap-1">
            {orbState === 'idle' && <Mic size={36} className={activeAgent ? 'text-emerald-300' : 'text-blue-200'} />}
            {orbState === 'listening' && (
              <motion.div animate={{ scale: [1,1.15,1] }} transition={{ repeat: Infinity, duration: 0.8 }}>
                <Mic size={36} className="text-cyan-300" />
              </motion.div>
            )}
            {orbState === 'thinking' && (
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}>
                <div className="w-9 h-9 border-2 border-purple-300 border-t-transparent rounded-full" />
              </motion.div>
            )}
            {orbState === 'speaking' && <Volume2 size={36} className={activeAgent ? 'text-emerald-300' : 'text-emerald-300'} />}
            <span className="text-xs font-medium tracking-widest uppercase"
              style={{ color: orbState === 'idle' ? (activeAgent ? '#6ee7b7' : '#93c5fd') : '#e2e8f0' }}>
              {label}
            </span>
          </div>
        </motion.button>
      </div>

      {/* Live transcript */}
      <AnimatePresence>
        {transcript && (
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="text-sm text-blue-200/70 max-w-xs text-center italic">
            "{transcript}"
          </motion.p>
        )}
      </AnimatePresence>

      {/* Controls row */}
      <div className="flex items-center gap-3">
        <p className="text-xs text-slate-500 tracking-widest uppercase">
          {orbState === 'idle' && !continuous ? 'Tap to speak' :
           orbState === 'idle' && continuous  ? 'Waiting…' :
           orbState === 'listening'            ? 'Listening…' :
           orbState === 'thinking'             ? 'Thinking…' : 'Speaking…'}
        </p>
        <button onClick={toggleContinuous}
          title={continuous ? 'Disable always-on' : 'Enable always-on listening'}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] transition-colors ${
            continuous
              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400'
              : 'border-slate-700/50 text-slate-600 hover:border-slate-500 hover:text-slate-400'
          }`}>
          <Radio size={10} /> LIVE
        </button>
      </div>
    </div>
  )
}
