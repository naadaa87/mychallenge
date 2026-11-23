-- 마이챌린지(마챌) D1 스키마 v2.0 (커뮤니티 운영 모델: 정기모임 · 학습/도전그룹 · 출석 · 기록 · 성과)
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
  can_lead INTEGER NOT NULL DEFAULT 0,       -- 운영진이 승인한 그룹리더 (v2.0)
  leader_since TEXT,
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
  recruit_until TEXT,                       -- 모집 마감일 (v1.2)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS challenges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,      -- 그룹 (표 이름은 예전 그대로 둔다)
  title TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'challenge',    -- study(학습그룹) | challenge(도전그룹)
  field_code TEXT NOT NULL,                  -- S-01~S-06
  stage TEXT NOT NULL DEFAULT 'recruiting',  -- recruiting | active | closed | stopped
  round_id INTEGER,                          -- 모집 시즌 (선택)
  leader_id INTEGER NOT NULL,
  summary TEXT,                              -- 한 줄 소개
  description TEXT,                          -- 자세한 소개: 무엇을, 어떻게, 누구와
  goal_text TEXT,                            -- 그룹 목표 문장
  goal_metric TEXT,                          -- revenue | customers | sales | users | content | study | custom
  goal_unit TEXT,
  goal_target REAL,
  start_date TEXT,
  end_date TEXT,
  schedule_text TEXT,                        -- 예: 매주 화요일 21시 온라인
  capacity INTEGER NOT NULL DEFAULT 8,       -- 정원(그룹리더 포함)
  join_mode TEXT NOT NULL DEFAULT 'approval',-- open(바로 참여) | approval(리더 승인)
  recruit_open INTEGER NOT NULL DEFAULT 1,   -- 새 그룹원을 받는 중인지
  policy TEXT,                               -- JSON 출석 규칙
  place TEXT,                                -- 주로 모이는 곳
  chat_url TEXT,                             -- 그룹 대화방 (그룹원에게만 보임)
  proposal TEXT,                             -- (예전 제안서, 쓰지 않음)
  review TEXT,                               -- (예전 심사 결과, 쓰지 않음)
  public_numbers TEXT,                       -- JSON {has_sales, customers_band, hours}
  closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS group_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',       -- leader | sub | member
  status TEXT NOT NULL DEFAULT 'applied',    -- applied | active | left | removed | rejected
  apply_note TEXT,
  joined_at TEXT,
  left_at TEXT,
  leave_type TEXT,                           -- self | attendance | leader | staff
  leave_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(challenge_id, user_id)
);






CREATE TABLE IF NOT EXISTS milestones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  code TEXT NOT NULL DEFAULT 'custom',
  title TEXT NOT NULL,
  due_date TEXT,
  done_at TEXT,
  evidence TEXT
);





CREATE TABLE IF NOT EXISTS disputes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL,                    -- report(게시물 신고) | removal(그룹 퇴출 이의) | other
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
  board TEXT NOT NULL DEFAULT 'share',       -- notice | share | idea | trend | question | group | review
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
  hidden INTEGER NOT NULL DEFAULT 0,          -- v1.2
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
  type TEXT NOT NULL,                        -- regular(정기모임) | showcase(성과발표회) | seminar | workshop | office_hour | networking
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  location TEXT,
  capacity INTEGER,
  min_level TEXT NOT NULL DEFAULT 'L1',
  description TEXT,
  attendance_code TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | cancelled (v1.2)
  mode TEXT NOT NULL DEFAULT 'offline',      -- offline | online | hybrid (v2.0)
  online_url TEXT,                           -- 온라인 참여 링크 (신청자에게만 보임)
  topics TEXT,                               -- 쉼표 구분 idea, market, trend, ai, sideproject, group
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

