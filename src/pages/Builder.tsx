import { useState, useEffect } from 'react'
import { MdCheckCircle, MdCloudDownload, MdCheck } from 'react-icons/md'
import { api } from '../lib/api'

type PackageManager = 'npm' | 'pnpm' | 'yarn'
type ChallengeType = 'blink' | 'nod_top' | 'nod_bottom' | 'yaw_left' | 'yaw_right' | 'smile' | 'open_mouth' | 'gaze_target'

interface Model {
  id: string
  name: string
  version: string
  file_path: string
  accuracy: number | null
  fpr: number | null
  fnr: number | null
  created_at: number
  is_active: number
}

const packageManagers: PackageManager[] = ['npm', 'pnpm', 'yarn']
const inputClass = 'h-12 rounded-md border border-hairline bg-canvas px-4 text-[15px] text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15'

const challengeIcons: Record<ChallengeType, React.ReactNode> = {
  blink: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5C7 5 3 12 3 12s4 7 9 7 9-7 9-7-4-7-9-7z" />
    </svg>
  ),
  nod_top: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  nod_bottom: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  yaw_left: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  yaw_right: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  smile: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01" strokeLinecap="round" />
    </svg>
  ),
  open_mouth: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="14" r="3" />
      <path d="M9 9h.01M15 9h.01" strokeLinecap="round" />
    </svg>
  ),
  gaze_target: (
    <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  ),
}

const challengeOptions: Array<{ type: ChallengeType; label: string }> = [
  { type: 'blink', label: 'Kedip' },
  { type: 'nod_top', label: 'Angguk ↑' },
  { type: 'nod_bottom', label: 'Angguk ↓' },
  { type: 'yaw_left', label: 'Yaw ←' },
  { type: 'yaw_right', label: 'Yaw →' },
  { type: 'smile', label: 'Senyum' },
  { type: 'open_mouth', label: 'Buka Mulut' },
  { type: 'gaze_target', label: 'Lihat Titik' },
]

function FieldLabel({ children }: { children: string }) {
  return <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{children}</span>
}

