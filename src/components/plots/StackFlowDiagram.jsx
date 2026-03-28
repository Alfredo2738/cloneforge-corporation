import { motion } from 'framer-motion'

const NODES = {
  mic:        { label: 'Mic / Voice',      sub: 'Web Speech API',        color: '#06b6d4' },
  orb:        { label: 'VoiceOrb',         sub: 'Speech Recognition',    color: '#3b82f6' },
  brain:      { label: 'Oriel4o Brain',    sub: 'FastAPI · DO App',      color: '#8b5cf6' },
  qdrant:     { label: 'Qdrant Mesh',      sub: '3 Collections · RAG',   color: '#f59e0b' },
  cerebras:   { label: 'Cerebras LLM',     sub: 'Qwen3-235B · 800 T/s',  color: '#10b981' },
  elevenlabs: { label: 'ElevenLabs TTS',   sub: 'Oriel Voice · MP3',     color: '#f43f5e' },
  speaker:    { label: 'Audio Output',     sub: 'Web AudioContext',       color: '#06b6d4' },
}

// Which nodes are "hot" per orbState
const ACTIVE = {
  idle:      [],
  listening: ['mic', 'orb'],
  thinking:  ['orb', 'brain', 'qdrant', 'cerebras'],
  speaking:  ['brain', 'orb', 'elevenlabs', 'speaker'],
}

// Arrow definitions: [fromNode, label, activeStates]
// We render these between consecutive nodes in a row
const FWD_ARROWS = [
  { label: 'transcript',        states: ['listening'] },
  { label: 'messages + key',    states: ['thinking'] },
  { label: 'embed + search',    states: ['thinking'] },
  { label: 'context chunks',    states: ['thinking'] },
]
const RET_ARROWS = [
  { label: 'stream tokens',     states: ['thinking', 'speaking'] },
  { label: 'SSE chunks',        states: ['thinking', 'speaking'] },
  { label: 'text → TTS',        states: ['speaking'] },
  { label: 'audio b64',         states: ['speaking'] },
]

function NodeBox({ id, orbState }) {
  const node   = NODES[id]
  const active = ACTIVE[orbState]?.includes(id)
  return (
    <motion.div
      animate={{ opacity: active ? 1 : 0.28, scale: active ? 1.03 : 0.97 }}
      transition={{ duration: 0.25 }}
      className="flex flex-col items-center rounded-lg border px-2 py-1.5 text-center w-[72px] flex-shrink-0"
      style={{
        borderColor: active ? node.color + '70' : '#1e293b',
        background:  active ? node.color + '18' : 'rgba(15,23,42,0.5)',
        boxShadow:   active ? `0 0 10px ${node.color}28` : 'none',
      }}
    >
      <span className="text-[9px] font-semibold leading-tight" style={{ color: active ? node.color : '#334155' }}>
        {node.label}
      </span>
      <span className="text-[7px] text-slate-700 leading-tight mt-0.5">{node.sub}</span>
      {active && (
        <motion.div className="w-1 h-1 rounded-full mt-1 flex-shrink-0"
          animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }}
          style={{ background: node.color }} />
      )}
    </motion.div>
  )
}

function Arrow({ arrowDef, orbState, reversed = false }) {
  const active = arrowDef.states.includes(orbState)
  const color  = active ? '#3b82f6' : '#1e293b'
  return (
    <div className={`flex flex-col items-center justify-center w-10 flex-shrink-0 ${reversed ? 'flex-row-reverse' : ''}`}>
      <motion.span className="text-[6px] text-center leading-none mb-0.5 w-10"
        animate={{ opacity: active ? 0.85 : 0.2 }} style={{ color }}>
        {arrowDef.label}
      </motion.span>
      <motion.div className={`flex items-center w-full ${reversed ? 'flex-row-reverse' : ''}`}
        animate={{ opacity: active ? 1 : 0.15 }}>
        <div className="flex-1 h-px" style={{ background: color }} />
        {!reversed && <div className="w-0 h-0 border-y-[2.5px] border-l-[4px] border-transparent border-y-transparent" style={{ borderLeftColor: color }} />}
        {reversed  && <div className="w-0 h-0 border-y-[2.5px] border-r-[4px] border-transparent border-y-transparent" style={{ borderRightColor: color }} />}
      </motion.div>
    </div>
  )
}

function VerticalArrow({ color, label, down = true }) {
  return (
    <div className="flex flex-col items-center w-[72px]">
      {down && <div className="h-3 w-px" style={{ background: color }} />}
      <span className="text-[6px]" style={{ color }}>{down ? '↓' : '↑'} {label}</span>
      {!down && <div className="h-3 w-px" style={{ background: color }} />}
    </div>
  )
}

export default function StackFlowDiagram({ orbState = 'idle' }) {
  const stateLabel = {
    idle:      'IDLE',
    listening: 'LISTENING — Capturing voice',
    thinking:  'THINKING — RAG + LLM inference',
    speaking:  'SPEAKING — TTS synthesis',
  }[orbState]

  const stateColor = { idle: '#334155', listening: '#06b6d4', thinking: '#8b5cf6', speaking: '#10b981' }[orbState]

  const fwdRow = ['mic', 'orb', 'brain', 'qdrant', 'cerebras']
  const retRow = ['cerebras', 'brain', 'orb', 'elevenlabs', 'speaker']

  return (
    <div className="rounded-xl border border-slate-800/40 bg-slate-900/20 px-3 py-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-[9px] text-slate-600 tracking-widest uppercase font-mono">Stack Flow</span>
        <motion.span key={orbState} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full"
          style={{ color: stateColor, background: stateColor + '15', border: `1px solid ${stateColor}30` }}>
          {stateLabel}
        </motion.span>
      </div>

      {/* Forward pass: Mic → Orb → Brain → Qdrant → Cerebras */}
      <div className="flex items-center justify-between mb-0 overflow-x-auto">
        {fwdRow.map((id, i) => (
          <div key={id} className="flex items-center flex-shrink-0">
            <NodeBox id={id} orbState={orbState} />
            {i < fwdRow.length - 1 && <Arrow arrowDef={FWD_ARROWS[i]} orbState={orbState} />}
          </div>
        ))}
      </div>

      {/* Downward connector on right side: Cerebras → return path */}
      <div className="flex justify-end pr-0 my-0.5">
        <VerticalArrow color={orbState === 'thinking' ? '#10b981' : '#1e293b'} label="stream" down />
      </div>

      {/* Return pass: Cerebras → Brain → Orb → ElevenLabs → Speaker */}
      <div className="flex items-center justify-between overflow-x-auto flex-row-reverse">
        {retRow.map((id, i) => (
          <div key={`ret-${id}-${i}`} className="flex items-center flex-row-reverse flex-shrink-0">
            <NodeBox id={id} orbState={orbState} />
            {i < retRow.length - 1 && <Arrow arrowDef={RET_ARROWS[i]} orbState={orbState} reversed />}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-800/30 pt-2">
        {[
          { color: '#06b6d4', label: 'Voice I/O' },
          { color: '#8b5cf6', label: 'Brain API' },
          { color: '#f59e0b', label: 'Qdrant RAG' },
          { color: '#10b981', label: 'Cerebras' },
          { color: '#f43f5e', label: 'ElevenLabs' },
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1 text-[8px] text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  )
}
