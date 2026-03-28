import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Volume2, Radio, Globe } from 'lucide-react'
import { streamChat, streamAgentMessage, synthesizeVoice, playAudioB64 } from '../../api/brain'

const PULSE_VARIANTS = {
  idle:      { scale: 1,    opacity: 0.6 },
  listening: { scale: 1.15, opacity: 1   },
  thinking:  { scale: 1.05, opacity: 0.8 },
  speaking:  { scale: 1.2,  opacity: 1   },
}

const LANGUAGES = [
  { flag: '🇺🇸', label: 'EN', recog: 'en-US', tts: 'en' },
  { flag: '🇷🇺', label: 'RU', recog: 'ru-RU', tts: 'ru' },
  { flag: '🇪🇸', label: 'ES', recog: 'es-ES', tts: 'es' },
  { flag: '🇫🇷', label: 'FR', recog: 'fr-FR', tts: 'fr' },
  { flag: '🇩🇪', label: 'DE', recog: 'de-DE', tts: 'de' },
  { flag: '🇨🇳', label: 'ZH', recog: 'zh-CN', tts: 'zh' },
  { flag: '🇸🇦', label: 'AR', recog: 'ar-SA', tts: 'ar' },
  { flag: '🇧🇷', label: 'PT', recog: 'pt-BR', tts: 'pt' },
]

// Strip the 〔EN〕 translation line — TTS only speaks the main response
function extractVoiceText(fullText) {
  const idx = fullText.indexOf('〔EN〕')
  return idx !== -1 ? fullText.slice(0, idx).trim() : fullText.trim()
}

