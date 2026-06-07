import express from 'express'
import { queries } from '../db'
import { nanoid } from 'nanoid'
import { ZipArchive } from 'archiver'

const router = express.Router()

type ReactProjectRequest = {
  projectName?: string
  appTitle?: string
  apiUrl?: string
  verifyApiUrl?: string
  callbackApiUrl?: string
  publicKey?: string
  gitRemote?: string
  preset?: 'local' | 'staging' | 'prod'
  packageManager?: 'npm' | 'pnpm' | 'yarn'
  includeDocker?: boolean
  includeMockApi?: boolean
  primaryModelName?: string
  modelFiles?: string[]
  sdkFiles?: Array<{ path: string; content: string }>
  indexCss?: string
  theme?: {
    primary?: string
    accent?: string
    radius?: string
  }
  liveness?: {
    challengeCount?: number
    timeoutSeconds?: number
    antiSpoofThreshold?: number
    passScore?: number
    minBrightness?: number
    maxBrightness?: number
    minBlurScore?: number
    minFaceSize?: number
    maxFaceSize?: number
    enabledChallenges?: string[]
  }
}

const PACKAGE_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/
const BRAND_PRIMARY = '#45b8e8'
const BRAND_PRIMARY_ACTIVE = '#2da0d4'

const GENERATED_PROJECT_INDEX_CSS = `@tailwind base;
@tailwind components;
@tailwind utilities;

@layer utilities {
  .liveness-glass-surface {
    @apply backdrop-blur-xl bg-white/80 border border-white/60;
    box-shadow:
      0 2px 4px 0 rgba(69, 184, 232, 0.08),
      0 6px 20px -2px rgba(69, 184, 232, 0.18),
      0 20px 52px -8px rgba(69, 184, 232, 0.22);
  }
  .liveness-glass-camera {
    @apply backdrop-blur-md bg-white/25 border border-white/40;
    box-shadow:
      0 2px 4px 0 rgba(69, 184, 232, 0.08),
      0 8px 28px -4px rgba(69, 184, 232, 0.20),
      0 20px 52px -8px rgba(69, 184, 232, 0.18);
  }
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`

async function getGeneratedProjectIndexCss(): Promise<string> {
  try {
    const fs = await import('fs/promises')
    const path = await import('path')
    const sourcePath = path.join(process.cwd(), 'src/index.css')
    const source = await fs.readFile(sourcePath, 'utf-8')

    if (
      source.includes('.liveness-glass-surface')
      && source.includes('rgba(69, 184, 232')
    ) {
      return GENERATED_PROJECT_INDEX_CSS
    }
  } catch {}

  return GENERATED_PROJECT_INDEX_CSS
}

function sanitizePackageName(value: unknown) {
  const normalized = String(value || 'liveness-react-app')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)

  return PACKAGE_NAME_PATTERN.test(normalized) ? normalized : 'liveness-react-app'
}

function sanitizeText(value: unknown, fallback: string, maxLength = 80) {
  const text = String(value || fallback).trim().replace(/[<>]/g, '')
  return (text || fallback).slice(0, maxLength)
}

function sanitizeUrl(value: unknown, fallback: string) {
  const text = String(value || fallback).trim()
  try {
    const url = new URL(text)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString().replace(/\/$/, '')
  } catch {}
  return fallback
}

function sanitizeHexColor(value: unknown, fallback: string) {
  const text = String(value || '').trim()
  return HEX_COLOR_PATTERN.test(text) ? text : fallback
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue)) return fallback
  return Math.min(max, Math.max(min, numberValue))
}

