// 총괄 관리 — 총괄 현황, 보안·접속, 사이트 운영 (v2.2)
import { api, post, put, esc, toast, reload, field, input, textarea, select, check, bindForms, bindActions, num, fmtDate, ago, empty } from '../../core.js';
import { kpi, kv, actionLabel, fmtDetail, getCounts, invalidateCounts } from './shared.js';

export const SCOPES = [
  ['members', '회원·가입', '가입 신청, 회원 정보 변경, 신규 회원 정착, 승급 심사'],
  ['groups', '그룹·성과', '그룹리더 신청·자격, 그룹 관리, 시즌, 매출 확인, 페이퍼'],
  ['comms', '정기모임·소통', '정기모임·일정, 발표 신청, 단체 알림, 단체카톡방'],
  ['community', '커뮤니티', '커뮤니티 관리, 이의·신고'],
  ['data', 'KPI·데이터', 'KPI 지표, CSV 내려받기'],
];
const SCOPE_NAME = Object.fromEntries(SCOPES.map(([k, n]) => [k, n]));
export function scopeChips(s) {
  if (s.is_owner) return '<span class="chip ink">모든 영역</span>';
  if (s.scopes == null) return '<span class="chip">전체</span>';
  if (!s.scopes.length) return '<span class="chip amber">현황·검색만</span>';
  return s.scopes.map(k => `<span class="chip blue">${esc(SCOPE_NAME[k] || k)}</span>`).join(' ');
}
const ownerOnly = title => ({ title, body: '<div class="notice">총괄관리자만 볼 수 있는 화면입니다.</div>' });

