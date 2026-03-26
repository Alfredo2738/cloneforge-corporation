const BRAIN_URL = import.meta.env.VITE_BRAIN_URL || 'http://localhost:8000'
const BRAIN_KEY = import.meta.env.VITE_BRAIN_API_KEY || ''

const headers = () => ({
  'Content-Type': 'application/json',
  'X-Brain-Key': BRAIN_KEY,
  'ngrok-skip-browser-warning': 'true',
})

// ── Chat ──────────────────────────────────────────────────────────────────────

export async function* streamChat(messages, collections = ['cloneforge_docs', 'cloneforge_web']) {
  const res = await fetch(`${BRAIN_URL}/chat/stream`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ messages, collections, stream: true }),
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
  const res = await fetch(`${BRAIN_URL}/agents/${agentId}/message`, {
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

export async function synthesizeVoice(text, voiceKey = 'oriel') {
  const res = await fetch(`${BRAIN_URL}/voice/synthesize`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ text, voice_key: voiceKey, format: 'b64' }),
  })
  const data = await res.json()
  return data.audio_b64
}

export function playAudioB64(b64) {
  const audio = new Audio(`data:audio/mpeg;base64,${b64}`)
  return audio.play()
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
