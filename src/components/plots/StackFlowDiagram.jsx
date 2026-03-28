import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'

// ── Infrastructure definitions ────────────────────────────────────────────────
const TIERS = [
  {
    id: 'client',
    label: 'CLIENT',
    region: 'User Device · Browser',
    color: '#06b6d4',
    nodes: [
      { id: 'browser',  label: 'Browser',         sub: 'Chrome / Safari / Firefox', color: '#06b6d4' },
      { id: 'speech',   label: 'Web Speech API',  sub: 'STT · AudioContext',         color: '#0ea5e9' },
    ],
    activeOn: { listening: ['browser','speech'], thinking: ['browser'], speaking: ['browser','speech'] },
  },
  {
    id: 'edge',
    label: 'EDGE',
    region: 'Global CDN',
    color: '#94a3b8',
    nodes: [
      { id: 'vercel_corp', label: 'Vercel',      sub: 'cloneforge-corporation.ai', color: '#e2e8f0' },
      { id: 'vercel_clin', label: 'Vercel',      sub: 'cloneforge.io',             color: '#e2e8f0' },
      { id: 'cloudflare',  label: 'Cloudflare',  sub: 'TLS · Proxy · DDoS',        color: '#f97316' },
    ],
    activeOn: { listening: [], thinking: ['vercel_corp','cloudflare'], speaking: ['cloudflare','vercel_corp'] },
  },
  {
    id: 'compute',
    label: 'COMPUTE',
    region: 'Digital Ocean App Platform · NYC',
    color: '#8b5cf6',
    nodes: [
      { id: 'brain', label: 'Oriel4o Brain API', sub: 'FastAPI · uvicorn · professional-xs · 512 MB', color: '#8b5cf6', wide: true },
    ],
    routes: ['/chat/stream', '/agents/{id}/message', '/voice/synthesize', '/clinical/consult', '/ledger/stats', '/ingest/urls'],
    activeOn: { listening: [], thinking: ['brain'], speaking: ['brain'] },
  },
  {
    id: 'data',
    label: 'DATA & AI',
    region: 'Cloud Services',
    color: '#475569',
    nodes: [
      { id: 'qdrant',     label: 'Qdrant Cloud',   sub: 'GCP us-east4\n3 cols · 384-dim',        color: '#f59e0b',
        activeOn: { listening: false, thinking: true, speaking: false } },
      { id: 'postgres',   label: 'Postgres',        sub: 'DO Managed DB\nsessions · ledger',       color: '#3b82f6',
        activeOn: { listening: false, thinking: true, speaking: false } },
      { id: 'cerebras',   label: 'Cerebras Cloud',  sub: 'Qwen3-235B-A22B\n~800 tok/s',            color: '#10b981',
        activeOn: { listening: false, thinking: true, speaking: false } },
      { id: 'elevenlabs', label: 'ElevenLabs',      sub: 'multilingual_v2\n20+ voices · MP3',     color: '#f43f5e',
        activeOn: { listening: false, thinking: false, speaking: true } },
    ],
  },
]

const CONN_LABELS = {
  'client→edge':   { thinking: 'HTTPS POST /chat/stream', speaking: 'audio b64 ← SSE', listening: 'n/a' },
  'edge→compute':  { thinking: 'REST + SSE · X-Brain-Key', speaking: 'MP3 stream ←', listening: 'n/a' },
  'compute→data':  { thinking: 'embed+search · SQL · infer', speaking: 'TTS text →', listening: 'n/a' },
}

