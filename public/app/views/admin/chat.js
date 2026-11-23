// 단체카톡방 · 신규 회원 정착 (v2.1)
// - 단체카톡방: 참여 현황 확인, 참여 안내 다시 보내기, 대화방에 올릴 공지 만들기와 기록, 설정
// - 신규 회원 정착: 가입한 회원이 첫 그룹 활동까지 어디쯤 왔는지 보고, 멈춘 단계에 맞는 안내를 보낸다
import { api, post, put, esc, nl2br, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, num, fmtDate, ago, lvChip, empty, FIELDS } from '../../core.js';
import { kpi, kv, qs, hbars, invalidateCounts, inviteMessage, copyBtn, bindCopy } from './shared.js';

export const CHAT_STATUS = {
  none: ['아직 안 들어옴', ''],
  clicked: ['링크만 누름', 'amber'],
  joined: ['참여했다고 표시', 'blue'],
  verified: ['운영진 확인', 'green'],
  left: ['나감', 'red'],
};
export const chatChip = s => { const [l, c] = CHAT_STATUS[s || 'none'] || [s, '']; return `<span class="chip ${c}">${l}</span>`; };

export const ONBOARD_STEP_LIST = [['orientation', '오리엔테이션'], ['chat', '단체카톡방'], ['asset', '자기 자산 진단'], ['event', '정기모임 참석'], ['group', '그룹 참여'], ['attend', '그룹 모임 출석'], ['log', '첫 도전 기록']];
const STATE = { new: ['막 가입', 'blue'], progress: ['진행 중', ''], stalled: ['멈춤', 'amber'], done: ['정착 완료', 'green'] };
export const stateChip = s => { const [l, c] = STATE[s] || [s, '']; return `<span class="chip ${c}">${l}</span>`; };

// 일정 시각 'YYYY-MM-DD HH:MM' → '12/4(목) 19:30'
function shortWhen(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return String(s || '');
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return `${Number(m[2])}/${Number(m[3])}(${'일월화수목금토'[d.getDay()]}) ${m[4]}:${m[5]}`;
}
const appUrl = hash => `${location.origin}/app/${hash}`;
const picked = root => [...root.querySelectorAll('.pick:checked')].map(c => Number(c.value));
function bindPickAll(root) {
  const all = root.querySelector('[data-all]');
  if (all) all.addEventListener('change', () => root.querySelectorAll('.pick').forEach(c => { c.checked = all.checked; }));
}
function resultToast(r, what) {
  const s = r.sent.length, k = r.skipped.length;
  if (!s && k) toast(`보낸 사람이 없습니다 · ${r.skipped[0].reason}${k > 1 ? ` 외 ${k - 1}명` : ''}`, true);
  else toast(`${num(s)}명에게 ${what}을 보냈습니다${k ? ` · ${k}명은 건너뜀` : ''}`);
}

