import { fmtLocal, api, post, put, esc, nl2br, state, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, stat, num, pct, won, fmtDate, ago, LEVEL_NAMES, LEVELS, FIELDS, ROLES, BADGES, EVENT_TYPES, lvChip, stageChip, typeChip, fieldChip, pageHead, empty, tabs, modal, closeModal, progressBar } from '../core.js';
import { settleStatus } from './group.js';

const SECTIONS = [['applications', '가입 신청'], ['challenges', '챌린지 심사'], ['agreements', '합의서 승인'], ['settlements', '정산 검수'], ['papers', '페이퍼 검토'], ['promotions', '승급 심사'], ['disputes', '이의·신고'], ['users', '회원'], ['rounds', '라운드'], ['events', '일정'], ['settings', '규칙 설정'], ['audit', '감사 로그']];
const nav = active => `<div class="tabs">${[['home', '현황', '#/admin'], ...SECTIONS.map(([k, l]) => [k, l, '#/admin/' + k])].map(([k, l, h]) => `<a href="${h}" class="${k === active ? 'active' : ''}">${l}</a>`).join('')}</div>`;

export async function home() {
  const d = await api('/admin/dashboard');
  const q = d.queues;
  const queueMeta = [['applications', '가입 신청', q.applications], ['challenges', '챌린지 심사', q.challenges], ['agreements', '합의서 승인', q.agreements], ['settlements', '정산 검수', q.settlements], ['papers', '페이퍼 검토', q.papers], ['promotions', '승급 심사', q.promotions], ['disputes', '이의·신고', q.disputes]];
  return `<div class="wrap page">${pageHead('운영본부', '오늘 처리할 것부터. 큐가 비어 있으면 현황을 봅니다.')}${nav('home')}
    <h3 class="small muted">처리 대기</h3><div class="admin-queue" style="margin-bottom:20px">${queueMeta.map(([k, l, n]) => `<a href="#/admin/${k}"><span>${l}</span><span class="n ${n ? '' : 'zero'}">${n}</span></a>`).join('')}</div>
    <h3 class="small muted">핵심 지표 (MC-05)</h3><div class="grid grid-4">${stat('진행 중 그룹', num(d.active_groups), true)}${stat('이번 주 체크인 제출률', d.weekly_checkin_rate == null ? '-' : d.weekly_checkin_rate + '%')}${stat('첫 매출 회원 (누적)', num(d.first_sales), true)}${stat('라운드 완주 (누적)', num(d.completions))}</div>
    <div class="card" style="margin-top:14px"><h3>등급 분포</h3><div class="row">${LEVELS.map(l => { const c = d.levels.find(x => x.level === l)?.c || 0; return `<div class="stat" style="flex:1;min-width:90px"><div class="num lv-${l}">${c}</div><div class="label">${l} ${LEVEL_NAMES[l]}</div></div>`; }).join('')}</div></div>
    <div class="card" style="margin-top:14px"><div class="card-head"><h3>데이터 내려받기 (CSV)</h3><span class="muted small">엑셀에서 바로 열립니다. 내려받은 기록은 감사 로그에 남습니다.</span></div><div class="btn-row">${[['users', '회원'], ['applications', '가입 신청'], ['challenges', '챌린지'], ['ledger', '장부'], ['settlements', '정산'], ['payouts', '지급 내역'], ['papers', '페이퍼'], ['points', '포인트'], ['consents', '동의 기록']].map(([k, l]) => `<a class="btn sm" href="/api/admin/export?table=${k}" download>${l}</a>`).join('')}</div></div>
    <div class="card soft small" style="margin-top:14px"><b>운영 리듬 (MC-05)</b> · 매일 20분: 큐 비우기 → 매주 월: 체크인 제출률·막힌 그룹 확인 → 매월: 마챌데이 준비, 규칙 변경 공지 → 라운드 말: 데모데이, 페이퍼 검토, 정산 검수, 승급 심사.</div>
  </div>`;
}