function buildReactTemplate(input: ReactProjectRequest) {
  const projectName = sanitizePackageName(input.projectName)
  const appTitle = sanitizeText(input.appTitle, 'Liveness Verification')
  const apiUrl = sanitizeUrl(input.apiUrl, 'http://localhost:3001')
  const verifyApiUrl = sanitizeText(input.verifyApiUrl, '')
  const callbackApiUrl = sanitizeText(input.callbackApiUrl, '')
  const publicKey = sanitizeText(input.publicKey, '', 120)
  const preset = input.preset === 'staging' || input.preset === 'prod' ? input.preset : 'local'
  const packageManager = input.packageManager === 'pnpm' || input.packageManager === 'yarn' ? input.packageManager : 'npm'
  const includeDocker = input.includeDocker !== false
  const includeMockApi = input.includeMockApi === true
  const primaryModelName = sanitizeText(input.primaryModelName, 'anti-spoof.onnx', 120)
  const modelFiles = Array.isArray(input.modelFiles) ? input.modelFiles : []
  const sdkFiles = Array.isArray(input.sdkFiles) ? input.sdkFiles : []
  const primary = sanitizeHexColor(input.theme?.primary, BRAND_PRIMARY)
  const primaryActive = primary === BRAND_PRIMARY ? BRAND_PRIMARY_ACTIVE : '#003ecc'
  const accent = sanitizeHexColor(input.theme?.accent, '#05b169')
  const radius = sanitizeText(input.theme?.radius, '24px', 16)
  const challengeCount = clampNumber(input.liveness?.challengeCount, 2, 1, 7)
  const timeoutSeconds = clampNumber(input.liveness?.timeoutSeconds, 6, 1, 120)
  const antiSpoofThreshold = clampNumber(input.liveness?.antiSpoofThreshold, 0.25, 0.1, 0.9)
  const passScore = clampNumber(input.liveness?.passScore, 70, 1, 100)
  const minBrightness = clampNumber(input.liveness?.minBrightness, 40, 0, 255)
  const maxBrightness = clampNumber(input.liveness?.maxBrightness, 220, 0, 255)
  const minBlurScore = clampNumber(input.liveness?.minBlurScore, 18, 0, 100)
  const minFaceSize = clampNumber(input.liveness?.minFaceSize, 0.10, 0.05, 0.5)
  const maxFaceSize = clampNumber(input.liveness?.maxFaceSize, 0.80, 0.5, 1.0)
  const enabledChallenges = Array.isArray(input.liveness?.enabledChallenges)
    ? input.liveness.enabledChallenges
    : ['blink', 'smile']
  const installCommand = packageManager === 'yarn' ? 'yarn install' : `${packageManager} install`
  const devCommand = packageManager === 'yarn' ? 'yarn dev' : `${packageManager} run dev`
  const buildCommand = packageManager === 'yarn' ? 'yarn build' : `${packageManager} run build`

  const files: Array<{ path: string; content: string }> = [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: projectName,
        version: '0.1.0',
        private: true,
        type: 'module',
        scripts: {
          dev: 'vite --host 0.0.0.0',
          build: 'tsc && vite build',
          preview: 'vite preview --host 0.0.0.0',
        },
        dependencies: {
          '@mediapipe/tasks-vision': '^0.10.0',
          '@vitejs/plugin-react': '^4.3.0',
          typescript: '^5.4.5',
          vite: '^5.2.11',
          react: '^18.3.1',
          'react-dom': '^18.3.1',
          'onnxruntime-web': '^1.19.0',
          'react-icons': '^5.6.0',
          jspdf: '^4.2.1',
        },
        devDependencies: {
          '@types/react': '^18.3.0',
          '@types/react-dom': '^18.3.0',
          tailwindcss: '^3.4.1',
          autoprefixer: '^10.4.18',
          postcss: '^8.4.35',
        },
      }, null, 2),
    },
    {
      path: 'index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${appTitle}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'src/main.tsx',
      content: `import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { LivenessCamera } from './sdk/components/LivenessCamera'
import './index.css'

const config = {
  challengeCount: Number(import.meta.env.VITE_LIVENESS_CHALLENGE_COUNT || ${challengeCount}),
  challengeTimeoutMs: Number(import.meta.env.VITE_LIVENESS_TIMEOUT_MS || ${timeoutSeconds * 1000}),
  antiSpoofThreshold: Number(import.meta.env.VITE_LIVENESS_ANTI_SPOOF_THRESHOLD || ${antiSpoofThreshold}),
  passScore: Number(import.meta.env.VITE_LIVENESS_PASS_SCORE || ${passScore}),
  minBrightness: Number(import.meta.env.VITE_LIVENESS_MIN_BRIGHTNESS || ${minBrightness}),
  maxBrightness: Number(import.meta.env.VITE_LIVENESS_MAX_BRIGHTNESS || ${maxBrightness}),
  minBlurScore: Number(import.meta.env.VITE_LIVENESS_MIN_BLUR_SCORE || ${minBlurScore}),
  minFaceSize: Number(import.meta.env.VITE_LIVENESS_MIN_FACE_SIZE || ${minFaceSize}),
  maxFaceSize: Number(import.meta.env.VITE_LIVENESS_MAX_FACE_SIZE || ${maxFaceSize}),
  antiSpoofModelUrl: import.meta.env.VITE_LIVENESS_MODEL_URL || '/models/${primaryModelName}',
  enabledChallenges: (import.meta.env.VITE_LIVENESS_ENABLED_CHALLENGES || '${enabledChallenges.join(',')}').split(','),
}

function App() {
  const sessionId = window.location.pathname.replace(/^\\/+/g, '') // strip leading slash
  const [status, setStatus] = useState<'verifying' | 'ready' | 'error'>(
    import.meta.env.VITE_VERIFY_API ? 'verifying' : 'ready'
  )

  useEffect(() => {
    const verifyApiUrl = import.meta.env.VITE_VERIFY_API
    if (!verifyApiUrl) return

    if (!sessionId) {
      setStatus('error')
      return
    }

    const url = verifyApiUrl.replace('{sessionId}', sessionId)
    fetch(url)
      .then(res => res.ok ? setStatus('ready') : setStatus('error'))
      .catch(() => setStatus('error'))
  }, [sessionId])

  if (status === 'verifying') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-canvas via-surface-soft/30 to-canvas flex items-center justify-center">
        <div className="text-body text-title-md">Verifying session...</div>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-canvas via-surface-soft/30 to-canvas flex items-center justify-center">
        <div className="text-semantic-down text-title-md">Invalid or expired session link.</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-canvas via-surface-soft/30 to-canvas">
      <LivenessCamera
        config={config}
        onResult={async (result) => {
          console.log('Liveness result', result)
          const callbackApiUrl = import.meta.env.VITE_CALLBACK_API
          if (callbackApiUrl && sessionId) {
            try {
              const url = callbackApiUrl.replace('{sessionId}', sessionId)
              await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result)
              })
              console.log('Callback successful')
            } catch (err) {
              console.error('Callback failed', err)
            }
          }
        }}
      />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
`,
    },
    {
      path: 'tailwind.config.js',
      content: `/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '${primary}',
          active: '${primaryActive}',
          disabled: '#a8b8cc',
        },
        ink: '#0a0b0d',
        body: {
          DEFAULT: '#5b616e',
          strong: '#0a0b0d',
        },
        muted: {
          DEFAULT: '#7c828a',
          soft: '#a8acb3',
        },
        hairline: {
          DEFAULT: '#dee1e6',
          soft: '#eef0f3',
        },
        canvas: '#ffffff',
        surface: {
          soft: '#f7f7f7',
          card: '#ffffff',
          strong: '#eef0f3',
          dark: '#0a0b0d',
          'dark-elevated': '#16181c',
        },
        'on-primary': '#ffffff',
        'on-dark': {
          DEFAULT: '#ffffff',
          soft: '#a8acb3',
        },
        semantic: {
          up: '#05b169',
          down: '#cf202f',
        },
        'accent-yellow': '#f4b000',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      borderRadius: {
        none: '0px',
        xs: '4px',
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        pill: '100px',
        full: '9999px',
      },
      fontSize: {
        'display-mega': ['80px', { lineHeight: '1.0', letterSpacing: '-2px', fontWeight: '400' }],
        'display-xl': ['64px', { lineHeight: '1.0', letterSpacing: '-1.6px', fontWeight: '400' }],
        'display-lg': ['52px', { lineHeight: '1.0', letterSpacing: '-1.3px', fontWeight: '400' }],
        'display-md': ['44px', { lineHeight: '1.09', letterSpacing: '-1px', fontWeight: '400' }],
        'display-sm': ['36px', { lineHeight: '1.11', letterSpacing: '-0.5px', fontWeight: '400' }],
        'title-lg': ['32px', { lineHeight: '1.13', letterSpacing: '-0.4px', fontWeight: '400' }],
        'title-md': ['18px', { lineHeight: '1.33', letterSpacing: '0', fontWeight: '600' }],
        'title-sm': ['16px', { lineHeight: '1.25', letterSpacing: '0', fontWeight: '600' }],
        'body-md': ['16px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        'body-strong': ['16px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '700' }],
        'body-sm': ['14px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        caption: ['13px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '400' }],
        'caption-strong': ['12px', { lineHeight: '1.5', letterSpacing: '0', fontWeight: '600' }],
      },
    },
  },
  plugins: [],
}
`,
    },
    {
      path: 'postcss.config.js',
      content: `export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
`,
    },
    {
      path: 'src/index.css',
      content: input.indexCss || GENERATED_PROJECT_INDEX_CSS,
    },
    {
      path: '.env.example',
      content: `VITE_LIVENESS_API_URL=${apiUrl}
VITE_VERIFY_API=${verifyApiUrl}
VITE_CALLBACK_API=${callbackApiUrl}
VITE_LIVENESS_PUBLIC_KEY=${publicKey}
VITE_LIVENESS_CHALLENGE_COUNT=${challengeCount}
VITE_LIVENESS_TIMEOUT_MS=${timeoutSeconds * 1000}
VITE_LIVENESS_ANTI_SPOOF_THRESHOLD=${antiSpoofThreshold}
VITE_LIVENESS_PASS_SCORE=${passScore}
VITE_LIVENESS_MIN_BRIGHTNESS=${minBrightness}
VITE_LIVENESS_MAX_BRIGHTNESS=${maxBrightness}
VITE_LIVENESS_MIN_BLUR_SCORE=${minBlurScore}
VITE_LIVENESS_MIN_FACE_SIZE=${minFaceSize}
VITE_LIVENESS_MAX_FACE_SIZE=${maxFaceSize}
VITE_LIVENESS_MODEL_URL=/models/${primaryModelName}
VITE_LIVENESS_ENABLED_CHALLENGES=${enabledChallenges.join(',')}
`,
    },
    {
      path: 'vite.config.ts',
      content: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['onnxruntime-web'],
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
`,
    },
    {
      path: 'tsconfig.json',
      content: `{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "types": ["vite/client"]
  },
  "include": ["src"]
}
`,
    },
    {
      path: '.gitignore',
      content: `node_modules
