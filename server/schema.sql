CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE collaborators (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    avatar       TEXT NOT NULL DEFAULT '',
    user_name    TEXT NOT NULL DEFAULT '',
    instructions TEXT NOT NULL DEFAULT '',
    settings     TEXT NOT NULL DEFAULT '{}',
    sort         INTEGER NOT NULL DEFAULT 0,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL
  );

CREATE TABLE conversations (
    id                TEXT PRIMARY KEY,
    collaborator_id   TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    title             TEXT NOT NULL DEFAULT '',
    settings          TEXT NOT NULL DEFAULT '{}',
    runtime           TEXT NOT NULL DEFAULT '{}',
    branch_of         TEXT,
    branch_message_id TEXT,
    created_at        INTEGER NOT NULL,
    updated_at        INTEGER NOT NULL
  );

CREATE TABLE messages (
    id            TEXT PRIMARY KEY,
    conv_id       TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    seq           INTEGER NOT NULL,
    role          TEXT NOT NULL,
    content       TEXT NOT NULL DEFAULT '',
    reasoning     TEXT NOT NULL DEFAULT '',
    subtext       TEXT NOT NULL DEFAULT '',
    meta          TEXT,
    reply_to      TEXT,
    reactions     TEXT,
    version       INTEGER NOT NULL DEFAULT 0,
    version_count INTEGER NOT NULL DEFAULT 1,
    status        TEXT NOT NULL DEFAULT 'complete',
    pending       INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  );

CREATE TABLE attachments (
    id         TEXT PRIMARY KEY,
    message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    file       TEXT NOT NULL,
    mime       TEXT NOT NULL DEFAULT '',
    name       TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  , caption TEXT NOT NULL DEFAULT '', stereo TEXT NOT NULL DEFAULT '');

CREATE TABLE memories (
    id         TEXT PRIMARY KEY,
    collab_id  TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    content    TEXT NOT NULL,
    tags       TEXT NOT NULL DEFAULT '[]',
    source     TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  , kind TEXT NOT NULL DEFAULT 'fact', day TEXT NOT NULL DEFAULT '', history TEXT NOT NULL DEFAULT '[]', retracted_at INTEGER, retract_reason TEXT NOT NULL DEFAULT '', said TEXT NOT NULL DEFAULT '');

CREATE TABLE diaries (
    id         TEXT PRIMARY KEY,
    collab_id  TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    day        TEXT NOT NULL,
    content    TEXT NOT NULL,
    model      TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE (collab_id, day)
  );

