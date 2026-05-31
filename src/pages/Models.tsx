import { useEffect, useState, useRef } from 'react'
import { api } from '../lib/api'
import { MdMemory } from 'react-icons/md'

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

interface LocalModel {
  filename: string
  name: string
  description: string
  size: number
  path: string
}

export default function Models() {
  const [models, setModels] = useState<Model[]>([])
  const [localModels, setLocalModels] = useState<LocalModel[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showLocalModelsModal, setShowLocalModelsModal] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [uploadForm, setUploadForm] = useState({
    name: '',
    version: '',
    accuracy: '',
    fpr: '',
    fnr: '',
  })

  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    try {
      const data = await api.getModels()
      setModels(data.models)
    } catch (error) {
      console.error('Failed to load models:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadLocalModels = async () => {
    try {
      const data = await api.scanLocalModels()
      setLocalModels(data.localModels || [])
      setShowLocalModelsModal(true)
    } catch (error) {
      console.error('Failed to scan local models:', error)
      alert('Failed to scan local models')
    }
  }

  const isModelRegistered = (filename: string) => {
    return models.some(m => m.file_path.includes(filename))
  }

  const handleRegisterLocal = async (localModel: LocalModel) => {
    try {
      await api.registerLocalModel({
        filename: localModel.filename,
        name: localModel.name,
        version: '1.0.0',
      })

      setShowLocalModelsModal(false)
      loadModels()
    } catch (error) {
      console.error('Failed to register local model:', error)
      alert('Failed to register model')
    }
  }

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault()

    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      alert('Please select a model file')
      return
    }

    if (!uploadForm.name || !uploadForm.version) {
      alert('Name and version are required')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('model', file)
      formData.append('name', uploadForm.name)
      formData.append('version', uploadForm.version)
      if (uploadForm.accuracy) formData.append('accuracy', uploadForm.accuracy)
      if (uploadForm.fpr) formData.append('fpr', uploadForm.fpr)
      if (uploadForm.fnr) formData.append('fnr', uploadForm.fnr)

      await api.uploadModel(formData)

      setUploadForm({ name: '', version: '', accuracy: '', fpr: '', fnr: '' })
      if (fileInputRef.current) fileInputRef.current.value = ''
      setShowUploadModal(false)

      loadModels()
    } catch (error) {
      console.error('Failed to upload model:', error)
      alert('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const handleActivate = async (id: string) => {
    try {
      await api.activateModel(id)
      loadModels()
    } catch (error) {
      console.error('Failed to activate model:', error)
      alert('Activation failed')
    }
  }

  const handleDelete = async (id: string, isActive: boolean) => {
    if (isActive) {
      alert('Cannot delete active model')
      return
    }

    if (!confirm('Are you sure you want to delete this model?')) {
      return
    }

    try {
      await api.deleteModel(id)
      loadModels()
    } catch (error) {
      console.error('Failed to delete model:', error)
      alert('Delete failed')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted">Loading models...</div>
      </div>
    )
  }

  const activeModel = models.find(m => m.is_active === 1)

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-display-md text-ink font-normal">Model Management</h1>
            <p className="text-body mt-2">Upload and manage ONNX models</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={loadLocalModels}
              className="px-6 py-3 bg-surface-strong hover:bg-hairline text-ink rounded-pill font-semibold transition-colors"
            >
              Load Local Models
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-6 py-3 bg-primary hover:bg-primary-active text-white rounded-pill font-semibold transition-colors"
            >
              Upload Model
            </button>
          </div>
        </div>

        {/* Active Model Card */}
        {activeModel && (
          <div className="bg-canvas border-2 border-primary rounded-xl p-6 mb-12">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm text-muted mb-1">Active Model</div>
                <h2 className="text-title-lg text-ink">{activeModel.name}</h2>
                <p className="text-body">Version {activeModel.version}</p>
              </div>
              <div className="text-right">
                {activeModel.accuracy !== null && (
                  <div className="mb-2">
                    <span className="text-sm text-muted">Accuracy: </span>
                    <span className="text-2xl font-normal text-primary">{(activeModel.accuracy * 100).toFixed(1)}%</span>
                  </div>
                )}
                <div className="flex gap-4 text-sm">
                  {activeModel.fpr !== null && (
                    <div>
                      <span className="text-muted">FPR: </span>
                      <span className="font-semibold text-ink">{(activeModel.fpr * 100).toFixed(2)}%</span>
                    </div>
                  )}
                  {activeModel.fnr !== null && (
                    <div>
                      <span className="text-muted">FNR: </span>
                      <span className="font-semibold text-ink">{(activeModel.fnr * 100).toFixed(2)}%</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Models Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {models.length === 0 ? (
            <div className="col-span-full bg-canvas border border-hairline rounded-xl p-12 text-center">
              <div className="w-16 h-16 mx-auto mb-4 bg-surface-strong rounded-xl flex items-center justify-center">
                <MdMemory className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-title-lg text-ink mb-2">No Models Yet</h2>
              <p className="text-body mb-6">Upload your first ONNX model to get started</p>
              <button
                onClick={() => setShowUploadModal(true)}
                className="px-6 py-3 bg-primary hover:bg-primary-active text-white rounded-pill font-semibold transition-colors"
              >
                Upload Model
              </button>
            </div>
          ) : (
            models.map((model) => (
              <div
                key={model.id}
                className={`bg-canvas rounded-xl p-6 border-2 transition-all ${
                  model.is_active ? 'border-primary' : 'border-hairline'
                }`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-title-md text-ink">{model.name}</h3>
                    <p className="text-sm text-muted">v{model.version}</p>
                  </div>
                  {model.is_active === 1 && (
                    <span className="px-3 py-1 bg-primary text-white text-xs font-semibold rounded-pill">
                      Active
                    </span>
                  )}
                </div>

                {/* Metrics */}
                <div className="space-y-2 mb-4">
                  {model.accuracy !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">Accuracy</span>
                      <span className="font-semibold text-ink">{(model.accuracy * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {model.fpr !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">False Positive Rate</span>
                      <span className="font-semibold text-ink">{(model.fpr * 100).toFixed(2)}%</span>
                    </div>
                  )}
                  {model.fnr !== null && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted">False Negative Rate</span>
                      <span className="font-semibold text-ink">{(model.fnr * 100).toFixed(2)}%</span>
                    </div>
                  )}
                </div>

                {/* File Info */}
                <div className="text-xs text-muted mb-4 font-mono truncate">
                  {model.file_path}
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  {model.is_active === 0 && (
                    <button
                      onClick={() => handleActivate(model.id)}
                      className="flex-1 px-4 py-2 bg-primary hover:bg-primary-active text-white rounded-pill text-sm font-semibold transition-colors"
                    >
                      Set Active
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(model.id, model.is_active === 1)}
                    disabled={model.is_active === 1}
                    className="px-4 py-2 bg-surface-strong hover:bg-hairline disabled:opacity-50 disabled:cursor-not-allowed text-ink rounded-pill text-sm font-semibold transition-colors"
                  >
                    Delete
                  </button>
                </div>

                {/* Created Date */}
                <div className="text-xs text-muted mt-3">
                  Created {new Date(model.created_at * 1000).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-surface-dark/50 flex items-center justify-center z-50 p-4">
            <div className="bg-canvas rounded-xl p-8 max-w-md w-full border border-hairline">
              <h2 className="text-title-lg text-ink mb-6">Upload Model</h2>

              <form onSubmit={handleUpload} className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-ink mb-2">
                    Model File (ONNX)
                  </label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".onnx"
                    required
                    className="w-full px-4 py-2 border border-hairline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-ink mb-2">
                    Model Name *
                  </label>
                  <input
                    type="text"
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    placeholder="e.g., Anti-Spoof Model"
                    required
                    className="w-full px-4 py-2 border border-hairline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-ink mb-2">
                    Version *
                  </label>
                  <input
                    type="text"
                    value={uploadForm.version}
                    onChange={(e) => setUploadForm({ ...uploadForm, version: e.target.value })}
                    placeholder="e.g., 1.0.0"
                    required
                    className="w-full px-4 py-2 border border-hairline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      Accuracy
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={uploadForm.accuracy}
                      onChange={(e) => setUploadForm({ ...uploadForm, accuracy: e.target.value })}
                      placeholder="0.95"
                      className="w-full px-3 py-2 border border-hairline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      FPR
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={uploadForm.fpr}
                      onChange={(e) => setUploadForm({ ...uploadForm, fpr: e.target.value })}
                      placeholder="0.05"
                      className="w-full px-3 py-2 border border-hairline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-ink mb-2">
                      FNR
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={uploadForm.fnr}
                      onChange={(e) => setUploadForm({ ...uploadForm, fnr: e.target.value })}
                      placeholder="0.03"
                      className="w-full px-3 py-2 border border-hairline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowUploadModal(false)}
                    className="flex-1 px-6 py-3 bg-surface-strong hover:bg-hairline text-ink rounded-pill font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={uploading}
                    className="flex-1 px-6 py-3 bg-primary hover:bg-primary-active disabled:opacity-50 text-white rounded-pill font-semibold transition-colors"
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Local Models Modal */}
        {showLocalModelsModal && (
          <div className="fixed inset-0 bg-surface-dark/50 flex items-center justify-center z-50 p-4">
            <div className="bg-canvas rounded-xl p-8 max-w-2xl w-full border border-hairline max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-title-lg text-ink">Local Models</h2>
                <button
                  onClick={() => setShowLocalModelsModal(false)}
                  className="text-muted hover:text-ink"
                >
                  ✕
                </button>
              </div>

              {localModels.length === 0 ? (
                <p className="text-center text-muted py-8">No models found in public/models</p>
              ) : (
                <div className="space-y-3">
                  {localModels.map((localModel) => {
                    const isRegistered = isModelRegistered(localModel.filename)
                    return (
                      <div
                        key={localModel.filename}
                        className="flex items-center justify-between p-4 border border-hairline rounded-lg hover:bg-surface-soft transition-colors"
                      >
                        <div className="flex-1">
                          <h3 className="text-sm font-semibold text-ink">{localModel.name}</h3>
                          <p className="text-xs text-muted">{localModel.description}</p>
                          <p className="text-xs text-muted mt-1">
                            {localModel.filename} • {(localModel.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <button
                          onClick={() => handleRegisterLocal(localModel)}
                          disabled={isRegistered}
                          className={`px-4 py-2 rounded-pill text-sm font-semibold transition-colors ${
                            isRegistered
                              ? 'bg-surface-strong text-muted cursor-not-allowed'
                              : 'bg-primary hover:bg-primary-active text-white'
                          }`}
                        >
                          {isRegistered ? 'Registered' : 'Register'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