dist
.env
.env.local
.DS_Store
`,
    },
    {
      path: 'README.md',
      content: `# ${appTitle}

Generated from Liveness App Builder.

## Bundled Models

${modelFiles.length > 0 ? modelFiles.map((name, i) => `${i + 1}. \`${name}\`${i === 0 ? ' (primary)' : ''}`).join('\n') : 'No models bundled'}

## Run locally

\`\`\`bash
cp .env.example .env.local
${installCommand}
${devCommand}
\`\`\`

## Build

\`\`\`bash
${buildCommand}
\`\`\`

## Environment Variables

- \`VITE_LIVENESS_API_URL\`: Backend/API base URL
- \`VITE_VERIFY_API\`: (Optional) URL to verify dynamic session ID (e.g. https://api.com/verify/{sessionId})
- \`VITE_CALLBACK_API\`: (Optional) URL to POST results after liveness (e.g. https://api.com/callback/{sessionId})
- \`VITE_LIVENESS_PUBLIC_KEY\`: Public SDK key (browser-safe only)
- \`VITE_LIVENESS_CHALLENGE_COUNT\`: Number of challenges
- \`VITE_LIVENESS_TIMEOUT_MS\`: Timeout per challenge (ms)
- \`VITE_LIVENESS_ANTI_SPOOF_THRESHOLD\`: Anti-spoof strictness (0.1-0.9)
- \`VITE_LIVENESS_PASS_SCORE\`: Final passing score (0-100)
- \`VITE_LIVENESS_MIN_BRIGHTNESS\`: Min brightness threshold (0-255)
- \`VITE_LIVENESS_MAX_BRIGHTNESS\`: Max brightness threshold (0-255)
- \`VITE_LIVENESS_MIN_BLUR_SCORE\`: Min blur score (0-100)
- \`VITE_LIVENESS_MIN_FACE_SIZE\`: Min face size ratio (0.05-0.5)
- \`VITE_LIVENESS_MAX_FACE_SIZE\`: Max face size ratio (0.5-1.0)
- \`VITE_LIVENESS_MODEL_URL\`: Path to anti-spoof model
- \`VITE_LIVENESS_ENABLED_CHALLENGES\`: Comma-separated challenge types
`,
    },
  ]

  if (includeDocker) {
    files.push(
      {
        path: 'Dockerfile',
        content: `FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
`,
      },
      {
        path: 'docker-compose.yml',
        content: `services:
  web:
    build: .
    ports:
      - "8080:80"
    env_file:
      - .env.example
${includeMockApi ? `  mock-api:
    image: node:20-alpine
    working_dir: /app
    command: ["node", "server.js"]
    volumes:
      - ./mock-api:/app
    ports:
      - "3001:3001"
` : ''}`,
      },
    )
  }

  if (includeMockApi) {
    files.push({
      path: 'mock-api/server.js',
      content: `const http = require('http')

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify({ status: 'ok', service: 'liveness-mock-api' }))
})

server.listen(3001, () => console.log('Mock API running on :3001'))
`,
    })
  }

  return { projectName, files }
}

