/**
 * FaceAuth — SCIF biometric face recognition layer
 *
 * Uses face-api.js (browser-side, WebGL) to compute a 128-dim face descriptor.
 * Enrollment: capture → send descriptor to /scif/face/enroll (stored in Postgres)
 * Verification: capture → send descriptor to /scif/face/verify (Euclidean distance < 0.6)
 *
 * Models served from /public/models/ (face-api.js SSD MobileNet v1 + landmark + recognition)
 * Install: npm install face-api.js
 * Models: download from https://github.com/justadudewhohacks/face-api.js/tree/master/weights
 *         and place in public/models/
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { enrollFacePrint, verifyFace } from '../api/brain'

// Lazy-load face-api to avoid blocking initial bundle
let faceapi = null
let modelsLoaded = false

async function loadFaceApi() {
  if (modelsLoaded) return faceapi
  faceapi = await import('face-api.js')
  const MODEL_URL = '/models'
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ])
  modelsLoaded = true
  return faceapi
}

const FOUNDER_LABELS = { alfred: 'Alfred Pinkerton', diana: 'Diana Safina' }

// mode: 'enroll' | 'verify'
export default function FaceAuth({ principal, mode = 'verify', onResult, onClose }) {
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const intervalRef = useRef(null)

  const [status, setStatus] = useState('loading') // loading | ready | scanning | success | fail | error
  const [message, setMessage] = useState('Loading face recognition models...')
  const [confidence, setConfidence] = useState(null)

  const stopCamera = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }, [])

  // Compute descriptor from current video frame
  const getDescriptor = useCallback(async (api) => {
    const detection = await api
      .detectSingleFace(videoRef.current, new api.SsdMobilenetv1Options({ minConfidence: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor()
    return detection?.descriptor ?? null
  }, [])

  const handleEnroll = useCallback(async (api) => {
    setStatus('scanning')
    setMessage('Hold still — capturing face...')
    // Capture 3 samples and use the first successful one
    for (let attempt = 0; attempt < 5; attempt++) {
      await new Promise(r => setTimeout(r, 600))
      const descriptor = await getDescriptor(api)
      if (!descriptor) continue

      setMessage('Face detected — enrolling...')
      const result = await enrollFacePrint(principal, descriptor)
      if (result.enrolled) {
        setStatus('success')
        setMessage(`Face enrolled for ${FOUNDER_LABELS[principal] || principal}.`)
        stopCamera()
        onResult?.({ enrolled: true, principal })
        return
      }
    }
    setStatus('fail')
    setMessage('No face detected clearly. Ensure good lighting and face the camera directly.')
  }, [principal, getDescriptor, stopCamera, onResult])

  const handleVerify = useCallback(async (api) => {
    setStatus('scanning')
    setMessage('Scanning...')

    intervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return
      const descriptor = await getDescriptor(api)
      if (!descriptor) {
        setMessage('No face detected — position yourself in the frame.')
        return
      }

      const result = await verifyFace(principal, descriptor)
      clearInterval(intervalRef.current)
      stopCamera()

      if (result.reason === 'no_enrollment') {
        setStatus('fail')
        setMessage('No face print enrolled yet. Use enrollment mode first.')
        onResult?.({ verified: false, reason: 'no_enrollment' })
        return
      }

      if (result.verified) {
        setStatus('success')
        setConfidence(result.confidence)
        setMessage(`Identity confirmed — ${FOUNDER_LABELS[principal] || principal}`)
        onResult?.({ verified: true, principal, confidence: result.confidence })
      } else {
        setStatus('fail')
        setMessage('Face not recognized. Access denied.')
        onResult?.({ verified: false, principal, distance: result.distance })
      }
    }, 800)
  }, [principal, getDescriptor, stopCamera, onResult])

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const api = await loadFaceApi()
        if (cancelled) return

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }

        setStatus('ready')
        setMessage(mode === 'enroll' ? 'Camera ready — click Enroll to capture.' : 'Camera ready — verifying...')

        if (mode === 'verify') {
          await handleVerify(api)
        }
      } catch (err) {
        if (!cancelled) {
          setStatus('error')
          setMessage(err.name === 'NotAllowedError'
            ? 'Camera access denied. Allow camera in browser settings.'
            : `Face recognition error: ${err.message}`)
        }
      }
    }
    init()
    return () => {
      cancelled = true
      stopCamera()
    }
  }, [mode, handleVerify, stopCamera])

  const statusColors = {
    loading: 'text-zinc-400',
    ready: 'text-zinc-300',
    scanning: 'text-violet-400',
    success: 'text-emerald-400',
    fail: 'text-rose-400',
    error: 'text-red-500',
  }

  const borderColors = {
    loading: 'border-zinc-700',
    ready: 'border-zinc-600',
    scanning: 'border-violet-500',
    success: 'border-emerald-500',
    fail: 'border-rose-500',
    error: 'border-red-600',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-sm mx-4 bg-zinc-900 border border-zinc-700 rounded-2xl overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <div>
            <p className="text-xs text-zinc-500 uppercase tracking-widest font-mono">SCIF Biometric</p>
            <p className="text-sm text-zinc-200 font-medium mt-0.5">
              {mode === 'enroll' ? 'Face Enrollment' : 'Face Verification'} — {FOUNDER_LABELS[principal] || principal}
            </p>
          </div>
          <button onClick={() => { stopCamera(); onClose?.() }}
            className="text-zinc-500 hover:text-zinc-300 text-xl leading-none">✕</button>
        </div>

        {/* Video feed */}
        <div className={`relative mx-5 mt-5 rounded-xl overflow-hidden border-2 ${borderColors[status]} transition-colors duration-300`}>
          <video
            ref={videoRef}
            className="w-full aspect-square object-cover scale-x-[-1]"
            playsInline
            muted
          />
          {/* Scanning overlay */}
          {status === 'scanning' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-36 h-36 rounded-full border-2 border-violet-400/60 animate-pulse" />
              <div className="absolute w-28 h-28 rounded-full border border-violet-400/30" />
            </div>
          )}
          {/* Success overlay */}
          {status === 'success' && (
            <div className="absolute inset-0 bg-emerald-900/40 flex items-center justify-center">
              <div className="text-4xl">✓</div>
            </div>
          )}
          {/* Fail overlay */}
          {(status === 'fail' || status === 'error') && (
            <div className="absolute inset-0 bg-rose-900/40 flex items-center justify-center">
              <div className="text-4xl">✗</div>
            </div>
          )}
        </div>

        {/* Status message */}
        <div className="px-5 py-4">
          <p className={`text-sm font-mono ${statusColors[status]}`}>{message}</p>
          {confidence !== null && status === 'success' && (
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Confidence: {Math.round(confidence * 100)}%
            </p>
          )}
        </div>

        {/* Action buttons */}
        <div className="px-5 pb-5 flex gap-3">
          {mode === 'enroll' && status === 'ready' && (
            <button
              onClick={async () => {
                const api = await loadFaceApi()
                handleEnroll(api)
              }}
              className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Enroll Face
            </button>
          )}
          {(status === 'success' || status === 'fail' || status === 'error') && (
            <button
              onClick={() => { stopCamera(); onClose?.() }}
              className="flex-1 py-2.5 bg-zinc-700 hover:bg-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Close
            </button>
          )}
          {status === 'fail' && mode === 'enroll' && (
            <button
              onClick={() => window.location.reload()}
              className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