export default function VoiceOrb({
  onTranscript,
  onResponse,
  onSources,
  conversationHistory,
  activeAgent,
  onAgentResponse,
  collections,
  onOrbStateChange,
}) {
  const [orbState, setOrbState]               = useState('idle')
  const [continuous, setContinuous]           = useState(false)
  const [transcript, setTranscript]           = useState('')
  const [lang, setLang]                       = useState(LANGUAGES[0])
  const [showLangPicker, setShowLangPicker]   = useState(false)

  const recognitionRef   = useRef(null)
  const orbStateRef      = useRef('idle')
  const continuousRef    = useRef(false)
  const silenceTimerRef  = useRef(null)   // replaces finalTimerRef — fires after 1400ms of no new speech
  const lastFinalRef     = useRef('')
  const activeAgentRef   = useRef(null)
  const langRef          = useRef(LANGUAGES[0])
  const convHistoryRef   = useRef([])
  const accTextRef       = useRef('')     // accumulated transcript across continuous results

  const _setOrbState = useCallback((s) => {
    setOrbState(s)
    orbStateRef.current = s
    onOrbStateChange?.(s)
  }, [onOrbStateChange])

  useEffect(() => { continuousRef.current  = continuous        }, [continuous])
  useEffect(() => { activeAgentRef.current = activeAgent       }, [activeAgent])
  useEffect(() => { langRef.current        = lang              }, [lang])
  useEffect(() => { convHistoryRef.current = conversationHistory ?? [] }, [conversationHistory])

  // ── Core voice handler ────────────────────────────────────────────────────
  const handleFinalTranscript = useCallback(async (text) => {
    if (!text.trim()) return
    const agent   = activeAgentRef.current
    const curLang = langRef.current

    _setOrbState('thinking')
    onTranscript?.(text, agent?.id || null)

    let fullResponse = ''
    const voiceKey = agent ? agent.voiceKey : 'oriel'

    try {
      if (agent) {
        for await (const event of streamAgentMessage(agent.id, text, collections, curLang.tts)) {
          if (event.type === 'token') {
            fullResponse += event.data
            onAgentResponse?.(agent.id, fullResponse, false)
          } else if (event.type === 'done') {
            onAgentResponse?.(agent.id, fullResponse, true)
            break
          }
        }
      } else {
        const messages = [...convHistoryRef.current, { role: 'user', content: text }]
        for await (const event of streamChat(messages, collections, curLang.tts)) {
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
      const msg = 'Oriel4o is reconnecting — please try again in a moment.'
      agent ? onAgentResponse?.(agent.id, msg, true) : onResponse?.(msg, true)
      _setOrbState('idle'); setTranscript('')
      if (continuousRef.current) setTimeout(() => startListening(), 2500)
      return
    }

    if (!fullResponse) {
      _setOrbState('idle'); setTranscript('')
      if (continuousRef.current) setTimeout(() => startListening(), 800)
      return
    }

    // Speak only the main-language portion — never read the 〔EN〕 translation aloud
    _setOrbState('speaking')
    try {
      const voiceText = extractVoiceText(fullResponse)
      const b64 = await synthesizeVoice(voiceText.slice(0, 500), voiceKey, curLang.tts)
      await playAudioB64(b64)
    } catch (e) {
      console.warn('TTS failed:', e)
    }

    _setOrbState('idle'); setTranscript('')
    if (continuousRef.current) setTimeout(() => startListening(), 700)
  }, [onTranscript, onResponse, onSources, onAgentResponse, collections, _setOrbState]) // eslint-disable-line

  const handleFinalRef = useRef(handleFinalTranscript)
  useEffect(() => { handleFinalRef.current = handleFinalTranscript }, [handleFinalTranscript])

  // ── Build recognizer ──────────────────────────────────────────────────────
  const buildRecognizer = useCallback((langObj) => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      console.warn('SpeechRecognition not supported')
      return null
    }
    const SR  = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()

    // continuous: true — we control when to stop via silence timer
    rec.continuous     = true
    rec.interimResults = true
    rec.lang           = langObj.recog

    rec.onresult = (e) => {
      // Accumulate all results (final + interim) into one string
      const text = Array.from(e.results).map(r => r[0].transcript).join('').trim()
      setTranscript(text)
      accTextRef.current = text

      // Reset silence timer on every new speech event
      clearTimeout(silenceTimerRef.current)

      const words = text.split(/\s+/).filter(Boolean)
      // Require at least 3 words before we even consider firing
      if (words.length >= 3) {
        // 1400ms of silence = user has finished speaking
        silenceTimerRef.current = setTimeout(() => {
          const t = accTextRef.current
          if (t && t !== lastFinalRef.current) {
            lastFinalRef.current = t
            accTextRef.current   = ''
            try { rec.stop() } catch {}
          }
        }, 1400)
      }
    }

    rec.onend = () => {
      // If we stopped because of silence timer, the text is in lastFinalRef
      const t = lastFinalRef.current
      // Only fire if the text hasn't already been sent
      const pending = accTextRef.current
      accTextRef.current = ''
      clearTimeout(silenceTimerRef.current)

      const toProcess = pending || t
      if (toProcess && toProcess === lastFinalRef.current) {
        // text already set by silence timer path — fire it
        handleFinalRef.current(toProcess)
        lastFinalRef.current = ''
      } else if (pending && pending !== lastFinalRef.current) {
        lastFinalRef.current = pending
        handleFinalRef.current(pending)
      } else if (orbStateRef.current === 'listening') {
        _setOrbState('idle')
      }
    }

    rec.onerror = (e) => {
      console.warn('SpeechRecognition error:', e.error)
      clearTimeout(silenceTimerRef.current)
      accTextRef.current = ''
      if (orbStateRef.current === 'listening') _setOrbState('idle')
    }

    return rec
  }, [_setOrbState])

  // Initial build
  useEffect(() => {
    recognitionRef.current = buildRecognizer(LANGUAGES[0])
    return () => {
      clearTimeout(silenceTimerRef.current)
      try { recognitionRef.current?.stop() } catch {}
    }
  }, [buildRecognizer])

  // ── Language switch ───────────────────────────────────────────────────────
  const switchLanguage = useCallback((langObj) => {
    const wasListening = orbStateRef.current === 'listening'
    clearTimeout(silenceTimerRef.current)
    accTextRef.current = ''
    try { recognitionRef.current?.stop() } catch {}

    // Sync ref immediately — don't wait for React's async useEffect to fire
    langRef.current = langObj
    setLang(langObj)
    setShowLangPicker(false)

    const rec = buildRecognizer(langObj)
    recognitionRef.current = rec

    if (wasListening && rec) {
      setTimeout(() => {
        try { rec.start(); _setOrbState('listening'); setTranscript('') } catch {}
      }, 150)
    }
  }, [buildRecognizer, _setOrbState])

  const startListening = useCallback(() => {
    if (!recognitionRef.current) return
    accTextRef.current = ''
    clearTimeout(silenceTimerRef.current)
    try {
      recognitionRef.current.start()
      _setOrbState('listening')
      setTranscript('')
    } catch (e) {
      console.warn('startListening error:', e)
    }
  }, [_setOrbState])

  const toggleListen = () => {
    if (orbState === 'listening') {
      clearTimeout(silenceTimerRef.current)
      accTextRef.current = ''
      try { recognitionRef.current?.stop() } catch {}
      _setOrbState('idle')
    } else if (orbState === 'idle') {
      startListening()
    }
  }

  const toggleContinuous = () => {
    const next = !continuous
    setContinuous(next)
    if (next && orbState === 'idle') startListening()
    else if (!next && orbState === 'listening') {
      clearTimeout(silenceTimerRef.current)
      accTextRef.current = ''
      try { recognitionRef.current?.stop() } catch {}
      _setOrbState('idle')
    }
  }

  const stateColors = activeAgent
    ? { idle: ['#1a4a2e','#0d2a1a'], listening: ['#1e6b3a','#0f3d20'], thinking: ['#6b3a7d','#3d1f4a'], speaking: ['#2a6b1a','#163d0d'] }
    : { idle: ['#1e3a5f','#0f2040'], listening: ['#1a5276','#0e3460'], thinking: ['#7d3c98','#4a235a'], speaking: ['#117a65','#0b5345'] }
  const [c1, c2] = stateColors[orbState]

  const stateLabel = activeAgent
    ? (orbState === 'idle' ? activeAgent.name.toUpperCase() : orbState === 'listening' ? 'LISTENING…' : orbState === 'thinking' ? 'THINKING…' : 'SPEAKING…')
    : (orbState === 'idle' && !continuous ? 'ORIEL' : orbState === 'idle' ? 'WAITING…' : orbState === 'listening' ? 'LISTENING…' : orbState === 'thinking' ? 'THINKING…' : 'SPEAKING…')

  // Language indicator — show selected language when non-English
  const showLangBadge = lang.tts !== 'en'

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Active agent banner */}
      <AnimatePresence>
        {activeAgent && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-900/20 text-xs text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            In conversation with <strong>{activeAgent.name}</strong>
            <span className="text-emerald-600 ml-1">{lang.flag} {lang.label}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Language mode badge */}
      <AnimatePresence>
        {showLangBadge && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-blue-500/30 bg-blue-900/20 text-[10px] text-blue-300">
            <span>{lang.flag}</span>
            <span>Oriel responds in <strong>{lang.label}</strong> + English translation</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Glow rings + orb */}
      <div className="relative flex items-center justify-center">
        {['speaking','listening'].includes(orbState) && (
          <>
            <motion.div className="absolute rounded-full border border-blue-400/20"
              animate={{ scale:[1,1.4,1], opacity:[0.3,0,0.3] }} transition={{ duration:2, repeat:Infinity }}
              style={{ width:200, height:200 }} />
            <motion.div className="absolute rounded-full border border-blue-300/15"
              animate={{ scale:[1,1.6,1], opacity:[0.2,0,0.2] }} transition={{ duration:2.5, repeat:Infinity, delay:0.3 }}
              style={{ width:200, height:200 }} />
          </>
        )}
        {continuous && orbState === 'idle' && (
          <motion.div className="absolute rounded-full border border-cyan-400/30"
            animate={{ scale:[1,1.2,1], opacity:[0.4,0.1,0.4] }} transition={{ duration:3, repeat:Infinity }}
            style={{ width:200, height:200 }} />
        )}

        <motion.button onClick={toggleListen} variants={PULSE_VARIANTS} animate={orbState}
          transition={{ type:'spring', stiffness:200, damping:20 }}
          className="relative w-48 h-48 rounded-full flex items-center justify-center cursor-pointer select-none"
          style={{ background:`radial-gradient(circle at 35% 35%, ${c1}, ${c2})`, boxShadow:`0 0 60px ${c1}80, 0 0 120px ${c1}30` }}
          disabled={orbState === 'thinking' || orbState === 'speaking'}>

          <motion.div className="absolute inset-4 rounded-full"
            animate={{ opacity: orbState === 'thinking' ? [0.3,0.8,0.3] : 0.2 }}
            transition={{ duration:1.2, repeat:Infinity }}
            style={{ background:`radial-gradient(circle, ${c1}cc, transparent)` }} />

          <div className="relative z-10 flex flex-col items-center gap-1">
            {orbState === 'idle' && <Mic size={36} className={activeAgent ? 'text-emerald-300' : 'text-blue-200'} />}
            {orbState === 'listening' && (
              <motion.div animate={{ scale:[1,1.15,1] }} transition={{ repeat:Infinity, duration:0.8 }}>
                <Mic size={36} className="text-cyan-300" />
              </motion.div>
            )}
            {orbState === 'thinking' && (
              <motion.div animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:2, ease:'linear' }}>
                <div className="w-9 h-9 border-2 border-purple-300 border-t-transparent rounded-full" />
              </motion.div>
            )}
            {orbState === 'speaking' && <Volume2 size={36} className="text-emerald-300" />}
            <span className="text-xs font-medium tracking-widest uppercase"
              style={{ color: orbState === 'idle' ? (activeAgent ? '#6ee7b7' : '#93c5fd') : '#e2e8f0' }}>
              {stateLabel}
            </span>
            <span className="text-base leading-none mt-0.5">{lang.flag}</span>
          </div>
        </motion.button>
      </div>

      {/* Live transcript */}
      <AnimatePresence>
        {transcript && (
          <motion.p initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            className="text-sm text-blue-200/70 max-w-xs text-center italic">
            "{transcript}"
          </motion.p>
        )}
      </AnimatePresence>

      {/* Controls row */}
      <div className="flex items-center gap-2">
        <p className="text-xs text-slate-500 tracking-widest uppercase">
          {orbState === 'idle' && !continuous ? 'Tap to speak' :
           orbState === 'idle' && continuous  ? 'Waiting…' :
           orbState === 'listening'            ? 'Listening…' :
           orbState === 'thinking'             ? 'Thinking…' : 'Speaking…'}
        </p>

        <button onClick={toggleContinuous}
          className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] transition-colors ${
            continuous ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-400' : 'border-slate-700/50 text-slate-600 hover:border-slate-500 hover:text-slate-400'
          }`}>
          <Radio size={10} /> LIVE
        </button>

        {/* Language picker */}
        <div className="relative">
          <button onClick={() => setShowLangPicker(p => !p)}
            className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] transition-colors ${
              showLangPicker ? 'border-blue-500/50 bg-blue-500/10 text-blue-400' : 'border-slate-700/50 text-slate-400 hover:border-slate-500'
            }`}>
            <Globe size={10} /> {lang.flag} {lang.label}
          </button>

          <AnimatePresence>
            {showLangPicker && (
              <motion.div initial={{ opacity:0, y:4 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0, y:4 }}
                className="absolute bottom-full mb-2 left-0 bg-slate-900 border border-slate-700/60 rounded-xl p-2 flex flex-wrap gap-1 w-44 z-50 shadow-xl">
                {LANGUAGES.map(l => (
                  <button key={l.label} onClick={() => switchLanguage(l)}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs transition-colors w-[calc(50%-2px)] ${
                      lang.label === l.label
                        ? 'bg-blue-600/30 border border-blue-500/40 text-blue-300'
                        : 'hover:bg-slate-800 text-slate-400 border border-transparent'
                    }`}>
                    <span>{l.flag}</span> {l.label}
                    {lang.label === l.label && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-400" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