// GET /api/builds - Get all builds
router.get('/', (req, res) => {
  try {
    const builds = queries.getAllBuilds.all()
    res.json({ builds })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

import { exec } from 'child_process'
import { promisify } from 'util'
import * as os from 'os'

const execAsync = promisify(exec)

async function getGitArchive(gitRemote?: string): Promise<Array<{ path: string; content: Buffer }>> {
  if (!gitRemote && gitRemote !== '') { // if undefined or null, we might not init
    // Actually we want to init if either gitRemote is provided OR we just want an empty repo.
    // Let's init if they explicitly want it. For now we only trigger if gitRemote has string value
    // or if you want to always init, we can just run it. We'll run it if gitRemote is provided or we just want to.
  }

  const fs = await import('fs/promises')
  const path = await import('path')

  // Create temp dir
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'liveness-git-'))
  const files: Array<{ path: string; content: Buffer }> = []

  try {
    // Init git
    await execAsync('git init -b main', { cwd: tempDir })

    // Add remote if provided
    if (gitRemote && gitRemote.trim() !== '') {
      await execAsync(`git remote add origin ${gitRemote.trim()}`, { cwd: tempDir })
    }

    // Read all files in .git directory recursively
    async function readDir(dir: string, baseRoute: string) {
      const entries = await fs.readdir(dir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)
        const routePath = path.posix.join(baseRoute, entry.name)

        if (entry.isDirectory()) {
          await readDir(fullPath, routePath)
        } else if (entry.isFile()) {
          const content = await fs.readFile(fullPath)
          files.push({ path: routePath, content })
        }
      }
    }

    await readDir(path.join(tempDir, '.git'), '.git')
  } catch (err) {
    console.error('Git init failed:', err)
  } finally {
    // Cleanup temp dir
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {})
  }

  return files
}

