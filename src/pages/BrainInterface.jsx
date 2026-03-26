import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Activity, Database, Globe, Zap, ChevronDown, ChevronUp, Send } from 'lucide-react'
import VoiceOrb from '../components/voice/VoiceOrb'
import AgentPanel from '../components/agents/AgentPanel'
import BrainDash from '../components/plots/BrainDash'
import { streamChat, ingestUrls } from '../api/brain'

const WELCOME = `I am Oriel4o — the master intelligence of CloneForge Corporation.

I operate across your entire knowledge mesh: clinical documentation, research literature, indexed web intelligence, and live agent networks.

Speak or type. I am listening.`

export default function BrainInterface() {
  const [conversation, setConversation] = useState([])
  const [displayMessages, setDisplayMessages] = useState([
    { role: 'assistant', content: WELCOME, sources: [] }
  ])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [sources, setSources] = useState([])
  const [agents, setAgents] = useState([])
  const [showDash, setShowDash] = useState(true)
  const [showAgents, setShowAgents] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [ingestStatus, setIngestStatus] = useState('')
  const chatEndRef = useRef(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [displayMessages])

  const handleSend = async (text) => {
    const userText = text || input.trim()
    if (!userText || isStreaming) return
    setInput('')

    const newConversation = [...conversation, { role: 'user', content: userText }]
    setConversation(newConversation)
    setDisplayMessages(prev => [...prev, { role: 'user', content: userText }])
    setIsStreaming(true)

    let assistantMsg = { role: 'assistant', content: '', sources: [] }
    setDisplayMessages(prev => [...prev, assistantMsg])

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

  const handleIngest = async () => {
    const urls = urlInput.split('\n').map(u => u.trim()).filter(Boolean)
    if (!urls.length) return
    setIngestStatus('Queuing…')
    const result = await ingestUrls(urls)
    setIngestStatus(`${result.count || result.indexed || 0} URLs queued for indexing`)
    setUrlInput('')
    setTimeout(() => setIngestStatus(''), 4000)
  }

  return (
    <div className="min-h-screen bg-[#050c18] text-slate-200 flex flex-col">
      {/* Header */}
      <header className="border-b border-slate-800/60 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-blue-900 flex items-center justify-center text-xs font-bold">O</div>
          <div>
            <h1 className="text-sm font-semibold text-slate-100 tracking-wide">CLONEFORGE CORPORATION</h1>
            <p className="text-xs text-slate-500 tracking-widest">ORIEL4O BRAIN INTERFACE</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-green-400">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          BRAIN ONLINE
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Voice + Chat */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Voice orb */}
          <div className="flex justify-center py-8 border-b border-slate-800/40">
            <VoiceOrb
              onTranscript={(t) => handleSend(t)}
              onResponse={(text, done) => {
                if (!done) return
                // VoiceOrb handles its own streaming display via handleSend
              }}
              onSources={setSources}
              conversationHistory={conversation}
            />
          </div>

          {/* Chat */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <AnimatePresence initial={false}>
              {displayMessages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600/30 border border-blue-500/20 text-blue-100'
                      : 'bg-slate-800/60 border border-slate-700/40 text-slate-200'
                  }`}>
                    {msg.role === 'assistant' && (
                      <p className="text-xs text-blue-400/60 mb-1.5 font-medium tracking-widest">ORIEL4O</p>
                    )}
                    <p className="whitespace-pre-wrap">{msg.content}
                      {isStreaming && i === displayMessages.length - 1 && msg.role === 'assistant' && (
                        <span className="inline-block w-1 h-4 bg-blue-400 ml-0.5 animate-pulse" />
                      )}
                    </p>
                    {msg.sources?.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-700/40 flex flex-wrap gap-1">
                        {msg.sources.slice(0, 4).map((s, si) => (
                          <span key={si} className="text-xs bg-slate-700/50 rounded-md px-2 py-0.5 text-slate-400">
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
          <div className="border-t border-slate-800/60 px-4 py-3 flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Type to Oriel4o…"
              className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 outline-none focus:border-blue-500/50 transition-colors"
            />
            <button
              onClick={() => handleSend()}
              disabled={isStreaming || !input.trim()}
              className="p-2.5 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 hover:bg-blue-600/40 disabled:opacity-40 transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-96 border-l border-slate-800/60 flex flex-col overflow-y-auto">

          {/* Plots */}
          <div className="border-b border-slate-800/40">
            <button
              onClick={() => setShowDash(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-2"><Activity size={13} /> BRAIN ANALYTICS</span>
              {showDash ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <AnimatePresence>
              {showDash && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-4"
                >
                  <BrainDash agents={agents} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Agents */}
          <div className="border-b border-slate-800/40">
            <button
              onClick={() => setShowAgents(p => !p)}
              className="w-full flex items-center justify-between px-4 py-3 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              <span className="flex items-center gap-2"><Zap size={13} /> AGENT NETWORK</span>
              {showAgents ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
            </button>
            <AnimatePresence>
              {showAgents && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="px-4 pb-4"
                >
                  <AgentPanel
                    onAgentMessage={({ agentId, message }) => {
                      setDisplayMessages(prev => [
                        ...prev,
                        { role: 'assistant', content: `[Agent ${agentId}]: ${message}`, sources: [] }
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
            <textarea
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              placeholder="Paste URLs (one per line)…"
              rows={4}
              className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-xs text-slate-300 placeholder:text-slate-600 outline-none focus:border-blue-500/50 resize-none transition-colors"
            />
            <button
              onClick={handleIngest}
              disabled={!urlInput.trim()}
              className="mt-2 w-full py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs hover:bg-blue-600/40 disabled:opacity-40 transition-colors"
            >
              {ingestStatus || 'Ingest into Qdrant Mesh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
