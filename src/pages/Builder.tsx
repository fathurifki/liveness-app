import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { MdBuild } from 'react-icons/md'

interface Model {
  id: string
  name: string
  version: string
  is_active: number
}

interface Config {
  id: string
  name: string
  preset_type: string
}

interface Build {
  id: string
  version: string
  model_id: string
  config_id: string
  output_path: string
  created_at: number
}

export default function Builder() {
  const [models, setModels] = useState<Model[]>([])
  const [configs, setConfigs] = useState<Config[]>([])
  const [builds, setBuilds] = useState<Build[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedConfig, setSelectedConfig] = useState('')
  const [version, setVersion] = useState('')
  const [building, setBuilding] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [modelsData, configsData, buildsData] = await Promise.all([
        api.getModels(),
        api.getConfigs(),
        api.getBuilds(),
      ])

      setModels(modelsData.models)
      setConfigs(configsData.configs)
      setBuilds(buildsData.builds)

      const activeModel = modelsData.models.find((m: Model) => m.is_active === 1)
      if (activeModel) {
        setSelectedModel(activeModel.id)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBuild = async () => {
    if (!selectedModel || !selectedConfig || !version) {
      alert('Please select model, config, and enter version')
      return
    }

    setBuilding(true)
    try {
      await api.createBuild({
        version,
        modelId: selectedModel,
        configId: selectedConfig,
      })

      alert(`SDK v${version} built successfully!`)
      setVersion('')
      loadData()
    } catch (error) {
      console.error('Failed to build SDK:', error)
      alert('Build failed')
    } finally {
      setBuilding(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this build?')) {
      return
    }

    try {
      await api.deleteBuild(id)
      loadData()
    } catch (error) {
      console.error('Failed to delete build:', error)
      alert('Delete failed')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted">Loading...</div>
      </div>
    )
  }

  const selectedModelData = models.find(m => m.id === selectedModel)
  const selectedConfigData = configs.find(c => c.id === selectedConfig)

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-display-md text-ink font-normal">SDK Builder</h1>
          <p className="text-body mt-2">Build and package SDK with models and configurations</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Build Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Model Selection */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">1. Select Model</h3>
              {models.length === 0 ? (
                <p className="text-sm text-muted">No models available. Upload a model first.</p>
              ) : (
                <div className="space-y-2">
                  {models.map((model) => (
                    <label
                      key={model.id}
                      className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedModel === model.id
                          ? 'border-primary bg-surface-soft'
                          : 'border-hairline hover:border-hairline-soft'
                      }`}
                    >
                      <input
                        type="radio"
                        name="model"
                        value={model.id}
                        checked={selectedModel === model.id}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        className="mr-3 accent-primary"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-ink">{model.name}</div>
                        <div className="text-sm text-muted">Version {model.version}</div>
                      </div>
                      {model.is_active === 1 && (
                        <span className="px-3 py-1 bg-primary text-white text-xs font-semibold rounded-pill">
                          Active
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Config Selection */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">2. Select Configuration</h3>
              {configs.length === 0 ? (
                <p className="text-sm text-muted">No configurations available. Create a config first.</p>
              ) : (
                <div className="space-y-2">
                  {configs.map((config) => (
                    <label
                      key={config.id}
                      className={`flex items-center p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedConfig === config.id
                          ? 'border-primary bg-surface-soft'
                          : 'border-hairline hover:border-hairline-soft'
                      }`}
                    >
                      <input
                        type="radio"
                        name="config"
                        value={config.id}
                        checked={selectedConfig === config.id}
                        onChange={(e) => setSelectedConfig(e.target.value)}
                        className="mr-3 accent-primary"
                      />
                      <div className="flex-1">
                        <div className="font-semibold text-ink">{config.name}</div>
                        <div className="text-sm text-muted capitalize">{config.preset_type}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Version Input */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">3. Set Version</h3>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="e.g., 1.0.0"
                className="w-full px-4 py-3 border border-hairline rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent text-lg"
              />
              <p className="text-sm text-muted mt-2">Use semantic versioning (major.minor.patch)</p>
            </div>

            {/* Build Button */}
            <div className="bg-canvas border-2 border-primary rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-title-md text-ink">Ready to Build?</h3>
                  <p className="text-sm text-muted">This will generate an NPM package</p>
                </div>
                <div className="w-12 h-12 bg-surface-strong rounded-xl flex items-center justify-center">
                  <MdBuild className="w-6 h-6 text-primary" />
                </div>
              </div>
              <button
                onClick={handleBuild}
                disabled={building || !selectedModel || !selectedConfig || !version}
                className="w-full px-6 py-4 bg-primary hover:bg-primary-active disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-pill font-semibold text-lg transition-colors"
              >
                {building ? 'Building...' : 'Build SDK'}
              </button>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Build Summary */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">Build Summary</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <div className="text-muted mb-1">Model</div>
                  <div className="font-semibold text-ink">
                    {selectedModelData ? `${selectedModelData.name} v${selectedModelData.version}` : 'Not selected'}
                  </div>
                </div>
                <div>
                  <div className="text-muted mb-1">Configuration</div>
                  <div className="font-semibold text-ink">
                    {selectedConfigData ? selectedConfigData.name : 'Not selected'}
                  </div>
                </div>
                <div>
                  <div className="text-muted mb-1">SDK Version</div>
                  <div className="font-semibold text-ink">
                    {version || 'Not set'}
                  </div>
                </div>
                <div className="pt-3 border-t border-hairline">
                  <div className="text-muted mb-1">Output</div>
                  <div className="font-mono text-xs text-ink bg-surface-soft p-2 rounded">
                    {version ? `liveness-sdk-v${version}.zip` : 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Build Instructions */}
            <div className="bg-canvas border border-hairline rounded-xl p-6">
              <h3 className="text-title-md text-ink mb-4">After Build</h3>
              <div className="space-y-2 text-sm text-body">
                <p>1. Package will be saved to <code className="bg-surface-soft px-1 rounded font-mono text-xs">data/builds/</code></p>
                <p>2. Test the SDK locally</p>
                <p>3. Publish to NPM registry</p>
                <p>4. Developers can install with:</p>
                <pre className="bg-surface-soft p-2 rounded text-xs font-mono mt-2 text-ink">
                  npm install @yourcompany/liveness-sdk
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Builds */}
        <div className="mt-12 bg-canvas border border-hairline rounded-xl p-6">
          <h3 className="text-title-md text-ink mb-6">Recent Builds</h3>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-muted">Version</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-muted">Model</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-muted">Config</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-muted">Created</th>
                  <th className="text-left py-3 px-4 text-sm font-semibold text-muted">Output</th>
                  <th className="text-right py-3 px-4 text-sm font-semibold text-muted">Actions</th>
                </tr>
              </thead>
              <tbody>
                {builds.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted">
                      No builds yet. Create your first SDK build above.
                    </td>
                  </tr>
                ) : (
                  builds.map((build) => {
                    const model = models.find(m => m.id === build.model_id)
                    const config = configs.find(c => c.id === build.config_id)
                    return (
                      <tr key={build.id} className="border-b border-hairline-soft hover:bg-surface-soft">
                        <td className="py-3 px-4 text-sm font-semibold text-ink">v{build.version}</td>
                        <td className="py-3 px-4 text-sm text-body">
                          {model ? `${model.name} v${model.version}` : 'Unknown'}
                        </td>
                        <td className="py-3 px-4 text-sm text-body">
                          {config ? config.name : 'Unknown'}
                        </td>
                        <td className="py-3 px-4 text-sm text-body">
                          {new Date(build.created_at * 1000).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-xs font-mono text-muted">
                          {build.output_path}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleDelete(build.id)}
                            className="text-semantic-down hover:opacity-80 text-sm font-semibold"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