// POST /api/builds/react-project - Generate React project ZIP
router.post('/react-project', async (req, res) => {
  try {
    const input = req.body || {}
    const fs = await import('fs/promises')
    const path = await import('path')

    // Resolve models if modelIds provided
    const modelFiles: Array<{ name: string; content: Buffer }> = []
    if (Array.isArray(input.modelIds) && input.modelIds.length > 0) {
      for (const modelId of input.modelIds) {
        const model = queries.getModelById.get(modelId)
        if (model) {
          // Determine physical path
          let physicalPath: string
          if (model.file_path.startsWith('/models/')) {
            // Local bundled model
            physicalPath = path.join(process.cwd(), 'public', model.file_path)
          } else {
            // Uploaded model
            physicalPath = path.join(process.cwd(), model.file_path)
          }

          try {
            const content = await fs.readFile(physicalPath)
            modelFiles.push({
              name: path.basename(model.file_path),
              content,
            })
          } catch (err) {
            console.warn('Model file not found:', physicalPath)
          }
        }
      }
    }

    // Primary model = first selected
    const primaryModelName = modelFiles.length > 0 ? modelFiles[0].name : 'anti-spoof.onnx'

    // Bundle SDK source files
    const sdkFiles: Array<{ path: string; content: string }> = []
    const sdkSourcePaths = [
      'src/index.ts',
      'src/core/types.ts',
      'src/components/LivenessCamera.tsx',
      'src/components/LivenessCameraModern.tsx',
      'src/components/DebugOverlay.tsx',
      'src/components/HistoryView.tsx',
      'src/hooks/useLiveness.ts',
      'src/adapters/mediapipeAdapter.ts',
      'src/adapters/onnxAntiSpoofAdapter.ts',
      'src/adapters/onnxChallengeAdapter.ts',
      'src/adapters/onnxHeadPoseAdapter.ts',
      'src/utils/antiSpoof.ts',
      'src/utils/challengeDetector.ts',
      'src/utils/errorHandling.tsx',
      'src/utils/historyStorage.ts',
      'src/utils/landmarkCrop.ts',
      'src/utils/nanoid.ts',
      'src/utils/onnxPreprocess.ts',
      'src/utils/onnxRunQueue.ts',
      'src/utils/performance.ts',
      'src/utils/qualityCheck.ts',
      'src/utils/reportGenerator.ts',
      'src/utils/scoreAggregator.ts',
    ]

    for (const srcPath of sdkSourcePaths) {
      try {
        const fullPath = path.join(process.cwd(), srcPath)
        const content = await fs.readFile(fullPath, 'utf-8')
        sdkFiles.push({
          path: srcPath.replace('src/', 'src/sdk/'),
          content,
        })
      } catch (err) {
        console.warn('SDK file not found:', srcPath)
      }
    }

    const indexCss = await getGeneratedProjectIndexCss()

    // Pass to template
    const { projectName, files } = buildReactTemplate({
      ...input,
      primaryModelName,
      modelFiles: modelFiles.map(m => m.name),
      sdkFiles,
      indexCss,
    })

    res.status(200)
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="${projectName}.zip"`)

    const archive = new ZipArchive({ zlib: { level: 9 } })
    archive.on('error', (error) => {
      throw error
    })
    archive.pipe(res)

    for (const file of files) {
      archive.append(file.content, { name: `${projectName}/${file.path}` })
    }

    // Add SDK source files
    for (const sdkFile of sdkFiles) {
      archive.append(sdkFile.content, { name: `${projectName}/${sdkFile.path}` })
    }

    // Add all model files to public/models/
    // If the single pack exists, we bundle it instead of individual encrypted models.
    try {
      const packPath = path.join(process.cwd(), 'public/models/models.pack.enc')
      const packContent = await fs.readFile(packPath)
      archive.append(packContent, { name: `${projectName}/public/models/models.pack.enc` })
    } catch {
      // Pack doesn't exist, fallback to individual models
      for (const modelFile of modelFiles) {
        archive.append(modelFile.content, { name: `${projectName}/public/models/${modelFile.name}` })
      }
    }

    // Add MediaPipe WASM files
    const mediapipeWasmDir = path.join(process.cwd(), 'public/mediapipe/wasm')
    try {
      const wasmFiles = await fs.readdir(mediapipeWasmDir)
      for (const wasmFile of wasmFiles) {
        const wasmPath = path.join(mediapipeWasmDir, wasmFile)
        const stat = await fs.stat(wasmPath)
        if (stat.isFile()) {
          const content = await fs.readFile(wasmPath)
          archive.append(content, { name: `${projectName}/public/mediapipe/wasm/${wasmFile}` })
        }
      }
    } catch (err) {
      console.warn('MediaPipe WASM files not found, skipping:', err)
    }

    // Add .git directory if gitRemote is provided or explicitly requested
    if (typeof input.gitRemote === 'string') {
      const gitFiles = await getGitArchive(input.gitRemote)
      for (const gitFile of gitFiles) {
        archive.append(gitFile.content, { name: `${projectName}/${gitFile.path}` })
      }
    }

    await archive.finalize()
  } catch (error: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: error.message })
    }
  }
})

// GET /api/builds/:id - Get build by ID
router.get('/:id', (req, res) => {
  try {
    const build = queries.getBuildById.get(req.params.id)
    if (!build) {
      return res.status(404).json({ error: 'Build not found' })
    }
    res.json(build)
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// POST /api/builds - Create new build
router.post('/', async (req, res) => {
  try {
    const { version, modelId, configId } = req.body

    if (!version || !modelId || !configId) {
      return res.status(400).json({ error: 'Version, modelId, and configId are required' })
    }

    // Verify model and config exist
    const model = queries.getModelById.get(modelId)
    const config = queries.getConfigById.get(configId)

    if (!model) {
      return res.status(404).json({ error: 'Model not found' })
    }

    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' })
    }

    const id = nanoid()
    const outputPath = `/data/builds/liveness-sdk-v${version}`

    queries.insertBuild.run(
      id,
      version,
      modelId,
      configId,
      outputPath
    )

    const build = queries.getBuildById.get(id)

    res.status(201).json({
      message: 'Build created',
      build,
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

// DELETE /api/builds/:id - Delete build
router.delete('/:id', (req, res) => {
  try {
    const build = queries.getBuildById.get(req.params.id)
    if (!build) {
      return res.status(404).json({ error: 'Build not found' })
    }

    queries.db.prepare('DELETE FROM sdk_builds WHERE id = ?').run(req.params.id)

    res.json({ message: 'Build deleted' })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