// ───────── 카톡방 공지 문안 ─────────
const TEMPLATES = {
  welcome: '새 회원 소개',
  events: '다가오는 정기모임',
  groups: '모집 중인 그룹',
  stories: '이번 주 그룹 소식',
  custom: '직접 쓰기',
};
function draft(kind, d, ids) {
  if (kind === 'welcome') {
    const list = d.newcomers.filter(u => ids.includes(u.id));
    if (!list.length) return '';
    const lines = list.map(u => {
      const tags = u.interest_names.length ? ` (관심: ${u.interest_names.slice(0, 3).join(', ')})` : '';
      const bio = String(u.bio || '').replace(/\s+/g, ' ').trim();
      return `· ${u.nickname}님${tags}${bio ? `\n  ${bio.length > 60 ? bio.slice(0, 60) + '…' : bio}` : ''}`;
    });
    return `[새 회원 소개]\n이번에 마챌에 새로 오신 분들입니다. 반갑게 맞아 주세요!\n\n${lines.join('\n')}\n\n정기모임과 그룹에서 곧 만나요. 궁금한 건 이 방에 편하게 물어보세요.`;
  }
  if (kind === 'events') {
    if (!d.events.length) return '';
    const lines = d.events.map(e => {
      const where = e.mode === 'online' ? '온라인' : e.location ? e.location : e.mode === 'hybrid' ? '오프라인·온라인' : '오프라인';
      const topics = e.topic_names.length ? `\n  이야기 주제: ${e.topic_names.join(', ')}` : '';
      return `· ${shortWhen(e.starts_at)} ${e.title}\n  ${e.type_name} · ${where}${e.capacity ? ` · 정원 ${e.capacity}명 중 ${e.registered}명 신청` : ` · ${e.registered}명 신청`}${topics}`;
    });
    return `[다가오는 정기모임·일정]\n${lines.join('\n')}\n\n신청은 회원 공간의 정기모임·일정 메뉴에서 할 수 있어요.\n${appUrl('#/events')}`;
  }
  if (kind === 'groups') {
    if (!d.groups.length) return '';
    const lines = d.groups.map(g => {
      const extra = [g.schedule_text, g.summary].filter(Boolean).map(x => String(x).replace(/\s+/g, ' ').trim()).map(x => (x.length > 70 ? x.slice(0, 70) + '…' : x));
      return `· [${g.type_name || '그룹'}] ${g.title}\n  그룹리더 ${g.leader} · ${g.members}/${g.capacity}명${g.field_name ? ` · ${g.field_name}` : ''}${extra.length ? '\n  ' + extra.join('\n  ') : ''}`;
    });
    return `[지금 모집 중인 그룹]\n${lines.join('\n')}\n\n관심 가는 그룹이 있으면 소개와 출석 규칙을 읽어 보고 신청해 주세요.\n${appUrl('#/groups')}`;
  }
  if (kind === 'stories') {
    if (!d.stories.length) return '';
    const lines = d.stories.map(p => `· ${p.group_title ? `${p.group_title} — ` : ''}${p.title} (${p.nickname})`);
    return `[이번 주 그룹 소식]\n그룹에서 올라온 이야기들이에요.\n\n${lines.join('\n')}\n\n전체 글은 커뮤니티의 그룹 소식 게시판에서 볼 수 있어요.\n${appUrl('#/community/board/group')}`;
  }
  return '';
}

// ───────── 단체카톡방 ─────────
async function chatPage({ query }) {
  const tab = ['compose', 'settings'].includes(query.tab) ? query.tab : 'members';
  const tabs = `<div class="pill-tabs" style="margin-bottom:14px">${[['members', '참여 현황'], ['compose', '공지 만들기'], ['settings', '설정']].map(([k, l]) => `<a href="#/admin/chat${k === 'members' ? '' : '?tab=' + k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</div>`;
  const out = tab === 'compose' ? await composeTab(query) : tab === 'settings' ? await settingsTab() : await membersTab(query);
  return { title: '단체카톡방', sub: '회원이 마챌 단체카톡방에 들어왔는지 확인하고, 대화방에 올릴 공지를 만듭니다.', body: tabs + out.body, mount: out.mount };
}

