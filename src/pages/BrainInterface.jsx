import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Globe, Zap, ChevronDown, ChevronUp, Send, X } from 'lucide-react'
import VoiceOrb from '../components/voice/VoiceOrb'
import AgentPanel from '../components/agents/AgentPanel'
import BrainDash from '../components/plots/BrainDash'
import { streamChat, ingestUrls } from '../api/brain'

const WELCOME = `I am Oriel4o — the master intelligence of CloneForge Corporation. I operate across your entire knowledge mesh: clinical documentation, research literature, indexed web intelligence, and live agent networks. Speak or type. I'm listening.`

export default function BrainInterface() {
  const [conversation, setConversation]       = useState([])
  const [displayMessages, setDisplayMessages] = useState([
    { role: 'assistant', content: WELCOME, sources: [], speaker: 'ORIEL4O' }
  ])
  const [input, setInput]           = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [sources, setSources]       = useState([])
  const [showDash, setShowDash]     = useState(true)
  const [showAgents, setShowAgents] = useState(true)
  const [urlInput, setUrlInput]     = useState('')
  const [ingestStatus, setIngestStatus] = useState('')
  const [activeAgent, setActiveAgent]   = useState(null)  // { id, name, voiceKey, type }
  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages])

  // ── Text send to Oriel ────────────────────────────────────────────────────
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

    for await (const event of streamChat(newConversation)) {
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

  // ── Voice transcript handler (from VoiceOrb) ──────────────────────────────
  const handleVoiceTranscript = (text, agentId) => {
    // Add user message to display
    setDisplayMessages(prev => [...prev, { role: 'user', content: text }])

    if (agentId) {
      // Agent conversation — add empty agent placeholder
      const agent = activeAgent
      setDisplayMessages(prev => [
        ...prev,
        { role: 'assistant', content: '', sources: [], speaker: agent?.name?.toUpperCase() || 'AGENT', agentId },
      ])
    } else {
      // Oriel conversation
      setDisplayMessages(prev => [
        ...prev,
        { role: 'assistant', content: '', sources: [], speaker: 'ORIEL4O' },
      ])
      setConversation(prev => [...prev, { role: 'user', content: text }])
      setIsStreaming(true)
    }
  }

  // ── Voice response handler ─────────────────────────────────────────────────
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

  // ── Agent voice response handler ──────────────────────────────────────────
  const handleAgentVoiceResponse = (agentId, text, done) => {
    setDisplayMessages(prev => {
      const msgs = [...prev]
      // Find the last placeholder for this agent
      const idx = [...msgs].reverse().findIndex(m => m.agentId === agentId && m.role === 'assistant')
      if (idx !== -1) {
        const realIdx = msgs.length - 1 - idx
        msgs[realIdx] = { ...msgs[realIdx], content: text }
      }
      return msgs
    })
  }

  // ── URL ingest ────────────────────────────────────────────────────────────
  const handleIngest = async () => {
    const urls = urlInput.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return
    setIngestStatus('Queuing…')
    const result = await ingestUrls(urls)
    setIngestStatus(`${result.count || result.indexed || 0} URLs queued`)
    setUrlInput('')
    setTimeout(() => setIngestStatus(''), 4000)
  }

  // ── Speaker color mapping ─────────────────────────────────────────────────
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
          {activeAgent && (
            <motion.div initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/30 bg-emerald-900/20 text-xs text-emerald-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Talking to {activeAgent.name}
              <button onClick={() => setActiveAgent(null)} className="ml-1 hover:text-emerald-200">
                <X size={11} />
              </button>
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
          {/* Voice orb */}
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
            />
          </div>

          {/* Chat transcript */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            <AnimatePresence initial={false}>
              {displayMessages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${speakerStyle(msg)}`}>
                    {msg.role === 'assistant' && (
                      <p className="text-xs mb-1.5 font-medium tracking-widest opacity-60">
                        {msg.speaker || 'ORIEL4O'}
                      </p>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}
                      {isStreaming && i === displayMessages.length - 1 && msg.role === 'assistant' && (
                        <span className="inline-block w-1 h-4 bg-current ml-0.5 animate-pulse opacity-70" />
                      )}
                    </p>
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
            <div ref={chatEndRef} />
          </div>

          {/* Text input */}
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

        {/* Right sidebar */}
        <div className="w-96 border-l border-slate-800/60 flex flex-col overflow-y-auto flex-shrink-0">
          {/* Brain Analytics */}
          <div className="border-b border-slate-800/40">
            <button onClick={() => setShowDash(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-slate-200 transition-colors">
              <span className="flex items-center gap-2"><Activity size={13} /> BRAIN ANALYTICS</span>
              {showDash ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <AnimatePresence>
              {showDash && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="px-4 pb-4">
                  <BrainDash />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Agent Network */}
          <div className="border-b border-slate-800/40">
            <button onClick={() => setShowAgents(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-slate-200 transition-colors">
              <span className="flex items-center gap-2"><Zap size={13} /> AGENT NETWORK</span>
              {showAgents ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <AnimatePresence>
              {showAgents && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="px-4 pb-4">
                  <AgentPanel
                    activeAgentId={activeAgent?.id}
                    onActivateAgent={(agent) => setActiveAgent(agent)}
                    onDeactivateAgent={() => setActiveAgent(null)}
                    onAgentMessage={({ agentId, agentName, agentType, message }) => {
                      setDisplayMessages(prev => [
                        ...prev,
                        { role: 'assistant', content: message, sources: [], speaker: agentName?.toUpperCase() || `AGENT`, agentId, agentType },
                      ])
                    }}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* URL Ingest */}
          <div className="px-4 py-4">
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-2">
              <Globe size={12} /> INDEX WEB KNOWLEDGE
            </p>
            <textarea value={urlInput} onChange={e => setUrlInput(e.target.value)}
              placeholder="Paste URLs (one per line)…" rows={4}
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 outline-none focus:border-blue-500/50 resize-none transition-colors" />
            <button onClick={handleIngest} disabled={!urlInput.trim()}
              className="mt-2 w-full py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs hover:bg-blue-600/40 disabled:opacity-40 transition-colors">
              {ingestStatus || 'Ingest into Qdrant Mesh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
