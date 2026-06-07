import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

const dataDir = path.join(process.cwd(), 'data')
const dbPath = path.join(dataDir, 'sdk-kit.db')

// Ensure data directory exists
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

let dbInitialized = false

export const db = new Database(dbPath)

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL')

export function initDatabase() {
  if (dbInitialized) {
    console.log('⚠️  Database already initialized')
    return
  }
  db.exec(`
    -- Sessions table
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      video_path TEXT NOT NULL,
      duration INTEGER,
      media_type TEXT DEFAULT 'video' CHECK(media_type IN ('video', 'image')),
      status TEXT DEFAULT 'unlabeled' CHECK(status IN ('unlabeled', 'labeled', 'skipped')),
      label TEXT CHECK(label IN ('REAL', 'SPOOF', NULL)),
      labeled_by TEXT,
      labeled_at INTEGER,
      metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    );

    -- Models table
    CREATE TABLE IF NOT EXISTS models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      version TEXT NOT NULL,
      file_path TEXT NOT NULL,
      accuracy REAL,
      fpr REAL,
      fnr REAL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      is_active INTEGER DEFAULT 0
    );

    -- Configurations table
    CREATE TABLE IF NOT EXISTS configurations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      preset_type TEXT CHECK(preset_type IN ('strict', 'balanced', 'lenient', 'custom')),
      config TEXT NOT NULL,
      model_id TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (model_id) REFERENCES models(id)
    );

    -- Test results table
    CREATE TABLE IF NOT EXISTS test_results (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      predicted_label TEXT,
      confidence REAL,
      passed INTEGER,
      score REAL,
      tested_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (config_id) REFERENCES configurations(id),
      FOREIGN KEY (session_id) REFERENCES sessions(id)
    );

    -- SDK builds table
    CREATE TABLE IF NOT EXISTS sdk_builds (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      model_id TEXT NOT NULL,
      config_id TEXT NOT NULL,
      output_path TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')),
      FOREIGN KEY (model_id) REFERENCES models(id),
      FOREIGN KEY (config_id) REFERENCES configurations(id)
    );

    -- Create indexes for better query performance
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
    CREATE INDEX IF NOT EXISTS idx_sessions_label ON sessions(label);
    CREATE INDEX IF NOT EXISTS idx_models_active ON models(is_active);
    CREATE INDEX IF NOT EXISTS idx_test_results_config ON test_results(config_id);
  `)

  dbInitialized = true
  console.log('✅ Database initialized at:', dbPath)
}

// Helper functions for common queries
export function getQueries() {
  return {
    // Sessions
    getAllSessions: db.prepare('SELECT * FROM sessions ORDER BY created_at DESC'),
    getSessionById: db.prepare('SELECT * FROM sessions WHERE id = ?'),
    getSessionsByStatus: db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY created_at DESC'),
    insertSession: db.prepare(`
      INSERT INTO sessions (id, timestamp, video_path, duration, metadata, media_type)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    updateSessionLabel: db.prepare(`
      UPDATE sessions
      SET status = 'labeled', label = ?, labeled_by = ?, labeled_at = strftime('%s', 'now')
      WHERE id = ?
    `),

    // Models
    getAllModels: db.prepare('SELECT * FROM models ORDER BY created_at DESC'),
    getModelById: db.prepare('SELECT * FROM models WHERE id = ?'),
    getActiveModel: db.prepare('SELECT * FROM models WHERE is_active = 1 LIMIT 1'),
    insertModel: db.prepare(`
      INSERT INTO models (id, name, version, file_path, accuracy, fpr, fnr)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    setActiveModel: db.prepare('UPDATE models SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END'),

    insertTestResult: db.prepare(`
      INSERT INTO test_results (id, config_id, session_id, predicted_label, confidence, passed, score)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getAllConfigs: db.prepare('SELECT * FROM configurations ORDER BY created_at DESC'),
    getConfigById: db.prepare('SELECT * FROM configurations WHERE id = ?'),
    insertConfig: db.prepare(`
      INSERT INTO configurations (id, name, preset_type, config, model_id)
      VALUES (?, ?, ?, ?, ?)
    `),

    // SDK Builds
    getAllBuilds: db.prepare('SELECT * FROM sdk_builds ORDER BY created_at DESC'),
    getBuildById: db.prepare('SELECT * FROM sdk_builds WHERE id = ?'),
    insertBuild: db.prepare(`
      INSERT INTO sdk_builds (id, version, model_id, config_id, output_path)
      VALUES (?, ?, ?, ?, ?)
    `),

    // Stats
    getStats: db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM sessions) as total_sessions,
        (SELECT COUNT(*) FROM sessions WHERE status = 'labeled') as labeled_sessions,
        (SELECT COUNT(*) FROM sessions WHERE status = 'unlabeled') as unlabeled_sessions,
        (SELECT COUNT(*) FROM models) as total_models,
        (SELECT COUNT(*) FROM configurations) as total_configs,
        (SELECT COUNT(*) FROM sdk_builds) as total_builds
    `),
  }
}

// Export queries for backward compatibility
export const queries = {
  get getAllSessions() { return getQueries().getAllSessions },
  get getSessionById() { return getQueries().getSessionById },
  get getSessionsByStatus() { return getQueries().getSessionsByStatus },
  get insertSession() { return getQueries().insertSession },
  get updateSessionLabel() { return getQueries().updateSessionLabel },
  get getAllModels() { return getQueries().getAllModels },
  get getModelById() { return getQueries().getModelById },
  get getActiveModel() { return getQueries().getActiveModel },
  get insertModel() { return getQueries().insertModel },
  get setActiveModel() { return getQueries().setActiveModel },
  get getAllConfigs() { return getQueries().getAllConfigs },
  get getConfigById() { return getQueries().getConfigById },
  get insertConfig() { return getQueries().insertConfig },
  get getAllBuilds() { return getQueries().getAllBuilds },
  get getBuildById() { return getQueries().getBuildById },
  get insertBuild() { return getQueries().insertBuild },
  get getStats() { return getQueries().getStats },
  db,
}