async function membersTab(query) {
  const status = ['none', 'clicked', 'joined', 'verified', 'left'].includes(query.status) ? query.status : '';
  const d = await api('/admin/chat' + qs({ status, q: query.q }));
  const s = d.stats, c = d.settings || {};
  const off = !c.enabled || !c.url;
  const notIn = s.none + s.clicked + s.left;
  const filterTabs = [['', '전체', s.members], ['joined', '확인 필요', s.joined], ['clicked', '링크만 누름', s.clicked], ['none', '아직 안 들어옴', s.none], ['verified', '운영진 확인', s.verified], ['left', '나감', s.left]];
  const row = m => {
    const acts = [];
    if (m.chat_status !== 'verified') acts.push(`<button class="btn sm${m.chat_status === 'joined' ? ' primary' : ''}" data-act="set" data-id="${m.id}" data-s="verified">확인</button>`);
    if (m.chat_status !== 'left' && m.chat_status !== 'none') acts.push(`<button class="btn sm ghost" data-act="set" data-id="${m.id}" data-s="left">나감</button>`);
    if (!['joined', 'verified'].includes(m.chat_status) && m.onboarded) acts.push(`<button class="btn sm ghost" data-act="remind1" data-id="${m.id}">안내</button>`);
    return `<tr><td><input type="checkbox" class="pick" value="${m.id}" aria-label="${esc(m.nickname)} 선택"></td>
      <td><a href="#/admin/users/${m.id}"><b>${esc(m.nickname)}</b></a> ${lvChip(m.level)}<br><small class="muted">${esc(m.name)}${m.onboarded ? '' : ' · 오리엔테이션 전'}</small></td>
      <td>${chatChip(m.chat_status)}${m.chat_at ? `<br><small class="muted">${ago(m.chat_at)}</small>` : ''}</td>
      <td><small>${m.last_reminded_at ? ago(m.last_reminded_at) : '-'}</small></td>
      <td><small>${fmtDate(m.created_at)}</small></td>
      <td class="btn-cell">${acts.join('')}</td></tr>`;
  };
  const body = `
    ${off ? `<div class="notice warn" style="margin-bottom:12px">단체카톡방 안내가 꺼져 있거나 주소가 비어 있어 회원 화면에 보이지 않습니다. <a href="#/admin/chat?tab=settings">설정</a>에서 주소를 확인해 주세요.</div>` : ''}
    <div class="kpi-grid kpi-4">
      ${kpi('단체카톡방 참여율', s.rate == null ? '-' : s.rate + '<small>%</small>', `활동 중인 회원 ${num(s.members)}명 중 ${num(s.in)}명`, { accent: true })}
      ${kpi('운영진이 확인', num(s.verified) + '<small>명</small>', '대화방 참여자 목록과 맞춰 본 회원')}
      ${kpi('확인이 필요한 회원', num(s.joined) + '<small>명</small>', '회원이 참여했다고 표시함', { href: '#/admin/chat?status=joined' })}
      ${kpi('아직 안 들어온 회원', num(notIn) + '<small>명</small>', `링크만 누름 ${num(s.clicked)} · 나감 ${num(s.left)}`, { href: '#/admin/chat?status=none' })}
    </div>
    <div class="toolbar">
      <div class="pill-tabs sm">${filterTabs.map(([k, l, n]) => `<a href="#/admin/chat${qs({ status: k, q: query.q })}" class="${status === k ? 'active' : ''}">${l} ${num(n)}</a>`).join('')}</div>
      <form class="toolbar-search" data-form="q"><input type="search" name="q" value="${esc(query.q || '')}" placeholder="닉네임·이름·이메일"><button class="btn sm" type="submit">찾기</button></form>
    </div>
    ${d.members.length ? `<div class="bulkbar"><label class="check"><input type="checkbox" data-all> <span>전체 선택</span></label>
        <button class="btn sm primary" data-act="bulk" data-s="verified">운영진 확인</button>
        <button class="btn sm" data-act="bulk" data-s="left">나감으로 표시</button>
        <button class="btn sm ghost" data-act="bulk" data-s="none" data-confirm="선택한 회원의 참여 상태를 처음으로 되돌릴까요?">처음 상태로</button>
        <button class="btn sm" data-act="remind">선택한 회원에게 참여 안내</button>
        <span class="grow"></span>
        <button class="btn sm" data-act="remindAll" ${off || !notIn ? 'disabled' : ''}>안 들어온 회원 모두에게 안내</button></div>
      <section class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr><th></th><th>회원</th><th>참여 상태</th><th>마지막 안내</th><th>가입</th><th></th></tr></thead><tbody>${d.members.map(row).join('')}</tbody></table></div></section>`
      : empty('해당하는 회원이 없습니다', status ? '다른 상태를 골라 보세요.' : '')}
    <div class="adm-two" style="margin-top:14px">
      <section class="card soft small"><h3>참여 확인하는 방법</h3>
        <ol class="steps-list">
          <li>회원이 회원 공간에서 링크를 누르면 <b>링크만 누름</b>, 들어간 뒤 '참여했어요'를 누르면 <b>참여했다고 표시</b>가 됩니다.</li>
          <li>카카오톡 대화방의 참여자 목록과 닉네임을 맞춰 보고 <b>확인</b>을 누릅니다. 오픈채팅 프로필 이름을 마챌 닉네임으로 해 달라고 공지해 두면 편합니다.</li>
          <li>나간 회원을 보면 <b>나감</b>으로 바꿉니다. 회원이 다시 링크를 누르면 상태가 이어서 기록됩니다.</li>
        </ol></section>
      <section class="card soft small"><h3>참여 안내는 이렇게 갑니다</h3>
        <p style="margin:0 0 6px">오리엔테이션을 마친 회원에게만 회원 공간 알림으로 보냅니다. 누르면 참여 방법 화면이 열립니다.</p>
        <p class="muted" style="margin:0">같은 회원에게는 ${num(d.remind_gap_days)}일에 한 번만 보냅니다. 이메일·문자는 보내지 않습니다. 간격은 <a href="#/admin/chat?tab=settings">설정</a>에서 바꿀 수 있습니다.</p></section>
    </div>`;
  return { body, mount(root) {
    bindPickAll(root);
    bindForms(root, { q(v) { go('#/admin/chat' + qs({ status, q: v.q })); } });
    const remind = async (ids, label) => { const r = await post('/admin/chat/remind', { ids }); resultToast(r, label); reload(); };
    bindActions(root, {
      async set(el) { await post('/admin/chat/members', { ids: [Number(el.dataset.id)], status: el.dataset.s }); invalidateCounts(); toast('바꿨습니다'); reload(); },
      async bulk(el) { const ids = picked(root); if (!ids.length) throw new Error('회원을 골라 주세요'); await post('/admin/chat/members', { ids, status: el.dataset.s }); invalidateCounts(); toast(`${ids.length}명을 바꿨습니다`); reload(); },
      async remind1(el) { await remind([Number(el.dataset.id)], '참여 안내'); },
      async remind() { const ids = picked(root); if (!ids.length) throw new Error('회원을 골라 주세요'); if (!confirm(`선택한 ${ids.length}명에게 단체카톡방 참여 안내를 보낼까요?`)) return; await remind(ids, '참여 안내'); },
      async remindAll() { if (!confirm(`오리엔테이션을 마쳤지만 아직 대화방에 없는 회원에게 참여 안내를 보낼까요? 최근 ${d.remind_gap_days}일 안에 받은 회원은 빠집니다.`)) return; await remind([], '참여 안내'); },
    });
  } };
}

