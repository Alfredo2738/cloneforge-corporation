import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Volume2, Loader2, Users, Activity, ChevronRight,
  TrendingUp, MapPin, Building2, Pill, FileText, Globe,
  ArrowLeft, Zap, BarChart3,
} from 'lucide-react'
import { streamChat, synthesizeVoice, playAudioB64, ingestUrls } from '../api/brain'
import CorporateGate, { useCorporateAuth } from '../components/auth/CorporateGate'

// ── Pharma collections ────────────────────────────────────────────────────────
const PHARMA_COLLECTIONS = ['cloneforge_docs', 'cloneforge_medical_records', 'cloneforge_web']

const PHARMA_SYSTEM_CONTEXT = `You are Oriel4o — CloneForge's pharma sales intelligence agent.
You specialise in pharmaceutical sales, regional pipelines, HMO relationships, KPIs, and territory management.
Use indexed documents, clinical records, and web knowledge to provide precise, data-backed answers.
If asked about specific deals, pilots, or agreements that are not in your context, say clearly the data hasn't been indexed yet.`

// ── Mock territory data (replaces with real RAG data when indexed) ─────────────
const TERRITORIES = [
  { id: 'northeast', label: 'Northeast', states: 'NY · NJ · CT · MA · PA', reps: 4, status: 'active',   color: '#6366f1' },
  { id: 'southeast', label: 'Southeast', states: 'FL · GA · NC · SC · VA', reps: 3, status: 'active',   color: '#8b5cf6' },
  { id: 'midwest',   label: 'Midwest',   states: 'IL · OH · MI · IN · WI', reps: 3, status: 'pilot',    color: '#a78bfa' },
  { id: 'southwest', label: 'Southwest', states: 'TX · AZ · NM · NV',       reps: 2, status: 'pipeline', color: '#c4b5fd' },
  { id: 'west',      label: 'West',      states: 'CA · OR · WA · CO',       reps: 3, status: 'active',   color: '#ddd6fe' },
]

const PILOT_COMPANIES = [
  { name: 'Vialux Therapeutics',   stage: 'Pilot',    region: 'Northeast', product: 'Oncology', hmo: 'UnitedHealthcare', color: '#10b981' },
  { name: 'Nexum Biosciences',     stage: 'Pipeline', region: 'Southeast', product: 'Cardiology', hmo: 'BCBS Florida',   color: '#f59e0b' },
  { name: 'Aether Health Group',   stage: 'Prospect', region: 'Midwest',   product: 'Neurology', hmo: 'Humana',          color: '#6366f1' },
]

