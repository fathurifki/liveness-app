import { useState, useRef, useEffect } from 'react'
import { MdCameraAlt, MdArrowBack, MdRefresh } from 'react-icons/md'
import { saveKtpToHistory, KtpOcrResult } from '../utils/historyStorage'
import { scanKTP, KTPFields } from '../utils/ktpScanner'

interface KtpCameraProps {
  onBack: () => void
  onCapture: (side: 'front' | 'back', image: string) => void
  side: 'front' | 'back'
}

export function KtpCamera({ onBack, onCapture, side }: KtpCameraProps) {
  const [stream, setStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [cutout, setCutout] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  useEffect(() => {
    async function startCamera() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'environment',
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          }
        })
        setStream(mediaStream)
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream
        }
      } catch (err) {
        console.error('Error accessing camera:', err)
      }
    }

    startCamera()

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop())
      }
    }
  }, [])

  // Measure KTP frame position for overlay cutout
  useEffect(() => {
    function measure() {
      if (!containerRef.current || !frameRef.current) return
      const container = containerRef.current.getBoundingClientRect()
      const frame = frameRef.current.getBoundingClientRect()
      setCutout({
        x: frame.left - container.left,
        y: frame.top - container.top,
        w: frame.width,
        h: frame.height,
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const handleCapture = () => {
    if (!videoRef.current || !cutout) return;
    setIsCapturing(true)

    // Capture actual image from video but crop just the KTP frame area
    const video = videoRef.current;

    // Video elements object-cover means the actual drawn video might not map 1:1 to container width/height
    // We need to calculate the actual crop depending on object-cover mechanics.
    // For simplicity given the container usually matches video aspect due to mobile portrait,
    // we use the cutout relative coordinates to crop.

    // Scale factor between the actual video intrinsic size and its displayed size
    const container = containerRef.current?.getBoundingClientRect();
    if (!container) return;

    // We assume the video fills the container with object-cover.
    const videoRatio = video.videoWidth / video.videoHeight;
    const containerRatio = container.width / container.height;

    let drawWidth = container.width;
    let drawHeight = container.height;
    let offsetX = 0;
    let offsetY = 0;

    if (videoRatio > containerRatio) {
      // Video is wider than container - height matches, width is cropped
      drawHeight = video.videoHeight;
      drawWidth = video.videoHeight * containerRatio;
      offsetX = (video.videoWidth - drawWidth) / 2;
    } else {
      // Video is taller than container - width matches, height is cropped
      drawWidth = video.videoWidth;
      drawHeight = video.videoWidth / containerRatio;
      offsetY = (video.videoHeight - drawHeight) / 2;
    }

    // Scale from container coords to video natural coords
    const scaleX = drawWidth / container.width;
    const scaleY = drawHeight / container.height;

    const sourceX = offsetX + (cutout.x * scaleX);
    const sourceY = offsetY + (cutout.y * scaleY);
    const sourceW = cutout.w * scaleX;
    const sourceH = cutout.h * scaleY;

    const canvas = document.createElement("canvas");
    canvas.width = sourceW;
    canvas.height = sourceH;
    const ctx = canvas.getContext("2d");

    setTimeout(() => {
      if (ctx) {
        ctx.drawImage(
          video,
          sourceX, sourceY, sourceW, sourceH, // Source rectangle
          0, 0, sourceW, sourceH // Destination rectangle
        );
        const imageUrl = canvas.toDataURL("image/jpeg", 0.9);
        setIsCapturing(false)
        onCapture(side, imageUrl)
      }
    }, 300)
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center bg-surface-dark overflow-hidden">
      {/* Top Bar - Glassmorphism Overlay */}
      <div className="absolute top-0 left-0 right-0 z-20 px-8 pt-10 pb-16 bg-gradient-to-b from-surface-dark/90 via-surface-dark/40 to-transparent">
        <div className="flex flex-col items-center w-full">
          <div className="w-full flex justify-start mb-6">
            <button
              onClick={onBack}
              className="text-on-dark text-lg font-medium hover:text-on-dark-soft transition-colors"
            >
              Tutup
            </button>
          </div>

          <h3 className="text-on-dark font-normal text-2xl tracking-tight mb-4 text-center">Ambil Foto KTP Anda</h3>
          <p className="text-on-dark-soft text-sm text-center leading-relaxed max-w-[280px]">
            Pastikan pencahayaan cukup dan tulisan pada KTP terbaca jelas sebelum melanjutkan.
          </p>
        </div>
      </div>

      {/* Camera Preview */}
      <div ref={containerRef} className="relative w-full h-full flex items-center justify-center overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Overlay with transparent cutout for KTP area */}
        {cutout && (
          <svg className="absolute inset-0 z-10 w-full h-full pointer-events-none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <mask id="ktp-cutout">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={cutout.x}
                  y={cutout.y}
                  width={cutout.w}
                  height={cutout.h}
                  rx={12}
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(10,11,13,0.65)"
              mask="url(#ktp-cutout)"
            />
          </svg>
        )}

        {/* KTP Guide Frame */}
        <div ref={frameRef} className="relative z-20 w-[88%] aspect-[1.586/1] border-2 border-dashed border-on-dark/40 rounded-xl pointer-events-none flex items-center justify-center">
          <div className="w-3/4 opacity-40">
            <svg viewBox="0 0 240 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <circle cx="50" cy="60" r="22" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
              <path d="M28 105 C28 85, 72 85, 72 105" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
              <line x1="110" y1="45" x2="190" y2="45" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
              <line x1="110" y1="65" x2="210" y2="65" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
              <line x1="110" y1="85" x2="180" y2="85" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
              <line x1="110" y1="105" x2="200" y2="105" stroke="white" strokeWidth="2" strokeDasharray="4 4" />
            </svg>
          </div>
        </div>
      </div>

      {/* Controls - Glassmorphism Button Area */}
      <div className="absolute bottom-0 left-0 right-0 z-30 p-10 flex flex-col items-center bg-gradient-to-t from-surface-dark/90 via-surface-dark/40 to-transparent">
        <button
          onClick={handleCapture}
          disabled={isCapturing}
          className="w-full max-w-sm py-5 bg-primary text-on-primary text-lg font-bold rounded-pill shadow-[0_8px_32px_rgba(0,82,255,0.3)] active:scale-[0.98] transition-all hover:bg-primary-active"
        >
          {isCapturing ? 'Mengambil Foto...' : 'Ambil Foto'}
        </button>
      </div>
    </div>
  )
}

function IdPlaceholder({ side }: { side: 'front' | 'back' }) {
  const isFront = side === 'front';

  return (
    <div className="relative w-full aspect-[1.586/1] bg-white/45 backdrop-blur-md rounded-xl border border-hairline flex items-center justify-center overflow-hidden">
      <div className="w-3/4 opacity-20">
        <svg viewBox="0 0 240 150" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
          {isFront ? (
            <>
              <circle cx="50" cy="75" r="30" fill="#000" />
              <rect x="110" y="50" width="100" height="8" rx="4" fill="#000" />
              <rect x="110" y="70" width="120" height="8" rx="4" fill="#000" />
              <rect x="110" y="90" width="90" height="8" rx="4" fill="#000" />
            </>
          ) : (
            <>
              <rect x="30" y="50" width="100" height="8" rx="4" fill="#000" />
              <rect x="30" y="70" width="120" height="8" rx="4" fill="#000" />
              <rect x="30" y="90" width="90" height="8" rx="4" fill="#000" />
              <circle cx="190" cy="75" r="30" fill="#000" />
            </>
          )}
        </svg>
      </div>
    </div>
  )
}

export function KtpVerificationFlow() {
  const [step, setStep] = useState<'instructions' | 'camera' | 'review'>('instructions')
  const [images, setImages] = useState<{ front?: string }>({})
  const [isScanning, setIsScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState('')
  const [ocrData, setOcrData] = useState<KtpOcrResult | null>(null)

  const handleCapture = async (_side: 'front' | 'back', image: string) => {
    setImages({ front: image })
    setIsScanning(true)
    try {
      const result = await scanKTP(image, (step) => setScanProgress(step))
      const mappedData: KtpOcrResult = {
        nik: result.nik || '',
        nama: result.nama || '',
        tempatLahir: result.tmp_lahir || '',
        tanggalLahir: result.tgl_lahir || '',
        alamat: result.alamat || '',
        rt_rw: result.rt_rw || '',
        kelurahan_desa: result.kelurahan_desa || '',
        kecamatan: result.kecamatan || '',
        agama: result.agama || '',
        jenis_kelamin: result.jenis_kelamin || '',
        golongan_darah: result.golongan_darah || '',
        pekerjaan: result.pekerjaan || '',
        kewarganegaraan: result.kewarganegaraan || '',
        status_perkawinan: result.status_perkawinan || '',
        berlaku_hingga: result.berlaku_hingga || ''
      }
      setOcrData(mappedData)
      setStep('review')
    } catch (err) {
      console.error('OCR Error:', err)
      alert('Gagal membaca KTP. Silakan ambil ulang.')
    } finally {
      setIsScanning(false)
    }
  }

  const handleConfirm = () => {
    if (!images.front || !ocrData) return
    saveKtpToHistory(images.front, ocrData, 'passed')
    alert('Data KTP Disimpan dan dimasukkan ke History')
    setStep('instructions')
    setImages({}) // Reset state
  }

  return (
    <div className="relative flex flex-col h-full w-full liveness-glass-surface rounded-xl overflow-hidden shadow-xl">
      {step === 'instructions' ? (
        <div className="flex flex-col h-full p-4 overflow-y-auto">
          <div className="flex items-center w-full shrink-0">
            <button className="p-2 -ml-2 hover:bg-white/40 rounded-full transition-colors text-ink">
              <MdArrowBack className="w-7 h-7" />
            </button>
          </div>

          <div className="flex flex-col items-center text-center mb-4 px-4 shrink-0">
            <h2 className="text-3xl font-normal text-ink mb-4 tracking-tight">Ambil Foto KTP Anda</h2>
            <p className="text-body text-base leading-relaxed max-w-[280px]">
              Ambil foto bagian depan KTP Anda dengan jelas.
            </p>
            <button className="mt-4 text-primary font-bold text-sm hover:underline">
              Jika Anda memiliki pertanyaan, silakan kunjungi Pusat Bantuan kami
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center gap-8 max-w-sm mx-auto w-full my-auto">
            <div className="relative">
              <span className="block text-ink font-bold text-sm mb-4 uppercase tracking-wider">Depan</span>
              <IdPlaceholder side="front" />
              {images.front && (
                <div className="absolute inset-0 top-9 rounded-xl overflow-hidden border-2 border-primary shadow-sm">
                  <img src={images.front} className="w-full h-full object-cover" alt="KTP Front" />
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 pt-8 mt-auto">
            <button
              onClick={() => setStep('camera')}
              className="w-full py-5 bg-primary text-on-primary text-lg font-bold rounded-pill shadow-[0_8px_32px_rgba(0,82,255,0.3)] active:scale-[0.98] transition-all hover:bg-primary-active"
            >
              {images.front ? 'Ambil Ulang' : 'Lanjut'}
            </button>
          </div>
        </div>
      ) : step === 'camera' ? (
        <KtpCamera
          side="front"
          onBack={() => setStep('instructions')}
          onCapture={handleCapture}
        />
      ) : (
        <div className="flex flex-col h-full bg-canvas overflow-y-auto">
          {isScanning && (
            <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-surface-dark/80 backdrop-blur-sm">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
              <p className="text-on-dark font-medium">{scanProgress || 'Memproses KTP...'}</p>
            </div>
          )}
          {/* Review Header */}
          <div className="flex items-center px-6 pt-8 pb-4 border-b border-hairline sticky top-0 bg-canvas/90 backdrop-blur-md z-10">
            <button
              onClick={() => setStep('instructions')}
              className="p-2 -ml-2 mr-4 hover:bg-surface-soft rounded-full transition-colors text-ink"
            >
              <MdArrowBack className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-semibold text-ink tracking-tight">Hasil KTP</h2>
          </div>

          <div className="p-6 flex flex-col gap-8">
            {/* Captured Image */}
            <div className="flex flex-col gap-3">
              <span className="text-sm font-semibold text-ink uppercase tracking-wider">Foto KTP</span>
              <div className="relative w-full aspect-[1.586/1] rounded-xl overflow-hidden shadow-sm border border-hairline bg-surface-soft">
                {images.front && (
                  <img src={images.front} className="w-full h-full object-cover" alt="KTP Front Result" />
                )}
              </div>
              <button
                onClick={() => setStep('camera')}
                className="self-start text-primary text-sm font-bold hover:underline"
              >
                Ambil ulang foto
              </button>
            </div>

            {/* OCR Results */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between pb-2 border-b border-hairline">
                <span className="text-sm font-semibold text-ink uppercase tracking-wider">Data Terdeteksi</span>
                <span className="text-xs font-bold text-semantic-up bg-semantic-up/10 px-2 py-1 rounded">Berhasil</span>
              </div>

              {ocrData ? (
                <div className="grid grid-cols-1 gap-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wider">NIK</span>
                    <span className="text-base font-medium text-ink font-mono">{ocrData.nik || '-'}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wider">Nama Lengkap</span>
                    <span className="text-base font-medium text-ink">{ocrData.nama || '-'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wider">Tempat Lahir</span>
                      <span className="text-base font-medium text-ink">{ocrData.tempatLahir || '-'}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted uppercase tracking-wider">Tgl Lahir</span>
                      <span className="text-base font-medium text-ink">{ocrData.tanggalLahir || '-'}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-muted uppercase tracking-wider">Alamat</span>
                    <span className="text-base font-medium text-ink">{ocrData.alamat || '-'}</span>
                  </div>
                </div>
              ) : (
                <div className="py-8 text-center text-muted italic">
                  Gagal mengekstrak data otomatis
                </div>
              )}
            </div>

            <button
              onClick={handleConfirm}
              className="mt-4 w-full py-4 bg-primary text-on-primary text-base font-bold rounded-pill active:scale-[0.98] transition-all hover:bg-primary-active shadow-sm"
            >
              Konfirmasi Data
            </button>
          </div>
        </div>
      )}
    </div>
  )
}