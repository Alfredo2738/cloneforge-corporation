import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Maximize2, X } from 'lucide-react'
import Plot from 'react-plotly.js'
import { getBrainStatus, listAgents, getLedgerStats } from '../../api/brain'

// ── Expandable chart panel wrapper ────────────────────────────────────────────
function ChartPanel({ title, children, expandedChildren }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-2 relative group">
        <button
          onClick={() => setExpanded(true)}
          className="absolute top-2 right-2 p-1 rounded opacity-0 group-hover:opacity-100 text-slate-600 hover:text-slate-300 hover:bg-slate-800/60 transition-all z-10"
          title={`Expand ${title}`}
        >
          <Maximize2 size={11} />
        </button>
        {children}
      </div>
      {expanded && createPortal(
        <AnimatePresence>
          <motion.div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setExpanded(false)}
            style={{ background: 'rgba(2,6,23,0.92)', backdropFilter: 'blur(8px)' }}
          >
            <motion.div
              className="bg-[#060f1e] border border-slate-700/60 rounded-2xl p-5 w-full max-w-4xl shadow-2xl"
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-semibold text-slate-200 tracking-wide">{title}</span>
                <button onClick={() => setExpanded(false)} className="p-1 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors">
                  <X size={16} />
                </button>
              </div>
              {expandedChildren || children}
            </motion.div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}

// ── Shared theme ─────────────────────────────────────────────────────────────
const T = {
  paper: 'rgba(0,0,0,0)',
  plot:  'rgba(0,0,0,0)',
  font:  { color: '#94a3b8', family: 'Inter, system-ui, monospace', size: 11 },
  grid:  '#1e293b',
  zero:  '#334155',
  tick:  { color: '#64748b', size: 10 },
}

const layout = (overrides = {}) => ({
  paper_bgcolor: T.paper,
  plot_bgcolor:  T.plot,
  font:          T.font,
  margin:        { t: 36, b: 40, l: 48, r: 16 },
  xaxis: { gridcolor: T.grid, zerolinecolor: T.zero, tickfont: T.tick },
  yaxis: { gridcolor: T.grid, zerolinecolor: T.zero, tickfont: T.tick },
  ...overrides,
})

const cfg = { displayModeBar: false, responsive: true }

// ── Colour palette ────────────────────────────────────────────────────────────
const C = {
  blue:    '#3b82f6',
  purple:  '#8b5cf6',
  cyan:    '#06b6d4',
  amber:   '#f59e0b',
  green:   '#10b981',
  rose:    '#f43f5e',
  slate:   '#475569',
  blueL:   '#93c5fd',
  purpleL: '#c4b5fd',
  cyanL:   '#67e8f9',
}

// ── System Vitals header ──────────────────────────────────────────────────────
function SystemVitals({ status, ledger, lastUpdate }) {
  const model    = status?.model || '—'
  const cfu      = ledger?.balances?.us_master?.toLocaleString() ?? '—'
  const chainLen = ledger?.chain_length ?? 0
  const qdrantOk = status?.qdrant?.collections !== undefined

  const pill = (label, val, color) => (
    <div className="flex flex-col items-start bg-slate-900/70 border border-slate-800/60 rounded-lg px-3 py-2 min-w-0">
      <span className="text-[10px] text-slate-500 tracking-widest uppercase mb-0.5">{label}</span>
      <span className="text-sm font-mono font-semibold truncate" style={{ color }}>{val}</span>
    </div>
  )

  return (
    <div className="grid grid-cols-2 gap-1.5 mb-1">
      {pill('Model', model.replace('qwen-3-', 'Qwen3-').replace('-instruct-2507', ''), C.blueL)}
      {pill('Qdrant', qdrantOk ? 'MESH LIVE' : 'OFFLINE', qdrantOk ? C.green : C.rose)}
      {pill('CFU Balance', cfu, C.amber)}
      {pill('Chain Tx', chainLen, C.cyan)}
    </div>
  )
}

// ── Neural Wave (animated) ────────────────────────────────────────────────────
function NeuralWave({ tick, orbState, expanded }) {
  const n = 150
  const t = Array.from({ length: n }, (_, i) => i / 15)
  const phase = tick * 0.28

  // Amplitude varies by orbState to reflect activity level
  const amp = orbState === 'speaking' ? 1.1 : orbState === 'thinking' ? 0.9 : orbState === 'listening' ? 0.7 : 0.5

  const wave1 = t.map(x => amp * (Math.sin(x + phase) * 0.7 + Math.sin(2.7 * x + phase * 0.6) * 0.25))
  const wave2 = t.map(x => amp * 0.75 * Math.cos(x * 1.4 + phase * 1.05))
  const wave3 = t.map(x => amp * 0.45 * (Math.sin(x * 0.6 + phase * 0.35) + Math.random() * 0.06))

  const stateColor = orbState === 'speaking' ? C.green : orbState === 'thinking' ? C.purple : orbState === 'listening' ? C.cyan : C.blue

  return (
    <Plot
      data={[
        { x: t, y: wave1, type: 'scatter', mode: 'lines', line: { color: stateColor, width: 2 }, name: 'Oriel Signal' },
        { x: t, y: wave2, type: 'scatter', mode: 'lines', line: { color: C.purple, width: 1.5, dash: 'dot' }, name: 'Mesh Echo' },
        { x: t, y: wave3, type: 'scatter', mode: 'lines', line: { color: C.cyan, width: 1, dash: 'dash' }, name: 'RAG Pulse' },
      ]}
      layout={layout({
        title: { text: 'Brain Activity — Live Signal', font: { color: '#cbd5e1', size: 12 } },
        showlegend: true,
        legend: { font: { color: '#64748b', size: 9 }, bgcolor: 'rgba(0,0,0,0)', orientation: 'h', x: 0, y: 1.18 },
        height: expanded ? 400 : 190,
        yaxis: { ...layout().yaxis, range: [-1.5, 1.5], title: { text: 'Amplitude', font: { size: 9 }, standoff: 4 } },
        xaxis: { ...layout().xaxis, showticklabels: false, title: { text: 'Time →', font: { size: 9 }, standoff: 0 } },
        margin: { t: 44, b: 24, l: 44, r: 12 },
      })}
      config={cfg}
      style={{ width: '100%' }}
    />
  )
}

// ── Qdrant Mesh Chart ─────────────────────────────────────────────────────────
function QdrantChart({ collections, expanded }) {
  const labels  = Object.keys(collections)
  const points  = labels.map(k => collections[k]?.points || 0)
  const indexed = labels.map(k => collections[k]?.indexed_vectors || 0)
  const clean   = labels.map(l => l.replace('cloneforge_', '').replace('_', ' '))

  return (
    <Plot
      data={[
        {
          name: 'Points',
          type: 'bar', x: clean, y: points,
          marker: { color: C.blue, opacity: 0.9 },
          text: points.map(v => v > 0 ? String(v) : '0'),
          textposition: 'outside',
          textfont: { color: C.blueL, size: 10 },
        },
        {
          name: 'Indexed',
          type: 'bar', x: clean, y: indexed,
          marker: { color: C.purple, opacity: 0.65 },
        },
      ]}
      layout={layout({
        barmode: 'group',
        title: { text: 'Qdrant Mesh — Collections', font: { color: '#cbd5e1', size: 12 } },
        legend: { font: { color: '#64748b', size: 9 }, bgcolor: 'rgba(0,0,0,0)', x: 0.55, y: 1.18, orientation: 'h' },
        height: expanded ? 440 : 220,
        margin: { t: 44, b: 48, l: 40, r: 12 },
        xaxis: { ...layout().xaxis, tickangle: -15, tickfont: { color: '#94a3b8', size: 10 } },
        yaxis: { ...layout().yaxis, title: { text: 'Count', font: { size: 9 }, standoff: 4 } },
      })}
      config={cfg}
      style={{ width: '100%' }}
    />
  )
}

// ── Attention Heatmap ─────────────────────────────────────────────────────────
function AttentionHeatmap({ tick, expanded }) {
  const layers = 8, heads = 12
  const phase = tick * 0.18
  const z = Array.from({ length: layers }, (_, l) =>
    Array.from({ length: heads }, (_, h) =>
      Math.abs(Math.sin((l * 0.9 + h * 0.5 + phase) * 0.65)) * 0.85 + Math.random() * 0.15
    )
  )
  return (
    <Plot
      data={[{
        type: 'heatmap', z,
        colorscale: [[0,'#0f172a'],[0.25,'#1e3a5f'],[0.55,'#2563eb'],[0.8,'#60a5fa'],[1,'#e0f2fe']],
        showscale: true,
        colorbar: { thickness: 8, len: 0.8, tickfont: { color: '#475569', size: 8 }, outlinewidth: 0 },
        xgap: 1.5, ygap: 1.5,
        hovertemplate: 'Layer %{y} | Head %{x}<br>Activation: %{z:.2f}<extra></extra>',
      }]}
      layout={layout({
        title: { text: 'Attention Activation (8L × 12H)', font: { color: '#cbd5e1', size: 12 } },
        height: expanded ? 440 : 220,
        margin: { t: 36, b: 36, l: 40, r: 40 },
        xaxis: { ...layout().xaxis, title: { text: 'Attention Head', font: { size: 9 }, standoff: 4 } },
        yaxis: { ...layout().yaxis, title: { text: 'Layer', font: { size: 9 }, standoff: 4 } },
      })}
      config={cfg}
      style={{ width: '100%' }}
    />
  )
}

// ── Message Activity ──────────────────────────────────────────────────────────
function MessageActivity({ messageHistory, expanded }) {
  const empty = !messageHistory?.length
  const hours  = empty ? Array.from({ length: 24 }, (_, i) => i) : messageHistory.map(r => r.hour % 24)
  const counts = empty ? Array(24).fill(0) : messageHistory.map(r => r.count)

  return (
    <Plot
      data={[{
        x: hours, y: counts, type: 'scatter', mode: 'lines+markers',
        fill: 'tozeroy',
        line: { color: C.blue, width: 2.5, shape: 'spline' },
        marker: { color: C.blueL, size: 5, line: { color: C.blue, width: 1 } },
        fillcolor: 'rgba(59,130,246,0.10)',
        name: 'Messages',
        hovertemplate: 'Hour %{x}:00 UTC<br>%{y} messages<extra></extra>',
      }]}
      layout={layout({
        title: { text: 'Message Activity — Last 24 h', font: { color: '#cbd5e1', size: 12 } },
        height: expanded ? 400 : 190,
        margin: { t: 36, b: 44, l: 48, r: 12 },
        xaxis: { ...layout().xaxis, title: { text: 'Hour (UTC)', font: { size: 9 }, standoff: 4 }, dtick: 4, range: [-0.5, 23.5] },
        yaxis: { ...layout().yaxis, title: { text: 'Messages', font: { size: 9 }, standoff: 4 }, rangemode: 'nonnegative' },
      })}
      config={cfg}
      style={{ width: '100%' }}
    />
  )
}

// ── Postgres Stats ────────────────────────────────────────────────────────────
function PostgresStats({ pg }) {
  if (!pg || pg.error) {
    return (
      <div className="flex items-center justify-center h-16 text-xs text-slate-600">
        {pg?.error ? `DB: ${pg.error.slice(0, 80)}` : 'Connecting to Postgres…'}
      </div>
    )
  }

  const stats = [
    { label: 'Sessions',   val: pg.sessions,         color: C.blue   },
    { label: 'Messages',   val: pg.messages,          color: C.purple },
    { label: 'Facts',      val: pg.facts,             color: C.cyan   },
    { label: 'Agent Logs', val: pg.agent_logs,        color: C.amber  },
    { label: 'Clinical',   val: pg.clinical_sessions, color: C.green  },
  ]

  return (
    <div>
      <p className="text-[10px] text-slate-500 mb-2 tracking-widest uppercase font-semibold">Postgres — Live Row Counts</p>
      <div className="grid grid-cols-5 gap-1">
        {stats.map(s => (
          <div key={s.label} className="flex flex-col items-center bg-slate-950/60 rounded-lg py-2 px-1 border border-slate-800/50">
            <span className="text-sm font-bold font-mono" style={{ color: s.color }}>{s.val ?? '—'}</span>
            <span className="text-[10px] text-slate-500 mt-0.5 text-center leading-tight">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Forge Ledger ──────────────────────────────────────────────────────────────
function ForgeLedger({ ledger }) {
  if (!ledger) return (
    <div className="text-xs text-slate-700 text-center py-3">Loading ledger…</div>
  )

  const balances = ledger.balances || {}
  const nodes    = ledger.nodes    || {}
  const labels   = Object.keys(balances).filter(k => balances[k] !== 0 || nodes[k]?.active)
  const values   = labels.map(k => Math.max(balances[k] || 0, 0))
  const total    = values.reduce((a, b) => a + b, 0)

  return (
    <div>
      <p className="text-[10px] text-slate-500 mb-2 tracking-widest uppercase font-semibold">Forge Ledger — CFU Balances</p>
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          {labels.map((k, i) => {
            const pct  = total > 0 ? (values[i] / total) * 100 : 0
            const node = nodes[k] || {}
            const active = node.active
            return (
              <div key={k} className="flex items-center gap-2 mb-1.5">
                <span className={`text-[10px] w-20 truncate font-mono ${active ? 'text-slate-300' : 'text-slate-600'}`}>{k}</span>
                <div className="flex-1 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{
                    width: `${pct}%`,
                    background: active ? C.amber : C.slate,
                    opacity: active ? 1 : 0.4,
                  }} />
                </div>
                <span className="text-[10px] font-mono text-slate-500 w-16 text-right">{values[i].toLocaleString()}</span>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-[10px] text-slate-600 font-mono border-t border-slate-800/40 pt-1.5">
        <span>CHAIN: {ledger.chain_length} TX</span>
        <span className="truncate">HEAD: {ledger.head_hash}</span>
      </div>
    </div>
  )
}

// ── Agent Network ─────────────────────────────────────────────────────────────
function AgentNetwork({ liveAgents }) {
  const counts = { master: 0, subagent: 0, microagent: 0, rogue: 0 }
  liveAgents.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1 })
  const labels = Object.keys(counts)
  const values = Object.values(counts)
  const total  = values.reduce((a, b) => a + b, 0)

  if (total === 0) return (
    <div>
      <p className="text-[9px] text-slate-600 mb-1 tracking-widest uppercase">Agent Network</p>
      <p className="text-xs text-slate-700 text-center py-3">No agents active</p>
    </div>
  )

  return (
    <Plot
      data={[{
        type: 'pie', labels, values, hole: 0.6,
        marker: { colors: [C.blue, C.cyan, C.green, C.rose], line: { color: '#0f172a', width: 2 } },
        textinfo: 'label+value',
        textfont: { color: '#cbd5e1', size: 10 },
        hovertemplate: '%{label}: %{value} agent(s)<extra></extra>',
      }]}
      layout={{
        ...layout(),
        title: { text: 'Agent Network', font: { color: '#cbd5e1', size: 12 } },
        showlegend: false,
        height: 200,
        margin: { t: 36, b: 10, l: 20, r: 20 },
        annotations: [{
          text: `<b>${total}</b><br><span style="font-size:9px">agents</span>`,
          font: { size: 13, color: '#94a3b8' },
          showarrow: false, x: 0.5, y: 0.5,
        }],
      }}
      config={cfg}
      style={{ width: '100%' }}
    />
  )
}

// ── Fact Topics Bar ───────────────────────────────────────────────────────────
function FactTopics({ topics, expanded }) {
  if (!topics?.length) return null
  const sorted = [...topics].sort((a, b) => b.count - a.count).slice(0, 8)
  return (
    <Plot
      data={[{
        type: 'bar', orientation: 'h',
        x: sorted.map(t => t.count),
        y: sorted.map(t => t.topic),
        marker: {
          color: sorted.map((_, i) => `hsl(${210 + i * 18}, 70%, 55%)`),
          opacity: 0.85,
        },
        text: sorted.map(t => String(t.count)),
        textposition: 'outside',
        textfont: { color: '#94a3b8', size: 9 },
        hovertemplate: '%{y}: %{x} facts<extra></extra>',
      }]}
      layout={layout({
        title: { text: 'Top Fact Topics', font: { color: '#cbd5e1', size: 12 } },
        height: expanded ? 440 : 220,
        margin: { t: 36, b: 24, l: 80, r: 40 },
        xaxis: { ...layout().xaxis, title: { text: 'Count', font: { size: 9 }, standoff: 4 } },
        yaxis: { ...layout().yaxis, autorange: 'reversed', tickfont: { color: '#94a3b8', size: 9 } },
      })}
      config={cfg}
      style={{ width: '100%' }}
    />
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function BrainDash({ orbState = 'idle' }) {
  const [status,     setStatus]     = useState(null)
  const [ledger,     setLedger]     = useState(null)
  const [liveAgents, setLiveAgents] = useState([])
  const [tick,       setTick]       = useState(0)
  const [lastUpdate, setLastUpdate] = useState(null)
  const [error,      setError]      = useState(null)

  const fetchAll = useCallback(async () => {
    try {
      const [s, l, a] = await Promise.allSettled([getBrainStatus(), getLedgerStats(), listAgents()])
      if (s.status === 'fulfilled') { setStatus(s.value); setLastUpdate(new Date().toLocaleTimeString()) }
      if (l.status === 'fulfilled') setLedger(l.value)
      if (a.status === 'fulfilled') setLiveAgents(a.value?.agents || [])
      setError(null)
    } catch (e) {
      setError('Brain unreachable')
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, 12000)
    return () => clearInterval(iv)
  }, [fetchAll])

  useEffect(() => {
    const anim = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(anim)
  }, [])

  const collections = status?.qdrant?.collections || {}
  const pg          = status?.postgres || null
  const topics      = pg?.fact_topics || []
  const msgHistory  = pg?.message_history || []

  return (
    <div className="flex flex-col gap-3">

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-slate-600 tracking-widest uppercase font-mono">Brain Analytics</span>
        <span className="flex items-center gap-1.5 text-[9px] font-mono text-slate-700">
          {error
            ? <span className="text-rose-500">{error}</span>
            : lastUpdate
              ? <><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />{lastUpdate}</>
              : 'Loading…'
          }
        </span>
      </div>

      {/* System vitals */}
      <SystemVitals status={status} ledger={ledger} lastUpdate={lastUpdate} />

      {/* Neural Wave */}
      <ChartPanel title="Brain Activity — Live Signal"
        expandedChildren={<NeuralWave tick={tick} orbState={orbState} expanded />}>
        <NeuralWave tick={tick} orbState={orbState} />
      </ChartPanel>

      {/* Qdrant + Attention */}
      <div className="grid grid-cols-2 gap-2">
        <ChartPanel title="Qdrant Mesh — Collections"
          expandedChildren={<QdrantChart collections={collections} expanded />}>
          <QdrantChart collections={collections} />
        </ChartPanel>
        <ChartPanel title="Attention Activation"
          expandedChildren={<AttentionHeatmap tick={tick} expanded />}>
          <AttentionHeatmap tick={tick} />
        </ChartPanel>
      </div>

      {/* Message Activity */}
      <ChartPanel title="Message Activity — Last 24h"
        expandedChildren={<MessageActivity messageHistory={msgHistory} expanded />}>
        <MessageActivity messageHistory={msgHistory} />
      </ChartPanel>

      {/* Fact Topics */}
      {topics.length > 0 && (
        <ChartPanel title="Top Fact Topics"
          expandedChildren={<FactTopics topics={topics} expanded />}>
          <FactTopics topics={topics} />
        </ChartPanel>
      )}

      {/* Postgres */}
      <div className="rounded-xl border border-slate-800/50 bg-slate-900/30 px-3 py-3">
        <PostgresStats pg={pg} />
      </div>

      {/* Forge Ledger */}
      <div className="rounded-xl border border-amber-900/30 bg-slate-900/30 px-3 py-3">
        <ForgeLedger ledger={ledger} />
      </div>

      {/* Agent Network */}
      <ChartPanel title="Agent Network"
        expandedChildren={<AgentNetwork liveAgents={liveAgents} expanded />}>
        <AgentNetwork liveAgents={liveAgents} />
      </ChartPanel>
    </div>
  )
}