async function composeTab(query) {
  const days = [7, 14, 30, 60].includes(Number(query.days)) ? Number(query.days) : 14;
  const d = await api('/admin/chat/compose' + qs({ days }));
  const counts = { welcome: d.newcomers.length, events: d.events.length, groups: d.groups.length, stories: d.stories.length, custom: null };
  const kind = TEMPLATES[query.kind] ? query.kind : (d.newcomers.length ? 'welcome' : d.events.length ? 'events' : d.groups.length ? 'groups' : 'custom');
  const ids = d.newcomers.map(u => u.id);
  const text = draft(kind, d, ids);
  const emptyMsg = { welcome: `최근 ${days}일 안에 오리엔테이션을 마친 회원 중 아직 소개하지 않은 분이 없습니다.`, events: '다가오는 일정이 없습니다. 정기모임·일정 메뉴에서 먼저 일정을 만들어 주세요.', groups: '지금 모집 중이면서 자리가 남은 그룹이 없습니다.', stories: '최근 7일 동안 그룹 소식 게시판에 올라온 글이 없습니다.' }[kind];
  const kindLabel = Object.fromEntries(Object.entries(TEMPLATES));
  const body = `
    ${d.chat ? '' : '<div class="notice warn" style="margin-bottom:12px">단체카톡방 안내가 꺼져 있습니다. 공지는 만들 수 있지만 회원 화면에는 대화방 안내가 보이지 않습니다.</div>'}
    <div class="adm-two wide-left">
      <section class="card">
        <div class="card-head"><h3>대화방에 올릴 글</h3><span class="muted small">문안을 다듬어 복사한 뒤 카카오톡에 붙여 넣으세요</span></div>
        <div class="pill-tabs sm" style="margin-bottom:12px">${Object.entries(TEMPLATES).map(([k, l]) => `<a href="#/admin/chat${qs({ tab: 'compose', kind: k, days: days === 14 ? '' : days })}" class="${kind === k ? 'active' : ''}">${l}${counts[k] != null ? ` ${counts[k]}` : ''}</a>`).join('')}</div>
        ${kind === 'welcome' ? `<div class="row between small" style="margin-bottom:8px"><span class="muted">오리엔테이션을 마쳤고 아직 소개하지 않은 회원</span>${select('days', [[7, '최근 7일 가입'], [14, '최근 14일 가입'], [30, '최근 30일 가입'], [60, '최근 60일 가입']], days)}</div>
          ${d.newcomers.length ? `<div class="check-pick">${d.newcomers.map(u => `<label class="check"><input type="checkbox" class="nc" value="${u.id}" checked> <span><b>${esc(u.nickname)}</b> <small class="muted">${fmtDate(u.created_at)} 가입${u.interest_names.length ? ' · ' + esc(u.interest_names.slice(0, 2).join(', ')) : ''}${['joined', 'verified'].includes(u.chat_status) ? '' : ' · 아직 대화방에 없음'}</small></span></label>`).join('')}</div>
            <p class="small muted" style="margin:6px 0 10px">아직 대화방에 없는 회원은 소개 글을 볼 수 없으니, 먼저 참여 안내를 보내도 좋습니다. 기록하면 소개한 회원은 다음 목록에서 빠집니다.</p>` : ''}` : ''}
        ${text || kind === 'custom' ? '' : `<div class="notice" style="margin-bottom:10px">${esc(emptyMsg)}</div>`}
        <form class="form" data-form="post" style="gap:10px">
          <textarea name="body" id="compose-text" rows="14" placeholder="${kind === 'custom' ? '대화방에 올릴 내용을 적어 주세요' : '문안이 여기에 만들어집니다'}">${esc(text)}</textarea>
          <div class="btn-row">
            <button class="btn" type="button" data-copy="" data-copy-src="#compose-text">복사</button>
            ${d.chat ? `<a class="btn ghost" href="${esc(d.chat.url)}" target="_blank" rel="noopener">대화방 열기</a>` : ''}
            <span class="grow"></span>
            <button class="btn primary" type="submit">대화방에 올렸어요</button>
          </div>
          <p class="small muted" style="margin:0">이 화면에서 카카오톡으로 바로 보내지는 않습니다. 복사해서 직접 올린 뒤 '올렸어요'를 누르면 기록이 남아 같은 소식을 두 번 올리지 않게 됩니다.</p>
        </form>
      </section>
      <div class="stack">
        <section class="card"><div class="card-head"><h3>올린 기록</h3><span class="muted small">최근 20건</span></div>
          ${d.posts.length ? `<div class="list">${d.posts.map(p => `<details class="list-item small" style="display:block"><summary><b>${esc(kindLabel[p.kind] || p.kind)}</b> <span class="muted">· ${esc(p.posted_by_name || '-')} · ${fmtDate(p.created_at, true)}${p.member_ids ? ` · ${String(p.member_ids).split(',').length}명 소개` : ''}</span></summary><div style="margin-top:6px;color:var(--ink-2)">${nl2br(p.body)}</div></details>`).join('')}</div>` : '<p class="muted small" style="margin:0">아직 기록이 없습니다.</p>'}
        </section>
        <section class="card soft small"><h3>올리는 리듬</h3>
          <ul class="steps-list" style="list-style:disc">
            <li><b>새 회원 소개</b> · 주 1회. 이름만 나열하기보다 관심 분야를 함께 적으면 대화가 시작됩니다.</li>
            <li><b>정기모임 안내</b> · 일정 확정 직후와 3일 전.</li>
            <li><b>모집 중인 그룹</b> · 새 그룹이 열릴 때. 자리가 남은 그룹만 나옵니다.</li>
            <li><b>그룹 소식</b> · 주말에 한 번, 지난 7일 글을 모아서.</li>
          </ul></section>
      </div>
    </div>`;
  return { body, mount(root) {
    bindCopy(root);
    const ta = root.querySelector('#compose-text');
    const sel = root.querySelector('select[name=days]');
    if (sel) sel.addEventListener('change', () => go('#/admin/chat' + qs({ tab: 'compose', kind: 'welcome', days: sel.value })));
    const chosen = () => [...root.querySelectorAll('.nc:checked')].map(c => Number(c.value));
    root.querySelectorAll('.nc').forEach(c => c.addEventListener('change', () => { ta.value = draft('welcome', d, chosen()); }));
    bindForms(root, { async post(v) {
      if (!v.body.trim()) throw new Error('올린 내용이 비어 있습니다');
      const member_ids = kind === 'welcome' ? chosen() : [];
      await post('/admin/chat/posts', { kind, body: v.body, member_ids });
      toast(kind === 'welcome' && member_ids.length ? `기록했습니다. ${member_ids.length}명을 소개한 회원으로 표시했습니다` : '기록했습니다');
      reload();
    } });
  } };
}

