import { useEffect, useState } from 'react'
import Plot from 'react-plotly.js'
import { getBrainStatus } from '../../api/brain'

const DARK_LAYOUT = {
  paper_bgcolor: 'rgba(0,0,0,0)',
  plot_bgcolor:  'rgba(0,0,0,0)',
  font: { color: '#94a3b8', family: 'Inter, system-ui, sans-serif', size: 11 },
  margin: { t: 30, b: 30, l: 40, r: 20 },
  xaxis: { gridcolor: '#1e293b', zerolinecolor: '#1e293b', tickfont: { color: '#64748b' } },
  yaxis: { gridcolor: '#1e293b', zerolinecolor: '#1e293b', tickfont: { color: '#64748b' } },
}

function KnowledgeGraph({ collections }) {
  const labels = Object.keys(collections)
  const values = labels.map(k => collections[k]?.vectors || collections[k]?.points || 0)
  const colors = ['#3b82f6', '#8b5cf6', '#06b6d4', '#10b981']

  return (
    <Plot
      data={[{
        type: 'bar',
        x: labels.map(l => l.replace('cloneforge_', '')),
        y: values,
        marker: { color: colors.slice(0, labels.length), opacity: 0.85 },
        text: values.map(String),
        textposition: 'outside',
      }]}
      layout={{
        ...DARK_LAYOUT,
        title: { text: 'Qdrant Mesh — Vector Counts', font: { color: '#cbd5e1', size: 12 } },
        height: 220,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
    />
  )
}

function AgentActivity({ agents }) {
  const types = { master: 0, subagent: 0, microagent: 0, rogue: 0 }
  agents.forEach(a => { types[a.type] = (types[a.type] || 0) + 1 })

  return (
    <Plot
      data={[{
        type: 'pie',
        labels: Object.keys(types),
        values: Object.values(types),
        hole: 0.55,
        marker: { colors: ['#3b82f6', '#06b6d4', '#10b981', '#ef4444'] },
        textinfo: 'label+value',
        textfont: { color: '#cbd5e1', size: 11 },
      }]}
      layout={{
        ...DARK_LAYOUT,
        title: { text: 'Active Agent Network', font: { color: '#cbd5e1', size: 12 } },
        showlegend: false,
        height: 220,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
    />
  )
}

function NeuralWave() {
  const t = Array.from({ length: 100 }, (_, i) => i / 10)
  const wave1 = t.map(x => Math.sin(x) * Math.exp(-x * 0.08) + Math.sin(3 * x) * 0.3)
  const wave2 = t.map(x => Math.cos(x * 1.5) * Math.exp(-x * 0.06) * 0.7)

  return (
    <Plot
      data={[
        {
          x: t, y: wave1, type: 'scatter', mode: 'lines',
          line: { color: '#3b82f6', width: 2 }, name: 'Oriel Signal',
        },
        {
          x: t, y: wave2, type: 'scatter', mode: 'lines',
          line: { color: '#8b5cf6', width: 1.5, dash: 'dot' }, name: 'Mesh Echo',
        },
      ]}
      layout={{
        ...DARK_LAYOUT,
        title: { text: 'Brain Activity — Neural Signal', font: { color: '#cbd5e1', size: 12 } },
        height: 200,
        showlegend: true,
        legend: { font: { color: '#64748b', size: 10 }, bgcolor: 'rgba(0,0,0,0)' },
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
    />
  )
}

function AttentionHeatmap() {
  const layers = 6
  const heads = 8
  const z = Array.from({ length: layers }, () =>
    Array.from({ length: heads }, () => Math.random())
  )

  return (
    <Plot
      data={[{
        type: 'heatmap',
        z,
        colorscale: [
          [0, '#0f172a'], [0.3, '#1e3a5f'], [0.6, '#2563eb'], [1, '#93c5fd']
        ],
        showscale: false,
        xgap: 2, ygap: 2,
      }]}
      layout={{
        ...DARK_LAYOUT,
        title: { text: 'Attention Head Activation', font: { color: '#cbd5e1', size: 12 } },
        xaxis: { ...DARK_LAYOUT.xaxis, title: { text: 'Head', font: { color: '#64748b', size: 10 } } },
        yaxis: { ...DARK_LAYOUT.yaxis, title: { text: 'Layer', font: { color: '#64748b', size: 10 } } },
        height: 220,
      }}
      config={{ displayModeBar: false, responsive: true }}
      style={{ width: '100%' }}
    />
  )
}

export default function BrainDash({ agents = [] }) {
  const [status, setStatus] = useState(null)

  useEffect(() => {
    getBrainStatus().then(setStatus).catch(() => {})
    const interval = setInterval(() => {
      getBrainStatus().then(setStatus).catch(() => {})
    }, 15000)
    return () => clearInterval(interval)
  }, [])

  const collections = status?.qdrant?.collections || {}

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 col-span-2">
        <NeuralWave />
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
        <KnowledgeGraph collections={collections} />
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
        <AttentionHeatmap />
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 col-span-2">
        <AgentActivity agents={agents} />
      </div>
    </div>
  )
}