-- ---------- v1.1 추가 ----------
-- 약관·개인정보 동의 기록 (지원서 제출, 가입 시점)
CREATE TABLE IF NOT EXISTS consents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_type TEXT NOT NULL,                -- application | user
  subject_id INTEGER NOT NULL,
  kind TEXT NOT NULL,                        -- terms | privacy | public_results
  version TEXT NOT NULL,                     -- 동의한 문서의 시행일
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_consents_subject ON consents(subject_type, subject_id);

-- 로그인 실패 기록 (15분 안에 같은 이메일 10회, 같은 IP 30회 실패하면 잠시 막는다)
CREATE TABLE IF NOT EXISTS login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email ON login_attempts(email, created_at);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ip, created_at);

-- ---------- v1.2 운영본부 콘솔 ----------
-- 기존 표에 열을 더할 때 쓰는 마이그레이션 기록 (functions/_lib/admin-routes.js 의 MIGRATIONS)
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 운영자(최고 관리자). 운영진(users.role = 'staff') 중 이 표에 있는 사람만 규칙 변경·운영진 임명·개인정보 내려받기를 한다
CREATE TABLE IF NOT EXISTS admin_roles (
  user_id INTEGER PRIMARY KEY,
  role TEXT NOT NULL DEFAULT 'owner',
  granted_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 운영진 내부 메모 (회원·챌린지·가입 신청에 붙인다. 회원에게는 보이지 않는다)
CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type TEXT NOT NULL,                    -- user | challenge | application
  ref_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_notes_ref ON admin_notes(ref_type, ref_id);

-- 운영본부가 보낸 단체 알림 기록
CREATE TABLE IF NOT EXISTS broadcasts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id INTEGER NOT NULL,
  segment TEXT NOT NULL,                     -- JSON {type, level, challenge_id}
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  recipients INTEGER NOT NULL DEFAULT 0,
  post_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


-- ───────── v1.3 이용 통계 (KPI) ─────────
-- 공개 사이트·회원 공간의 페이지 보기, 클릭, 머문 시간. IP와 브라우저 정보 원문은 저장하지 않는다. 13개월이 지나면 지운다.
CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,                         -- 한국 날짜 YYYY-MM-DD
  hour INTEGER NOT NULL,                     -- 한국 시각 0~23
  vid TEXT NOT NULL,                         -- 브라우저에 저장된 무작위 방문자 번호
  sid TEXT NOT NULL,                         -- 방문(세션) 번호, 30분 쉬면 새로 만든다
  user_id INTEGER,                           -- 로그인한 회원이면 회원 번호
  kind TEXT NOT NULL,                        -- view | click | leave
  area TEXT NOT NULL DEFAULT 'site',         -- site | paper | app
  path TEXT NOT NULL,
  title TEXT,                                -- view: 페이지 제목
  source TEXT,                               -- view(방문 첫 페이지): 유입 출처 이름 (네이버 검색, 인스타그램, 직접 방문 …)
  ref_host TEXT,                             -- view(방문 첫 페이지): 들어온 주소의 도메인
  campaign TEXT,                             -- utm_source / utm_medium / utm_campaign
  target TEXT,                               -- click: 누른 링크 주소 또는 종류
  label TEXT,                                -- click: 누른 글자
  zone TEXT,                                 -- click: header | hero | body | cta | footer | nav
  dur INTEGER,                               -- leave: 화면에 보인 시간(초)
  scroll INTEGER,                            -- leave: 그 페이지를 가장 많이 내려 본 위치(%)
  device TEXT,                               -- mobile | tablet | desktop
  is_new INTEGER NOT NULL DEFAULT 0,         -- 이 브라우저의 첫 방문
  entry INTEGER NOT NULL DEFAULT 0,          -- 방문의 첫 페이지
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ae_day ON analytics_events(day, kind);
CREATE INDEX IF NOT EXISTS idx_ae_path ON analytics_events(path, kind, day);
CREATE INDEX IF NOT EXISTS idx_ae_sid ON analytics_events(sid);
CREATE INDEX IF NOT EXISTS idx_ae_user ON analytics_events(user_id, day);

-- ───────── v2.0 커뮤니티 운영 모델 ─────────
-- 그룹리더 신청. 운영진이 승인하면 users.can_lead = 1 이 되고, 그 뒤로는 언제든 그룹을 만들 수 있다.
CREATE TABLE IF NOT EXISTS leader_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  form TEXT NOT NULL,                        -- JSON {kind, topic, plan, experience, time}
  status TEXT NOT NULL DEFAULT 'pending',    -- pending | approved | rejected
  note TEXT,
  decided_by INTEGER,
  decided_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 그룹 모임 일정 (온라인·오프라인). 모임마다 출석을 받는다.
CREATE TABLE IF NOT EXISTS group_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,                   -- 한국 시각 YYYY-MM-DDTHH:MM
  duration_min INTEGER NOT NULL DEFAULT 90,
  mode TEXT NOT NULL DEFAULT 'online',       -- online | offline
  place TEXT,                                -- 장소 또는 온라인 링크
  agenda TEXT,                               -- 다룰 것
  prep TEXT,                                 -- 미리 준비할 것
  status TEXT NOT NULL DEFAULT 'scheduled',  -- scheduled | open(출석 받는 중) | closed(출석 마감) | cancelled
  code TEXT,                                 -- 출석 코드 (숫자 4자리)
  opened_at TEXT,
  closed_at TEXT,
  notes TEXT,                                -- 모임 기록(회의록)
  created_by INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gs_group ON group_sessions(challenge_id, starts_at);

-- 모임별 참석 예정과 출석 결과
CREATE TABLE IF NOT EXISTS session_attendance (
  session_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  rsvp TEXT,                                 -- yes | no
  rsvp_note TEXT,                            -- 불참 사유
  rsvp_at TEXT,
  status TEXT,                               -- present | late | absent | excused (비어 있으면 아직)
  method TEXT,                               -- code | leader | auto
  checked_at TEXT,
  marked_by INTEGER,
  PRIMARY KEY(session_id, user_id)
);

-- 출석 경고 (자동 또는 그룹리더가 준 경고). cleared_at이 있으면 취소된 경고
CREATE TABLE IF NOT EXISTS group_warnings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'attendance',   -- attendance | manual
  reason TEXT NOT NULL,
  session_id INTEGER,
  issued_by INTEGER,                         -- 비어 있으면 출석 규칙에 따른 자동 경고
  cleared_at TEXT,
  cleared_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gw_member ON group_warnings(challenge_id, user_id);

-- 도전 기록 (진행 기록·학습 노트·자료·회고·공지). 커뮤니티에 공유하면 post_id가 생긴다
CREATE TABLE IF NOT EXISTS group_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'progress',     -- progress | study | resource | retro | notice
  body TEXT NOT NULL,
  link TEXT,
  session_id INTEGER,
  post_id INTEGER,
  pinned INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gl_group ON group_logs(challenge_id, created_at);

CREATE TABLE IF NOT EXISTS log_cheers (
  log_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(log_id, user_id)
);

-- 성과 기록 (매출·고객·판매·사용자·콘텐츠 등). 운영진이 확인하면 verified_at이 생긴다
CREATE TABLE IF NOT EXISTS group_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  challenge_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  label TEXT,
  happened_on TEXT NOT NULL,
  evidence TEXT,
  post_id INTEGER,
  verified_by INTEGER,
  verified_at TEXT,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_gr_group ON group_results(challenge_id, happened_on);

-- 정기모임 발제와 성과발표회 발표 신청
CREATE TABLE IF NOT EXISTS event_presentations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  challenge_id INTEGER,                      -- 그룹 발표면 그룹
  title TEXT NOT NULL,
  summary TEXT,
  link TEXT,
  status TEXT NOT NULL DEFAULT 'applied',    -- applied | confirmed | presented | declined
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
