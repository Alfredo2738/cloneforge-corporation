import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Zap, Brain, Skull, X, ArrowRight, MessageSquare } from 'lucide-react'
import { spawnAgent, terminateAgent, streamAgentMessage, streamAgentToAgent } from '../../api/brain'

const AGENT_COLORS = {
  master:    { bg: 'from-blue-900 to-blue-800',   border: 'border-blue-500',   icon: '🧠' },
  subagent:  { bg: 'from-slate-800 to-slate-700', border: 'border-cyan-500',   icon: '⚡' },
  microagent:{ bg: 'from-slate-800 to-slate-700', border: 'border-green-500',  icon: '🔬' },
  rogue:     { bg: 'from-red-900 to-red-800',     border: 'border-red-400',    icon: '☠️' },
}

const STATUS_DOT = {
  spawning:  'bg-yellow-400 animate-pulse',
  active:    'bg-green-400',
  thinking:  'bg-purple-400 animate-pulse',
  idle:      'bg-slate-400',
  complete:  'bg-blue-400',
  diverged:  'bg-red-400 animate-pulse',
}

export default function AgentPanel({ onAgentMessage }) {
  const [agents, setAgents] = useState([])
  const [streaming, setStreaming] = useState({})
  const [a2aMode, setA2aMode] = useState(null)  // { fromId } | null
  const [showSpawn, setShowSpawn] = useState(false)
  const [spawnForm, setSpawnForm] = useState({ name: '', type: 'subagent', specialty: 'medical' })

  const handleSpawn = async () => {
    const agent = await spawnAgent(spawnForm.name, spawnForm.type, spawnForm.specialty)
    setAgents(prev => [...prev, { ...agent, messages: [] }])
    setShowSpawn(false)
    setSpawnForm({ name: '', type: 'subagent', specialty: 'medical' })
  }

  const handleTerminate = async (agentId) => {
    await terminateAgent(agentId)
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status: 'complete' } : a))
  }

  const handleMessage = async (agentId, message) => {
    setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status: 'thinking' } : a))
    let full = ''
    for await (const event of streamAgentMessage(agentId, message)) {
      if (event.type === 'token') {
        full += event.data
        setStreaming(prev => ({ ...prev, [agentId]: full }))
      } else if (event.type === 'done') {
        onAgentMessage?.({ agentId, message: full })
        setAgents(prev => prev.map(a => a.id === agentId ? { ...a, status: 'idle' } : a))
        setStreaming(prev => { const n = { ...prev }; delete n[agentId]; return n })
      }
    }
  }

  const handleA2A = async (toId) => {
    if (!a2aMode) return
    const msg = `Analyze from your perspective and respond to: What is the most critical insight about CloneForge's healthcare AI approach?`
    for await (const event of streamAgentToAgent(a2aMode.fromId, toId, msg)) {
      if (event.type === 'token') {
        setStreaming(prev => ({ ...prev, [toId]: (prev[toId] || '') + event.data }))
      } else if (event.type === 'done') {
        setStreaming(prev => { const n = { ...prev }; delete n[toId]; return n })
      }
    }
    setA2aMode(null)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-300 tracking-widest uppercase">Agent Network</h2>
        <button
          onClick={() => setShowSpawn(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-300 text-xs hover:bg-blue-600/40 transition-colors"
        >
          <Plus size={12} /> Spawn Agent
        </button>
      </div>

      {/* Spawn form */}
      <AnimatePresence>
        {showSpawn && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-xl border border-blue-500/20 bg-slate-900/60 p-4 flex flex-col gap-3"
          >
            <input
              placeholder="Agent name (optional)"
              value={spawnForm.name}
              onChange={e => setSpawnForm(p => ({ ...p, name: e.target.value }))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              {['subagent', 'microagent', 'rogue'].map(t => (
                <button
                  key={t}
                  onClick={() => setSpawnForm(p => ({ ...p, type: t }))}
                  className={`flex-1 py-1.5 rounded-lg text-xs capitalize border transition-colors ${
                    spawnForm.type === t
                      ? 'border-blue-500 bg-blue-600/20 text-blue-300'
                      : 'border-slate-700 text-slate-400 hover:border-slate-500'
                  }`}
                >
                  {AGENT_COLORS[t].icon} {t}
                </button>
              ))}
            </div>
            <select
              value={spawnForm.specialty}
              onChange={e => setSpawnForm(p => ({ ...p, specialty: e.target.value }))}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none"
            >
              {['medical','research','financial','technical','legal','narrative'].map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <div className="flex gap-2">
              <button onClick={handleSpawn}
                className="flex-1 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-500 transition-colors">
                Spawn
              </button>
              <button onClick={() => setShowSpawn(false)}
                className="px-4 py-2 rounded-lg border border-slate-700 text-slate-400 text-sm hover:border-slate-500 transition-colors">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Agent cards */}
      <div className="flex flex-col gap-3">
        <AnimatePresence>
          {agents.map(agent => {
            const style = AGENT_COLORS[agent.type] || AGENT_COLORS.subagent
            return (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className={`rounded-xl border ${style.border}/30 bg-gradient-to-br ${style.bg} p-4 flex flex-col gap-3`}
              >
                {/* Agent header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{style.icon}</span>
                    <div>
                      <p className="text-sm font-medium text-slate-200">{agent.name}</p>
                      <p className="text-xs text-slate-400 capitalize">{agent.type} · {agent.specialty}</p>
                    </div>
                    <span className={`w-2 h-2 rounded-full ml-1 ${STATUS_DOT[agent.status] || 'bg-slate-500'}`} />
                  </div>
                  <div className="flex gap-1">
                    {a2aMode?.fromId !== agent.id && (
                      <button
                        onClick={() => setA2aMode(a2aMode ? null : { fromId: agent.id })}
                        title="Route message from this agent"
                        className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-cyan-300 transition-colors"
                      >
                        <ArrowRight size={13} />
                      </button>
                    )}
                    {a2aMode && a2aMode.fromId !== agent.id && (
                      <button
                        onClick={() => handleA2A(agent.id)}
                        title="Send agent-to-agent message here"
                        className="p-1.5 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-300 text-xs hover:bg-cyan-600/40 transition-colors"
                      >
                        <MessageSquare size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => handleTerminate(agent.id)}
                      className="p-1.5 rounded-lg hover:bg-white/10 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <X size={13} />
                    </button>
                  </div>
                </div>

                {/* Streaming output */}
                {streaming[agent.id] && (
                  <div className="text-xs text-slate-300 bg-black/20 rounded-lg p-3 max-h-32 overflow-y-auto leading-relaxed">
                    {streaming[agent.id]}
                    <span className="inline-block w-1 h-3 bg-blue-400 ml-0.5 animate-pulse" />
                  </div>
                )}

                {/* Quick action */}
                {agent.status !== 'complete' && (
                  <button
                    onClick={() => handleMessage(agent.id, 'What is your primary insight on CloneForge\'s healthcare AI value proposition?')}
                    className="text-xs text-slate-400 hover:text-slate-200 border border-slate-700/50 hover:border-slate-500 rounded-lg py-1.5 transition-colors"
                  >
                    Query agent
                  </button>
                )}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {agents.length === 0 && (
          <p className="text-xs text-slate-600 text-center py-6">No agents spawned yet.<br />Spawn a subagent, microagent, or rogue.</p>
        )}
      </div>

      {a2aMode && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-xs text-cyan-400 text-center bg-cyan-900/20 border border-cyan-500/20 rounded-lg py-2 px-3">
          Select target agent to route message → or <button onClick={() => setA2aMode(null)} className="underline hover:text-cyan-200">cancel</button>
        </motion.div>
      )}
    </div>
  )
}
