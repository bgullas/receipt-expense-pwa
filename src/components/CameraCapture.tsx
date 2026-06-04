import { useRef, useState, useCallback } from 'react'
import { Camera, Upload, X, RotateCcw } from 'lucide-react'

interface Props {
  onCapture: (base64: string) => void
}

export default function CameraCapture({ onCapture }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  const [mode, setMode] = useState<'idle' | 'camera' | 'preview'>('idle')
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      })
      streamRef.current = stream
      if (videoRef.current) videoRef.current.srcObject = stream
      setMode('camera')
    } catch {
      setError('Camera not available. Please use the file upload instead.')
    }
  }, [])

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  const shoot = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    stopCamera()
    setPreview(dataUrl)
    setMode('preview')
  }, [stopCamera])

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      setPreview(dataUrl)
      setMode('preview')
    }
    reader.readAsDataURL(file)
  }, [])

  const confirm = useCallback(() => {
    if (preview) {
      const base64 = preview.split(',')[1]
      onCapture(base64)
      setPreview(null)
      setMode('idle')
    }
  }, [preview, onCapture])

  const reset = useCallback(() => {
    stopCamera()
    setPreview(null)
    setMode('idle')
    setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }, [stopCamera])

  if (mode === 'preview' && preview) {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-lg border border-gray-200">
          <img src={preview} alt="Receipt preview" className="w-full object-contain max-h-96" />
        </div>
        <div className="flex gap-3 w-full max-w-sm">
          <button onClick={reset} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-gray-300 text-gray-700 font-medium hover:bg-gray-50 transition-colors">
            <RotateCcw size={18} /> Retake
          </button>
          <button onClick={confirm} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors">
            Use Photo
          </button>
        </div>
      </div>
    )
  }

  if (mode === 'camera') {
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-full max-w-sm rounded-2xl overflow-hidden shadow-lg bg-black">
          <video ref={videoRef} autoPlay playsInline muted className="w-full" />
          <div className="absolute inset-0 border-2 border-white/30 rounded-2xl pointer-events-none" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-64 border-2 border-white/60 rounded-lg pointer-events-none" />
        </div>
        <div className="flex gap-3 w-full max-w-sm">
          <button onClick={reset} className="flex items-center justify-center w-12 h-12 rounded-full border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors">
            <X size={20} />
          </button>
          <button onClick={shoot} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors shadow-md">
            <Camera size={20} /> Capture Receipt
          </button>
        </div>
        <canvas ref={canvasRef} className="hidden" />
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-sm">
      {error && (
        <div className="w-full px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>
      )}
      <button onClick={startCamera} className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-blue-600 text-white font-semibold text-lg hover:bg-blue-700 active:scale-95 transition-all shadow-md">
        <Camera size={24} /> Take Photo
      </button>
      <div className="text-gray-400 text-sm">or</div>
      <button onClick={() => fileRef.current?.click()} className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl border-2 border-dashed border-gray-300 text-gray-600 font-medium hover:border-blue-400 hover:text-blue-600 transition-colors">
        <Upload size={20} /> Upload from Gallery
      </button>
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  )
}
