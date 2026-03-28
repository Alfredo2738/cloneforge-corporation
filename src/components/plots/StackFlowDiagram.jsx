import { useState, useEffect } from 'react'
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
      { id: 'browser', label: 'Browser',        sub: 'Chrome / Safari / Firefox', color: '#06b6d4' },
      { id: 'speech',  label: 'Web Speech API', sub: 'STT · AudioContext',         color: '#0ea5e9' },
    ],
    activeOn: { listening: ['browser','speech'], thinking: ['browser'], speaking: ['browser','speech'] },
  },
  {
    id: 'edge',
    label: 'EDGE',
    region: 'Global CDN',
    color: '#94a3b8',
    nodes: [
      { id: 'vercel_corp', label: 'Vercel',     sub: 'cloneforge-corporation.ai', color: '#e2e8f0' },
      { id: 'vercel_clin', label: 'Vercel',     sub: 'cloneforge.io',             color: '#e2e8f0' },
      { id: 'cloudflare',  label: 'Cloudflare', sub: 'TLS · Proxy · DDoS',        color: '#f97316' },
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
      { id: 'qdrant',     label: 'Qdrant Cloud',  sub: 'GCP us-east4\n3 cols · 384-dim',    color: '#f59e0b',
        activeOn: { listening: false, thinking: true,  speaking: false } },
      { id: 'postgres',   label: 'Postgres',       sub: 'DO Managed DB\nsessions · ledger',  color: '#3b82f6',
        activeOn: { listening: false, thinking: true,  speaking: false } },
      { id: 'cerebras',   label: 'Cerebras Cloud', sub: 'Qwen3-235B-A22B\n~800 tok/s',       color: '#10b981',
        activeOn: { listening: false, thinking: true,  speaking: false } },
      { id: 'elevenlabs', label: 'ElevenLabs',     sub: 'multilingual_v2\n20+ voices · MP3', color: '#f43f5e',
        activeOn: { listening: false, thinking: false, speaking: true  } },
    ],
  },
]

const CONN_LABELS = {
  'client→edge':  { thinking: 'HTTPS POST /chat/stream', speaking: 'audio b64 ← SSE',        listening: 'n/a' },
  'edge→compute': { thinking: 'REST + SSE · X-Brain-Key', speaking: 'MP3 stream ←',           listening: 'n/a' },
  'compute→data': { thinking: 'embed+search · SQL · infer', speaking: 'TTS text →',           listening: 'n/a' },
}

const STATE_CONFIG = {
  idle:      { label: 'IDLE',                        color: '#475569' },
  listening: { label: 'LISTENING — capturing voice',  color: '#06b6d4' },
  thinking:  { label: 'THINKING — RAG + LLM',         color: '#8b5cf6' },
  speaking:  { label: 'SPEAKING — TTS synthesis',     color: '#10b981' },
}

// ── Node card ─────────────────────────────────────────────────────────────────
function ServiceNode({ node, active, expanded }) {
  const s = node.sub.split('\n')

  const labelSize  = expanded ? 'text-sm'     : 'text-[10px]'
  const subSize    = expanded ? 'text-xs'     : 'text-[9px]'
  const subColor   = active
    ? (expanded ? '#cbd5e1' : '#94a3b8')
    : (expanded ? '#475569' : '#334155')
  const labelColor = active ? node.color : (expanded ? '#334155' : '#1e293b')
  const minW       = expanded ? 'min-w-[120px]' : 'min-w-[80px]'
  const pad        = expanded ? 'px-4 py-3'     : 'px-2 py-1.5'

  return (
    <motion.div
      animate={{ opacity: active ? 1 : (expanded ? 0.45 : 0.3), scale: active ? 1 : 0.97 }}
      transition={{ duration: 0.2 }}
      className={`flex flex-col items-center rounded-lg border text-center flex-shrink-0 ${pad} ${minW} ${node.wide ? 'flex-1' : ''}`}
      style={{
        borderColor: active ? node.color + '90' : (expanded ? '#1e3a5f' : '#1e293b'),
        background:  active ? node.color + '22' : (expanded ? 'rgba(8,20,50,0.8)' : 'rgba(8,15,30,0.6)'),
        boxShadow:   active ? `0 0 ${expanded ? 24 : 14}px ${node.color}40` : 'none',
      }}
    >
      <span className={`font-bold font-mono leading-tight ${labelSize}`}
        style={{ color: labelColor }}>
        {node.label}
      </span>
      {s.map((line, i) => (
        <span key={i} className={`font-mono leading-snug mt-0.5 ${subSize}`}
          style={{ color: subColor }}>
          {line}
        </span>
      ))}
      {active && (
        <motion.div className={`rounded-full mt-1.5 ${expanded ? 'w-2 h-2' : 'w-1 h-1'}`}
          animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.55, repeat: Infinity }}
          style={{ background: node.color, boxShadow: `0 0 6px ${node.color}` }} />
      )}
    </motion.div>
  )
}