async function settingsTab() {
  const d = await api('/admin/chat?only=settings');
  const c = d.settings || {}, o = d.onboarding || {};
  if (!d.is_owner) {
    return { body: `<div class="notice" style="margin-bottom:12px">설정은 운영자만 바꿀 수 있습니다. 바꿀 내용이 있으면 운영자에게 알려 주세요.</div>
      <section class="card">${kv([['안내', c.enabled && c.url ? '켜짐' : '꺼짐'], ['대화방 이름', esc(c.name || '-')], ['주소', c.url ? `<a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.url)}</a>` : '-'], ['참여코드', c.code ? '설정됨' : '없음'], ['정착 기간', `가입 후 ${num(o.window_days)}일`], ['멈춤 기준', `${num(o.stall_days)}일 넘게 접속 없음`], ['같은 안내 간격', `${num(o.nudge_gap_days)}일`]])}</section>` };
  }
  const body = `<form class="card form" data-form="cs" style="max-width:760px">
      <h3>단체카톡방 안내</h3>
      ${check('enabled', '회원 화면에 단체카톡방 안내를 보여 줍니다', !!c.enabled)}
      <div class="form-cols">${field('대화방 이름', input('name', { value: c.name || '', placeholder: '마챌 단체카톡방' }))}${field('참여코드 (선택)', input('code', { value: c.code || '', placeholder: '오픈채팅에 참여코드를 걸어 둔 경우' }), '로그인한 회원에게만 보입니다')}</div>
      ${field('대화방 주소', input('url', { value: c.url || '', placeholder: 'https://open.kakao.com/o/…' }), '카카오톡 오픈채팅 링크. https:// 로 시작해야 합니다')}
      ${field('회원에게 보일 한마디 (선택)', textarea('intro', { value: c.intro || '', rows: 3, placeholder: '예: 들어오시면 닉네임을 마챌 닉네임과 같게 바꿔 주세요. 홍보 글은 올리지 않습니다.' }))}
      <h3 style="margin-top:8px">신규 회원 정착 기준</h3>
      <div class="form-cols">
        ${field('정착 기간 (일)', input('window_days', { type: 'number', value: o.window_days || 30, min: 7, max: 365 }), '가입 후 이 기간 안의 회원을 봅니다')}
        ${field('멈춤 기준 (일)', input('stall_days', { type: 'number', value: o.stall_days || 7, min: 2, max: 60 }), '이만큼 접속이 없으면 멈춤')}
        ${field('같은 안내 간격 (일)', input('nudge_gap_days', { type: 'number', value: o.nudge_gap_days || 3, min: 1, max: 30 }), '한 회원에게 안내를 다시 보내기까지')}
      </div>
      ${field('바꾸는 이유', input('reason', { required: true, placeholder: '예: 대화방 주소 변경' }), '감사 로그에 남습니다')}
      <div class="btn-row"><button class="btn primary" type="submit">저장</button>${c.url ? `<a class="btn ghost" href="${esc(c.url)}" target="_blank" rel="noopener">주소 열어 확인</a>` : ''}</div>
    </form>`;
  return { body, mount(root) {
    bindForms(root, { async cs(v) {
      if (v.url && !/^https:\/\//i.test(v.url.trim())) throw new Error('대화방 주소는 https:// 로 시작해야 합니다');
      if (!v.enabled && !confirm('안내를 끄면 회원 화면에서 단체카톡방 안내가 사라집니다. 저장할까요?')) return;
      await put('/admin/chat/settings', { enabled: !!v.enabled, name: v.name, url: v.url.trim(), code: v.code, intro: v.intro, reason: v.reason,
        onboarding: { window_days: v.window_days, stall_days: v.stall_days, nudge_gap_days: v.nudge_gap_days } });
      toast('저장했습니다'); reload();
    } });
  } };
}

