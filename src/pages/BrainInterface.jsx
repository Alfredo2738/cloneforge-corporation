import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Globe, Zap, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Send, X, Network, Volume2, Loader2 } from 'lucide-react'
import VoiceOrb from '../components/voice/VoiceOrb'
import AgentPanel from '../components/agents/AgentPanel'
import BrainDash from '../components/plots/BrainDash'
import StackFlowDiagram from '../components/plots/StackFlowDiagram'
import { streamChat, ingestUrls, synthesizeVoice, playAudioB64 } from '../api/brain'

const ALL_COLLECTIONS = ['cloneforge_docs', 'cloneforge_medical_records', 'cloneforge_web']

const MESH_SEED_URLS = [
  'https://cloneforge.io',
  'https://cloneforge.io/clonepharma_sales',
  'https://cloneforge-corporation.ai',
]

const WELCOME = `I am Oriel4o — the master intelligence of CloneForge Corporation. I operate across your entire knowledge mesh: clinical documentation, research literature, indexed web intelligence, and live agent networks. Speak or type. I'm listening.`

function parseTranslation(content) {
  const marker = '〔EN〕'
  const idx = content.indexOf(marker)
  if (idx === -1) return { main: content, translation: null }
  return {
    main: content.slice(0, idx).trim(),
    translation: content.slice(idx + marker.length).trim(),
  }
}

