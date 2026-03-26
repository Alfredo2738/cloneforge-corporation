import { useEffect, useState, useCallback } from 'react'
import Plot from 'react-plotly.js'
import { getBrainStatus, listAgents } from '../../api/brain'

const DARK = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor:  'rgba(0,0,0,0)',
  font:   { color: '#94a3b8', family: 'Inter, system-ui, sans-serif', size: 10 },
  margin: { t: 28, b: 28, l: 36, r: 12 },
  xaxis:  { gridcolor: '#1e293b', zerolinecolor: '#1e293b', tickfont: { color: '#475569', size: 9 } },
  yaxis:  { gridcolor: '#1e293b', zerolinecolor: '#1e293b', tickfont: { color: '#475569', size: 9 } },
}

// ── Qdrant Vector Counts ────────────────────────────────────────────────────
function QdrantChart({ collections }) {
  const labels = Object.keys(collections)
  const points = labels.map(k => collections[k]?.points || 0)
  const indexed = labels.map(k => collections[k]?.indexed_vectors || 0)
  const shortLabels = labels.map(l => l.replace('cloneforge_', ''))

  return (
    <Plot
      data={[
        {
          name: 'Vectors',
          type: 'bar', x: shortLabels, y: points,
          marker: { color: '#3b82f6', opacity: 0.9 },
          text: points.map(String), textposition: 'outside',
          textfont: { color: '#93c5fd', size: 9 },
        },
        {
          name: 'Indexed',
          type: 'bar', x: shortLabels, y: indexed,
          marker: { color: '#8b5cf6', opacity: 0.6 },
        },
      ]}
      layout={{
        ...DARK,
        barmode: 'group',
        title: { text: 'Qdrant Mesh — Vectors', font: { color: '#cbd5e1', size: 11 } },
        legend: { font: { color: '#64748b', size: 9 }, bgcolor: 'rgba(0,0,0,0)', x: 0.6, y: 1.15, orientation: 'h' },
        height: 200,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
    />
  )
}

// ── Postgres Stats ──────────────────────────────────────────────────────────
function PostgresStats({ pg }) {
  if (!pg || pg.error) {
    return (
      <div className="flex items-center justify-center h-24 text-xs text-slate-600">
        {pg?.error ? `DB offline: ${pg.error.slice(0, 60)}` : 'Connecting to Postgres…'}
      </div>
    )
  }

  const stats = [
    { label: 'Sessions',    val: pg.sessions,          color: '#3b82f6' },
    { label: 'Messages',    val: pg.messages,           color: '#8b5cf6' },
    { label: 'Facts',       val: pg.facts,              color: '#06b6d4' },
    { label: 'Agent Logs',  val: pg.agent_logs,         color: '#f59e0b' },
    { label: 'Clinical',    val: pg.clinical_sessions,  color: '#10b981' },
  ]

  return (
    <div>
      <p className="text-xs text-slate-500 mb-2 tracking-widest uppercase">Postgres — Live Counts</p>
      <div className="grid grid-cols-5 gap-1">
        {stats.map(s => (
          <div key={s.label} className="flex flex-col items-center bg-slate-900/60 rounded-lg py-2 px-1 border border-slate-800/60">
            <span className="text-base font-bold" style={{ color: s.color }}>{s.val ?? '—'}</span>
            <span className="text-[9px] text-slate-500 mt-0.5 text-center">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Message Activity (last 24h) ─────────────────────────────────────────────
function MessageActivity({ messageHistory }) {
  if (!messageHistory?.length) {
    // Flatline placeholder when no data
    const t = Array.from({ length: 24 }, (_, i) => i)
    return (
      <Plot
        data={[{
          x: t, y: t.map(() => 0), type: 'scatter', mode: 'lines',
          fill: 'tozeroy',
          line: { color: '#3b82f6', width: 1.5 },
          fillcolor: 'rgba(59,130,246,0.08)',
          name: 'Messages',
        }]}
        layout={{
          ...DARK,
          title: { text: 'Message Activity — Last 24h', font: { color: '#cbd5e1', size: 11 } },
          height: 160,
          xaxis: { ...DARK.xaxis, title: { text: 'Hour', font: { size: 9 } } },
          yaxis: { ...DARK.yaxis, title: { text: 'Count', font: { size: 9 } } },
        }}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%' }}
      />
    )
  }

  const hours = messageHistory.map(r => r.hour % 24)
  const counts = messageHistory.map(r => r.count)

  return (
    <Plot
      data={[{
        x: hours, y: counts, type: 'scatter', mode: 'lines+markers',
        fill: 'tozeroy',
        line: { color: '#3b82f6', width: 2 },
        marker: { color: '#93c5fd', size: 4 },
        fillcolor: 'rgba(59,130,246,0.12)',
        name: 'Messages',
      }]}
      layout={{
        ...DARK,
        title: { text: 'Message Activity — Last 24h', font: { color: '#cbd5e1', size: 11 } },
        height: 160,
        xaxis: { ...DARK.xaxis, title: { text: 'Hour (UTC)', font: { size: 9 } }, dtick: 4 },
        yaxis: { ...DARK.yaxis, title: { text: 'Messages', font: { size: 9 } } },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
    />
  )
}

// ── Live Neural Signal (animated) ──────────────────────────────────────────
function NeuralWave({ tick }) {
  const t = Array.from({ length: 120 }, (_, i) => i / 12)
  const phase = tick * 0.3
  const wave1 = t.map(x => Math.sin(x + phase) * 0.8 + Math.sin(3 * x + phase * 0.7) * 0.3)
  const wave2 = t.map(x => Math.cos(x * 1.3 + phase * 1.1) * 0.6)
  const wave3 = t.map(x => Math.sin(x * 0.5 + phase * 0.4) * 0.4 + Math.random() * 0.05)

  return (
    <Plot
      data={[
        { x: t, y: wave1, type: 'scatter', mode: 'lines', line: { color: '#3b82f6', width: 2 }, name: 'Oriel Signal' },
        { x: t, y: wave2, type: 'scatter', mode: 'lines', line: { color: '#8b5cf6', width: 1.5, dash: 'dot' }, name: 'Mesh Echo' },
        { x: t, y: wave3, type: 'scatter', mode: 'lines', line: { color: '#06b6d4', width: 1, dash: 'dash' }, name: 'RAG Pulse' },
      ]}
      layout={{
        ...DARK,
        title: { text: 'Brain Activity — Live Signal', font: { color: '#cbd5e1', size: 11 } },
        showlegend: true,
        legend: { font: { color: '#475569', size: 9 }, bgcolor: 'rgba(0,0,0,0)', orientation: 'h', x: 0, y: 1.2 },
        height: 180,
        yaxis: { ...DARK.yaxis, range: [-1.4, 1.4] },
        xaxis: { ...DARK.xaxis, showticklabels: false },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
    />
  )
}

// ── Agent Network ───────────────────────────────────────────────────────────
function AgentNetwork({ liveAgents }) {
  const counts = { master: 0, subagent: 0, microagent: 0, rogue: 0 }
  liveAgents.forEach(a => { counts[a.type] = (counts[a.type] || 0) + 1 })
  const labels = Object.keys(counts)
  const values = Object.values(counts)
  const total = values.reduce((a, b) => a + b, 0)

  return (
    <div>
      <p className="text-xs text-slate-500 mb-2 tracking-widest uppercase">Agent Network</p>
      {total === 0 ? (
        <p className="text-xs text-slate-700 text-center py-4">No agents active</p>
      ) : (
        <Plot
          data={[{
            type: 'pie',
            labels,
            values,
            hole: 0.55,
            marker: { colors: ['#3b82f6', '#06b6d4', '#10b981', '#ef4444'] },
            textinfo: 'label+value',
            textfont: { color: '#cbd5e1', size: 10 },
          }]}
          layout={{
            ...DARK,
            showlegend: false,
            height: 200,
            margin: { t: 10, b: 10, l: 20, r: 20 },
            annotations: [{
              text: `${total}<br>agents`,
              font: { size: 14, color: '#94a3b8' },
              showarrow: false, x: 0.5, y: 0.5,
            }],
          }}
          config={{ displayModeBar: false, responsive: true }}
          style={{ width: '100%' }}
        />
      )}
    </div>
  )
}

// ── Attention Heatmap ───────────────────────────────────────────────────────
function AttentionHeatmap({ tick }) {
  const layers = 6
  const heads = 8
  // Shift the pattern on each tick for a live feel
  const z = Array.from({ length: layers }, (_, l) =>
    Array.from({ length: heads }, (_, h) =>
      Math.abs(Math.sin((l + h + tick * 0.2) * 0.7)) * 0.8 + Math.random() * 0.2
    )
  )
  return (
    <Plot
      data={[{
        type: 'heatmap',
        z,
        colorscale: [[0,'#0f172a'],[0.3,'#1e3a5f'],[0.6,'#2563eb'],[1,'#93c5fd']],
        showscale: false,
        xgap: 2, ygap: 2,
      }]}
      layout={{
        ...DARK,
        title: { text: 'Attention Activation', font: { color: '#cbd5e1', size: 11 } },
        xaxis: { ...DARK.xaxis, title: { text: 'Head', font: { size: 9 } } },
        yaxis: { ...DARK.yaxis, title: { text: 'Layer', font: { size: 9 } } },
        height: 180,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
    />
  )
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export default function BrainDash({ agents = [] }) {
  const [status, setStatus] = useState(null)
  const [liveAgents, setLiveAgents] = useState([])
  const [tick, setTick] = useState(0)
  const [lastUpdate, setLastUpdate] = useState(null)

  const fetchStatus = useCallback(async () => {
    try {
      const s = await getBrainStatus()
      setStatus(s)
      setLastUpdate(new Date().toLocaleTimeString())
    } catch {}
  }, [])

  const fetchAgents = useCallback(async () => {
    try {
      const data = await listAgents()
      setLiveAgents(data.agents || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchStatus()
    fetchAgents()
    const statusInterval = setInterval(fetchStatus, 15000)
    const agentInterval  = setInterval(fetchAgents, 8000)
    return () => { clearInterval(statusInterval); clearInterval(agentInterval) }
  }, [fetchStatus, fetchAgents])

  // Animate the neural wave + attention heatmap
  useEffect(() => {
    const anim = setInterval(() => setTick(t => t + 1), 1200)
    return () => clearInterval(anim)
  }, [])

  const collections    = status?.qdrant?.collections || {}
  const pg             = status?.postgres || null
  const msgHistory     = pg?.message_history || []

  // Merge prop agents with live agent list (prop agents have voiceKey etc.)
  const mergedAgents = liveAgents.length ? liveAgents : agents

  return (
    <div className="flex flex-col gap-3">

      {/* Live indicator */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-600 tracking-widest uppercase">Brain Analytics</span>
        {lastUpdate && (
          <span className="text-[10px] text-slate-700 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
            {lastUpdate}
          </span>
        )}
      </div>

      {/* Neural Wave */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-2">
        <NeuralWave tick={tick} />
      </div>

      {/* Qdrant + Attention side-by-side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-2">
          <QdrantChart collections={collections} />
        </div>
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-2">
          <AttentionHeatmap tick={tick} />
        </div>
      </div>

      {/* Message Activity */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-2">
        <MessageActivity messageHistory={msgHistory} />
      </div>

      {/* Postgres Stats */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
        <PostgresStats pg={pg} />
      </div>

      {/* Agent Network */}
      <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 p-3">
        <AgentNetwork liveAgents={mergedAgents} />
      </div>
    </div>
  )
}
