// 사람 — 회원 목록·상세, 운영진
import { api, post, esc, nl2br, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, num, fmtDate, fmtLocal, ago, LEVEL_NAMES, LEVELS, FIELDS, ROLES, BADGES, EVENT_TYPES, lvChip, stageChip, typeChip, empty, modal, closeModal, progressBar } from '../../core.js';
import { kpi, kv, pager, qs, notesBox, mountNotes, invalidateCounts } from './shared.js';

const STATUS = { active: '활동', dormant: '휴면', removed: '제명·탈퇴' };
const statusChip = s => s === 'active' ? '' : `<span class="chip ${s === 'removed' ? 'red' : 'amber'}">${STATUS[s] || s}</span>`;

export const people = {
  async users({ query, me }) {
    const page = Number(query.page || 1);
    const d = await api('/admin/users' + qs({ q: query.q, level: query.level, status: query.status, role: query.role, sort: query.sort, page }));
    const cur = { q: query.q, level: query.level, status: query.status, role: query.role, sort: query.sort };
    const body = `<form class="filters adm-filters" data-form="f">
        <input type="search" name="q" value="${esc(query.q || '')}" placeholder="닉네임·이름·이메일">
        ${select('level', [['', '모든 등급'], ...LEVELS.map(l => [l, `${l} ${LEVEL_NAMES[l]}`])], query.level || '')}
        ${select('status', [['', '모든 상태'], ['active', '활동'], ['dormant', '휴면'], ['removed', '제명·탈퇴']], query.status || '')}
        ${select('role', [['', '회원+운영진'], ['member', '회원만'], ['staff', '운영진만']], query.role || '')}
        ${select('sort', [['', '최근 가입순'], ['seen', '최근 접속순'], ['points', '포인트 많은 순'], ['level', '등급 높은 순'], ['name', '닉네임순']], query.sort || '')}
        <button class="btn sm primary" type="submit">적용</button>${Object.values(cur).some(Boolean) ? '<a class="btn sm ghost" href="#/admin/users">초기화</a>' : ''}
      </form>
      ${d.rows.length ? `<div class="card flush"><div class="table-wrap"><table class="tbl hover"><thead><tr><th>회원</th><th>등급</th><th class="num">포인트</th><th class="num">배지</th><th class="num">참여 중</th><th>최근 접속</th><th>가입</th></tr></thead><tbody>
        ${d.rows.map(u => `<tr data-href="#/admin/users/${u.id}"><td><a href="#/admin/users/${u.id}"><b>${esc(u.nickname)}</b></a> ${u.role === 'staff' ? '<span class="chip ink">운영진</span>' : ''}${statusChip(u.status)}<br><small class="muted">${esc(u.name)} · ${esc(u.email)}</small></td><td>${lvChip(u.level)}</td><td class="num">${num(u.points)}</td><td class="num">${num(u.badge_count)}</td><td class="num">${u.active_groups ? num(u.active_groups) : '-'}</td><td><small>${u.last_seen_at ? ago(u.last_seen_at) : '-'}</small></td><td><small>${fmtDate(u.created_at)}</small></td></tr>`).join('')}
      </tbody></table></div></div>${pager(page, d.per, d.total, p => '#/admin/users' + qs({ ...cur, page: p }))}` : empty('조건에 맞는 회원이 없습니다')}`;
    return { title: '회원', sub: `전체 ${num(d.total)}명. 이름을 누르면 활동 기록과 관리 메뉴가 열립니다.`,
      actions: `<a class="btn sm" href="/api/admin/export?table=users" download>CSV 내려받기</a>`,
      body, mount(root) {
        bindForms(root, { f(v) { go('#/admin/users' + qs(v)); } });
        root.querySelectorAll('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) go(tr.dataset.href); }));
      } };
  },

  async userDetail({ params, me }) {
    const d = await api('/admin/users/' + params.id);
    const counts = await api('/admin/counts');
    const isOwner = !!counts.is_owner;
    const u = d.user;
    const activeGroups = d.groups.filter(g => g.status === 'active' && ['recruiting', 'agreement', 'active', 'settling'].includes(g.stage));
    const attended = d.events.filter(e => e.status === 'attended').length;
    const lastApp = d.applications[0];
    const canEdit = u.role !== 'staff' || u.id === me.id || isOwner;
    const body = `
      <div class="kpi-grid kpi-4">
        ${kpi('활동 포인트', num(d.points.total) + '<small>점</small>', d.points.by_action.slice(0, 2).map(p => `${esc(p.label)} ${num(p.pts)}`).join(' · '))}
        ${kpi('배지', num(d.badges.filter(b => !b.revoked_at).length) + '<small>개</small>', d.badges.filter(b => !b.revoked_at).map(b => esc(b.name)).join(' · ') || '아직 없음')}
        ${kpi('참여 중인 챌린지', num(activeGroups.length) + '<small>개</small>', `지금까지 ${d.groups.length}개`)}
        ${kpi('일정 참석', num(attended) + '<small>회</small>', `신청 ${d.events.length}회`)}
      </div>
      <div class="adm-two wide-left">
        <div class="stack">
          <section class="card"><div class="card-head"><h3>참여한 챌린지</h3></div>
            ${d.groups.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>챌린지</th><th>역할</th><th class="num">체크인</th><th class="num">시간</th><th class="num">확인된 완료</th><th class="num">기여율 예정→실제</th></tr></thead><tbody>${d.groups.map(g => `<tr><td><a href="#/admin/groups/${g.id}">${esc(g.title)}</a><br>${typeChip(g.type)} ${stageChip(g.stage)} ${g.status !== 'active' ? `<span class="chip">${{ applied: '지원', left: g.leave_type === 'unannounced' ? '무단 이탈' : '이탈', removed: '제외', rejected: '거절' }[g.status] || g.status}</span>` : ''}</td><td>${esc(ROLES[g.role] || g.role)}</td><td class="num">${g.submitted}/${g.checkins}</td><td class="num">${num(g.hours)}</td><td class="num">${num(g.done_confirmed)}</td><td class="num">${g.planned_share == null ? '-' : Math.round(g.planned_share * 100) + '%'} → ${g.actual_share == null ? '-' : Math.round(g.actual_share * 100) + '%'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">아직 참여한 챌린지가 없습니다.</p>'}
          </section>
          <section class="card"><div class="card-head"><h3>다음 등급까지</h3>${d.progress.next ? `<span class="chip ${d.progress.eligible ? 'green' : ''}">${d.progress.eligible ? '조건 충족' : '진행 중'}</span>` : ''}</div>
            ${d.progress.next ? `<p class="small" style="margin:0 0 8px">${lvChip(u.level)} → <b class="lv lv-${d.progress.next}">${esc(d.progress.next_name)}</b> ${d.progress.auto ? '<small class="muted">(조건을 채우면 자동 승급)</small>' : '<small class="muted">(신청 후 심사)</small>'}</p>
              <div class="stack">${d.progress.items.map(i => `<div><div class="row between small"><span>${i.done ? '✓' : '·'} ${esc(i.label)}</span>${i.manual ? '' : `<span class="muted">${num(i.cur)} / ${num(i.goal)}</span>`}</div>${i.manual ? '' : progressBar(i.cur, i.goal)}</div>`).join('')}</div>` : '<p class="muted small">가장 높은 등급입니다.</p>'}
          </section>
          <section class="card"><div class="card-head"><h3>포인트 내역</h3><span class="muted small">항목별 누적</span></div>
            ${d.points.by_action.length ? `<div class="table-wrap"><table class="tbl compact"><tbody>${d.points.by_action.map(p => `<tr><td>${esc(p.label)}</td><td class="num">${num(p.n)}회</td><td class="num"><b>${num(p.pts)}</b>점</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">아직 포인트가 없습니다.</p>'}
          </section>
          <section class="card"><div class="card-head"><h3>등급·배지 이력</h3></div>
            <div class="timeline">${[...d.level_history.map(h => ({ t: h.created_at, html: `<b>${h.from_level || '-'} → ${h.to_level}</b> ${esc(h.reason || '')}${h.decided_by_name ? ` <small class="muted">· ${esc(h.decided_by_name)}</small>` : ''}` })),
              ...d.badges.map(b => ({ t: b.created_at, html: `<b>${esc(b.name)} 배지</b>${b.evidence ? ' · ' + esc(b.evidence) : ''}${b.granted_by_name ? ` <small class="muted">· ${esc(b.granted_by_name)}</small>` : ''}${b.revoked_at ? ' <span class="chip red">회수됨</span>' : canEdit ? ` <button class="btn sm ghost" data-act="revoke" data-id="${b.id}" data-confirm="${esc(b.name)} 배지를 회수할까요?">회수</button>` : ''}` })),
              ...d.promotions.map(p => ({ t: p.created_at, html: `<b>${p.target_level} 승급 신청</b> · ${{ pending: '대기', approved: '승인', held: '보류', rejected: '반려' }[p.status] || p.status}${p.decision_note ? ' · ' + esc(p.decision_note) : ''}` }))]
              .sort((a, b) => (a.t < b.t ? 1 : -1)).map(x => `<div class="tl-item"><small class="muted">${fmtDate(x.t)}</small><div>${x.html}</div></div>`).join('') || '<p class="muted small">기록이 없습니다.</p>'}</div>
          </section>
        </div>
        <div class="stack">
          <section class="card"><div class="card-head"><h3>기본 정보</h3></div>
            ${kv([['이름', esc(u.name)], ['이메일', esc(u.email)], ['연락처', esc(u.phone || '-')], ['가입', fmtDate(u.created_at)], ['최근 접속', u.last_seen_at ? ago(u.last_seen_at) : '-'], ['관심 분야', esc(String(u.interests || '').split(',').filter(Boolean).map(x => FIELDS[x.trim()] || x).join(', ') || '-')], ['사업자', u.has_business ? '있음' : '없음'], ['오리엔테이션', u.onboarded ? '이수' : '미이수'], ['활동', `글 ${d.activity.posts} · 댓글 ${d.activity.comments} · 이의 ${d.activity.disputes}`]])}
            ${u.bio ? `<p class="small" style="margin:10px 0 0">${nl2br(u.bio)}</p>` : ''}
          </section>
          ${u.asset_diag ? `<section class="card"><div class="card-head"><h3>자기 자산 진단</h3></div><div class="app-form">${Object.entries(u.asset_diag).filter(([, v]) => v).map(([k, v]) => `<div><b>${esc({ time: '쓸 수 있는 시간', money: '쓸 수 있는 돈', skills: '기술', experience: '경험', relations: '사람·관계', space: '공간·장비', goal: '목표' }[k] || k)}</b><span>${nl2br(typeof v === 'object' ? JSON.stringify(v) : v)}</span></div>`).join('')}</div></section>` : ''}
          ${notesBox('user', u.id, d.notes, me.id, isOwner)}
          ${lastApp ? `<details class="card"><summary><b>가입 신청서</b> <small class="muted">${fmtDate(lastApp.created_at)}</small></summary><div class="app-form" style="margin-top:10px">${Object.entries(lastApp.form).filter(([, v]) => v).map(([k, v]) => `<div><b>${esc(k)}</b><span>${nl2br(v)}</span></div>`).join('')}</div></details>` : ''}
          <details class="card"><summary><b>동의 기록</b> <small class="muted">${d.consents.length}건</small></summary><div class="list" style="margin-top:8px">${d.consents.map(c => `<div class="list-item small"><div class="grow">${{ terms: '이용약관', privacy: '개인정보 수집·이용', public_results: '결과 공개 원칙' }[c.kind] || c.kind} <span class="muted">· ${esc(c.version)}</span></div><span class="muted">${fmtDate(c.created_at, true)}</span></div>`).join('') || '<p class="muted small">기록 없음</p>'}</div></details>
          ${d.events.length ? `<details class="card"><summary><b>일정 신청·참석</b> <small class="muted">${d.events.length}건</small></summary><div class="list" style="margin-top:8px">${d.events.map(e => `<a class="list-item small" href="#/admin/events/${e.id}"><div class="grow">${esc(e.title)} <span class="muted">· ${EVENT_TYPES[e.type] || e.type}</span></div><span class="${e.status === 'attended' ? '' : 'muted'}">${{ attended: '참석', registered: '신청', cancelled: '취소' }[e.status] || e.status} · ${fmtLocal(e.starts_at).slice(0, 10)}</span></a>`).join('')}</div></details>` : ''}
        </div>
      </div>`;
    const actions = canEdit ? `<button class="btn sm primary" data-act="manage">등급·배지·상태 관리</button><button class="btn sm" data-act="temp">임시 비밀번호</button>` : '<span class="muted small">다른 운영진의 정보는 운영자만 바꿀 수 있습니다</span>';
    return { title: `${esc(u.nickname)} <span class="title-chips">${lvChip(u.level)}${u.role === 'staff' ? `<span class="chip ink">${d.is_owner ? '운영자' : '운영진'}</span>` : ''}${statusChip(u.status)}</span>`, sub: `${esc(u.name)} · ${esc(u.email)}`, crumbs: [['회원', '#/admin/users'], [u.nickname]], actions, body, mount(root) {
      mountNotes(root);
      bindActions(root, {
        manage() {
          modal(`<h3>${esc(u.nickname)} 관리</h3><form class="form" data-form="u">
            <div class="form-cols">${field('등급 조정', select('level', [['', '변경 없음'], ...LEVELS.map(l => [l, `${l} ${LEVEL_NAMES[l]}`])]))}${field('상태', select('status', [['', '변경 없음'], ['active', '활동'], ['dormant', '휴면 (로그인은 되지만 활동 제한)'], ['removed', '제명 (로그인 차단)']]))}</div>
            ${field('배지 부여', select('badge', [['', '없음'], ...Object.entries(BADGES)]), '첫 매출 배지는 포인트도 함께 줍니다. 증빙을 꼭 확인하세요.')}
            ${field('사유 / 증빙 (회원에게 알림으로 전달)', input('reason', { placeholder: '예: 11/3 스마트스토어 첫 주문 증빙 확인', required: true }))}
            <div class="btn-row"><button class="btn primary" type="submit">저장</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
            { onMount(m) { bindForms(m, { async u(v) { const body = { reason: v.reason, evidence: v.reason }; if (v.level) body.level = v.level; if (v.status) body.status = v.status; if (v.badge) body.badge = v.badge; if (!v.level && !v.status && !v.badge) throw new Error('바꿀 항목을 골라 주세요'); if (v.status === 'removed' && !confirm('제명하면 바로 로그아웃되고 다시 로그인할 수 없습니다. 진행할까요?')) return; await post(`/admin/users/${u.id}`, body); closeModal(); toast('저장했습니다'); reload(); } }); } });
        },
        async temp() { if (!confirm(`${u.nickname}님의 임시 비밀번호를 만들까요? 지금 로그인된 기기는 모두 로그아웃됩니다.`)) return; const r = await post(`/admin/users/${u.id}`, { temp_password: true }); modal(`<h3>임시 비밀번호</h3><p>${esc(u.nickname)}님에게 직접 전해 주세요. 로그인한 뒤 내 정보에서 바꾸도록 안내합니다. 이 창을 닫으면 다시 볼 수 없습니다.</p><pre class="json" style="font-size:1.15rem">${esc(r.temp_password)}</pre><button class="btn primary" data-close-modal>닫기</button>`); },
        async revoke(el) { await post(`/admin/users/${u.id}`, { revoke_badge_id: Number(el.dataset.id), reason: '운영진 회수' }); toast('회수했습니다'); reload(); },
      });
    } };
  },

  async staff({ me }) {
    const d = await api('/admin/staff');
    const owner = d.me.is_owner;
    const body = `
      <div class="adm-two wide-left">
        <section class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>운영진</th><th>권한</th><th class="num">최근 30일 처리</th><th>마지막 처리</th>${owner ? '<th></th>' : ''}</tr></thead><tbody>
          ${d.rows.map(s => `<tr><td><a href="#/admin/users/${s.id}"><b>${esc(s.nickname)}</b></a>${s.id === me.id ? ' <small class="muted">(나)</small>' : ''}<br><small class="muted">${esc(s.name)} · ${esc(s.email)}</small></td><td>${s.is_owner ? '<span class="chip ink">운영자</span>' : '<span class="chip">운영진</span>'}</td><td class="num">${num(s.actions_30d)}</td><td><small>${s.last_action_at ? ago(s.last_action_at) : '-'}</small></td>
            ${owner ? `<td class="btn-cell">${s.is_owner ? (d.rows.filter(x => x.is_owner).length > 1 ? `<button class="btn sm" data-act="st" data-a="remove_owner" data-id="${s.id}" data-confirm="${esc(s.nickname)}님의 운영자 권한을 해제할까요?">운영자 해제</button>` : '') : `<button class="btn sm" data-act="st" data-a="make_owner" data-id="${s.id}" data-confirm="${esc(s.nickname)}님을 운영자로 지정할까요? 규칙 변경과 개인정보 내려받기를 할 수 있게 됩니다.">운영자로</button>`}${s.id !== me.id ? `<button class="btn sm danger" data-act="st" data-a="revoke" data-id="${s.id}" data-confirm="${esc(s.nickname)}님을 일반 회원으로 돌릴까요?">해제</button>` : ''}</td>` : ''}</tr>`).join('')}
        </tbody></table></div></section>
        <div class="stack">
          ${owner ? `<form class="card form" data-form="add"><h3>운영진 추가</h3>${field('회원 이메일 또는 닉네임', input('who', { required: true, placeholder: '가입한 회원만 지정할 수 있습니다' }))}<button class="btn primary" type="submit">운영진으로 지정</button></form>` : '<div class="notice">운영진 지정과 해제는 운영자만 할 수 있습니다.</div>'}
          <section class="card soft"><h3>권한 차이</h3><div class="table-wrap"><table class="tbl perm"><thead><tr><th></th><th>운영진</th><th>운영자</th></tr></thead><tbody>
            ${[['받은 일 처리 (가입·심사·정산·페이퍼·승급·이의)', 1, 1], ['회원 등급·배지·상태 조정', 1, 1], ['단체 알림, 일정, 커뮤니티 관리', 1, 1], ['지급 처리, 재원 기록', 1, 1], ['장부·정산·페이퍼 CSV', 1, 1], ['규칙 설정 변경', 0, 1], ['회원·신청서·동의 기록 CSV, 전체 백업', 0, 1], ['운영진 지정·해제, 다른 운영진 정보 변경', 0, 1]].map(([l, a, b]) => `<tr><td>${l}</td><td>${a ? '✓' : '–'}</td><td>${b ? '✓' : '–'}</td></tr>`).join('')}
          </tbody></table></div><p class="small muted" style="margin:10px 0 0">운영자는 최소 한 명이 있어야 합니다. 모든 처리는 감사 로그에 남습니다.</p></section>
        </div>
      </div>`;
    return { title: '운영진', sub: '누가 무엇을 처리하는지 한눈에 봅니다.', body, mount(root) {
      bindForms(root, { async add(v) { await post('/admin/staff', { action: 'grant', who: v.who }); toast('운영진으로 지정했습니다'); reload(); } });
      bindActions(root, { async st(el) { await post('/admin/staff', { action: el.dataset.a, user_id: Number(el.dataset.id) }); invalidateCounts(); toast('바꿨습니다'); reload(); } });
    } };
  },
};