// ── Node card ─────────────────────────────────────────────────────────────────
function ServiceNode({ node, active, compact }) {
  const s = node.sub.split('\n')
  return (
    <motion.div
      animate={{ opacity: active ? 1 : 0.3, scale: active ? 1 : 0.97 }}
      transition={{ duration: 0.2 }}
      className={`flex flex-col items-center rounded-lg border text-center flex-shrink-0 ${
        compact ? 'px-2 py-1.5 min-w-[72px]' : 'px-3 py-2 min-w-[90px]'
      } ${node.wide ? 'flex-1' : ''}`}
      style={{
        borderColor: active ? node.color + '80' : '#1e293b',
        background:  active ? node.color + '18' : 'rgba(8,15,30,0.6)',
        boxShadow:   active ? `0 0 14px ${node.color}28` : 'none',
      }}
    >
      <span className={`font-semibold leading-tight ${compact ? 'text-[9px]' : 'text-xs'}`}
        style={{ color: active ? node.color : '#334155' }}>
        {node.label}
      </span>
      {s.map((line, i) => (
        <span key={i} className={`leading-tight mt-0.5 ${compact ? 'text-[7px] text-slate-700' : 'text-[9px] text-slate-600'}`}>
          {line}
        </span>
      ))}
      {active && (
        <motion.div className="w-1 h-1 rounded-full mt-1"
          animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.55, repeat: Infinity }}
          style={{ background: node.color }} />
      )}
    </motion.div>
  )
}

// ── Connector between tiers ───────────────────────────────────────────────────
function TierConnector({ label, active, color }) {
  return (
    <div className="flex flex-col items-center py-0.5">
      <motion.div className="h-4 w-px" animate={{ opacity: active ? 1 : 0.15 }}
        style={{ background: active ? color : '#1e293b' }} />
      {label && (
        <motion.span className="text-[7px] font-mono px-1.5 py-0.5 rounded my-0.5 text-center max-w-[160px]"
          animate={{ opacity: active ? 0.9 : 0.15 }}
          style={{ color, background: active ? color + '15' : 'transparent' }}>
          {label}
        </motion.span>
      )}
      <motion.div className="h-4 w-px" animate={{ opacity: active ? 1 : 0.15 }}
        style={{ background: active ? color : '#1e293b' }} />
      <div className="w-0 h-0 border-x-[3px] border-t-[5px] border-x-transparent"
        style={{ borderTopColor: active ? color : '#1e293b', opacity: active ? 1 : 0.15 }} />
    </div>
  )
}

// ── State indicator strip ─────────────────────────────────────────────────────
const STATE_CONFIG = {
  idle:      { label: 'IDLE',                       color: '#334155' },
  listening: { label: 'LISTENING — capturing voice', color: '#06b6d4' },
  thinking:  { label: 'THINKING — RAG + LLM',        color: '#8b5cf6' },
  speaking:  { label: 'SPEAKING — TTS synthesis',    color: '#10b981' },
}