const HMOS = [
  { name: 'UnitedHealthcare', members: '49M', coverage: 'National', tier: 1 },
  { name: 'Kaiser Permanente', members: '13M', coverage: 'West / Mid-Atlantic', tier: 1 },
  { name: 'Anthem / BCBS', members: '46M', coverage: 'National', tier: 1 },
  { name: 'Humana', members: '17M', coverage: 'Southeast / Midwest', tier: 2 },
  { name: 'Cigna', members: '18M', coverage: 'National', tier: 2 },
  { name: 'Aetna / CVS', members: '35M', coverage: 'National', tier: 2 },
]

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    active:   { color: '#10b981', bg: '#10b98115', label: 'Active' },
    pilot:    { color: '#f59e0b', bg: '#f59e0b15', label: 'Pilot' },
    pipeline: { color: '#6366f1', bg: '#6366f115', label: 'Pipeline' },
    prospect: { color: '#94a3b8', bg: '#94a3b815', label: 'Prospect' },
  }
  const s = map[status] || map.prospect
  return (
    <span className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full"
      style={{ color: s.color, background: s.bg, border: `1px solid ${s.color}40` }}>
      {s.label}
    </span>
  )
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-1"
      style={{ borderColor: color + '30', background: color + '08' }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={13} style={{ color }} />
        <span className="text-[10px] font-mono tracking-widest uppercase" style={{ color: '#64748b' }}>{label}</span>
      </div>
      <span className="text-2xl font-bold font-mono" style={{ color }}>{value}</span>
      {sub && <span className="text-[10px] text-slate-500">{sub}</span>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
function PharmaSalesInterface({ session }) {
  const [tab, setTab]                   = useState('chat')   // chat | territories | hmos | pipeline
  const [conversation, setConversation] = useState([])
  const [displayMessages, setDisplayMessages] = useState([{
    role: 'assistant',
    content: `Welcome to CloneForge Pharma Sales Intelligence. I am Oriel4o — specialized for pharmaceutical sales operations, HMO relationships, territory management, and pipeline tracking.\n\nAsk me about your territories, pilot companies, formulary access, or regional KPIs. I draw from your indexed knowledge mesh for verified answers.`,
    sources: [],
  }])
  const [input, setInput]           = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [speakingIdx, setSpeakingIdx] = useState(null)
  const chatRef = useRef(null)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [displayMessages])

  const handleSpeak = useCallback(async (text, idx) => {
    if (speakingIdx !== null) return
    setSpeakingIdx(idx)
    try {
      const b64 = await synthesizeVoice(text, 'oriel')
      await playAudioB64(b64)
    } catch (e) { console.warn('TTS:', e) }
    finally { setSpeakingIdx(null) }
  }, [speakingIdx])

  const handleSend = async (override) => {
    const userText = override || input.trim()
    if (!userText || isStreaming) return
    setInput('')

    const newConv = [...conversation, { role: 'user', content: userText }]
    setConversation(newConv)
    setDisplayMessages(prev => [
      ...prev,
      { role: 'user', content: userText },
      { role: 'assistant', content: '', sources: [] },
    ])
    setIsStreaming(true)

    let msg = { role: 'assistant', content: '', sources: [] }
    for await (const event of streamChat(newConv, PHARMA_COLLECTIONS)) {
      if (event.type === 'sources') {
        msg = { ...msg, sources: event.data }
        setDisplayMessages(prev => [...prev.slice(0, -1), msg])
      } else if (event.type === 'token') {
        msg = { ...msg, content: msg.content + event.data }
        setDisplayMessages(prev => [...prev.slice(0, -1), msg])
      } else if (event.type === 'done') {
        setConversation(prev => [...prev, { role: 'assistant', content: msg.content }])
        setIsStreaming(false)
      }
    }
    setIsStreaming(false)
  }

  const QUICK = [
    'What are my active pilot programs?',
    'Show Northeast territory KPIs',
    'Which HMOs have formulary access?',
    'Summarize Vialux Therapeutics pipeline',
    'Compare Q1 vs Q4 sales velocity',
  ]

  const TABS = [
    { id: 'chat',        icon: Zap,       label: 'Oriel4o Chat' },
    { id: 'territories', icon: MapPin,     label: 'Territories' },
    { id: 'pipeline',    icon: TrendingUp, label: 'Pipeline' },
    { id: 'hmos',        icon: Building2,  label: 'HMOs' },
  ]

  return (
    <div className="h-screen bg-[#05030f] text-slate-200 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-indigo-900/40 px-6 py-4 flex items-center justify-between flex-shrink-0"
        style={{ background: 'rgba(99,102,241,0.04)' }}>
        <div className="flex items-center gap-4">
          <a href="/"
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-slate-500 hover:text-slate-300 text-xs transition-colors">
            <ArrowLeft size={13} /> Brain
          </a>
          <div className="w-px h-5 bg-slate-800" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              <Pill size={14} />
            </div>
            <div>
              <h1 className="text-sm font-semibold tracking-wide" style={{ color: '#a5b4fc' }}>CLONEFORGE PHARMA SALES</h1>
              <p className="text-xs tracking-widest" style={{ color: '#4c1d95' }}>ORIEL4O · PHARMA INTELLIGENCE LAYER</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs" style={{ color: '#10b981' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            MESH ONLINE
          </div>
          <div className="text-xs text-slate-500 font-mono">{session?.name || 'Pharma Sales'}</div>
        </div>
      </header>

      {/* KPI strip */}
      <div className="border-b border-indigo-900/30 px-6 py-3 flex-shrink-0 overflow-x-auto">
        <div className="flex gap-4 min-w-max">
          <KpiCard icon={MapPin}     label="Active Territories" value="5"   sub="US Coverage"       color="#6366f1" />
          <KpiCard icon={Building2}  label="Pilot Companies"    value="3"   sub="Indexed pilots"    color="#8b5cf6" />
          <KpiCard icon={Users}      label="Field Reps"         value="15"  sub="Across all regions" color="#a78bfa" />
          <KpiCard icon={TrendingUp} label="HMO Relationships"  value="6"   sub="Tier 1 & 2"        color="#10b981" />
          <KpiCard icon={BarChart3}  label="Pipeline Stage"     value="3"   sub="Companies tracked"  color="#f59e0b" />
          <KpiCard icon={Globe}      label="States Covered"     value="22"  sub="Active + pilot"    color="#06b6d4" />
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-slate-800/50 px-6 flex-shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold tracking-wide transition-colors border-b-2 -mb-px"
            style={{
              borderColor:  tab === t.id ? '#6366f1' : 'transparent',
              color: tab === t.id ? '#a5b4fc' : '#475569',
            }}>
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Chat tab ── */}
        {tab === 'chat' && (
          <div className="flex flex-col flex-1 min-w-0">
            {/* Quick prompts */}
            <div className="flex gap-2 px-4 py-2 overflow-x-auto border-b border-slate-800/30 flex-shrink-0">
              {QUICK.map(q => (
                <button key={q} onClick={() => handleSend(q)}
                  className="flex-shrink-0 text-[10px] font-mono px-3 py-1 rounded-full border transition-colors"
                  style={{ borderColor: '#312e81', color: '#a5b4fc', background: '#1e1b4b30' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#312e8160'}
                  onMouseLeave={e => e.currentTarget.style.background = '#1e1b4b30'}>
                  {q}
                </button>
              ))}
            </div>

            <div ref={chatRef} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              <AnimatePresence initial={false}>
                {displayMessages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-indigo-600/20 border border-indigo-500/20 text-indigo-100'
                        : 'bg-slate-800/50 border border-slate-700/40 text-slate-200'
                    }`}>
                      {msg.role === 'assistant' && (
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[10px] font-mono tracking-widest opacity-50" style={{ color: '#a5b4fc' }}>ORIEL4O · PHARMA</span>
                          {msg.content && !isStreaming && (
                            <button onClick={() => handleSpeak(msg.content, i)}
                              disabled={speakingIdx !== null}
                              className="ml-3 p-1 rounded opacity-40 hover:opacity-100 transition-opacity disabled:cursor-wait">
                              {speakingIdx === i ? <Loader2 size={11} className="animate-spin" /> : <Volume2 size={11} />}
                            </button>
                          )}
                        </div>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}
                        {isStreaming && i === displayMessages.length - 1 && msg.role === 'assistant' && (
                          <span className="inline-block w-1 h-4 bg-indigo-400 ml-0.5 animate-pulse opacity-70" />
                        )}
                      </p>
                      {msg.sources?.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-current/10 flex flex-wrap gap-1">
                          {msg.sources.slice(0, 4).map((s, si) => (
                            <span key={si} className="text-[10px] bg-black/20 rounded px-2 py-0.5 opacity-60">
                              {s.source?.split('/').pop() || s.source}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div className="border-t border-slate-800/60 px-4 py-3 flex gap-2 flex-shrink-0">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Ask about territories, HMOs, pipeline KPIs…"
                className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none transition-colors"
                style={{
                  background: '#0f0c29',
                  border: '1px solid #312e81',
                  color: '#e2e8f0',
                }}
              />
              <button onClick={() => handleSend()} disabled={isStreaming || !input.trim()}
                className="p-2.5 rounded-xl transition-colors disabled:opacity-40"
                style={{ background: '#312e81', border: '1px solid #4338ca', color: '#a5b4fc' }}>
                <Send size={16} />
              </button>
            </div>
          </div>
        )}

        {/* ── Territories tab ── */}
        {tab === 'territories' && (
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-sm font-semibold tracking-widest text-slate-400 mb-4 uppercase font-mono flex items-center gap-2">
              <MapPin size={14} style={{ color: '#6366f1' }} /> US Sales Territories
            </h2>
            <div className="grid grid-cols-1 gap-3 max-w-2xl">
              {TERRITORIES.map(t => (
                <div key={t.id} className="rounded-xl border p-4"
                  style={{ borderColor: t.color + '30', background: t.color + '06' }}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                      <span className="font-semibold text-sm" style={{ color: t.color }}>{t.label}</span>
                    </div>
                    <StatusBadge status={t.status} />
                  </div>
                  <p className="text-xs text-slate-400 font-mono mb-2">{t.states}</p>
                  <div className="flex items-center gap-4 text-[10px] text-slate-500">
                    <span><span className="text-slate-300 font-semibold">{t.reps}</span> field reps</span>
                    <button onClick={() => { setTab('chat'); handleSend(`Tell me about the ${t.label} territory — KPIs, rep coverage, and active pilots`) }}
                      className="flex items-center gap-1 hover:text-indigo-400 transition-colors">
                      Ask Oriel4o <ChevronRight size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-600 font-mono">
              Territory data sourced from indexed documents. Index your CRM exports via the URL ingest field in Brain Interface to populate live KPIs.
            </p>
          </div>
        )}

        {/* ── Pipeline tab ── */}
        {tab === 'pipeline' && (
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-sm font-semibold tracking-widest text-slate-400 mb-4 uppercase font-mono flex items-center gap-2">
              <TrendingUp size={14} style={{ color: '#8b5cf6' }} /> Pharma Company Pipeline
            </h2>
            <div className="grid grid-cols-1 gap-4 max-w-2xl">
              {PILOT_COMPANIES.map(c => (
                <div key={c.name} className="rounded-xl border p-4"
                  style={{ borderColor: c.color + '30', background: c.color + '08' }}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Building2 size={13} style={{ color: c.color }} />
                        <span className="font-semibold text-sm text-slate-100">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.stage.toLowerCase()} />
                        <span className="text-[10px] text-slate-500 font-mono">{c.region} · {c.product}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] text-slate-500 mb-0.5">Primary HMO</p>
                      <p className="text-xs text-slate-300 font-mono">{c.hmo}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => { setTab('chat'); handleSend(`Pull the latest KPIs and status for ${c.name} — include pipeline stage, HMO access, and regional coverage`) }}
                      className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded-lg border transition-colors"
                      style={{ borderColor: c.color + '40', color: c.color, background: c.color + '10' }}>
                      <FileText size={10} /> Query Oriel4o
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-600 font-mono">
              Index deal documents and CRM exports to surface live data. These companies are tracked based on indexed knowledge — use the Brain Interface ingest field to add real contract data.
            </p>
          </div>
        )}

        {/* ── HMOs tab ── */}
        {tab === 'hmos' && (
          <div className="flex-1 overflow-y-auto p-6">
            <h2 className="text-sm font-semibold tracking-widest text-slate-400 mb-4 uppercase font-mono flex items-center gap-2">
              <Building2 size={14} style={{ color: '#a78bfa' }} /> HMO Relationships
            </h2>
            <div className="grid grid-cols-1 gap-3 max-w-2xl">
              {HMOS.map(h => (
                <div key={h.name} className="rounded-xl border border-slate-800/50 bg-slate-900/30 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-sm text-slate-100">{h.name}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
                      style={{
                        color: h.tier === 1 ? '#10b981' : '#f59e0b',
                        background: h.tier === 1 ? '#10b98115' : '#f59e0b15',
                        border: `1px solid ${h.tier === 1 ? '#10b98140' : '#f59e0b40'}`,
                      }}>
                      Tier {h.tier}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-slate-500 font-mono">
                    <span><span className="text-slate-300">{h.members}</span> members</span>
                    <span className="text-slate-600">·</span>
                    <span>{h.coverage}</span>
                    <button onClick={() => { setTab('chat'); handleSend(`What is our formulary access and relationship status with ${h.name}?`) }}
                      className="ml-auto flex items-center gap-1 hover:text-indigo-400 transition-colors">
                      Ask Oriel4o <ChevronRight size={10} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-xs text-slate-600 font-mono">
              Index formulary agreements and HMO contracts via Brain Interface to get live relationship status and coverage data.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Auth gate wrapper ─────────────────────────────────────────────────────────
function GatedPharmaSales() {
  const existing = useCorporateAuth()
  const [session, setSession] = useState(existing)
  if (!session) return <CorporateGate onGrant={setSession} />
  return <PharmaSalesInterface session={session} />
}

export default GatedPharmaSales