export async function section({ params, me, query }) {
  const sec = params.section; const h = handlers[sec];
  if (!h) { go('#/admin'); return ''; }
  const inner = await h(params, me, query);
  const label = SECTIONS.find(([k]) => k === sec)?.[1] || sec;
  return { html: `<div class="wrap page">${pageHead('운영본부 · ' + label)}${nav(sec)}${inner.html}</div>`, mount: inner.mount };
}

const handlers = {
  async applications(params, me, query) {
    const status = query.status || 'pending';
    const rows = await api('/admin/applications?status=' + status);
    const html = `<div class="pill-tabs" style="margin-bottom:14px">${[['pending', '대기'], ['approved', '승인 (초대 코드 발송)'], ['joined', '가입 완료'], ['rejected', '반려']].map(([k, l]) => `<a href="#/admin/applications?status=${k}" class="${status === k ? 'active' : ''}">${l}</a>`).join('')}</div>
      ${rows.length ? rows.map(a => `<div class="card" style="margin-bottom:10px"><div class="row between"><h3 style="margin:0">${esc(a.name)} <small class="muted">${esc(a.email)}${a.phone ? ' · ' + esc(a.phone) : ''}</small></h3><span class="muted small">${ago(a.created_at)}</span></div>
        <div class="small stack" style="margin-top:8px">${[['job', '하는 일'], ['hours_weekday', '가능 시간'], ['interests', '관심 분야'], ['experience', '경험'], ['why_group', '그룹에 대해'], ['share_opinion', '배분에 대한 생각'], ['side_job_check', '겸업 확인'], ['can_attend', '참석 가능'], ['give', '줄 수 있는 것'], ['referrer', '추천인'], ['question', '질문']].filter(([k]) => a.form[k]).map(([k, l]) => `<div><b>${l}</b> · ${k === 'interests' ? esc(String(a.form[k]).split(',').map(x => FIELDS[x] || x).join(', ')) : k === 'side_job_check' ? esc({ yes: '확인했고 문제 없음', partial: '일부 제한 있음', no: '아직 확인 안 함', na: '해당 없음' }[a.form[k]] || a.form[k]) : k === 'can_attend' ? esc({ yes: '대부분 참석', some: '절반 정도', no: '온라인만' }[a.form[k]] || a.form[k]) : nl2br(a.form[k])}</div>`).join('')}</div>
        ${a.status === 'approved' ? `<div class="notice ok" style="margin-top:10px">초대 코드 <span class="kbd">${esc(a.invite_code)}</span> — 이 코드를 ${esc(a.email)}로 보내 주세요. 가입 페이지: <span class="kbd">${location.origin}/app/#/register</span></div>` : ''}
        ${a.note ? `<p class="small muted" style="margin:8px 0 0">메모: ${esc(a.note)}</p>` : ''}
        ${a.status === 'pending' ? `<div class="btn-row" style="margin-top:10px"><button class="btn primary sm" data-act="approve" data-id="${a.id}">승인 → 초대 코드 발급</button><button class="btn sm" data-act="reject" data-id="${a.id}">반려</button></div>` : ''}</div>`).join('') : empty('해당 상태의 신청이 없습니다')}`;
    return { html, mount(root) { bindActions(root, {
      async approve(el) { const r = await post(`/admin/applications/${el.dataset.id}`, { decision: 'approve' }); modal(`<h3>초대 코드가 발급됐습니다</h3><p>아래 내용을 <b>${esc(r.email)}</b>로 보내 주세요.</p><pre class="json">안녕하세요, 마이챌린지(마챌) 운영본부입니다.\n가입 신청이 승인되었습니다.\n\n가입 페이지: ${location.origin}/app/#/register\n초대 코드: ${r.invite_code}\n\n지원서에 적은 이메일로 가입해 주세요. 가입 후 5분짜리 오리엔테이션을 마치면 챌린저(L1)가 됩니다.</pre><button class="btn primary" data-close-modal>닫기</button>`); reload(); },
      reject(el) { modal(`<h3>반려</h3><form class="form" data-form="rj">${field('사유 (내부 메모)', textarea('note', { rows: 2 }))}<div class="btn-row"><button class="btn danger" type="submit">반려</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async rj(d) { await post(`/admin/applications/${el.dataset.id}`, { decision: 'reject', note: d.note }); closeModal(); reload(); } }); } }); },
    }); } };
  },

  async challenges() {
    const rows = await api('/admin/challenges');
    const s = (await api('/admin/settings')).settings;
    const html = rows.length ? rows.map(c => `<div class="card" style="margin-bottom:12px"><div class="row">${typeChip(c.type)}${stageChip(c.stage)}${fieldChip(c.field_code)}</div><h3 style="margin-top:6px">${esc(c.title)} <small class="muted">· ${esc(c.leader_nickname)}</small></h3><p class="small">${esc(c.summary || '')}</p>
      <details><summary class="small" style="cursor:pointer">제안서 전문</summary><div class="small stack" style="margin-top:8px">${Object.entries(c.proposal).filter(([, v]) => v).map(([k, v]) => `<div><b>${k}</b> · ${nl2br(v)}</div>`).join('')}</div></details>
      ${c.stage === 'review' ? `<form class="form" data-form="rv" data-id="${c.id}" style="margin-top:12px"><h3 class="small">심사표 (각 1~5점, 가중 합계 ${s.review_pass_score}점 이상 통과)</h3><div class="table-wrap"><table class="tbl"><tbody>${s.review_items.map(it => `<tr><td>${esc(it.label)} <small class="muted">×${it.weight}</small></td><td>${[1, 2, 3, 4, 5].map(n => `<label style="margin-right:8px"><input type="radio" name="s_${it.key}" value="${n}" ${n === 3 ? 'checked' : ''}> ${n}</label>`).join('')}</td></tr>`).join('')}</tbody></table></div>
        <div class="row">${check('banned', '금지 유형 해당 (다단계·대출·도박·보장 표현 등)')}${check('conflict', '이해충돌 미해결')}</div>${field('의견 (제안자에게 전달)', textarea('comment', { rows: 2 }))}
        <div class="btn-row"><button class="btn primary" type="submit" name="decision" value="approve">승인 → 모집</button><button class="btn" type="submit" name="decision" value="revise">보완 요청</button><button class="btn danger" type="submit" name="decision" value="reject">반려</button></div></form>` : `<p class="small muted" style="margin-top:8px">보완 요청 상태 — 제안자의 재제출을 기다리는 중${c.review?.comment ? ` (의견: ${esc(c.review.comment)})` : ''}</p>`}</div>`).join('') : empty('심사할 챌린지가 없습니다');
    return { html, mount(root) { bindForms(root, { async rv(d, f, sub) { const scores = {}; for (const it of s.review_items) scores[it.key] = Number(d['s_' + it.key]); const r = await post(`/admin/challenges/${f.dataset.id}/review`, { scores, banned: !!d.banned, conflict: !!d.conflict, comment: d.comment, decision: sub.value }); toast(`처리했습니다 (합계 ${r.review.total}점)`); reload(); } }); } };
  },

  async agreements() {
    const rows = await api('/admin/agreements');
    const html = rows.length ? rows.map(a => `<div class="card" style="margin-bottom:10px"><div class="row between"><h3 style="margin:0">${esc(a.title)} <small class="muted">v${a.version} · 그룹장 ${esc(a.leader)}</small></h3><span class="chip ${a.status === 'signed' ? 'blue' : 'amber'}">${{ draft: '서명 대기', signing: '서명 중', signed: '전원 서명' }[a.status]}</span></div>
      <p class="small" style="margin:8px 0">프리셋 ${esc(a.clauses.preset)} · 배분 ${Math.round(a.clauses.ratios.hq * 100)}/${Math.round(a.clauses.ratios.leader * 100)}/${Math.round(a.clauses.ratios.pool * 100)} · 소유 ${a.clauses.ownership_type}형 · 예산 ${won(a.clauses.budget_cap_person)}/${won(a.clauses.budget_cap_group)} · 정산 ${a.clauses.settlement_mode}${a.clauses.special_terms ? `<br>특약: ${esc(a.clauses.special_terms)}` : ''}</p>
      <div class="btn-row"><a class="btn sm" href="#/groups/${a.challenge_id}/agreement">합의서 보기</a>${a.status === 'signed' ? `<button class="btn sm primary" data-act="ok" data-id="${a.id}">승인 → 챌린지 시작</button><button class="btn sm" data-act="back" data-id="${a.id}">보완 요청</button>` : ''}</div></div>`).join('') : empty('승인 대기 중인 합의서가 없습니다');
    return { html, mount(root) { bindActions(root, {
      async ok(el) { await post(`/admin/agreements/${el.dataset.id}`, { approve: true }); toast('승인했습니다. 챌린지가 시작됩니다'); reload(); },
      back(el) { modal(`<h3>보완 요청</h3><form class="form" data-form="bk">${field('그룹장에게 보낼 의견', textarea('note', { rows: 3, required: true }))}<div class="btn-row"><button class="btn primary" type="submit">보내기</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async bk(d) { await post(`/admin/agreements/${el.dataset.id}`, { approve: false, note: d.note }); closeModal(); reload(); } }); } }); },
    }); } };
  },

  async settlements() {
    const rows = await api('/admin/settlements');
    return { html: rows.length ? `<div class="card"><div class="list">${rows.map(s => `<a class="list-item" href="#/settlements/${s.id}" style="color:inherit"><div class="grow"><div class="title">${esc(s.title)}</div><div class="meta">${fmtDate(s.period_start)}~${fmtDate(s.period_end)} · 정산 가능 ${won(s.result.D)} · 운영본부 ${won(s.result.A)}</div></div>${settleStatus(s.status)}</a>`).join('')}</div></div>` : empty('검수할 정산이 없습니다') };
  },

  async papers() {
    const rows = await api('/admin/papers');
    const html = rows.length ? rows.map(p => `<div class="card" style="margin-bottom:10px"><div class="row">${fieldChip(p.field_code)}${p.form.has_sales ? '<span class="chip green">매출 발생</span>' : '<span class="chip">매출 없음</span>'}</div><h3 style="margin-top:6px">${esc(p.title)} <small class="muted">· ${esc(p.leader)}</small></h3>
      <div class="small stack"><div><b>문제</b> · ${esc(p.form.pain || '')}</div><div><b>숫자</b> · 외부 매출 ${won(p.form.revenue_external)} · 비용 ${won(p.form.expenses)} · 고객 ${num(p.form.customers)}명 · ${num(p.form.hours)}h</div><div><b>잘된 것</b> · ${(p.form.good || []).map(esc).join(' / ') || '-'}</div><div><b>안 된 것</b> · ${(p.form.bad || []).map(esc).join(' / ') || '-'}</div></div>
      <p class="small muted" style="margin:8px 0">검토 기준: 수익 보장 표현 없음 · 타인 정보 노출 없음 · 숫자가 장부와 크게 어긋나지 않음 · 안 된 것이 솔직하게 적혀 있음</p>
      <form class="form" data-form="pr" data-id="${p.id}">${field('의견', textarea('note', { rows: 2 }))}<div class="btn-row"><button class="btn primary" type="submit" name="decision" value="approve">승인 · 공개</button><button class="btn" type="submit" name="decision" value="return">보완 요청</button><a class="btn ghost" href="#/groups/${p.challenge_id}/paper">그룹에서 보기</a></div></form></div>`).join('') : empty('검토할 페이퍼가 없습니다');
    return { html, mount(root) { bindForms(root, { async pr(d, f, sub) { await post(`/admin/papers/${f.dataset.id}/review`, { decision: sub.value, note: d.note }); toast('처리했습니다'); reload(); } }); } };
  },

  async promotions() {
    const rows = await api('/admin/promotions');
    const html = rows.length ? rows.map(r => `<div class="card" style="margin-bottom:10px"><div class="row between"><h3 style="margin:0">${esc(r.nickname)} ${lvChip(r.level)} → <span class="lv lv-${r.target_level}">${LEVEL_NAMES[r.target_level]}</span></h3><span class="muted small">${ago(r.created_at)}</span></div>
      <div class="small" style="margin-top:8px"><b>신청 내용</b> · ${nl2br(r.note || '')}${r.evidence ? `<br><b>증빙</b> · ${nl2br(r.evidence)}` : ''}</div>
      <div class="small stack" style="margin-top:8px">${r.progress.items.map(i => `<div>${i.done ? '✅' : '◻️'} ${esc(i.label)} <span class="muted">${i.manual ? '' : `(${num(i.cur)}/${num(i.goal)})`}</span></div>`).join('')}<div class="${r.progress.eligible ? 'chip green' : 'chip amber'}" style="align-self:flex-start">${r.progress.eligible ? '자동 확인 조건 충족' : '조건 미충족 — 보류 권장'}</div></div>
      <form class="form" data-form="pm" data-id="${r.id}" style="margin-top:10px">${field('결정 사유 (신청자에게 전달)', textarea('note', { rows: 2 }))}<div class="btn-row"><button class="btn primary" type="submit" name="decision" value="approve">승인</button><button class="btn" type="submit" name="decision" value="hold">보류</button><button class="btn danger" type="submit" name="decision" value="reject">반려</button></div></form></div>`).join('') : empty('대기 중인 승급 신청이 없습니다');
    return { html, mount(root) { bindForms(root, { async pm(d, f, sub) { await post(`/admin/promotions/${f.dataset.id}`, { decision: sub.value, note: d.note }); toast('처리했습니다'); reload(); } }); } };
  },

  async disputes() {
    const rows = await api('/admin/disputes');
    const html = rows.length ? rows.map(d => `<div class="card" style="margin-bottom:10px"><div class="row between"><h3 style="margin:0">${d.ref_type === 'settlement' ? '정산 이의' : d.ref_type === 'report' ? '게시물 신고' : '기타'} <small class="muted">· ${esc(d.nickname)} · ${d.stage}차</small></h3><span class="chip ${d.status === 'open' ? 'red' : 'amber'}">${d.status === 'open' ? '접수' : '조정 중'}</span></div><p class="small" style="margin:8px 0">${nl2br(d.note || '')}</p>
      <div class="btn-row">${d.ref_type === 'settlement' ? `<a class="btn sm" href="#/settlements/${d.ref_id}">정산표</a>` : d.ref_type === 'report' ? `<a class="btn sm" href="#/community/posts/${d.ref_id}">게시물</a>` : ''}${d.status === 'open' ? `<button class="btn sm" data-act="mediate" data-id="${d.id}">2차 조정 시작</button>` : ''}<button class="btn sm primary" data-act="resolve" data-id="${d.id}">종결</button></div></div>`).join('') : empty('처리할 이의·신고가 없습니다');
    return { html, mount(root) { bindActions(root, {
      async mediate(el) { await post(`/admin/disputes/${el.dataset.id}`, { status: 'mediating', stage: 2 }); reload(); },
      resolve(el) { modal(`<h3>종결</h3><form class="form" data-form="rs">${field('결과 기록', textarea('result', { rows: 3, required: true }))}<div class="btn-row"><button class="btn primary" type="submit">종결</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async rs(d) { await post(`/admin/disputes/${el.dataset.id}`, { status: 'resolved', result: d.result }); closeModal(); reload(); } }); } }); },
    }); } };
  },

  async users(params, me, query) {
    const rows = await api('/admin/users?q=' + encodeURIComponent(query.q || ''));
    const html = `<form class="filters" data-form="q"><input type="text" name="q" value="${esc(query.q || '')}" placeholder="닉네임 · 이메일 · 이름" style="padding:8px 10px;border:1px solid var(--line);border-radius:9px;flex:1;min-width:160px"><button class="btn sm" type="submit">검색</button></form>
      <div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>회원</th><th>등급</th><th class="num">포인트</th><th>배지</th><th>상태</th><th>가입</th><th></th></tr></thead><tbody>${rows.map(u => `<tr><td><b>${esc(u.nickname)}</b><br><small class="muted">${esc(u.name)} · ${esc(u.email)}</small></td><td>${lvChip(u.level)}${u.role === 'staff' ? ' <span class="chip ink">운영진</span>' : ''}</td><td class="num">${num(u.points)}</td><td>${u.badges.map(b => `<span class="chip amber" title="${fmtDate(b.created_at)}">${BADGES[b.code] || b.code}</span>`).join(' ')}</td><td>${{ active: '활동', dormant: '휴면', removed: '제명' }[u.status]}</td><td><small>${fmtDate(u.created_at)}</small></td><td><button class="btn sm" data-act="edit" data-id="${u.id}">관리</button></td></tr>`).join('')}</tbody></table></div></div>`;
    return { html, mount(root) {
      bindForms(root, { q(d) { go('#/admin/users?q=' + encodeURIComponent(d.q)); } });
      bindActions(root, { edit(el) {
        const u = rows.find(x => x.id === Number(el.dataset.id));
        modal(`<h3>${esc(u.nickname)} 관리</h3><form class="form" data-form="u">
          <div class="form-cols">${field('등급 조정', select('level', [['', '변경 없음'], ...LEVELS.map(l => [l, `${l} ${LEVEL_NAMES[l]}`])]))}${field('상태', select('status', [['', '변경 없음'], ['active', '활동'], ['dormant', '휴면'], ['removed', '제명']]))}</div>
          <div class="form-cols">${field('운영진 권한', select('role', [['', '변경 없음'], ['staff', '운영진'], ['member', '일반 회원']]))}${field('배지 부여', select('badge', [['', '없음'], ...Object.entries(BADGES)]))}</div>
          ${field('사유 / 증빙 (알림으로 전달)', input('reason', { placeholder: '예: 11/3 스마트스토어 첫 주문 증빙 확인' }))}
          ${u.badges.length ? field('배지 회수', select('revoke_badge_id', [['', '없음'], ...u.badges.map(b => [b.id, `${BADGES[b.code] || b.code} (${fmtDate(b.created_at)})`])])) : ''}
          ${check('temp_password', '임시 비밀번호 발급 (비밀번호를 잊은 회원)')}
          <div class="btn-row"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
          { onMount(m) { bindForms(m, { async u(d) { const body = {}; if (d.level) body.level = d.level; if (d.status) body.status = d.status; if (d.role) body.role = d.role; if (d.badge) body.badge = d.badge; if (d.revoke_badge_id) body.revoke_badge_id = d.revoke_badge_id; body.reason = d.reason; body.evidence = d.reason; if (d.temp_password) body.temp_password = true; const r = await post(`/admin/users/${u.id}`, body); closeModal(); if (r.temp_password) { modal(`<h3>임시 비밀번호</h3><p>${esc(u.nickname)}님에게 아래 비밀번호를 전해 주세요. 로그인 후 내 정보에서 바꾸도록 안내합니다.</p><pre class="json" style="font-size:1.1rem">${esc(r.temp_password)}</pre><button class="btn primary" data-close-modal>닫기</button>`); } else { toast('저장했습니다'); reload(); } } }); } });
      } });
    } };
  },

  async rounds() {
    const rows = await api('/rounds');
    const html = `<div class="grid grid-2"><div class="card"><h3>라운드 목록</h3>${rows.length ? `<div class="list">${rows.map(r => `<div class="list-item"><div class="grow"><div class="title">${esc(r.name)}</div><div class="meta">${fmtDate(r.start_date)} ~ ${fmtDate(r.end_date)}</div></div>${select('st_' + r.id, [['planning', '준비'], ['open', '모집'], ['active', '진행'], ['closed', '종료']], r.status)}<button class="btn sm" data-act="st" data-id="${r.id}">저장</button></div>`).join('')}</div>` : '<p class="muted small">라운드가 없습니다.</p>'}</div>
      <form class="card form" data-form="nr"><h3>새 라운드</h3>${field('이름', input('name', { required: true, placeholder: '예: 2026 라운드 1' }))}<div class="form-cols">${field('시작일', input('start_date', { type: 'date', required: true }))}${field('종료일 (12주 뒤)', input('end_date', { type: 'date', required: true }))}</div><button class="btn primary" type="submit">만들기</button></form></div>`;
    return { html, mount(root) { bindForms(root, { async nr(d) { await post('/admin/rounds', d); toast('만들었습니다'); reload(); } }); bindActions(root, { async st(el) { const sel = root.querySelector(`[name=st_${el.dataset.id}]`); await put(`/admin/rounds/${el.dataset.id}`, { status: sel.value }); toast('저장했습니다'); } }); } };
  },

  async events() {
    const rows = await api('/events');
    const html = `<div class="grid grid-2"><div class="card"><h3>일정</h3>${rows.length ? `<div class="list">${rows.map(e => `<div class="list-item"><div class="grow"><div class="title">${esc(e.title)}</div><div class="meta">${EVENT_TYPES[e.type]} · ${fmtLocal(e.starts_at)} · 신청 ${e.registered}명 · 출석 코드 <span class="kbd">${esc(e.attendance_code || '')}</span></div></div></div>`).join('')}</div>` : '<p class="muted small">일정이 없습니다.</p>'}</div>
      <form class="card form" data-form="ne"><h3>새 일정</h3><div class="form-cols">${field('유형', select('type', Object.entries(EVENT_TYPES)))}${field('참여 가능 등급', select('min_level', LEVELS.slice(1).map(l => [l, `${l} ${LEVEL_NAMES[l]}`])))}</div>${field('제목', input('title', { required: true }))}<div class="form-cols">${field('일시', input('starts_at', { type: 'datetime-local', required: true }))}${field('장소 / 링크', input('location'))}</div><div class="form-cols">${field('정원 (비우면 무제한)', input('capacity', { type: 'number', min: 1 }))}${field('출석 코드 (비우면 자동)', input('attendance_code', { placeholder: '예: MD11' }))}</div>${field('설명', textarea('description', { rows: 3 }))}<button class="btn primary" type="submit">만들기</button></form></div>`;
    return { html, mount(root) { bindForms(root, { async ne(d) { d.starts_at = d.starts_at.replace('T', ' ') + (d.starts_at.length === 16 ? ':00' : ''); await post('/admin/events', d); toast('만들었습니다'); reload(); } }); } };
  },

  async settings() {
    const d = await api('/admin/settings'); const s = d.settings;
    const row = (key, label, value, hint = '') => `<form class="list-item" data-form="set" data-key="${key}" style="align-items:center"><div class="grow"><div class="title">${label}</div>${hint ? `<div class="meta">${hint}</div>` : ''}</div><input type="text" name="value" value="${esc(JSON.stringify(value))}" style="width:46%;min-width:140px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;font-family:ui-monospace,monospace;font-size:.85rem"><button class="btn sm" type="submit">저장</button></form>`;
    const html = `<div class="notice warn" style="margin-bottom:14px">규칙은 라운드 시작 전에만 바꾸고, 바꾼 내용은 마챌데이에서 공지합니다. 진행 중인 합의서에는 소급 적용되지 않습니다 (합의서에 당시 값이 저장됩니다). 값은 JSON 형식입니다.</div>
      <div class="card"><h3>돈 규칙</h3><div class="list">
        ${row('min_settlement', '최소 정산 금액 (원)', s.min_settlement, '미만이면 다음 정산으로 이월')}${row('budget_cap_person', '1인 예산 상한 (원)', s.budget_cap_person)}${row('budget_cap_group', '그룹 예산 상한 (원)', s.budget_cap_group)}${row('hq_ratio_range', '운영본부 몫 허용 범위', s.hq_ratio_range, '[최소, 최대] 비율')}${row('agency_rate', '정산 대행 수수료', s.agency_rate)}${row('withholding_rate', '원천징수 참고 비율', s.withholding_rate)}${row('share_adjust_limit', '그룹장 기여율 조정 한도', s.share_adjust_limit, '자동 산정값 대비 ±')}${row('share_alert_gap', '예정-실제 기여율 경고 기준', s.share_alert_gap)}
      </div></div>
      <div class="card" style="margin-top:12px"><h3>등급·심사</h3><div class="list">${row('levels', '승급 조건', s.levels)}${row('visibility', '열람 권한 (등급 코드)', s.visibility, 'card 카드 · group_logs 그룹 기록 · paper_full 페이퍼 전문 · swap_board 품앗이 · propose 제안')}${row('review_pass_score', '챌린지 심사 통과 점수', s.review_pass_score, '45점 만점')}${row('min_group', '그룹 최소 인원 (그룹장 포함)', s.min_group ?? 4)}${row('max_group', '그룹 최대 인원', s.max_group ?? 8)}</div></div>
      <div class="card" style="margin-top:12px"><h3>포인트</h3><div class="list">${Object.entries(s.points).map(([k, v]) => row('points', `${esc(v.label)} <small class="muted">(${k})</small>`, { [k]: v }, '하루 상한 daily_cap, 0이면 없음')).join('')}</div></div>
      <div class="card" style="margin-top:12px"><h3>배분 프리셋</h3><div class="list">${Object.entries(s.presets).map(([k, v]) => row('presets', `${esc(v.label)} <small class="muted">(${k})</small>`, { [k]: v })).join('')}</div></div>
      ${d.overrides.length ? `<details class="card" style="margin-top:12px"><summary class="small" style="cursor:pointer">변경 이력 (현재 덮어쓴 값 ${d.overrides.length}개)</summary><pre class="json">${esc(JSON.stringify(d.overrides, null, 2))}</pre></details>` : ''}`;
    return { html, mount(root) { bindForms(root, { async set(dd, f) { let value; try { value = JSON.parse(dd.value); } catch { throw new Error('JSON 형식이 올바르지 않습니다'); } const key = f.dataset.key; if (key === 'points' || key === 'presets') { value = { ...s[key], ...value }; } await put('/admin/settings', { key, value }); toast('저장했습니다. 변경 내용을 공지해 주세요'); state.settings = null; reload(); } }); } };
  },

  async audit() {
    const rows = await api('/admin/audit?limit=200');
    return { html: `<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>일시</th><th>행위자</th><th>행동</th><th>대상</th><th>내용</th></tr></thead><tbody>${rows.map(r => `<tr><td><small>${fmtDate(r.created_at, true)}</small></td><td>${esc(r.nickname || '-')}</td><td>${esc(r.action)}</td><td><small>${esc(r.target || '')}</small></td><td><small class="muted">${esc((r.detail || '').slice(0, 120))}</small></td></tr>`).join('')}</tbody></table></div></div>` };
  },
};
