import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Globe, Zap, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Send, X, Network, Volume2, Loader2, Users, Cpu, Upload, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import VoiceOrb from '../components/voice/VoiceOrb'
import AgentPanel from '../components/agents/AgentPanel'
import BrainDash from '../components/plots/BrainDash'
import StackFlowDiagram from '../components/plots/StackFlowDiagram'
import { streamChat, streamPanelChat, ingestUrls, ingestDocumentSmart, getIngestStatus, synthesizeVoice, playAudioB64 } from '../api/brain'

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
  const [sidebarOpen, setSidebarOpen]   = useState(true)
  const [urlInput, setUrlInput]         = useState('')
  const [ingestStatus, setIngestStatus] = useState('')
  const [activeAgent, setActiveAgent]   = useState(null)
  const [orbState, setOrbState]         = useState('idle')
  const [speakingIdx, setSpeakingIdx]   = useState(null)
  const [panelMode, setPanelMode]       = useState(false)
  const [autoSpeak, setAutoSpeak]       = useState(false)
  const [docFile, setDocFile]           = useState(null)
  const [docProject, setDocProject]     = useState('cloneforge')
  const [docUploading, setDocUploading] = useState(false)
  const [docResult, setDocResult]       = useState(null)
  const [meshStatus, setMeshStatus]     = useState(null)
  const docInputRef = useRef(null)
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

  // ── Standard text send ────────────────────────────────────────────────────
  const PANEL_TRIGGERS = /\b(spawn|activate|launch|start|use|run|create|bring in|fire up).{0,25}(panel|agents?|subagents?|experts?|team)|panel of experts|multi.?agent|five agents|expert panel/i

  const handleSend = async (text) => {
    const userText = text || input.trim()
    if (!userText || isStreaming) return
    setInput('')

    // Auto-route panel spawn requests to the real panel endpoint
    if (panelMode || PANEL_TRIGGERS.test(userText)) {
      if (!panelMode) setPanelMode(true)
      await handlePanelSend(userText)
      return
    }

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
        if (autoSpeak && assistantMsg.content) {
          const msgIdx = conversation.length + 2
          handleSpeak(assistantMsg.content, msgIdx)
        }
      }
    }
  }

  // ── Panel of experts send ─────────────────────────────────────────────────
  const handlePanelSend = async (userText) => {
    setDisplayMessages(prev => [...prev, { role: 'user', content: userText }])
    setIsStreaming(true)

    // Panel header placeholder
    const panelMsgId = `panel-${Date.now()}`
    setDisplayMessages(prev => [...prev, {
      role: 'panel', id: panelMsgId,
      agents: [], agentResponses: {}, synthesis: '', synthesising: false,
    }])

    for await (const event of streamPanelChat(userText, ALL_COLLECTIONS)) {
      if (event.type === 'panel_skip' || event.type === 'panel_error') {
        // Fall back to standard chat
        setDisplayMessages(prev => prev.filter(m => m.id !== panelMsgId))
        setIsStreaming(false)
        const newConv = [...conversation, { role: 'user', content: userText }]
        setConversation(newConv)
        setDisplayMessages(prev => [
          ...prev,
          { role: 'assistant', content: '', sources: [], speaker: 'ORIEL4O' },
        ])
        let fb = { role: 'assistant', content: '', sources: [], speaker: 'ORIEL4O' }
        for await (const e2 of streamChat(newConv, ALL_COLLECTIONS)) {
          if (e2.type === 'token') {
            fb = { ...fb, content: fb.content + e2.data }
            setDisplayMessages(prev => [...prev.slice(0, -1), fb])
          } else if (e2.type === 'done') {
            setIsStreaming(false)
          }
        }
        return
      }

      setDisplayMessages(prev => prev.map(m => {
        if (m.id !== panelMsgId) return m
        if (event.type === 'panel_start')
          return { ...m, agents: event.agents }
        if (event.type === 'agent_response')
          return { ...m, agentResponses: { ...m.agentResponses, [event.agent_id]: { name: event.agent_name, text: event.data } } }
        if (event.type === 'synthesis_start')
          return { ...m, synthesising: true }
        if (event.type === 'synthesis_token')
          return { ...m, synthesis: (m.synthesis || '') + event.data }
        if (event.type === 'synthesis_done') {
          setIsStreaming(false)
          setConversation(prev => [...prev,
            { role: 'user', content: userText },
            { role: 'assistant', content: m.synthesis + event.data },
          ])
          return { ...m, synthesising: false }
        }
        return m
      }))
    }
    setIsStreaming(false)
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

  // ── Document upload ───────────────────────────────────────────────────────
  const handleDocUpload = async () => {
    if (!docFile || docUploading) return
    setDocUploading(true)
    setDocResult(null)
    try {
      const result = await ingestDocumentSmart(docFile, docProject)
      setDocResult({ ok: true, ...result })
      setDocFile(null)
      if (docInputRef.current) docInputRef.current.value = ''
      // Refresh mesh status
      const status = await getIngestStatus()
      setMeshStatus(status.collections)
    } catch (e) {
      setDocResult({ ok: false, error: e.message })
    } finally {
      setDocUploading(false)
      setTimeout(() => setDocResult(null), 6000)
    }
  }

  const handleMeshStatus = async () => {
    const status = await getIngestStatus()
    setMeshStatus(status.collections)
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
                <motion.div key={msg.id || i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {/* ── Panel message ── */}
                  {msg.role === 'panel' ? (
                    <div className="w-full max-w-[95%]">
                      {/* Agent cards */}
                      {msg.agents?.length > 0 && (
                        <div className="mb-3">
                          <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Users size={10} /> Expert Panel — {msg.agents.length} agents
                          </p>
                          <div className="grid grid-cols-1 gap-2">
                            {msg.agents.map(a => {
                              const resp = msg.agentResponses?.[a.id]
                              return (
                                <div key={a.id} className="rounded-xl border border-slate-700/50 bg-slate-900/60 px-4 py-3">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <Cpu size={10} className="text-cyan-400" />
                                    <span className="text-[10px] font-semibold text-cyan-400 tracking-widest uppercase">{a.name}</span>
                                    {!resp && <span className="text-[9px] text-slate-600 animate-pulse ml-auto">thinking…</span>}
                                  </div>
                                  {resp ? (
                                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{resp.text}</p>
                                  ) : (
                                    <div className="h-2 bg-slate-800 rounded-full animate-pulse w-3/4 mt-1" />
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}
                      {/* Synthesis */}
                      {(msg.synthesising || msg.synthesis) && (
                        <div className="rounded-xl border border-blue-500/30 bg-blue-900/10 px-4 py-3">
                          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <Activity size={10} /> Oriel4o Synthesis
                          </p>
                          <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
                            {msg.synthesis}
                            {msg.synthesising && <span className="inline-block w-1 h-4 bg-blue-400 ml-0.5 animate-pulse" />}
                          </p>
                          {msg.synthesis && !msg.synthesising && (
                            <button onClick={() => handleSpeak(msg.synthesis, i)}
                              disabled={speakingIdx !== null}
                              className="mt-2 flex items-center gap-1 text-[10px] text-blue-400 opacity-60 hover:opacity-100 transition-opacity">
                              {speakingIdx === i ? <Loader2 size={10} className="animate-spin" /> : <Volume2 size={10} />}
                              Speak synthesis
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
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
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <div className="border-t border-slate-800/60 px-4 py-3 flex flex-col gap-2 flex-shrink-0">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder={panelMode ? 'Panel mode — experts will converge on a response…' : activeAgent ? `Type to ${activeAgent.name}…` : 'Type to Oriel4o…'}
                className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500/50 transition-colors"
              />
              <button onClick={() => handleSend()} disabled={isStreaming || !input.trim()}
                className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/40 disabled:opacity-40 transition-colors">
                <Send size={16} />
              </button>
            </div>
            <div className="flex items-center gap-3 px-1">
              <button
                onClick={() => setPanelMode(p => !p)}
                title="Panel mode — spawns expert agents per source"
                className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                  panelMode
                    ? 'border-cyan-500/50 bg-cyan-900/20 text-cyan-400'
                    : 'border-slate-700/50 bg-transparent text-slate-600 hover:text-slate-400'
                }`}
              >
                <Users size={11} />
                {panelMode ? 'Panel ON' : 'Panel'}
              </button>
              <button
                onClick={() => setAutoSpeak(p => !p)}
                title="Auto-speak — TTS every response"
                className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
                  autoSpeak
                    ? 'border-green-500/50 bg-green-900/20 text-green-400'
                    : 'border-slate-700/50 bg-transparent text-slate-600 hover:text-slate-400'
                }`}
              >
                <Volume2 size={11} />
                {autoSpeak ? 'Auto-speak ON' : 'Auto-speak'}
              </button>
            </div>
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
              {/* Infrastructure Stack — top, always visible */}
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

              {/* Brain Analytics — open by default */}
              <SidebarSection icon={Activity} label="BRAIN ANALYTICS" defaultOpen={true}>
                <BrainDash orbState={orbState} />
              </SidebarSection>

              {/* URL Ingest */}
              <div className="px-4 py-4 border-b border-slate-800/40">
                <p className="text-xs font-semibold text-slate-400 tracking-widest flex items-center gap-1.5 mb-3">
                  <Globe size={13} /> INDEX WEB KNOWLEDGE
                </p>
                <textarea
                  value={urlInput}
                  onChange={e => setUrlInput(e.target.value)}
                  placeholder="Paste URLs — one per line…"
                  rows={4}
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

              {/* Document Upload */}
              <div className="px-4 py-4 border-b border-slate-800/40">
                <p className="text-xs font-semibold text-slate-400 tracking-widest flex items-center gap-1.5 mb-3">
                  <Upload size={13} /> FEED THE BRAIN — DOCUMENTS
                </p>
                <p className="text-[10px] text-slate-600 mb-3 leading-relaxed">
                  PDF, TXT, MD, CSV — Oriel4o classifies each document as structured or unstructured, routes it to the right collection, and vectorizes it.
                </p>

                {/* File drop zone */}
                <label
                  className="flex flex-col items-center justify-center gap-2 border border-dashed border-slate-600/60 rounded-xl py-4 px-3 cursor-pointer hover:border-blue-500/50 hover:bg-blue-900/10 transition-colors"
                >
                  <input
                    ref={docInputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.csv"
                    className="hidden"
                    onChange={e => setDocFile(e.target.files[0] || null)}
                  />
                  <FileText size={20} className="text-slate-500" />
                  {docFile
                    ? <span className="text-xs text-blue-300 font-medium text-center break-all">{docFile.name}</span>
                    : <span className="text-xs text-slate-600 text-center">Click to select a file</span>
                  }
                </label>

                <div className="mt-2 flex gap-2">
                  <select
                    value={docProject}
                    onChange={e => setDocProject(e.target.value)}
                    className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-2 py-1.5 text-xs text-slate-300 outline-none focus:border-blue-500/50"
                  >
                    <option value="cloneforge">cloneforge</option>
                    <option value="clinical">clinical</option>
                    <option value="pharma">pharma</option>
                    <option value="internal">internal</option>
                    <option value="research">research</option>
                  </select>
                  <button
                    onClick={handleDocUpload}
                    disabled={!docFile || docUploading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs font-semibold hover:bg-blue-600/40 disabled:opacity-40 transition-colors"
                  >
                    {docUploading ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                    {docUploading ? 'Indexing…' : 'Upload'}
                  </button>
                </div>

                {/* Result feedback */}
                <AnimatePresence>
                  {docResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className={`mt-2 px-3 py-2 rounded-lg text-xs flex items-start gap-2 ${
                        docResult.ok
                          ? 'bg-green-900/20 border border-green-500/30 text-green-300'
                          : 'bg-red-900/20 border border-red-500/30 text-red-300'
                      }`}
                    >
                      {docResult.ok
                        ? <CheckCircle size={12} className="flex-shrink-0 mt-0.5" />
                        : <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />}
                      <span>
                        {docResult.ok
                          ? `${docResult.file} → ${docResult.collection} (${docResult.chunks} chunks, ${docResult.storage})`
                          : docResult.error || 'Upload failed'}
                      </span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Mesh Status */}
              <div className="px-4 py-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-slate-400 tracking-widest flex items-center gap-1.5">
                    <Activity size={13} /> MESH STATUS
                  </p>
                  <button onClick={handleMeshStatus} className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
                    Refresh
                  </button>
                </div>
                {meshStatus ? (
                  <div className="space-y-2">
                    {Object.entries(meshStatus).map(([col, info]) => (
                      <div key={col} className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 font-mono truncate">{col.replace('cloneforge_', '')}</span>
                        <span className={`font-semibold ${info.points > 0 ? 'text-green-400' : 'text-slate-600'}`}>
                          {info.points?.toLocaleString() ?? 0} pts
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button onClick={handleMeshStatus} className="w-full py-2 rounded-xl border border-slate-700/50 text-slate-600 text-xs hover:text-slate-400 hover:border-slate-600 transition-colors">
                    Check collection counts
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
