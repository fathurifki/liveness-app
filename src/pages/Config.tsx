import { useEffect, useState } from 'react'
import { api } from '../lib/api'

interface ConfigValues {
  antiSpoofThreshold: number
  minBrightness: number
  maxBrightness: number
  minBlurScore: number
  minFaceSize: number
  maxFaceSize: number
  passScore: number
  challengeCount: number
  challengeTimeoutMs: number
}

interface SavedConfig {
  id: string
  name: string
  preset_type: string
  config: ConfigValues
  model_id: string | null
  created_at: number
}

const DEFAULT_CONFIG: ConfigValues = {
  antiSpoofThreshold: 0.70,
  minBrightness: 40,
  maxBrightness: 220,
  minBlurScore: 80,
  minFaceSize: 0.15,
  maxFaceSize: 0.80,
  passScore: 70,
  challengeCount: 2,
  challengeTimeoutMs: 8000,
}

export default function Config() {
  const [config, setConfig] = useState<ConfigValues>(DEFAULT_CONFIG)
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([])
  const [presets, setPresets] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveName, setSaveName] = useState('')

  useEffect(() => {
    loadConfigs()
    loadPresets()
  }, [])

  const loadConfigs = async () => {
    try {
      const data = await api.getConfigs()
      setSavedConfigs(data.configs)
    } catch (error) {
      console.error('Failed to load configs:', error)
    }
  }

  const loadPresets = async () => {
    try {
      const data = await api.getPresets()
      setPresets(data.presets)
    } catch (error) {
      console.error('Failed to load presets:', error)
    }
  }

  const handleSliderChange = (key: keyof ConfigValues, value: number) => {
    setConfig({ ...config, [key]: value })
  }

  const loadPreset = (presetType: 'strict' | 'balanced' | 'lenient') => {
    if (presets && presets[presetType]) {
      setConfig(presets[presetType].config)
    }
  }

  const loadSavedConfig = (savedConfig: SavedConfig) => {
    setConfig(savedConfig.config)
  }

  const handleSave = async () => {
    if (!saveName.trim()) {
      alert('Please enter a configuration name')
      return
    }

    setSaving(true)
    try {
      await api.createConfig({
        name: saveName,
        presetType: 'custom',
        config: config,
      })

      setSaveName('')
      setShowSaveModal(false)
      loadConfigs()
    } catch (error) {
      console.error('Failed to save config:', error)
      alert('Save failed')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this configuration?')) {
      return
    }

    try {
      await api.deleteConfig(id)
      loadConfigs()
    } catch (error) {
      console.error('Failed to delete config:', error)
      alert('Delete failed')
    }
  }

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-display-md text-ink font-normal">Configuration Dashboard</h1>
            <p className="text-body mt-2">Tune thresholds and manage configurations</p>
          </div>
          <button
            onClick={() => setShowSaveModal(true)}
            className="px-6 py-3 bg-primary hover:bg-primary-active text-white rounded-pill font-semibold transition-colors"
          >
            Save Config
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Configuration Panel */}
          <div className="lg:col-span-2 space-y-6">
            {/* Presets */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">Quick Presets</h3>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => loadPreset('strict')}
                  className="px-4 py-3 bg-surface-strong hover:bg-hairline text-ink rounded-lg font-semibold transition-colors"
                >
                  🔒 Strict
                </button>
                <button
                  onClick={() => loadPreset('balanced')}
                  className="px-4 py-3 bg-surface-strong hover:bg-hairline text-ink rounded-lg font-semibold transition-colors"
                >
                  ⚖️ Balanced
                </button>
                <button
                  onClick={() => loadPreset('lenient')}
                  className="px-4 py-3 bg-surface-strong hover:bg-hairline text-ink rounded-lg font-semibold transition-colors"
                >
                  🔓 Lenient
                </button>
              </div>
            </div>

            {/* Anti-Spoof */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">Anti-Spoof</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-semibold text-ink flex items-center gap-1.5">
                      Threshold
                      <span className="group relative cursor-help">
                        <span className="text-muted text-base">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-6 z-50 w-64 bg-ink text-white text-xs leading-relaxed p-3 rounded-lg shadow-xl">
                          Threshold deteksi spoof (foto/video replay). Nilai rendah = lebih lenient (lebih banyak pass), nilai tinggi = lebih strict (lebih banyak reject). Rekomendasi: 0.20-0.30.
                        </span>
                      </span>
                    </label>
                    <span className="text-sm font-semibold text-primary">{config.antiSpoofThreshold.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={config.antiSpoofThreshold}
                    onChange={(e) => handleSliderChange('antiSpoofThreshold', parseFloat(e.target.value))}
                    className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                  <div className="flex justify-between text-xs text-muted mt-1">
                    <span>Lenient (0.0)</span>
                    <span>Strict (1.0)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quality Check */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">Quality Check</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-semibold text-ink flex items-center gap-1.5">
                      Min Brightness
                      <span className="group relative cursor-help">
                        <span className="text-muted text-base">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-6 z-50 w-64 bg-ink text-white text-xs leading-relaxed p-3 rounded-lg shadow-xl">
                          Batas minimum kecerahan gambar (0-255). Nilai terlalu tinggi akan reject ruangan gelap. Rekomendasi: 40-50.
                        </span>
                      </span>
                    </label>
                    <span className="text-sm font-semibold text-primary">{config.minBrightness}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={config.minBrightness}
                    onChange={(e) => handleSliderChange('minBrightness', parseInt(e.target.value))}
                    className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-semibold text-ink flex items-center gap-1.5">
                      Max Brightness
                      <span className="group relative cursor-help">
                        <span className="text-muted text-base">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-6 z-50 w-64 bg-ink text-white text-xs leading-relaxed p-3 rounded-lg shadow-xl">
                          Batas maksimum kecerahan gambar (0-255). Nilai terlalu rendah akan reject cahaya terang/overexposed. Rekomendasi: 220-230.
                        </span>
                      </span>
                    </label>
                    <span className="text-sm font-semibold text-primary">{config.maxBrightness}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={config.maxBrightness}
                    onChange={(e) => handleSliderChange('maxBrightness', parseInt(e.target.value))}
                    className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-semibold text-ink flex items-center gap-1.5">
                      Min Blur Score
                      <span className="group relative cursor-help">
                        <span className="text-muted text-base">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-6 z-50 w-64 bg-ink text-white text-xs leading-relaxed p-3 rounded-lg shadow-xl">
                          Mengukur ketajaman gambar (0-255). Nilai rendah = toleran terhadap blur, nilai tinggi = butuh gambar sangat tajam. Rekomendasi: 15-20 untuk webcam standar.
                        </span>
                      </span>
                    </label>
                    <span className="text-sm font-semibold text-primary">{config.minBlurScore}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={config.minBlurScore}
                    onChange={(e) => handleSliderChange('minBlurScore', parseInt(e.target.value))}
                    className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-semibold text-ink flex items-center gap-1.5">
                      Min Face Size
                      <span className="group relative cursor-help">
                        <span className="text-muted text-base">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-6 z-50 w-64 bg-ink text-white text-xs leading-relaxed p-3 rounded-lg shadow-xl">
                          Persentase minimum area wajah terhadap frame (0-1). Nilai terlalu tinggi = user harus terlalu dekat. Rekomendasi: 0.10-0.15.
                        </span>
                      </span>
                    </label>
                    <span className="text-sm font-semibold text-primary">{config.minFaceSize.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={config.minFaceSize}
                    onChange={(e) => handleSliderChange('minFaceSize', parseFloat(e.target.value))}
                    className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-semibold text-ink flex items-center gap-1.5">
                      Max Face Size
                      <span className="group relative cursor-help">
                        <span className="text-muted text-base">ⓘ</span>
                        <span className="invisible group-hover:visible absolute left-0 top-6 z-50 w-64 bg-ink text-white text-xs leading-relaxed p-3 rounded-lg shadow-xl">
                          Persentase maksimum area wajah terhadap frame (0-1). Nilai terlalu rendah = user harus terlalu jauh. Rekomendasi: 0.75-0.85.
                        </span>
                      </span>
                    </label>
                    <span className="text-sm font-semibold text-primary">{config.maxFaceSize.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={config.maxFaceSize}
                    onChange={(e) => handleSliderChange('maxFaceSize', parseFloat(e.target.value))}
                    className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>
            </div>

            {/* Challenges */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">Challenges</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-semibold text-ink">Challenge Count</label>
                    <span className="text-sm font-semibold text-primary">{config.challengeCount}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={config.challengeCount}
                    onChange={(e) => handleSliderChange('challengeCount', parseInt(e.target.value))}
                    className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>

                <div>
                  <div className="flex justify-between mb-2">
                    <label className="text-sm font-semibold text-ink">Timeout (ms)</label>
                    <span className="text-sm font-semibold text-primary">{config.challengeTimeoutMs}</span>
                  </div>
                  <input
                    type="range"
                    min="3000"
                    max="15000"
                    step="1000"
                    value={config.challengeTimeoutMs}
                    onChange={(e) => handleSliderChange('challengeTimeoutMs', parseInt(e.target.value))}
                    className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-primary"
                  />
                </div>
              </div>
            </div>

            {/* Pass Score */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">Pass Score</h3>
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-semibold text-ink">Minimum Score</label>
                  <span className="text-sm font-semibold text-primary">{config.passScore}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={config.passScore}
                  onChange={(e) => handleSliderChange('passScore', parseInt(e.target.value))}
                  className="w-full h-2 bg-surface-strong rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Current Config Preview */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">Current Config</h3>
              <pre className="text-xs bg-surface-soft p-4 rounded-lg overflow-auto max-h-96 font-mono text-ink">
                {JSON.stringify(config, null, 2)}
              </pre>
            </div>

            {/* Saved Configurations */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">Saved Configs</h3>
              <div className="space-y-2">
                {savedConfigs.length === 0 ? (
                  <p className="text-sm text-muted text-center py-4">No saved configs</p>
                ) : (
                  savedConfigs.map((savedConfig) => (
                    <div
                      key={savedConfig.id}
                      className="flex items-center justify-between p-3 bg-surface-soft rounded-lg hover:bg-surface-strong transition-colors"
                    >
                      <button
                        onClick={() => loadSavedConfig(savedConfig)}
                        className="flex-1 text-left"
                      >
                        <div className="text-sm font-semibold text-ink">{savedConfig.name}</div>
                        <div className="text-xs text-muted">
                          {new Date(savedConfig.created_at * 1000).toLocaleDateString()}
                        </div>
                      </button>
                      <button
                        onClick={() => handleDelete(savedConfig.id)}
                        className="ml-2 text-semantic-down hover:opacity-80"
                      >
                        🗑️
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Save Modal */}
        {showSaveModal && (
          <div className="fixed inset-0 bg-surface-dark/50 flex items-center justify-center z-50 p-4">
            <div className="bg-canvas rounded-xl p-8 max-w-md w-full border border-hairline">
              <h2 className="text-title-lg text-ink mb-6">Save Configuration</h2>

              <div className="mb-6">
                <label className="block text-sm font-semibold text-ink mb-2">
                  Configuration Name
                </label>
                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder="e.g., Production Config"
                  className="w-full px-4 py-2 border border-hairline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  autoFocus
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowSaveModal(false)}
                  className="flex-1 px-6 py-3 bg-surface-strong hover:bg-hairline text-ink rounded-pill font-semibold transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 px-6 py-3 bg-primary hover:bg-primary-active disabled:opacity-50 text-white rounded-pill font-semibold transition-colors"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