CREATE TABLE info_cards (
    id         TEXT PRIMARY KEY,
    collab_id  TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    content    TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

CREATE TABLE providers (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    base_url   TEXT NOT NULL,
    api_key    TEXT NOT NULL DEFAULT '',
    model      TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

CREATE TABLE embeddings (
    message_id TEXT PRIMARY KEY REFERENCES messages(id) ON DELETE CASCADE,
    collab_id  TEXT NOT NULL,
    vec        BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );

CREATE TABLE wakes (
    id           TEXT PRIMARY KEY,
    collab_id    TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    kind         TEXT NOT NULL,             -- silence | alarm | manual
    note         TEXT NOT NULL DEFAULT '',
    scheduled_at INTEGER NOT NULL,
    status       TEXT NOT NULL,             -- pending | running | done | failed | cancelled
    conv_id      TEXT,
    started_at   INTEGER,
    finished_at  INTEGER,
    result       TEXT NOT NULL DEFAULT '',
    tools        TEXT NOT NULL DEFAULT '[]',
    usage        TEXT,
    created_at   INTEGER NOT NULL
  );

CREATE TABLE card_history (
    id       TEXT PRIMARY KEY,
    card_id  TEXT NOT NULL,
    title    TEXT NOT NULL,
    content  TEXT NOT NULL,
    saved_at INTEGER NOT NULL
  );

CREATE TABLE summaries (
    id         TEXT PRIMARY KEY,
    collab_id  TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL,
    period     TEXT NOT NULL,
    content    TEXT NOT NULL,
    model      TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    UNIQUE (collab_id, kind, period)
  );

CREATE TABLE views (
    id          TEXT PRIMARY KEY,
    collab_id   TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    text        TEXT NOT NULL,
    said        TEXT NOT NULL DEFAULT '',
    status      TEXT NOT NULL DEFAULT 'held',
    note        TEXT NOT NULL DEFAULT '',
    history     TEXT NOT NULL DEFAULT '[]',
    created_at  INTEGER NOT NULL,
    reviewed_at INTEGER
  );

CREATE TABLE threads (
    id         TEXT PRIMARY KEY,
    collab_id  TEXT NOT NULL REFERENCES collaborators(id) ON DELETE CASCADE,
    text       TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    closed_at  INTEGER,
    close_note TEXT NOT NULL DEFAULT ''
  );

CREATE TABLE moments (
    id         TEXT PRIMARY KEY,
    collab_id  TEXT NOT NULL,
    day        TEXT NOT NULL,
    text       TEXT NOT NULL,
    said       TEXT NOT NULL DEFAULT '',
    importance INTEGER NOT NULL DEFAULT 2,
    arousal    REAL NOT NULL DEFAULT 0.3,
    resolved   INTEGER NOT NULL DEFAULT 1,
    touches    INTEGER NOT NULL DEFAULT 0,
    touched_at INTEGER,
    rings      TEXT NOT NULL DEFAULT '[]',
    shown      INTEGER NOT NULL DEFAULT 0,
    shown_at   INTEGER,
    vec        BLOB,
    source     TEXT NOT NULL DEFAULT 'diary',
    created_at INTEGER NOT NULL
  );

CREATE TABLE traits (
    id          TEXT PRIMARY KEY,
    collab_id   TEXT NOT NULL,
    label       TEXT NOT NULL,
    obs         TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    moment_ids  TEXT NOT NULL DEFAULT '[]',
    first_day   TEXT NOT NULL,
    last_day    TEXT NOT NULL,
    his_note    TEXT NOT NULL DEFAULT '',
    history     TEXT NOT NULL DEFAULT '[]',
    struck_why  TEXT NOT NULL DEFAULT '',
    struck_at   INTEGER,
    told        INTEGER NOT NULL DEFAULT 1,
    reviewed_at INTEGER,
    created_at  INTEGER NOT NULL
  );

CREATE TABLE persona_versions (
    id         TEXT PRIMARY KEY,
    collab_id  TEXT NOT NULL,
    content    TEXT NOT NULL DEFAULT '',
    note       TEXT NOT NULL DEFAULT '',
    status     TEXT NOT NULL,
    her_note   TEXT NOT NULL DEFAULT '',
    told       INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    decided_at INTEGER
  );

CREATE TABLE pulls (
    id         TEXT PRIMARY KEY,
    collab_id  TEXT NOT NULL,
    day        TEXT NOT NULL,
    sides      TEXT NOT NULL,
    chose      TEXT NOT NULL,
    why        TEXT NOT NULL DEFAULT '',
    said       TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

CREATE TABLE stances (
    id          TEXT PRIMARY KEY,
    collab_id   TEXT NOT NULL,
    label       TEXT NOT NULL,
    obs         TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'pending',
    pull_ids    TEXT NOT NULL DEFAULT '[]',
    first_day   TEXT NOT NULL,
    last_day    TEXT NOT NULL,
    his_note    TEXT NOT NULL DEFAULT '',
    history     TEXT NOT NULL DEFAULT '[]',
    struck_why  TEXT NOT NULL DEFAULT '',
    struck_at   INTEGER,
    told        INTEGER NOT NULL DEFAULT 1,
    reviewed_at INTEGER,
    created_at  INTEGER NOT NULL
  );

CREATE INDEX idx_conversations_collab ON conversations(collaborator_id, updated_at);

CREATE UNIQUE INDEX idx_messages_seq ON messages(conv_id, seq);

CREATE INDEX idx_attachments_message ON attachments(message_id);

CREATE INDEX idx_memories_collab ON memories(collab_id, created_at);

CREATE INDEX idx_embeddings_collab ON embeddings(collab_id);

CREATE INDEX idx_wakes_collab ON wakes(collab_id, status, scheduled_at);

CREATE INDEX idx_card_history ON card_history(card_id, saved_at);

CREATE INDEX idx_threads_collab ON threads(collab_id, closed_at);

CREATE INDEX idx_moments_collab ON moments(collab_id, day);

CREATE INDEX idx_traits_collab ON traits(collab_id, status);

CREATE INDEX idx_persona_collab ON persona_versions(collab_id, created_at);

CREATE INDEX idx_pulls_collab ON pulls(collab_id, day);

CREATE INDEX idx_stances_collab ON stances(collab_id, status);
