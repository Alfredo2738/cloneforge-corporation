const BRAIN_URL = import.meta.env.VITE_BRAIN_URL
if (!BRAIN_URL) throw new Error('VITE_BRAIN_URL is not set — check vercel.json build.env')
const BRAIN_KEY = import.meta.env.VITE_BRAIN_API_KEY || ''

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Brain-Key': BRAIN_KEY,
  'ngrok-skip-browser-warning': 'true',
})

// ── Resilient fetch — retries on network/503 errors with exponential backoff ──
async function resilientFetch(url, opts, { maxAttempts = 4, baseDelay = 800 } = {}) {
  let delay = baseDelay
  let lastErr
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(url, opts)
      if (res.status === 503 && attempt < maxAttempts) {
        // Brain is redeploying — wait and retry
        await new Promise(r => setTimeout(r, delay))
        delay = Math.min(delay * 2, 8000)
        continue
      }
      return res
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) {
        await new Promise(r => setTimeout(r, delay))
        delay = Math.min(delay * 2, 8000)
      }
    }
  }
  throw lastErr || new Error('Brain unavailable after retries')
}

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function* streamChat(messages, collections = ['cloneforge_docs', 'cloneforge_medical_records', 'cloneforge_web'], language = 'en') {
  const res = await resilientFetch(`${BRAIN_URL}/chat/stream`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ messages, collections, stream: true, language }),
  })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6))
          yield event
        } catch {}
      }
    }
  }
}

// ── Agents ────────────────────────────────────────────────────────────────────

export async function spawnAgent(name, type = 'subagent', specialty = 'medical') {
  const res = await fetch(`${BRAIN_URL}/agents/spawn`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name, type, specialty }),
  })
  return res.json()
}

export async function listAgents() {
  const res = await fetch(`${BRAIN_URL}/agents/list`, { headers: headers() })
  return res.json()
}

export async function* streamAgentMessage(agentId, message, collections) {
  const res = await resilientFetch(`${BRAIN_URL}/agents/${agentId}/message`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ message, collections }),
  })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { yield JSON.parse(line.slice(6)) } catch {}
      }
    }
  }
}

export async function* streamAgentToAgent(fromId, toId, message) {
  const res = await fetch(`${BRAIN_URL}/agents/talk`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ from_id: fromId, to_id: toId, message }),
  })
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { yield JSON.parse(line.slice(6)) } catch {}
      }
    }
  }
}

export async function terminateAgent(agentId) {
  const res = await fetch(`${BRAIN_URL}/agents/${agentId}`, {
    method: 'DELETE', headers: headers(),
  })
  return res.json()
}

// ── Voice ─────────────────────────────────────────────────────────────────────

export async function synthesizeVoice(text, voiceKey = 'oriel', languageCode = null) {
  const res = await fetch(`${BRAIN_URL}/voice/synthesize`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ text, voice_key: voiceKey, format: 'b64', language_code: languageCode }),
  })
  const data = await res.json()
  return data.audio_b64
}

// Shared AudioContext — keeps browser autoplay permission alive across agent turns
let _audioCtx = null
function getAudioContext() {
  if (!_audioCtx || _audioCtx.state === 'closed') {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  }
  return _audioCtx
}

export async function playAudioB64(b64) {
  try {
    const ctx = getAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()

    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    const buffer = await ctx.decodeAudioData(bytes.buffer)
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    return new Promise((resolve) => {
      source.onended = resolve
      source.start(0)
    })
  } catch (err) {
    // Fallback to HTML Audio element
    console.warn('AudioContext playback failed, falling back:', err)
    const audio = new Audio(`data:audio/mpeg;base64,${b64}`)
    return audio.play().catch(() => {})
  }
}

// ── Ingest ────────────────────────────────────────────────────────────────────

export async function ingestUrls(urls, background = true) {
  const res = await fetch(`${BRAIN_URL}/ingest/urls`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ urls, background }),
  })
  return res.json()
}

export async function getIngestStatus() {
  const res = await fetch(`${BRAIN_URL}/ingest/status`, { headers: headers() })
  return res.json()
}

// ── Status ────────────────────────────────────────────────────────────────────

export async function getBrainStatus() {
  const res = await fetch(`${BRAIN_URL}/status`)
  return res.json()
}

// ── Forge Ledger ───────────────────────────────────────────────────────────────

export async function getLedgerStats() {
  const res = await fetch(`${BRAIN_URL}/ledger/stats`, { headers: headers() })
  return res.json()
}