function TextField({
  label,
  value,
  placeholder,
  mono,
  required,
  onChange,
}: {
  label: string
  value: string
  placeholder: string
  mono?: boolean
  required?: boolean
  onChange: (value: string) => void
}) {
  return (
    <label className="grid gap-2">
      <FieldLabel>{label}</FieldLabel>
      <input
        value={value}
        required={required}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputClass} ${mono ? 'font-mono' : ''}`}
        placeholder={placeholder}
      />
    </label>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  onChange: (value: number) => void
}) {
  const formattedValue = Number.isInteger(value) ? String(value) : value.toFixed(2)

  return (
    <label className="rounded-xl border border-hairline-soft bg-surface-soft p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <FieldLabel>{label}</FieldLabel>
        <span className="font-mono text-sm font-medium text-ink">
          {formattedValue}{suffix || ''}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-primary"
      />
    </label>
  )
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default function Builder() {
  const [projectName, setProjectName] = useState('acme-liveness-check')
  const [appTitle, setAppTitle] = useState('ACME Liveness Gate')
  const [apiUrl, setApiUrl] = useState('http://localhost:3001')
  const [verifyApiUrl, setVerifyApiUrl] = useState('https://api.acme.com/v1/verify/{sessionId}')
  const [callbackApiUrl, setCallbackApiUrl] = useState('https://api.acme.com/v1/callback/{sessionId}')
  const [publicKey, setPublicKey] = useState('')
  const [gitRemote, setGitRemote] = useState('')
  const [packageManager, setPackageManager] = useState<PackageManager>('npm')

  // SDK Settings - Challenge Configuration
  const [enabledChallenges, setEnabledChallenges] = useState<ChallengeType[]>(['blink', 'smile'])
  const [challengeCount, setChallengeCount] = useState(2)
  const [timeoutSeconds, setTimeoutSeconds] = useState(6)

  // SDK Settings - Thresholds
  const [antiSpoofThreshold, setAntiSpoofThreshold] = useState(0.25)
  const [passScore, setPassScore] = useState(70)

  // SDK Settings - Quality
  const [minBrightness, setMinBrightness] = useState(40)
  const [maxBrightness, setMaxBrightness] = useState(220)
  const [minBlurScore, setMinBlurScore] = useState(18)
  const [minFaceSize, setMinFaceSize] = useState(0.10)
  const [maxFaceSize, setMaxFaceSize] = useState(0.80)

  const [generating, setGenerating] = useState(false)
  const [generatedFile, setGeneratedFile] = useState('')
  const [models, setModels] = useState<Model[]>([])
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(true)

  useEffect(() => {
    api.getModels()
      .then((data: any) => {
        const modelList = Array.isArray(data) ? data : data.models || []
        setModels(modelList)
        if (modelList.length > 0) {
          setSelectedModelIds([modelList[0].id])
        }
      })
      .catch((err: Error) => console.error('Failed to load models:', err))
      .finally(() => setLoadingModels(false))
  }, [])

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!projectName || !appTitle || !apiUrl) return

    setGenerating(true)
    setGeneratedFile('')

    try {
      const payload = {
        projectName,
        appTitle,
        apiUrl,
        verifyApiUrl,
        callbackApiUrl,
        publicKey,
        gitRemote,
        packageManager,
        modelIds: selectedModelIds,
        liveness: {
          enabledChallenges,
          challengeCount: Math.min(challengeCount, enabledChallenges.length),
          timeoutSeconds,
          antiSpoofThreshold,
          passScore,
          minBrightness,
          maxBrightness,
          minBlurScore,
          minFaceSize,
          maxFaceSize,
        },
      }

      const { blob, fileName } = await api.generateReactProject(payload)
      downloadBlob(blob, fileName)
      setGeneratedFile(fileName)
    } catch (error) {
      console.error('Generation failed:', error)
      alert('Failed to generate project. Check console for details.')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-canvas via-surface-soft/30 to-canvas">
      <div className="max-w-7xl mx-auto px-8 py-12">
        <div className="mb-10">
          <h1 className="text-display-sm font-semibold tracking-tight text-ink">Project Builder</h1>
          <p className="mt-3 text-body">
            Generate a ready-to-run React project with liveness SDK pre-configured.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Project Info */}
          <section className="rounded-xl border border-hairline bg-canvas p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <h2 className="mb-6 text-title-md text-ink">Project Info</h2>
            <div className="grid gap-5 md:grid-cols-2">
              <TextField
                label="Project Name"
                value={projectName}
                onChange={setProjectName}
                placeholder="acme-liveness-check"
                mono
                required
              />
              <TextField
                label="App Title"
                value={appTitle}
                onChange={setAppTitle}
                placeholder="ACME Liveness Gate"
                required
              />
              <TextField
                label="API URL"
                value={apiUrl}
                onChange={setApiUrl}
                placeholder="http://localhost:3001"
                mono
                required
              />
              <TextField
                label="Public Key"
                value={publicKey}
                onChange={setPublicKey}
                placeholder="Optional browser-safe key"
                mono
              />
              <div className="md:col-span-2">
                <TextField
                  label="Verification API URL (Optional)"
                  value={verifyApiUrl}
                  onChange={setVerifyApiUrl}
                  placeholder="https://api.acme.com/v1/verify/{sessionId}"
                  mono
                />
                <p className="mt-1 text-xs text-muted">API to validate the session before starting liveness. Use <code className="bg-surface-strong px-1 rounded">{'{sessionId}'}</code> for dynamic routing.</p>
              </div>
              <div className="md:col-span-2">
                <TextField
                  label="Callback API URL (Optional)"
                  value={callbackApiUrl}
                  onChange={setCallbackApiUrl}
                  placeholder="https://api.acme.com/v1/callback/{sessionId}"
                  mono
                />
                <p className="mt-1 text-xs text-muted">API to POST results after liveness check completes.</p>
              </div>
              <div className="md:col-span-2">
                <TextField
                  label="Git Remote URL (Optional)"
                  value={gitRemote}
                  onChange={setGitRemote}
                  placeholder="git@github.com:acme/liveness-web.git"
                  mono
                />
                <p className="mt-1 text-xs text-muted">Auto-initialize Git repository and set this remote origin.</p>
              </div>
            </div>
          </section>

          {/* Package Manager */}
          <section className="rounded-xl border border-hairline bg-canvas p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <h2 className="mb-6 text-title-md text-ink">Package Manager</h2>
            <div className="flex gap-3">
              {packageManagers.map((pm) => (
                <button
                  key={pm}
                  type="button"
                  onClick={() => setPackageManager(pm)}
                  className={`flex-1 rounded-lg border py-3 text-sm font-semibold transition ${
                    packageManager === pm
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-hairline bg-canvas text-body hover:border-primary/40'
                  }`}
                >
                  {pm}
                </button>
              ))}
            </div>
          </section>

          {/* SDK Settings - Challenge Types */}
          <section className="rounded-xl border border-hairline bg-canvas p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <h2 className="mb-2 text-title-md text-ink">Challenge Types</h2>
            <p className="mb-6 text-body-sm text-body">
              Pilih jenis challenge yang akan digunakan untuk verifikasi liveness.
            </p>
            <div className="grid grid-cols-4 gap-3">
              {challengeOptions.map(({ type, label }) => {
                const isEnabled = enabledChallenges.includes(type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setEnabledChallenges((prev) =>
                        prev.includes(type)
                          ? prev.length === 1 ? prev : prev.filter((t) => t !== type)
                          : [...prev, type]
                      )
                    }}
                    className={`flex flex-col items-center gap-2 rounded-lg border p-4 text-sm font-semibold transition ${
                      isEnabled
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-hairline bg-canvas text-body hover:border-primary/40'
                    }`}
                  >
                    {challengeIcons[type]}
                    {label}
                  </button>
                )
              })}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <NumberField
                label="Jumlah Challenge"
                value={challengeCount}
                min={1}
                max={enabledChallenges.length}
                step={1}
                onChange={setChallengeCount}
              />
              <NumberField
                label="Timeout per Challenge"
                value={timeoutSeconds}
                min={3}
                max={30}
                step={1}
                suffix="s"
                onChange={setTimeoutSeconds}
              />
            </div>
          </section>

          {/* SDK Settings - Thresholds */}
          <section className="rounded-xl border border-hairline bg-canvas p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <h2 className="mb-2 text-title-md text-ink">Detection Thresholds</h2>
            <p className="mb-6 text-body-sm text-body">
              Atur threshold untuk anti-spoof dan passing score.
            </p>
            <div className="grid gap-4 md:grid-cols-2">
              <NumberField
                label="Anti-Spoof Threshold"
                value={antiSpoofThreshold}
                min={0.1}
                max={0.6}
                step={0.05}
                onChange={setAntiSpoofThreshold}
              />
              <NumberField
                label="Pass Score"
                value={passScore}
                min={50}
                max={95}
                step={5}
                suffix="%"
                onChange={setPassScore}
              />
            </div>
          </section>

          {/* SDK Settings - Quality */}
          <section className="rounded-xl border border-hairline bg-canvas p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <h2 className="mb-2 text-title-md text-ink">Quality Settings</h2>
            <p className="mb-6 text-body-sm text-body">
              Atur threshold kualitas gambar untuk brightness, sharpness, dan ukuran wajah.
            </p>
            <div className="grid gap-4">
              <NumberField
                label="Min Brightness"
                value={minBrightness}
                min={20}
                max={100}
                step={5}
                onChange={setMinBrightness}
              />
              <NumberField
                label="Max Brightness"
                value={maxBrightness}
                min={180}
                max={240}
                step={5}
                onChange={setMaxBrightness}
              />
              <NumberField
                label="Min Blur Score (Sharpness)"
                value={minBlurScore}
                min={10}
                max={50}
                step={1}
                onChange={setMinBlurScore}
              />
              <div className="grid gap-4 md:grid-cols-2">
                <NumberField
                  label="Min Face Size"
                  value={minFaceSize}
                  min={0.05}
                  max={0.30}
                  step={0.01}
                  suffix="%"
                  onChange={setMinFaceSize}
                />
                <NumberField
                  label="Max Face Size"
                  value={maxFaceSize}
                  min={0.50}
                  max={0.95}
                  step={0.01}
                  suffix="%"
                  onChange={setMaxFaceSize}
                />
              </div>
            </div>
          </section>

          {/* Anti-Spoof Models */}
          <section className="rounded-xl border border-hairline bg-canvas p-8 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <h2 className="mb-2 text-title-md text-ink">Anti-Spoof Models</h2>
            <p className="mb-6 text-body-sm text-body">
              Select one or more models to bundle. The first selected model will be the default.
            </p>

            {loadingModels ? (
              <div className="text-body-sm text-muted">Loading models...</div>
            ) : models.length === 0 ? (
              <div className="text-body-sm text-muted">No models available</div>
            ) : (
              <div className="grid gap-3">
                {models.map((model) => {
                  const isSelected = selectedModelIds.includes(model.id)
                  const isFirst = selectedModelIds[0] === model.id

                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        setSelectedModelIds((prev) =>
                          prev.includes(model.id)
                            ? prev.filter((id) => id !== model.id)
                            : [...prev, model.id]
                        )
                      }}
                      className={`flex items-start gap-4 rounded-lg border p-5 text-left transition ${
                        isSelected
                          ? 'border-primary bg-primary/5'
                          : 'border-hairline bg-canvas hover:border-primary/40'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                          isSelected
                            ? 'border-primary bg-primary'
                            : 'border-hairline bg-canvas'
                        }`}
                      >
                        {isSelected && <MdCheck className="h-4 w-4 text-white" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink">{model.name}</span>
                          <span className="text-xs text-muted">v{model.version}</span>
                          {isFirst && (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                              Default
                            </span>
                          )}
                        </div>
                        {model.accuracy !== null && (
                          <p className="mt-1 text-sm text-body">
                            Accuracy: {(model.accuracy * 100).toFixed(1)}%
                            {model.fpr !== null && ` • FPR: ${(model.fpr * 100).toFixed(2)}%`}
                          </p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </section>

          {/* Generate Button */}
          <div className="rounded-xl border border-hairline bg-canvas p-6 shadow-[0_4px_12px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-title-md text-ink">Ready to Generate</h2>
                <p className="mt-1 text-body-sm text-body">
                  ZIP contains React source, env template, and package setup.
                </p>
              </div>
              <button
                type="submit"
                disabled={generating}
                className="flex w-full items-center justify-center gap-2 rounded-pill bg-primary py-4 text-title-sm font-semibold text-white shadow-lg transition hover:bg-primary-active focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto md:px-8"
              >
                {generating ? (
                  <>
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <MdCloudDownload className="h-5 w-5" />
                    <span>Generate Project</span>
                  </>
                )}
              </button>
            </div>

            {generatedFile && (
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-semantic-up/10 px-4 py-3 text-sm text-semantic-up">
                <MdCheckCircle className="h-5 w-5 flex-shrink-0" />
                <span className="font-medium">Downloaded: {generatedFile}</span>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