// ── Main diagram ──────────────────────────────────────────────────────────────
function DiagramContent({ orbState, compact = false }) {
  const sc = STATE_CONFIG[orbState] || STATE_CONFIG.idle

  const isNodeActive = (node, tier) => {
    if (tier.activeOn) {
      const active = tier.activeOn[orbState]
      if (Array.isArray(active)) return active.includes(node.id)
      return false
    }
    // Data-tier nodes have their own activeOn
    return node.activeOn?.[orbState] ?? false
  }

  const connActive = (key) => orbState !== 'idle'

  const connLabel = (key) => {
    if (orbState === 'idle') return null
    return CONN_LABELS[key]?.[orbState] ?? null
  }

  return (
    <div className="flex flex-col">
      {/* State badge */}
      <div className="flex items-center justify-between mb-3">
        <span className={`font-mono tracking-widest uppercase ${compact ? 'text-[8px] text-slate-600' : 'text-[10px] text-slate-500'}`}>
          CloneForge Full Stack
        </span>
        <motion.span key={orbState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`font-mono font-semibold px-2 py-0.5 rounded-full ${compact ? 'text-[8px]' : 'text-[10px]'}`}
          style={{ color: sc.color, background: sc.color + '15', border: `1px solid ${sc.color}30` }}>
          {sc.label}
        </motion.span>
      </div>

      {TIERS.map((tier, ti) => (
        <div key={tier.id}>
          {/* Tier label */}
          <div className="flex items-center gap-2 mb-1.5">
            <div className="h-px flex-1" style={{ background: tier.color + '30' }} />
            <span className={`font-mono tracking-widest ${compact ? 'text-[7px]' : 'text-[9px]'}`}
              style={{ color: tier.color + 'aa' }}>
              {tier.label} · {tier.region}
            </span>
            <div className="h-px flex-1" style={{ background: tier.color + '30' }} />
          </div>

          {/* Tier nodes */}
          <div className={`flex items-stretch gap-1.5 mb-1 ${tier.id === 'compute' ? 'flex-col' : 'flex-wrap'}`}>
            {tier.nodes.map(node => (
              <ServiceNode key={node.id} node={node} active={isNodeActive(node, tier)} compact={compact} />
            ))}
            {/* Routes badge for compute tier */}
            {tier.routes && (
              <div className="flex flex-wrap gap-1 mt-1">
                {tier.routes.map(r => (
                  <span key={r} className={`font-mono px-1.5 py-0.5 rounded border ${compact ? 'text-[6px]' : 'text-[8px]'}`}
                    style={{
                      color: orbState === 'thinking' || orbState === 'speaking' ? '#8b5cf6' : '#334155',
                      borderColor: orbState === 'thinking' || orbState === 'speaking' ? '#8b5cf640' : '#1e293b',
                      background: orbState === 'thinking' || orbState === 'speaking' ? '#8b5cf610' : 'transparent',
                    }}>
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Connector to next tier */}
          {ti < TIERS.length - 1 && (
            <TierConnector
              label={connLabel(ti === 0 ? 'client→edge' : ti === 1 ? 'edge→compute' : 'compute→data')}
              active={connActive(ti === 0 ? 'client→edge' : ti === 1 ? 'edge→compute' : 'compute→data')}
              color={TIERS[ti + 1].color}
            />
          )}
        </div>
      ))}

      {/* Legend */}
      <div className={`mt-3 flex flex-wrap gap-2 border-t border-slate-800/30 pt-2 ${compact ? 'gap-1.5' : 'gap-2'}`}>
        {[
          { color: '#06b6d4', label: 'Client / Voice' },
          { color: '#e2e8f0', label: 'Vercel Edge' },
          { color: '#f97316', label: 'Cloudflare' },
          { color: '#8b5cf6', label: 'DO Brain API' },
          { color: '#f59e0b', label: 'Qdrant' },
          { color: '#3b82f6', label: 'Postgres' },
          { color: '#10b981', label: 'Cerebras' },
          { color: '#f43f5e', label: 'ElevenLabs' },
        ].map(({ color, label }) => (
          <span key={label} className={`flex items-center gap-1 ${compact ? 'text-[7px]' : 'text-[8px]'} text-slate-600`}>
            <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Expanded modal ────────────────────────────────────────────────────────────
function ExpandedModal({ orbState, onClose }) {
  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ background: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(8px)' }}
      >
        <motion.div
          className="bg-[#060f1e] border border-slate-700/60 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-semibold text-slate-200 tracking-wide">CloneForge Infrastructure Stack</span>
            <button onClick={onClose} className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
              <X size={16} />
            </button>
          </div>
          <DiagramContent orbState={orbState} compact={false} />
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  )
}

// ── Public component ──────────────────────────────────────────────────────────
export default function StackFlowDiagram({ orbState = 'idle' }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <>
      <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] text-slate-600 tracking-widest uppercase font-mono">Infrastructure Stack</span>
          <button onClick={() => setExpanded(true)}
            className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
            title="Expand diagram">
            <Maximize2 size={11} />
          </button>
        </div>
        <DiagramContent orbState={orbState} compact={true} />
      </div>

      {expanded && <ExpandedModal orbState={orbState} onClose={() => setExpanded(false)} />}
    </>
  )
}