// ── Connector between tiers ───────────────────────────────────────────────────
function TierConnector({ label, active, color, expanded }) {
  const labelSize = expanded ? 'text-xs' : 'text-[7px]'
  return (
    <div className={`flex flex-col items-center ${expanded ? 'py-2' : 'py-0.5'}`}>
      <motion.div className={`w-px ${expanded ? 'h-8' : 'h-4'}`} animate={{ opacity: active ? 1 : 0.15 }}
        style={{ background: active ? color : '#1e3a5f' }} />
      {label && (
        <motion.span
          className={`${labelSize} font-mono px-2 py-0.5 rounded my-1 text-center max-w-[280px] tracking-wide`}
          animate={{ opacity: active ? 1 : 0.15 }}
          style={{
            color,
            background: active ? color + '20' : 'transparent',
            border: active ? `1px solid ${color}40` : 'none',
            textShadow: active && expanded ? `0 0 8px ${color}` : 'none',
          }}>
          {label}
        </motion.span>
      )}
      <motion.div className={`w-px ${expanded ? 'h-8' : 'h-4'}`} animate={{ opacity: active ? 1 : 0.15 }}
        style={{ background: active ? color : '#1e3a5f' }} />
      <div className={`w-0 h-0 border-x-transparent ${expanded ? 'border-x-[5px] border-t-[8px]' : 'border-x-[3px] border-t-[5px]'}`}
        style={{ borderTopColor: active ? color : '#1e3a5f', opacity: active ? 1 : 0.15 }} />
    </div>
  )
}