// ───────── 총괄 현황 ─────────
async function overview() {
  const counts = await getCounts();
  if (!counts.is_owner) return ownerOnly('총괄 현황');
  const d = await api('/admin/overview');
  const m = d.members, sys = d.system;
  const todo = d.checklist.filter(c => !c.ok);
  const body = `
    <section class="card own-check">
      <div class="card-head"><h3>총괄관리자 점검표</h3><span class="muted small">${todo.length ? `손볼 것 ${todo.length}가지` : '모두 괜찮습니다'}</span></div>
      <div class="own-checklist">${d.checklist.map(c => `<${c.link ? `a href="${c.link}"` : 'div'} class="own-ci ${c.ok ? (c.info ? 'info' : 'ok') : 'todo'}">
        <span class="own-ci-mark" aria-hidden="true">${c.ok ? (c.info ? 'i' : '✓') : '!'}</span>
        <span><b>${esc(c.title)}</b><small>${esc(c.detail)}</small></span></${c.link ? 'a' : 'div'}>`).join('')}</div>
    </section>

    <section class="adm-sec"><div class="adm-sec-head"><h2>회원과 커뮤니티</h2><span class="muted small">실제 기록에서 바로 계산합니다</span></div>
      <div class="kpi-grid kpi-4">
        ${kpi('활동 중인 회원', num(m.total) + '<small>명</small>', `이번 달 새 회원 ${num(m.new_month)}명 · 휴면 ${num(m.dormant)}명`, { accent: true, href: '#/users' })}
        ${kpi('최근 7일 접속', num(m.active_7d) + '<small>명</small>', m.total ? `회원의 ${Math.round(m.active_7d / m.total * 100)}%` : '-', { href: '#/kpi' })}
        ${kpi('모집·진행 중인 그룹', num(m.groups) + '<small>개</small>', `그룹리더 ${num(m.leaders)}명`, { href: '#/groups' })}
        ${kpi('단체카톡방 참여', m.chat_rate == null ? '-' : m.chat_rate + '<small>%</small>', `${num(m.chat_in)}명 · 새 회원 ${num(m.newcomers)}명 중 정착 ${num(m.newcomers_done)} · 멈춤 ${num(m.newcomers_stalled)}`, { href: '#/onboarding' })}
      </div>
    </section>

    <div class="adm-two">
      <section class="card"><div class="card-head"><h3>받은 일 처리 속도</h3><span class="muted small">최근 30일</span></div>
        <div class="table-wrap"><table class="tbl compact"><thead><tr><th>받은 일</th><th class="num">대기</th><th class="num">기한 지남</th><th class="num">30일 처리</th><th class="num">평균 처리</th></tr></thead><tbody>
          ${d.queues.map(q => `<tr><td><a href="#/${q.key}">${esc(q.name)}</a> <small class="muted">· ${q.limit}일 안</small></td><td class="num">${num(q.pending)}</td><td class="num">${q.overdue == null ? '-' : q.overdue ? `<b class="error">${num(q.overdue)}</b>` : '0'}</td><td class="num">${num(q.done30)}</td><td class="num">${q.avg_days == null ? '-' : `<span class="${q.avg_days > q.limit ? 'error' : ''}">${q.avg_days}일</span>`}</td></tr>`).join('')}
        </tbody></table></div>
        <p class="small muted" style="margin:10px 0 0">평균 처리가 기한보다 길면 담당을 나누거나 처리 기준을 단순하게 바꿀 때입니다.</p>
      </section>
      <section class="card"><div class="card-head"><h3>운영진 업무</h3><a class="small" href="#/staff">담당 영역 바꾸기</a></div>
        <div class="table-wrap"><table class="tbl compact"><thead><tr><th>운영진</th><th>담당</th><th class="num">7일</th><th class="num">30일</th><th>마지막 접속</th></tr></thead><tbody>
          ${d.staff.map(s => `<tr><td><a href="#/users/${s.id}"><b>${esc(s.nickname)}</b></a>${s.is_owner ? ' <small class="muted">총괄</small>' : ''}</td><td>${scopeChips(s)}</td><td class="num">${num(s.actions_7d)}</td><td class="num">${num(s.actions_30d)}</td><td><small>${s.last_seen_at ? ago(s.last_seen_at) : '-'}</small></td></tr>`).join('')}
        </tbody></table></div>
        <p class="small muted" style="margin:10px 0 0">숫자는 감사 로그에 남은 처리 건수입니다. 한 사람에게 몰리면 담당 영역을 나눠 주세요.</p>
      </section>
    </div>

    <div class="adm-two" style="margin-top:14px">
      <section class="card"><div class="card-head"><h3>시스템</h3><a class="small" href="#/data">데이터·백업</a></div>
        ${kv([
          ['마지막 전체 백업', sys.last_backup_at ? `${fmtDate(sys.last_backup_at, true)} <small class="muted">(${sys.backup_days}일 전)</small>` : '<span class="error">기록 없음</span>'],
          ['로그인 실패 (24시간)', `<a href="#/security">${num(sys.failures_24h)}건</a>`],
          ['정리할 데이터', sys.cleanup.map(t => `${esc(t.name)} ${num(t.count)}`).join(' · ')],
          ['회원 신청', sys.applications.open ? '받는 중' : '<span class="chip amber">닫힘</span>'],
          ['공지 띠', sys.banner ? `${esc(sys.banner.text)} <small class="muted">(${sys.banner.audience === 'all' ? '홈페이지·회원 공간' : '회원 공간'})</small>` : '꺼짐'],
          ['데이터베이스', `표 ${num(sys.tables)}개 · 구조 변경 ${num(sys.migrations)}건 적용`],
        ])}
      </section>
      <section class="card"><div class="card-head"><h3>최근 바뀐 규칙·권한</h3><a class="small" href="#/audit">감사 로그</a></div>
        ${d.changes.length ? `<div class="list">${d.changes.map(a => `<div class="list-item small"><div class="grow"><b>${esc(actionLabel(a.action))}</b> <span class="muted">· ${esc(a.actor || '-')} · ${ago(a.created_at)}</span><div class="meta">${esc(fmtDetail(a.detail, 120))}</div></div></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">아직 바뀐 것이 없습니다.</p>'}
      </section>
    </div>`;
  return { title: '총괄 현황', sub: '운영이 잘 굴러가는지, 총괄관리자가 챙길 것이 무엇인지 한 화면에서 봅니다.', body };
}

// ───────── 보안·접속 ─────────
async function security({ me }) {
  const counts = await getCounts();
  if (!counts.is_owner) return ownerOnly('보안·접속');
  const d = await api('/admin/security');
  const f = d.failures;
  const staffTargeted = f.by_email.filter(r => r.is_staff);
  const body = `
    ${staffTargeted.length ? `<div class="notice danger" style="margin-bottom:12px"><b>운영진 계정으로 로그인 실패가 있습니다.</b> ${staffTargeted.map(r => `${esc(r.email)} ${r.n}번`).join(', ')}. 본인이 틀린 것이 아니라면 비밀번호를 바꾸고 아래에서 그 계정의 다른 로그인을 모두 끊어 주세요.</div>` : ''}
    <div class="kpi-grid kpi-4">
      ${kpi('로그인 실패 (24시간)', num(f.total) + '<small>번</small>', `계정 ${num(f.by_email.length)}개 · IP ${num(f.by_ip.length)}곳`, { accent: true })}
      ${kpi('잠긴 계정·IP', num(f.by_email.filter(r => r.locked).length + f.by_ip.filter(r => r.locked).length) + '<small>곳</small>', `${d.rules.window_min}분 동안 계정당 ${d.rules.per_email}번, IP당 ${d.rules.per_ip}번 실패하면 잠김`)}
      ${kpi('운영진 로그인 기기', num(d.sessions.length) + '<small>대</small>', `운영진 ${num(d.staff.length)}명 · 로그인 유지 ${d.rules.session_days}일`)}
      ${kpi('오래 안 들어온 운영진', num(d.staff.filter(s => !s.last_seen_at || (Date.now() - Date.parse(s.last_seen_at.replace(' ', 'T') + 'Z')) / 864e5 > 90).length) + '<small>명</small>', '90일 넘게 접속 없음')}
    </div>
    <section class="card flush"><div class="card-head pad"><h3>운영진 로그인 기기</h3><span class="muted small">모르는 기기나 오래된 로그인은 끊어 주세요</span></div>
      ${d.sessions.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>운영진</th><th>기기</th><th>로그인</th><th>만료</th><th></th></tr></thead><tbody>
        ${d.sessions.map(s => `<tr><td><a href="#/users/${s.user_id}"><b>${esc(s.nickname)}</b></a>${s.is_owner ? ' <small class="muted">총괄</small>' : ''}${s.current ? ' <span class="chip green">지금 이 기기</span>' : ''}</td><td>${esc(s.ua || '기록 없음 (이전 로그인)')}</td><td><small>${fmtDate(s.created_at, true)}</small></td><td><small>${fmtDate(s.expires_at)}</small></td>
          <td class="btn-cell">${s.current ? '' : `<button class="btn sm" data-act="rv" data-sid="${s.sid}" data-confirm="${esc(s.nickname)}님의 이 기기 로그인을 끊을까요? 다시 로그인해야 합니다.">로그아웃</button>`}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted small pad">로그인한 운영진이 없습니다.</p>'}
    </section>
    <div class="adm-two" style="margin-top:14px">
      <section class="card"><div class="card-head"><h3>운영진 계정</h3></div>
        <div class="list">${d.staff.map(s => `<div class="list-item"><div class="grow"><b>${esc(s.nickname)}</b> ${s.is_owner ? '<span class="chip ink">총괄관리자</span>' : ''}<div class="meta">${esc(s.email)} · 로그인 기기 ${num(s.devices)}대 · 마지막 접속 ${s.last_seen_at ? ago(s.last_seen_at) : '-'}</div></div>
          ${s.devices ? `<button class="btn sm ghost" data-act="rvAll" data-uid="${s.id}" data-confirm="${esc(s.nickname)}님의 로그인을 모든 기기에서 끊을까요?${s.id === me.id ? ' 지금 이 기기는 남겨 둡니다.' : ''}">모든 기기 로그아웃</button>` : ''}</div>`).join('')}</div>
      </section>
      <section class="card"><div class="card-head"><h3>로그인 실패 · 최근 24시간</h3></div>
        ${f.by_email.length ? `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>입력한 이메일</th><th class="num">실패</th><th class="num">IP</th><th>마지막</th></tr></thead><tbody>${f.by_email.map(r => `<tr><td>${esc(r.email || '(빈칸)')}${r.is_staff ? ' <span class="chip red">운영진</span>' : ''}${r.locked ? ' <span class="chip amber">잠김</span>' : ''}</td><td class="num">${num(r.n)}</td><td class="num">${num(r.ips)}</td><td><small>${ago(r.last)}</small></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small" style="margin:0">최근 24시간 동안 로그인 실패가 없습니다.</p>'}
        ${f.by_ip.length ? `<h4 class="small" style="margin:14px 0 6px">IP별</h4><div class="table-wrap"><table class="tbl compact"><tbody>${f.by_ip.map(r => `<tr><td><code>${esc(r.ip)}</code>${r.locked ? ' <span class="chip amber">잠김</span>' : ''}</td><td class="num">${num(r.n)}번</td><td class="num">계정 ${num(r.emails)}개</td><td><small>${ago(r.last)}</small></td></tr>`).join('')}</tbody></table></div>` : ''}
        <p class="small muted" style="margin:10px 0 0">실패 기록은 개인정보처리방침에 따라 하루가 지나면 지웁니다. 한 IP에서 여러 계정을 시도하면 무작위 대입일 수 있습니다.</p>
      </section>
    </div>
    <section class="card soft small" style="margin-top:14px"><h3>안전하게 운영하려면</h3>
      <ul class="steps-list" style="list-style:disc">
        <li>운영진마다 자기 계정을 씁니다. 계정을 같이 쓰면 감사 로그로 누가 처리했는지 알 수 없습니다.</li>
        <li>운영을 그만둔 사람은 바로 <a href="#/staff">운영진·권한</a>에서 해제합니다. 해제하면 운영본부에 들어올 수 없습니다.</li>
        <li>비밀번호를 잊은 운영진은 회원 상세의 '임시 비밀번호'로 새로 발급합니다. 발급하면 그 사람의 모든 기기에서 로그아웃됩니다.</li>
        <li>총괄관리자는 두 명 이상 두고, 공용 PC에서는 쓰고 나서 꼭 로그아웃합니다.</li>
      </ul></section>`;
  return { title: '보안·접속', sub: '로그인 실패와 운영진 로그인 기기를 보고, 필요하면 로그인을 끊습니다.', body, mount(root) {
    bindActions(root, {
      async rv(el) { await post('/admin/security/revoke', { sid: Number(el.dataset.sid) }); toast('로그아웃시켰습니다'); reload(); },
      async rvAll(el) { const r = await post('/admin/security/revoke', { user_id: Number(el.dataset.uid) }); toast(`${num(r.revoked)}대 기기에서 로그아웃시켰습니다`); reload(); },
    });
  } };
}

// ───────── 사이트 운영 ─────────
async function site() {
  const d = await api('/admin/site');
  const s = d.site || {}, b = s.banner || {};
  const owner = d.is_owner;
  const preview = text => `<div class="site-notice-preview"><span>${esc(text || '공지 문구가 여기에 보입니다')}</span>${b.link ? ' <u>자세히</u>' : ''}</div>`;
  const status = `<div class="kpi-grid" style="grid-template-columns:repeat(2,1fr)">
      ${kpi('회원 신청', d.notice.applications.open ? '받는 중' : '닫힘', d.notice.applications.open ? '홈페이지 회원 신청서가 열려 있습니다' : esc(d.notice.applications.message), { accent: d.notice.applications.open, href: '/apply/' })}
      ${kpi('공지 띠', d.notice.banner ? '보이는 중' : '꺼짐', d.notice.banner ? `${d.notice.banner.audience === 'all' ? '홈페이지·회원 공간' : '회원 공간'}${b.until ? ` · ${esc(b.until)}까지` : ''}` : (b.enabled && b.until && b.until < d.today ? `${esc(b.until)}에 끝났습니다` : '켜면 맨 위에 한 줄로 보입니다'))}
    </div>`;
  if (!owner) return { title: '사이트 운영', sub: '회원 신청을 받을지, 맨 위 공지 띠에 무엇을 보일지 정합니다.', body: status + '<div class="notice" style="margin-top:12px">바꾸는 것은 총괄관리자만 할 수 있습니다.</div>' };
  const body = `${status}
    <form class="card form" data-form="site" style="max-width:820px;margin-top:14px">
      <h3>회원 신청</h3>
      <div class="radio-cards" style="grid-template-columns:repeat(2,1fr)">
        <label class="radio-card"><input type="radio" name="applications_open" value="1" ${s.applications_open !== false ? 'checked' : ''}><div><b>받기</b><small class="muted">홈페이지 회원 신청서로 언제든 신청할 수 있습니다</small></div></label>
        <label class="radio-card"><input type="radio" name="applications_open" value="0" ${s.applications_open === false ? 'checked' : ''}><div><b>잠시 닫기</b><small class="muted">신청서 대신 아래 안내가 보이고, 신청을 받지 않습니다</small></div></label>
      </div>
      ${field('닫혀 있을 때 보일 안내', textarea('applications_closed_message', { value: s.applications_closed_message || '', rows: 2, placeholder: '예: 1월 시즌 신규 회원 모집은 12월 15일에 시작합니다. 단체카톡방 공지로 먼저 알려 드릴게요.' }), '비워 두면 기본 문구가 나갑니다')}
      <h3 style="margin-top:6px">공지 띠</h3>
      ${check('banner_enabled', '맨 위에 공지 띠를 보여 줍니다', !!b.enabled)}
      ${field('문구', input('banner_text', { value: b.text || '', placeholder: '예: 12월 정기모임 신청을 받고 있습니다 (12/11 목 저녁)' }), '120자 이내. 한 줄로 짧게 쓰는 것이 좋습니다')}
      <div class="form-cols">
        ${field('누르면 열 곳 (선택)', input('banner_link', { value: b.link || '', placeholder: '/app/#/events 또는 /goals/ 또는 https://…' }))}
        ${field('끝나는 날 (선택)', input('banner_until', { type: 'date', value: b.until || '' }), '이 날이 지나면 자동으로 사라집니다')}
      </div>
      ${field('보일 곳', select('banner_audience', [['members', '회원 공간에만'], ['all', '홈페이지와 회원 공간 모두']], b.audience || 'members'))}
      <div class="field"><label>미리 보기</label><div id="banner-preview">${preview(b.text)}</div></div>
      ${field('바꾸는 이유', input('reason', { required: true, placeholder: '예: 12월 정기모임 안내' }), '감사 로그에 남습니다')}
      <div class="btn-row"><button class="btn primary" type="submit">저장</button></div>
    </form>
    <section class="card soft small" style="margin-top:14px;max-width:820px"><b>참고</b> · 공지 띠는 회원이 닫으면 같은 문구가 바뀌기 전까지 다시 보이지 않습니다. 회원에게 꼭 알려야 하는 일은 공지 띠와 함께 <a href="#/broadcast">단체 알림</a>이나 <a href="#/chat?tab=compose">단체카톡방 공지</a>로도 알려 주세요. 사이트 주소·운영 주체 같은 정보는 저장소의 <code>functions/_site/config.js</code>에서 바꿉니다.</section>`;
  return { title: '사이트 운영', sub: '회원 신청을 받을지, 맨 위 공지 띠에 무엇을 보일지 정합니다.', body, mount(root) {
    const f = root.querySelector('form[data-form=site]');
    const pv = root.querySelector('#banner-preview');
    f.banner_text.addEventListener('input', () => { pv.innerHTML = preview(f.banner_text.value); });
    bindForms(root, { async site(v) {
      const open = f.querySelector('input[name=applications_open]:checked')?.value !== '0';
      if (!open && !confirm('회원 신청을 닫으면 홈페이지 신청서가 바로 막힙니다. 저장할까요?')) return;
      await put('/admin/site', { reason: v.reason, applications_open: open, applications_closed_message: v.applications_closed_message,
        banner: { enabled: !!v.banner_enabled, text: v.banner_text, link: v.banner_link, until: v.banner_until, audience: v.banner_audience } });
      invalidateCounts(); toast('저장했습니다'); reload();
    } });
  } };
}

export const ownerPages = { overview, security, site };
