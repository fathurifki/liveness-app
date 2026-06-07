const API_BASE_URL = `http://${window.location.hostname}:3001/api`

export const api = {
  // Stats
  async getStats() {
    const res = await fetch(`${API_BASE_URL}/stats`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch stats')
    return data
  },

  async getLabelingStats() {
    const res = await fetch(`${API_BASE_URL}/stats/labeling`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch labeling stats')
    return data
  },

  // Sessions
  async getSessions(params?: { status?: string; label?: string; limit?: number; offset?: number }) {
    const query = new URLSearchParams(params as any).toString()
    const res = await fetch(`${API_BASE_URL}/sessions?${query}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch sessions')
    return data
  },

  async getSession(id: string) {
    const res = await fetch(`${API_BASE_URL}/sessions/${id}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to fetch session')
    return data
  },

  async createSession(formData: FormData) {
    const res = await fetch(`${API_BASE_URL}/sessions`, {
      method: 'POST',
      body: formData,
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to create session')
    return data
  },

  async deleteSession(id: string) {
    const res = await fetch(`${API_BASE_URL}/sessions/${id}`, {
      method: 'DELETE',
    })
    return res.json()
  },

  async exportSessions() {
    const res = await fetch(`${API_BASE_URL}/sessions/export`, {
      method: 'POST',
    })
    return res.json()
  },

  // Labels
  async labelSession(sessionId: string, label: 'REAL' | 'SPOOF', labeledBy?: string) {
    const res = await fetch(`${API_BASE_URL}/labels/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, labeledBy }),
    })
    return res.json()
  },

  async skipSession(sessionId: string) {
    const res = await fetch(`${API_BASE_URL}/labels/${sessionId}/skip`, {
      method: 'POST',
    })
    return res.json()
  },

  // Models
  async getModels() {
    const res = await fetch(`${API_BASE_URL}/models`)
    return res.json()
  },

  async getModel(id: string) {
    const res = await fetch(`${API_BASE_URL}/models/${id}`)
    return res.json()
  },

  async getActiveModel() {
    const res = await fetch(`${API_BASE_URL}/models/active/current`)
    return res.json()
  },

  async scanLocalModels() {
    const res = await fetch(`${API_BASE_URL}/models/local/scan`)
    return res.json()
  },

  async registerLocalModel(data: { filename: string; name: string; version: string }) {
    const res = await fetch(`${API_BASE_URL}/models/local/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.json()
  },

  async uploadModel(formData: FormData) {
    const res = await fetch(`${API_BASE_URL}/models`, {
      method: 'POST',
      body: formData,
    })
    return res.json()
  },

  async activateModel(id: string) {
    const res = await fetch(`${API_BASE_URL}/models/${id}/activate`, {
      method: 'PUT',
    })
    return res.json()
  },

  async updateModel(id: string, data: any) {
    const res = await fetch(`${API_BASE_URL}/models/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.json()
  },

  async deleteModel(id: string) {
    const res = await fetch(`${API_BASE_URL}/models/${id}`, {
      method: 'DELETE',
    })
    return res.json()
  },

  // Configs
  async getConfigs() {
    const res = await fetch(`${API_BASE_URL}/configs`)
    return res.json()
  },

  async getConfig(id: string) {
    const res = await fetch(`${API_BASE_URL}/configs/${id}`)
    return res.json()
  },

  async getPresets() {
    const res = await fetch(`${API_BASE_URL}/configs/presets/list`)
    return res.json()
  },

  async createConfig(data: any) {
    const res = await fetch(`${API_BASE_URL}/configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.json()
  },

  async updateConfig(id: string, data: any) {
    const res = await fetch(`${API_BASE_URL}/configs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.json()
  },

  async deleteConfig(id: string) {
    const res = await fetch(`${API_BASE_URL}/configs/${id}`, {
      method: 'DELETE',
    })
    return res.json()
  },

  // Builds
  async getBuilds() {
    const res = await fetch(`${API_BASE_URL}/builds`)
    return res.json()
  },

  async getBuild(id: string) {
    const res = await fetch(`${API_BASE_URL}/builds/${id}`)
    return res.json()
  },

  async createBuild(data: { version: string; modelId: string; configId: string }) {
    const res = await fetch(`${API_BASE_URL}/builds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.json()
  },

  async deleteBuild(id: string) {
    const res = await fetch(`${API_BASE_URL}/builds/${id}`, {
      method: 'DELETE',
    })
    return res.json()
  },

  async generateReactProject(data: any): Promise<{ blob: Blob; fileName: string }> {
    const res = await fetch(`${API_BASE_URL}/builds/react-project`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!res.ok) {
      const payload = await res.json().catch(() => ({ error: 'Generate failed' }))
      throw new Error(payload.error || 'Generate failed')
    }

    const disposition = res.headers.get('Content-Disposition')
    const fileName = disposition?.match(/filename="?([^";]+)"?/)?.[1] || `${data.projectName || 'liveness-react-app'}.zip`
    const blob = await res.blob()
    return { blob, fileName }
  },
}
