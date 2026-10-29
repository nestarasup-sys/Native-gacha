const { sha256 } = require('./storageFiles.cjs')
const { nextCategoryColor } = require('../../categoryColors.cjs')

const CATALOG_SCHEMA_VERSION = 16
const BUILTIN_DOMAINS = [
  'fabricator.models', 'fabricator.poses', 'fabricator.animations', 'fabricator.wardrobe', 'fabricator.design-settings',
  'fabricator.face-sets', 'fabricator.face-catalog', 'fabricator.face-components',
  'fabricator.expression-presets', 'fabricator.hair', 'fabricator.accessories',
  'customizer.characters', 'studio.projects', 'studio.prints',
  'video-studio.media', 'video-studio.backgrounds'
]

function initializeCatalogSchema(database, currentSchema) {
  database.pragma('journal_mode = WAL')
  database.pragma('synchronous = FULL')
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS domains (
      domain_id TEXT PRIMARY KEY,
      schema_version INTEGER NOT NULL CHECK(schema_version > 0),
      manifest_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS domain_migrations (
      domain_id TEXT NOT NULL REFERENCES domains(domain_id),
      from_version INTEGER NOT NULL,
      to_version INTEGER NOT NULL,
      migration_id TEXT NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY(domain_id, to_version)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      domain_id TEXT NOT NULL REFERENCES domains(domain_id),
      kind TEXT NOT NULL,
      display_name TEXT NOT NULL,
      schema_version INTEGER NOT NULL CHECK(schema_version > 0),
      metadata_json TEXT NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0 CHECK(archived IN (0,1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS assets_by_domain_kind_name ON assets(domain_id, kind, display_name COLLATE NOCASE, id);
    CREATE INDEX IF NOT EXISTS assets_by_updated ON assets(updated_at DESC);
    CREATE TABLE IF NOT EXISTS objects (
      sha256 TEXT PRIMARY KEY CHECK(length(sha256) = 64),
      byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      relative_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS asset_objects (
      asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
      sha256 TEXT NOT NULL REFERENCES objects(sha256),
      role TEXT NOT NULL,
      PRIMARY KEY(asset_id, role)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS asset_objects_by_hash ON asset_objects(sha256);
    CREATE TABLE IF NOT EXISTS entity_references (
      source_domain TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_domain TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation TEXT NOT NULL,
      PRIMARY KEY(source_domain, source_id, target_domain, target_id, relation)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS entity_references_by_target ON entity_references(target_domain, target_id);
    CREATE TABLE IF NOT EXISTS roteiros (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      video_title TEXT NOT NULL,
      character_ids_json TEXT NOT NULL,
      background_asset_id TEXT,
      ui_gif_asset_id TEXT,
      preview_details_collapsed INTEGER NOT NULL DEFAULT 0 CHECK(preview_details_collapsed IN (0, 1)),
      position INTEGER NOT NULL CHECK(position >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS roteiro_tiktoks (
      id TEXT PRIMARY KEY,
      roteiro_id TEXT NOT NULL REFERENCES roteiros(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      video_title TEXT NOT NULL,
      position INTEGER NOT NULL CHECK(position >= 0),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(roteiro_id, position)
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS roteiro_tiktoks_by_parent_order ON roteiro_tiktoks(roteiro_id, position);
    CREATE TABLE IF NOT EXISTS roteiro_sections (
      section_id TEXT PRIMARY KEY,
      roteiro_id TEXT NOT NULL REFERENCES roteiros(id) ON DELETE CASCADE,
      section_kind TEXT NOT NULL CHECK(section_kind IN ('opening', 'tiktok')),
      video_asset_json TEXT,
      blocks_json TEXT NOT NULL DEFAULT '[]',
      description_text TEXT NOT NULL DEFAULT '',
      timeline TEXT NOT NULL DEFAULT 'unspecified' CHECK(timeline IN ('unspecified', 'past', 'present', 'future')),
      scene_end_seconds REAL,
      first_group_reaction_seconds REAL,
      second_group_reaction_seconds REAL,
      additional_context TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS roteiro_sections_by_parent ON roteiro_sections(roteiro_id, section_kind);
    CREATE TABLE IF NOT EXISTS base_video_details (
      video_id TEXT PRIMARY KEY,
      video_number INTEGER,
      description_text TEXT NOT NULL DEFAULT '',
      timeline TEXT NOT NULL DEFAULT 'unspecified' CHECK(timeline IN ('unspecified', 'past', 'present', 'future')),
      scene_end_seconds REAL,
      first_group_reaction_seconds REAL,
      second_group_reaction_seconds REAL,
      additional_context TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS base_video_categories (
      category_id TEXT PRIMARY KEY,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color_hex TEXT NOT NULL DEFAULT '#7955c4',
      created_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS base_video_category_assignments (
      video_id TEXT PRIMARY KEY REFERENCES base_video_details(video_id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES base_video_categories(category_id) ON DELETE CASCADE,
      assigned_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS base_video_category_by_category ON base_video_category_assignments(category_id);
    CREATE TABLE IF NOT EXISTS roteiro_export_logs (
      id TEXT PRIMARY KEY,
      roteiro_id TEXT NOT NULL REFERENCES roteiros(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      action TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('success', 'error')),
      details TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS roteiro_export_logs_by_parent ON roteiro_export_logs(roteiro_id, created_at DESC, id DESC);
    CREATE TABLE IF NOT EXISTS base_video_sequence (
      sequence_id INTEGER PRIMARY KEY CHECK(sequence_id = 1),
      next_number INTEGER NOT NULL CHECK(next_number > 0)
    );
    CREATE TABLE IF NOT EXISTS domain_files (
      domain_id TEXT NOT NULL REFERENCES domains(domain_id),
      relative_path TEXT NOT NULL,
      content_text TEXT,
      object_sha256 TEXT REFERENCES objects(sha256),
      byte_length INTEGER NOT NULL CHECK(byte_length >= 0),
      content_sha256 TEXT NOT NULL CHECK(length(content_sha256) = 64),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(domain_id, relative_path),
      CHECK ((content_text IS NULL) <> (object_sha256 IS NULL))
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS domain_image_refs (
      domain_id TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      json_pointer TEXT NOT NULL,
      object_sha256 TEXT NOT NULL REFERENCES objects(sha256),
      PRIMARY KEY(domain_id, relative_path, json_pointer),
      FOREIGN KEY(domain_id, relative_path) REFERENCES domain_files(domain_id, relative_path) ON DELETE CASCADE
    ) WITHOUT ROWID;
    CREATE INDEX IF NOT EXISTS domain_image_refs_by_object ON domain_image_refs(object_sha256);
    CREATE INDEX IF NOT EXISTS domain_files_by_domain_path ON domain_files(domain_id, relative_path);
    CREATE TABLE IF NOT EXISTS domain_directories (
      domain_id TEXT NOT NULL REFERENCES domains(domain_id),
      relative_path TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(domain_id, relative_path)
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS domain_storage_state (
      domain_id TEXT PRIMARY KEY REFERENCES domains(domain_id),
      state TEXT NOT NULL CHECK(state IN ('legacy', 'migrating', 'active', 'verified')),
      manifest_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE TABLE IF NOT EXISTS migration_runs (
      id TEXT PRIMARY KEY,
      state TEXT NOT NULL CHECK(state IN ('prepared', 'copying', 'copied', 'verified', 'cutover', 'complete', 'failed')),
      manifest_json TEXT NOT NULL,
      error_text TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) WITHOUT ROWID;
    CREATE VIRTUAL TABLE IF NOT EXISTS asset_search USING fts5(asset_id UNINDEXED, domain_id UNINDEXED, kind, display_name, metadata_text, tokenize='unicode61 remove_diacritics 2');
    CREATE TRIGGER IF NOT EXISTS assets_search_insert AFTER INSERT ON assets BEGIN
      INSERT INTO asset_search(asset_id, domain_id, kind, display_name, metadata_text)
      VALUES (new.id, new.domain_id, new.kind, new.display_name, new.metadata_json);
    END;
    CREATE TRIGGER IF NOT EXISTS assets_search_update AFTER UPDATE ON assets BEGIN
      DELETE FROM asset_search WHERE asset_id = old.id;
      INSERT INTO asset_search(asset_id, domain_id, kind, display_name, metadata_text)
      VALUES (new.id, new.domain_id, new.kind, new.display_name, new.metadata_json);
    END;
    CREATE TRIGGER IF NOT EXISTS assets_search_delete AFTER DELETE ON assets BEGIN
      DELETE FROM asset_search WHERE asset_id = old.id;
    END;
  `)

  const now = new Date().toISOString()
  database.prepare(`INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (1, 'initial-catalog', ?, ?)`)
    .run(sha256('gacha-data-catalog-schema-v1'), now)
  database.prepare(`INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (2, 'domain-file-store-and-migration-journal', ?, ?)`)
    .run(sha256('gacha-domain-files-schema-v2'), now)
  database.prepare(`INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (3, 'canonical-image-references', ?, ?)`)
    .run(sha256('gacha-canonical-image-references-schema-v3'), now)
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (4, 'roteiros-and-tiktoks-sqlite-store', ?, ?)")
    .run(sha256('gacha-roteiros-sqlite-schema-v4'), now)
  const roteiroColumns = new Set(database.prepare('PRAGMA table_info(roteiros)').all().map((column) => column.name))
  if (!roteiroColumns.has('position')) {
    database.exec('ALTER TABLE roteiros ADD COLUMN position INTEGER NOT NULL DEFAULT 0 CHECK(position >= 0)')
    const existingRoutes = database.prepare('SELECT id FROM roteiros ORDER BY created_at, id').all()
    const updatePosition = database.prepare('UPDATE roteiros SET position = ? WHERE id = ?')
    database.transaction(() => existingRoutes.forEach((route, index) => updatePosition.run(index, route.id)))()
  }
  if (!roteiroColumns.has('background_asset_id')) database.exec('ALTER TABLE roteiros ADD COLUMN background_asset_id TEXT')
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (10, 'roteiro-background-library-reference', ?, ?)")
    .run(sha256('gacha-roteiro-background-library-reference-schema-v10'), now)
  if (!roteiroColumns.has('ui_gif_asset_id')) database.exec('ALTER TABLE roteiros ADD COLUMN ui_gif_asset_id TEXT')
  if (!roteiroColumns.has('preview_details_collapsed')) database.exec('ALTER TABLE roteiros ADD COLUMN preview_details_collapsed INTEGER NOT NULL DEFAULT 0 CHECK(preview_details_collapsed IN (0, 1))')
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (11, 'roteiro-ui-gif-library-reference', ?, ?)")
    .run(sha256('gacha-roteiro-ui-gif-library-reference-schema-v11'), now)
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (5, 'roteiros-position-compatibility', ?, ?)")
    .run(sha256('gacha-roteiros-position-compatibility-schema-v5'), now)
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (6, 'roteiro-section-content-and-blocks', ?, ?)")
    .run(sha256('gacha-roteiro-section-content-and-blocks-schema-v6'), now)
  const sectionColumns = new Set(database.prepare('PRAGMA table_info(roteiro_sections)').all().map((column) => column.name))
  if (!sectionColumns.has('description_text')) database.exec("ALTER TABLE roteiro_sections ADD COLUMN description_text TEXT NOT NULL DEFAULT ''")
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (7, 'roteiro-section-video-description', ?, ?)")
    .run(sha256('gacha-roteiro-section-video-description-schema-v7'), now)
  if (!sectionColumns.has('timeline')) database.exec("ALTER TABLE roteiro_sections ADD COLUMN timeline TEXT NOT NULL DEFAULT 'unspecified' CHECK(timeline IN ('unspecified', 'past', 'present', 'future'))")
  if (!sectionColumns.has('scene_end_seconds')) database.exec('ALTER TABLE roteiro_sections ADD COLUMN scene_end_seconds REAL')
  if (!sectionColumns.has('first_group_reaction_seconds')) database.exec('ALTER TABLE roteiro_sections ADD COLUMN first_group_reaction_seconds REAL')
  if (!sectionColumns.has('second_group_reaction_seconds')) database.exec('ALTER TABLE roteiro_sections ADD COLUMN second_group_reaction_seconds REAL')
  if (!sectionColumns.has('additional_context')) database.exec("ALTER TABLE roteiro_sections ADD COLUMN additional_context TEXT NOT NULL DEFAULT ''")
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (8, 'roteiro-section-timeline-and-reaction-timing', ?, ?)")
    .run(sha256('gacha-roteiro-section-timeline-and-reaction-timing-schema-v8'), now)
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (9, 'base-video-details', ?, ?)")
    .run(sha256('gacha-base-video-details-schema-v9'), now)
  const baseVideoColumns = new Set(database.prepare('PRAGMA table_info(base_video_details)').all().map((column) => column.name))
  if (!baseVideoColumns.has('video_number')) database.exec('ALTER TABLE base_video_details ADD COLUMN video_number INTEGER')
  if (!baseVideoColumns.has('additional_context')) database.exec("ALTER TABLE base_video_details ADD COLUMN additional_context TEXT NOT NULL DEFAULT ''")
  database.exec('CREATE UNIQUE INDEX IF NOT EXISTS base_video_details_by_number ON base_video_details(video_number) WHERE video_number IS NOT NULL')
  database.exec('INSERT OR IGNORE INTO base_video_sequence(sequence_id, next_number) SELECT 1, COALESCE(MAX(video_number), 0) + 1 FROM base_video_details')
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (10, 'base-video-stable-sequence-numbers', ?, ?)")
    .run(sha256('gacha-base-video-stable-sequence-numbers-schema-v10'), now)
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (12, 'roteiro-ai-additional-context', ?, ?)")
    .run(sha256('gacha-roteiro-ai-additional-context-schema-v12'), now)
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (13, 'roteiro-preview-details-collapsed', ?, ?)")
    .run(sha256('gacha-roteiro-preview-details-collapsed-schema-v13'), now)
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (14, 'base-video-categories', ?, ?)")
    .run(sha256('gacha-base-video-categories-schema-v14'), now)
  const categoryColumns = new Set(database.prepare('PRAGMA table_info(base_video_categories)').all().map((column) => column.name))
  if (!categoryColumns.has('color_hex')) {
    database.exec("ALTER TABLE base_video_categories ADD COLUMN color_hex TEXT NOT NULL DEFAULT '#7955c4'")
    const categoryRows = database.prepare('SELECT category_id FROM base_video_categories ORDER BY created_at, category_id').all()
    const assignColor = database.prepare('UPDATE base_video_categories SET color_hex=? WHERE category_id=?')
    const migrationUsedColors = new Set()
    database.transaction(() => categoryRows.forEach((row) => {
      const color = nextCategoryColor(migrationUsedColors)
      migrationUsedColors.add(color)
      assignColor.run(color, row.category_id)
    }))()
  }
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (15, 'base-video-category-colors', ?, ?)")
    .run(sha256('gacha-base-video-category-colors-schema-v15'), now)
  database.prepare("INSERT OR IGNORE INTO schema_migrations(version, name, checksum, applied_at) VALUES (16, 'roteiro-export-log-persistence', ?, ?)")
    .run(sha256('gacha-roteiro-export-log-persistence-schema-v16'), now)
  if (currentSchema < CATALOG_SCHEMA_VERSION) database.pragma(`user_version = ${CATALOG_SCHEMA_VERSION}`)
  const insertDomain = database.prepare(`INSERT OR IGNORE INTO domains(domain_id, schema_version, manifest_json, updated_at) VALUES (?, 1, '{}', ?)`)
  const registerBuiltins = database.transaction(() => BUILTIN_DOMAINS.forEach((id) => insertDomain.run(id, now)))
  registerBuiltins()
  database.prepare("INSERT OR IGNORE INTO app_metadata(key, value) VALUES ('schema_version', '1')").run()
  database.prepare("UPDATE app_metadata SET value=? WHERE key='schema_version'").run(String(CATALOG_SCHEMA_VERSION))
}

module.exports = { BUILTIN_DOMAINS, CATALOG_SCHEMA_VERSION, initializeCatalogSchema }