// ── Main diagram ──────────────────────────────────────────────────────────────
function DiagramContent({ orbState, compact = false, expanded = false }) {
  const sc = STATE_CONFIG[orbState] || STATE_CONFIG.idle

  const isNodeActive = (node, tier) => {
    if (tier.activeOn) {
      const active = tier.activeOn[orbState]
      return Array.isArray(active) ? active.includes(node.id) : false
    }
    return node.activeOn?.[orbState] ?? false
  }

  const connActive = () => orbState !== 'idle'
  const connLabel  = (key) => orbState === 'idle' ? null : (CONN_LABELS[key]?.[orbState] ?? null)

  // Text sizing based on context
  const headerSize   = expanded ? 'text-sm'     : (compact ? 'text-[10px]' : 'text-xs')
  const stateBadge   = expanded ? 'text-sm'     : (compact ? 'text-[8px]'  : 'text-[10px]')
  const tierLabel    = expanded ? 'text-sm'     : (compact ? 'text-[9px]'  : 'text-[10px]')
  const routeSize    = expanded ? 'text-xs'     : (compact ? 'text-[8px]'  : 'text-[9px]')
  const legendSize   = expanded ? 'text-xs'     : (compact ? 'text-[9px]'  : 'text-[10px]')

  // Active route color
  const routeActive  = orbState === 'thinking' || orbState === 'speaking'
  const routeColor   = routeActive ? '#a78bfa' : (expanded ? '#334155' : '#1e293b')
  const routeBorder  = routeActive ? '#7c3aed60' : (expanded ? '#1e3a5f' : '#1e293b')
  const routeBg      = routeActive ? '#6d28d915' : 'transparent'

  return (
    <div className="flex flex-col">
      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <span className={`font-mono tracking-widest uppercase ${headerSize}`}
          style={{ color: expanded ? '#64748b' : '#475569' }}>
          CloneForge Full Stack
        </span>
        <motion.span key={orbState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`font-mono font-bold px-3 py-1 rounded-full ${stateBadge}`}
          style={{
            color: sc.color,
            background: sc.color + '18',
            border: `1px solid ${sc.color}50`,
            textShadow: expanded ? `0 0 8px ${sc.color}` : 'none',
          }}>
          {sc.label}
        </motion.span>
      </div>

      {TIERS.map((tier, ti) => (
        <div key={tier.id}>
          {/* Tier header */}
          <div className="flex items-center gap-2 mb-2">
            <div className="h-px flex-1" style={{ background: tier.color + (expanded ? '50' : '30') }} />
            <span className={`font-mono font-semibold tracking-widest ${tierLabel}`}
              style={{
                color: expanded ? tier.color : tier.color + 'aa',
                textShadow: expanded ? `0 0 10px ${tier.color}80` : 'none',
              }}>
              {tier.label} · {tier.region}
            </span>
            <div className="h-px flex-1" style={{ background: tier.color + (expanded ? '50' : '30') }} />
          </div>

          {/* Nodes */}
          <div className={`flex items-stretch gap-2 mb-2 ${tier.id === 'compute' ? 'flex-col' : 'flex-wrap'}`}>
            {tier.nodes.map(node => (
              <ServiceNode key={node.id} node={node} active={isNodeActive(node, tier)} expanded={expanded} />
            ))}

            {/* Route badges */}
            {tier.routes && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {tier.routes.map(r => (
                  <span key={r}
                    className={`font-mono px-2 py-0.5 rounded border ${routeSize}`}
                    style={{ color: routeColor, borderColor: routeBorder, background: routeBg,
                      textShadow: routeActive && expanded ? `0 0 6px #7c3aed` : 'none' }}>
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
              active={connActive()}
              color={TIERS[ti + 1].color}
              expanded={expanded}
            />
          )}
        </div>
      ))}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3 border-t pt-3"
        style={{ borderColor: expanded ? '#1e3a5f' : '#1e293b50' }}>
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
          <span key={label} className={`flex items-center gap-1.5 font-mono ${legendSize}`}
            style={{ color: expanded ? '#64748b' : '#475569' }}>
            <span className={`rounded-full flex-shrink-0 ${expanded ? 'w-2.5 h-2.5' : 'w-1.5 h-1.5'}`}
              style={{ background: color, boxShadow: expanded ? `0 0 6px ${color}` : 'none' }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Expanded modal ────────────────────────────────────────────────────────────
function ExpandedModal({ orbState, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex flex-col"
        style={{ background: '#020812' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Terminal-style header bar */}
        <div className="flex items-center justify-between px-8 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid #0ea5e930', background: 'rgba(6,182,212,0.04)' }}>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-500/80" />
              <div className="w-3 h-3 rounded-full bg-amber-400/80" />
              <div className="w-3 h-3 rounded-full bg-green-400/80" />
            </div>
            <span className="text-base font-mono font-semibold tracking-widest uppercase"
              style={{ color: '#06b6d4', textShadow: '0 0 12px #06b6d4' }}>
              CloneForge Infrastructure Stack
            </span>
          </div>
          <button onClick={onClose}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg font-mono text-sm transition-colors"
            style={{ color: '#475569', border: '1px solid #1e3a5f' }}
            onMouseEnter={e => { e.currentTarget.style.color = '#06b6d4'; e.currentTarget.style.borderColor = '#06b6d490' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#475569'; e.currentTarget.style.borderColor = '#1e3a5f' }}>
            <X size={14} /> ESC
          </button>
        </div>

        {/* Diagram content */}
        <div className="flex-1 overflow-y-auto p-10 max-w-5xl mx-auto w-full">
          <DiagramContent orbState={orbState} compact={false} expanded={true} />
        </div>
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
          <span className="text-[10px] text-slate-500 tracking-widest uppercase font-mono">Infrastructure Stack</span>
          <button onClick={() => setExpanded(true)}
            className="p-1 rounded text-slate-600 hover:text-slate-300 hover:bg-slate-800/60 transition-colors"
            title="Expand diagram">
            <Maximize2 size={11} />
          </button>
        </div>
        <DiagramContent orbState={orbState} compact={true} expanded={false} />
      </div>

      {expanded && <ExpandedModal orbState={orbState} onClose={() => setExpanded(false)} />}
    </>
  )
}
