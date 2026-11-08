-- 마이챌린지(마챌) D1 스키마 v1.0
-- Cloudflare D1 콘솔 또는 `wrangler d1 execute machal-db --remote --file=schema.sql` 로 실행

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  nickname TEXT NOT NULL,
  phone TEXT,
  level TEXT NOT NULL DEFAULT 'L0',          -- L0~L5
  role TEXT NOT NULL DEFAULT 'member',       -- member | staff
  status TEXT NOT NULL DEFAULT 'active',     -- active | dormant | removed
  has_business INTEGER NOT NULL DEFAULT 0,
  interests TEXT,                            -- 쉼표 구분 S-01~S-06
  bio TEXT,
  onboarded INTEGER NOT NULL DEFAULT 0,
  asset_diag TEXT,                           -- JSON, 자기 자산 진단
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  form TEXT NOT NULL,                        -- JSON 지원서 답변
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | approved | rejected
  invite_code TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT,
  decided_by INTEGER
);

CREATE TABLE IF NOT EXISTS level_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  from_level TEXT,
  to_level TEXT NOT NULL,
  reason TEXT,
  decided_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS promotion_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  target_level TEXT NOT NULL,
  note TEXT,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | approved | held | rejected
  reviewer_id INTEGER,
  decision_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  action TEXT NOT NULL,
  points INTEGER NOT NULL,
  ref_type TEXT,
  ref_id INTEGER,
  quarter TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_points_user ON points_ledger(user_id, created_at);

CREATE TABLE IF NOT EXISTS badges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  code TEXT NOT NULL,                        -- first_sale | repeat_sale | completion | leader_completion | contributor | founder | mentor
  granted_by INTEGER,
  evidence TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS rounds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planning',   -- planning | open | active | closed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'group',        -- solo | group | official
  field_code TEXT NOT NULL,                  -- S-01~S-06
  stage TEXT NOT NULL DEFAULT 'proposed',    -- proposed | review | recruiting | agreement | active | settling | closed | rejected | stopped
  round_id INTEGER,
  leader_id INTEGER NOT NULL,
  summary TEXT,
  proposal TEXT,                             -- JSON 제안서
  review TEXT,                               -- JSON 심사 결과
  public_numbers TEXT,                       -- JSON {has_sales, customers_band, hours}
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'general',      -- leader | accounting | record | maker | marketing | general
  role_weight REAL NOT NULL DEFAULT 1.0,
  planned_share REAL,                        -- 0~1
  actual_share REAL,                         -- 0~1
  status TEXT NOT NULL DEFAULT 'applied',    -- applied | active | left | removed | rejected
  apply_note TEXT,
  joined_at TEXT,
  left_at TEXT,
  leave_type TEXT,                           -- notice | unannounced
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(challenge_id, user_id)
);

CREATE TABLE IF NOT EXISTS agreements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  clauses TEXT NOT NULL,                     -- JSON
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | signing | signed | approved | locked
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_by INTEGER,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS signatures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  agreement_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  signed_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT,
  UNIQUE(agreement_id, user_id)
);

CREATE TABLE IF NOT EXISTS checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  week_no INTEGER NOT NULL,
  opened_by INTEGER NOT NULL,
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(challenge_id, week_no)
);

CREATE TABLE IF NOT EXISTS checkin_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  checkin_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  done TEXT,                                 -- JSON array
  goals TEXT,                                -- JSON array
  blocker TEXT,
  hours REAL NOT NULL DEFAULT 0,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(checkin_id, user_id)
);

CREATE TABLE IF NOT EXISTS done_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  link TEXT,
  shared INTEGER NOT NULL DEFAULT 0,
  confirmed_by INTEGER,
  confirmed_at TEXT,
  cancelled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  code TEXT NOT NULL,                        -- declare | first_public | cross_feedback | demo_day | custom
  title TEXT NOT NULL,
  due_date TEXT,
  done_at TEXT,
  evidence TEXT
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                        -- revenue | expense
  entry_date TEXT NOT NULL,
  amount INTEGER NOT NULL,                   -- 원 단위 정수, 부가세 제외
  is_external INTEGER NOT NULL DEFAULT 1,    -- 매출: 외부 고객 여부
  channel TEXT,
  category TEXT,
  payer_type TEXT NOT NULL DEFAULT 'none',   -- 비용: member | hq | none
  payer_id INTEGER,
  evidence TEXT,
  note TEXT,
  entered_by INTEGER NOT NULL,
  confirmed_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settlements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  inputs TEXT NOT NULL,                      -- JSON
  result TEXT NOT NULL,                      -- JSON (모든 중간값)
  rule_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'confirming', -- confirming | disputed | reviewed | paid | carried
  created_by INTEGER NOT NULL,
  reviewed_by INTEGER,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS settlement_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  confirmed INTEGER NOT NULL,                -- 1 확인 / 0 이의
  dispute_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(settlement_id, user_id)
);

CREATE TABLE IF NOT EXISTS settlement_payouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  settlement_id INTEGER NOT NULL,
  user_id INTEGER,                           -- NULL = 운영본부
  kind TEXT NOT NULL,                        -- refund_member | refund_hq | fee | hq | leader | member
  gross INTEGER NOT NULL,
  withholding_rate REAL NOT NULL DEFAULT 0,
  withholding INTEGER NOT NULL DEFAULT 0,
  net INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | paid | held
  paid_at TEXT
);

CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL,                    -- settlement | report | other
  ref_id INTEGER,
  filed_by INTEGER NOT NULL,
  stage INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'open',       -- open | mediating | resolved | closed
  result TEXT,
  assignee_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);

CREATE TABLE IF NOT EXISTS papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL UNIQUE,
  form TEXT NOT NULL,                        -- JSON
  private_fields TEXT NOT NULL DEFAULT '[]', -- JSON array of field keys
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | review | approved | published
  publish_scope TEXT NOT NULL DEFAULT 'members', -- members | public
  reviewer_id INTEGER,
  review_note TEXT,
  submitted_at TEXT,
  published_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL,
  board TEXT NOT NULL DEFAULT 'share',       -- question | share | review | notice | swap
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  challenge_id INTEGER,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  reported INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS helpful (
  post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                        -- machal_day | demo_day | seminar | study | office_hour | workshop
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  location TEXT,
  capacity INTEGER,
  min_level TEXT NOT NULL DEFAULT 'L1',
  description TEXT,
  attendance_code TEXT,
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS registrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'registered', -- registered | attended | cancelled
  attended_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,                       -- JSON
  version INTEGER NOT NULL DEFAULT 1,
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  action TEXT NOT NULL,
  target TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS view_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  target_type TEXT NOT NULL,                 -- group_logs | paper_full
  target_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