// Collapsible sidebar section
function SidebarSection({ icon: Icon, label, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-slate-800/40">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="flex items-center gap-2 font-semibold tracking-widest">
          <Icon size={13} /> {label}
        </span>
        {open ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function BrainInterface() {
  const [conversation, setConversation]       = useState([])
  const [displayMessages, setDisplayMessages] = useState([
    { role: 'assistant', content: WELCOME, sources: [], speaker: 'ORIEL4O' }
  ])
  const [input, setInput]           = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [sources, setSources]       = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [urlInput, setUrlInput]     = useState('')
  const [ingestStatus, setIngestStatus] = useState('')
  const [activeAgent, setActiveAgent]   = useState(null)
  const [orbState, setOrbState]         = useState('idle')
  const [speakingIdx, setSpeakingIdx]   = useState(null)
  const chatContainerRef = useRef(null)

  const handleSpeak = useCallback(async (text, idx) => {
    if (speakingIdx !== null) return
    setSpeakingIdx(idx)
    try {
      const b64 = await synthesizeVoice(text, 'oriel')
      await playAudioB64(b64)
    } catch (e) {
      console.warn('TTS failed:', e)
    } finally {
      setSpeakingIdx(null)
    }
  }, [speakingIdx])

  useEffect(() => {
    const el = chatContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [displayMessages])

  useEffect(() => {
    ingestUrls(MESH_SEED_URLS, true).catch(() => {})
  }, [])

  // ── Text send ─────────────────────────────────────────────────────────────
  const handleSend = async (text) => {
    const userText = text || input.trim()
    if (!userText || isStreaming) return
    setInput('')

    const newConversation = [...conversation, { role: 'user', content: userText }]
    setConversation(newConversation)
    setDisplayMessages(prev => [
      ...prev,
      { role: 'user', content: userText },
      { role: 'assistant', content: '', sources: [], speaker: 'ORIEL4O' },
    ])
    setIsStreaming(true)

    let assistantMsg = { role: 'assistant', content: '', sources: [], speaker: 'ORIEL4O' }

    for await (const event of streamChat(newConversation, ALL_COLLECTIONS)) {
      if (event.type === 'sources') {
        setSources(event.data)
        assistantMsg = { ...assistantMsg, sources: event.data }
        setDisplayMessages(prev => [...prev.slice(0, -1), assistantMsg])
      } else if (event.type === 'token') {
        assistantMsg = { ...assistantMsg, content: assistantMsg.content + event.data }
        setDisplayMessages(prev => [...prev.slice(0, -1), assistantMsg])
      } else if (event.type === 'done') {
        setConversation(prev => [...prev, { role: 'assistant', content: assistantMsg.content }])
        setIsStreaming(false)
      }
    }
  }

  // ── Voice handlers ────────────────────────────────────────────────────────
  const handleVoiceTranscript = (text, agentId) => {
    setDisplayMessages(prev => [...prev, { role: 'user', content: text }])
    if (agentId) {
      const agent = activeAgent
      setDisplayMessages(prev => [
        ...prev,
        { role: 'assistant', content: '', sources: [], speaker: agent?.name?.toUpperCase() || 'AGENT', agentId },
      ])
    } else {
      setDisplayMessages(prev => [
        ...prev,
        { role: 'assistant', content: '', sources: [], speaker: 'ORIEL4O' },
      ])
      setConversation(prev => [...prev, { role: 'user', content: text }])
      setIsStreaming(true)
    }
  }

  const handleVoiceResponse = (text, done) => {
    setDisplayMessages(prev => {
      const msgs = [...prev]
      msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], content: text }
      return msgs
    })
    if (done) {
      setConversation(prev => [...prev, { role: 'assistant', content: text }])
      setIsStreaming(false)
    }
  }

  const handleAgentVoiceResponse = (agentId, text, done) => {
    setDisplayMessages(prev => {
      const msgs = [...prev]
      const idx = [...msgs].reverse().findIndex(m => m.agentId === agentId && m.role === 'assistant')
      if (idx !== -1) {
        const realIdx = msgs.length - 1 - idx
        msgs[realIdx] = { ...msgs[realIdx], content: text }
      }
      return msgs
    })
  }

  // ── Ingest ────────────────────────────────────────────────────────────────
  const handleIngest = async () => {
    const urls = urlInput.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return
    setIngestStatus('Queuing…')
    const result = await ingestUrls(urls)
    setIngestStatus(`${result.count || result.indexed || 0} URLs queued`)
    setUrlInput('')
    setTimeout(() => setIngestStatus(''), 4000)
  }

  // ── Speaker styles ────────────────────────────────────────────────────────
  const speakerStyle = (msg) => {
    if (msg.role === 'user') return 'bg-blue-600/30 border border-blue-500/20 text-blue-100'
    if (msg.agentId) {
      const t = msg.agentType || ''
      if (t === 'rogue')      return 'bg-red-900/30 border border-red-500/20 text-red-100'
      if (t === 'microagent') return 'bg-green-900/30 border border-green-500/20 text-green-100'
      return 'bg-cyan-900/30 border border-cyan-500/20 text-cyan-100'
    }
    return 'bg-slate-800/60 border border-slate-700/40 text-slate-200'
  }

  return (
    <div className="h-screen bg-[#050c18] text-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-slate-800/60 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center text-xs font-bold">O</div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100 tracking-wide">CLONEFORGE CORPORATION</h1>
            <p className="text-xs text-slate-500 tracking-widest">ORIEL4O BRAIN INTERFACE</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <a href="https://cloneforge.io" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-blue-500/30 bg-blue-500/10 text-blue-400 text-xs hover:bg-blue-500/20 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
              Physician Interface
            </a>
            <a href="https://cloneforge.io/clonepharma_sales" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-xs hover:bg-indigo-500/20 transition-colors">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
              Pharma Sales
            </a>
          </div>
          {activeAgent && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-900/20 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Talking to {activeAgent.name}
              <button onClick={() => setActiveAgent(null)} className="ml-1 hover:text-emerald-200"><X size={11} /></button>
            </motion.div>
          )}
          <div className="flex items-center gap-2 text-xs text-green-400">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            BRAIN ONLINE
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Voice + Chat */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex justify-center py-6 border-b border-slate-800/40 flex-shrink-0">
            <VoiceOrb
              onTranscript={handleVoiceTranscript}
              onResponse={handleVoiceResponse}
              onSources={(srcs) => {
                setSources(srcs)
                setDisplayMessages(prev => {
                  const msgs = [...prev]
                  if (msgs[msgs.length - 1]?.role === 'assistant') {
                    msgs[msgs.length - 1] = { ...msgs[msgs.length - 1], sources: srcs }
                  }
                  return msgs
                })
              }}
              conversationHistory={conversation}
              activeAgent={activeAgent}
              onAgentResponse={handleAgentVoiceResponse}
              collections={ALL_COLLECTIONS}
              onOrbStateChange={setOrbState}
            />
          </div>

          <div ref={chatContainerRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <AnimatePresence initial={false}>
              {displayMessages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${speakerStyle(msg)}`}>
                    {msg.role === 'assistant' && (
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-medium tracking-widest opacity-60">
                          {msg.speaker || 'ORIEL4O'}
                        </p>
                        {msg.content && !isStreaming && (
                          <button
                            onClick={() => handleSpeak(msg.content, i)}
                            disabled={speakingIdx !== null}
                            title="Speak this response"
                            className="ml-3 p-1 rounded-md opacity-40 hover:opacity-100 transition-opacity disabled:cursor-wait"
                          >
                            {speakingIdx === i
                              ? <Loader2 size={12} className="animate-spin" />
                              : <Volume2 size={12} />}
                          </button>
                        )}
                      </div>
                    )}
                    {msg.role === 'assistant' ? (() => {
                      const { main, translation } = parseTranslation(msg.content)
                      return (
                        <>
                          <p className="whitespace-pre-wrap">{main}
                            {isStreaming && i === displayMessages.length - 1 && (
                              <span className="inline-block w-1 h-4 bg-current ml-0.5 animate-pulse opacity-70" />
                            )}
                          </p>
                          {translation && (
                            <div className="mt-2 pt-2 border-t border-white/10">
                              <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">EN Translation</p>
                              <p className="text-xs text-slate-400 italic whitespace-pre-wrap">{translation}</p>
                            </div>
                          )}
                        </>
                      )
                    })() : (
                      <p className="whitespace-pre-wrap">{msg.content}
                        {isStreaming && i === displayMessages.length - 1 && msg.role === 'assistant' && (
                          <span className="inline-block w-1 h-4 bg-current ml-0.5 animate-pulse opacity-70" />
                        )}
                      </p>
                    )}
                    {msg.sources?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-current/10 flex flex-wrap gap-1">
                        {msg.sources.slice(0, 4).map((s, si) => (
                          <span key={si} className="text-xs bg-black/20 rounded-md px-2 py-0.5 opacity-70">
                            {s.project ? `${s.project}/` : ''}{s.source?.split('/').pop() || s.source}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="border-t border-slate-800/60 px-4 py-3 flex gap-2 flex-shrink-0">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder={activeAgent ? `Type to ${activeAgent.name}… (voice routes to agent)` : 'Type to Oriel4o…'}
              className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500/50 transition-colors"
            />
            <button onClick={() => handleSend()} disabled={isStreaming || !input.trim()}
              className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/40 disabled:opacity-40 transition-colors">
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Sidebar collapse toggle strip */}
        <div className="flex flex-col items-center justify-center w-5 flex-shrink-0 border-l border-slate-800/60 bg-slate-900/20 cursor-pointer hover:bg-slate-800/40 transition-colors"
          onClick={() => setSidebarOpen(p => !p)}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}>
          {sidebarOpen
            ? <ChevronRight size={12} className="text-slate-600" />
            : <ChevronLeft size={12} className="text-slate-500" />}
        </div>

        {/* Right sidebar */}
        <AnimatePresence initial={false}>
          {sidebarOpen && (
            <motion.div
              key="sidebar"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 400, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="border-l border-slate-800/60 flex flex-col overflow-y-auto flex-shrink-0 overflow-x-hidden"
              style={{ width: 400 }}
            >
              {/* Brain Analytics */}
              <SidebarSection icon={Activity} label="BRAIN ANALYTICS" defaultOpen={true}>
                <BrainDash orbState={orbState} />
              </SidebarSection>

              {/* Infrastructure Stack */}
              <SidebarSection icon={Network} label="INFRASTRUCTURE STACK" defaultOpen={true}>
                <StackFlowDiagram orbState={orbState} />
              </SidebarSection>

              {/* Agent Network */}
              <SidebarSection icon={Zap} label="AGENT NETWORK" defaultOpen={true}>
                <AgentPanel
                  activeAgentId={activeAgent?.id}
                  onActivateAgent={(agent) => setActiveAgent(agent)}
                  onDeactivateAgent={() => setActiveAgent(null)}
                  onAgentMessage={({ agentId, agentName, agentType, message }) => {
                    setDisplayMessages(prev => [
                      ...prev,
                      { role: 'assistant', content: message, sources: [], speaker: agentName?.toUpperCase() || 'AGENT', agentId, agentType },
                    ])
                  }}
                />
              </SidebarSection>

              {/* URL Ingest */}
              <div className="px-4 py-4">
                <p className="text-xs font-semibold text-slate-400 tracking-widest flex items-center gap-1.5 mb-3">
                  <Globe size={13} /> INDEX WEB KNOWLEDGE
                </p>
                <textarea
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="Paste URLs — one per line…"
                  rows={5}
                  className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2.5 text-xs text-slate-300 placeholder:text-slate-600 outline-none focus:border-blue-500/50 resize-none transition-colors leading-relaxed"
                />
                <button
                  onClick={handleIngest}
                  disabled={!urlInput.trim()}
                  className="mt-2 w-full py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold hover:bg-blue-600/40 disabled:opacity-40 transition-colors"
                >
                  {ingestStatus || 'Ingest into Qdrant Mesh'}
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