// ───────── 신규 회원 정착 ─────────
function stepDots(m, steps) {
  return `<span class="ob-dots" title="${esc(steps.map(s => `${m.steps[s.key] ? '✓' : '·'} ${s.name}`).join('\n'))}">${steps.map(s => `<i class="${m.steps[s.key] ? 'on' : ''}"></i>`).join('')}</span> <small class="muted">${m.done}/${m.total}</small>`;
}

async function onboardingPage({ query }) {
  const view = ['stalled', 'new', 'progress', 'done'].includes(query.view) ? query.view : '';
  const d = await api('/admin/onboarding' + qs({ days: query.days, view, q: query.q }));
  const total = d.funnel[0][1];
  const worst = [...d.by_next].sort((a, b) => b.n - a.n)[0];
  const tabs = [['', '전체', total], ['stalled', '멈춤', d.states.stalled], ['new', '막 가입', d.states.new], ['progress', '진행 중', d.states.progress], ['done', '정착 완료', d.states.done]];
  const cur = { days: query.days, view, q: query.q };
  const row = m => `<tr class="${m.state === 'done' ? 'dim' : ''}">
      <td>${m.next ? `<input type="checkbox" class="pick" value="${m.id}" aria-label="${esc(m.nickname)} 선택">` : ''}</td>
      <td><a href="#/admin/users/${m.id}"><b>${esc(m.nickname)}</b></a> ${lvChip(m.level)}<br><small class="muted">${esc(m.name)} · ${m.days == null ? '-' : m.days ? m.days + '일 전 가입' : '오늘 가입'}</small></td>
      <td>${stepDots(m, d.steps)}</td>
      <td>${m.next_name ? esc(m.next_name) : '<span class="muted">-</span>'}</td>
      <td>${stateChip(m.state)}<br><small class="muted">${m.last_seen_at ? '접속 ' + ago(m.last_seen_at) : '접속 기록 없음'}</small></td>
      <td><small>${m.last_nudged_at ? ago(m.last_nudged_at) + (m.nudges > 1 ? ` · 총 ${m.nudges}번` : '') : '-'}</small></td>
      <td class="btn-cell">${m.next ? `<button class="btn sm${m.state === 'stalled' ? ' primary' : ''}" data-act="nudge1" data-id="${m.id}" ${m.can_nudge ? '' : `data-force="1" data-confirm="${esc(m.nickname)}님은 최근에 안내를 받았습니다. 그래도 보낼까요?"`}>다음 단계 안내</button>` : ''}</td></tr>`;
  const body = `
    <div class="toolbar">
      <div class="row">${select('days', [7, 14, 30, 60, 90, 180, 365].map(n => [n, `최근 ${n}일 가입`]), d.days)}<span class="muted small">정착 기준은 <a href="#/admin/chat?tab=settings">설정</a>에서 바꿉니다</span></div>
      <form class="toolbar-search" data-form="q"><input type="search" name="q" value="${esc(query.q || '')}" placeholder="닉네임·이름·이메일"><button class="btn sm" type="submit">찾기</button></form>
    </div>
    <div class="kpi-grid kpi-4">
      ${kpi(`최근 ${d.days}일 새 회원`, num(total) + '<small>명</small>', `막 가입 ${num(d.states.new)} · 진행 중 ${num(d.states.progress)}`, { accent: true })}
      ${kpi('정착 완료', num(d.states.done) + '<small>명</small>', total ? `첫 도전 기록까지 마친 회원 ${Math.round(d.states.done / total * 100)}%` : '7단계를 모두 마친 회원', { href: '#/admin/onboarding' + qs({ ...cur, view: 'done' }) })}
      ${kpi('멈춘 회원', num(d.states.stalled) + '<small>명</small>', `${num(d.settings.stall_days)}일 넘게 접속이 없고 단계가 남음`, { href: '#/admin/onboarding' + qs({ ...cur, view: 'stalled' }) })}
      ${kpi('가장 많이 멈춘 단계', worst && worst.n ? esc(worst.name) : '-', worst && worst.n ? `${num(worst.n)}명이 이 단계 앞에 있음` : '멈춘 단계가 없습니다')}
    </div>
    <div class="adm-two">
      <section class="card"><div class="card-head"><h3>정착 단계</h3><span class="muted small">가입 대비 비율</span></div>${hbars(d.funnel, { showPct: true })}</section>
      <section class="card"><div class="card-head"><h3>다음 단계별로 안내하기</h3><span class="muted small">단계에 맞는 알림이 갑니다</span></div>
        <div class="list">${d.by_next.map(b => `<div class="list-item"><div class="grow"><b>${esc(b.name)}</b> <span class="muted small">· ${num(b.n)}명 대기${b.n && b.nudgeable < b.n ? ` · ${num(b.n - b.nudgeable)}명은 최근 안내 받음` : ''}</span><div class="meta">${esc(d.steps.find(s => s.key === b.step)?.title || '')}</div></div>${b.nudgeable ? `<button class="btn sm" data-act="nudgeStep" data-step="${b.step}" data-ids="${b.ids.join(',')}">${num(b.nudgeable)}명에게 안내</button>` : ''}</div>`).join('')}</div>
      </section>
    </div>
    <div class="toolbar" style="margin-top:6px"><div class="pill-tabs sm">${tabs.map(([k, l, n]) => `<a href="#/admin/onboarding${qs({ ...cur, view: k })}" class="${view === k ? 'active' : ''}">${l} ${num(n)}</a>`).join('')}</div></div>
    ${d.members.length ? `<div class="bulkbar"><label class="check"><input type="checkbox" data-all> <span>전체 선택</span></label>
        <input class="mini-input" name="note" id="nudge-note" placeholder="덧붙일 말 (선택) 예: 목요일 정기모임에서 봬요" style="flex:1;min-width:200px">
        <button class="btn sm primary" data-act="nudgeSel">선택한 회원에게 다음 단계 안내</button></div>
      <section class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr><th></th><th>회원</th><th>진행</th><th>다음 단계</th><th>상태</th><th>마지막 안내</th><th></th></tr></thead><tbody>${d.members.map(row).join('')}</tbody></table></div></section>`
      : empty(view ? '해당하는 회원이 없습니다' : `최근 ${d.days}일 동안 가입한 회원이 없습니다`, view ? '다른 상태를 골라 보세요.' : '기간을 늘려 보세요.')}
    <div class="adm-two" style="margin-top:14px">
      <section class="card"><div class="card-head"><h3>초대 코드를 받고 아직 가입하지 않은 분</h3><span class="muted small">${num(d.invites.length)}명</span></div>
        ${d.invites.length ? `<div class="list">${d.invites.map(a => `<div class="list-item small"><div class="grow"><b>${esc(a.name)}</b> <span class="muted">${esc(a.email)}</span><div class="meta">승인 ${a.days == null ? '-' : a.days ? a.days + '일 전' : '오늘'} · 코드 <span class="kbd">${esc(a.invite_code)}</span></div></div>${a.days >= 3 ? '<span class="chip amber">다시 연락</span>' : ''}${copyBtn(inviteMessage(a.invite_code, a.email), '안내문 복사')}</div>`).join('')}</div>` : '<p class="muted small" style="margin:0">승인한 분은 모두 가입했습니다.</p>'}
      </section>
      <section class="card"><div class="card-head"><h3>최근 보낸 안내</h3></div>
        ${d.nudges.length ? `<div class="list">${d.nudges.map(n => `<div class="list-item small"><div class="grow"><a href="#/admin/users/${n.user_id}"><b>${esc(n.nickname)}</b></a> · ${esc(n.title)}<div class="meta">${esc(n.sent_by_name || '-')} · ${ago(n.created_at)}</div></div></div>`).join('')}</div>` : '<p class="muted small" style="margin:0">아직 보낸 안내가 없습니다.</p>'}
      </section>
    </div>
    <section class="card soft small" style="margin-top:14px"><h3>상태 구분</h3>
      <p style="margin:0">${d.steps.map((s, i) => `${i + 1}. ${esc(s.name)}`).join(' → ')}</p>
      <p class="muted" style="margin:6px 0 0"><b>막 가입</b>은 가입 3일 이내, <b>멈춤</b>은 ${num(d.settings.stall_days)}일 넘게 접속이 없는 회원, <b>정착 완료</b>는 일곱 단계를 모두 마친 회원입니다. 안내는 회원 공간 알림으로 가고, 같은 회원에게는 ${num(d.settings.nudge_gap_days)}일에 한 번만 보냅니다.</p>
    </section>`;
  return { title: '신규 회원 정착', sub: '새로 가입한 회원이 첫 그룹 활동까지 어디쯤 왔는지 보고, 멈춘 단계에 맞춰 안내합니다.', body, mount(root) {
    bindPickAll(root); bindCopy(root);
    const sel = root.querySelector('select[name=days]');
    sel.addEventListener('change', () => go('#/admin/onboarding' + qs({ ...cur, days: sel.value })));
    bindForms(root, { q(v) { go('#/admin/onboarding' + qs({ ...cur, q: v.q })); } });
    const note = () => root.querySelector('#nudge-note')?.value || '';
    bindActions(root, {
      async nudge1(el) { const r = await post('/admin/onboarding/nudge', { ids: [Number(el.dataset.id)], note: note(), force: !!el.dataset.force }); resultToast(r, '안내'); reload(); },
      async nudgeSel() { const ids = picked(root); if (!ids.length) throw new Error('회원을 골라 주세요'); if (!confirm(`선택한 ${ids.length}명에게 각자 다음 단계 안내를 보낼까요?`)) return; const r = await post('/admin/onboarding/nudge', { ids, note: note() }); resultToast(r, '안내'); reload(); },
      async nudgeStep(el) { const ids = el.dataset.ids.split(',').map(Number).filter(Boolean); const name = d.by_next.find(b => b.step === el.dataset.step)?.name; if (!confirm(`'${name}' 단계 앞에 있는 ${ids.length}명에게 안내를 보낼까요?`)) return; const r = await post('/admin/onboarding/nudge', { ids, step: el.dataset.step, note: note() }); resultToast(r, '안내'); reload(); },
    });
  } };
}

export const chatAdmin = { chat: chatPage, onboarding: onboardingPage };
