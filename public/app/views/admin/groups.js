// 챌린지 — 그룹 현황, 그룹 상세, 라운드
import { api, post, put, esc, nl2br, toast, go, reload, field, input, select, bindForms, bindActions, num, won, fmtDate, ago, FIELDS, ROLES, lvChip, stageChip, typeChip, fieldChip, empty, modal, closeModal } from '../../core.js';
import { health, kpi, kv, qs, notesBox, mountNotes, askReason, columns, actionLabel, fmtDetail } from './shared.js';

const ROUND_STATUS = { planning: '준비', open: '모집', active: '진행', closed: '종료' };

// 상세 화면의 상태 표시 (목록과 같은 기준)
function groupHealth(d) {
  const n = d.members.filter(m => m.status === 'active').length || 1;
  const recent = d.checkins.slice(-2);
  const rate = recent.length ? Math.round(recent.reduce((s, c) => s + c.subs, 0) / (recent.length * n) * 100) : null;
  const lasts = d.members.map(m => m.last_submitted).filter(Boolean).sort();
  const last = lasts[lasts.length - 1];
  const idle = last ? (Date.now() - Date.parse(last.replace(' ', 'T') + 'Z')) / 86400e3 : null;
  if (rate == null || (idle != null && idle > 10)) return 'bad';
  if (rate < 60 || (idle != null && idle > 6)) return 'warn';
  return 'good';
}

export const groups = {
  async groups({ query }) {
    const view = query.view || 'running';
    const [rows, rounds] = await Promise.all([api('/admin/groups' + qs({ view: view === 'all' ? '' : view, round: query.round, type: query.type })), api('/rounds')]);
    const running = rows.filter(r => r.stage === 'active');
    const bad = running.filter(r => r.health === 'bad').length, warn = running.filter(r => r.health === 'warn').length;
    const body = `
      <div class="toolbar"><div class="pill-tabs">${[['running', '진행·정산'], ['forming', '준비 중'], ['done', '끝남'], ['all', '전체']].map(([k, l]) => `<a href="#/admin/groups${qs({ view: k, round: query.round, type: query.type })}" class="${view === k ? 'active' : ''}">${l}</a>`).join('')}</div>
        <form class="toolbar-search" data-form="f">${select('round', [['', '모든 라운드'], ...rounds.map(r => [r.id, r.name])], query.round || '')}${select('type', [['', '모든 유형'], ['group', '그룹'], ['solo', '솔로'], ['official', '오피셜']], query.type || '')}<button class="btn sm" type="submit">적용</button></form></div>
      ${view === 'running' && running.length ? `<div class="kpi-grid kpi-4">${kpi('진행 중', num(running.length) + '<small>개</small>')}${kpi('위험', num(bad) + '<small>개</small>', '10일 넘게 움직임 없음 또는 체크인 없음')}${kpi('주의', num(warn) + '<small>개</small>', '최근 2주 체크인 60% 미만')}${kpi('외부 매출 합계', won(rows.reduce((s, r) => s + r.revenue, 0)), '장부 기준')}</div>` : ''}
      ${rows.length ? `<div class="card flush"><div class="table-wrap"><table class="tbl hover"><thead><tr><th>챌린지</th><th>상태</th><th class="num">인원</th><th class="num">주차</th><th class="num">체크인 (최근 2주)</th><th class="num">마일스톤</th><th class="num">외부 매출</th><th>마지막 움직임</th></tr></thead><tbody>
        ${rows.map(c => `<tr data-href="#/admin/groups/${c.id}"><td><a href="#/admin/groups/${c.id}"><b>${esc(c.title)}</b></a><br><small class="muted">${typeChip(c.type)} ${esc(c.field_name || '')} · ${esc(c.leader)}${c.round_name ? ' · ' + esc(c.round_name) : ''}</small></td><td>${stageChip(c.stage)}<br>${c.stage === 'active' ? health(c.health) : ''}</td><td class="num">${num(c.members)}</td><td class="num">${c.last_week || '-'}</td><td class="num">${c.checkin_rate == null ? '-' : c.checkin_rate + '%'}</td><td class="num">${c.milestones.total ? `${c.milestones.done}/${c.milestones.total}` : '-'}</td><td class="num">${c.revenue ? won(c.revenue) : '-'}</td><td><small>${c.last_activity ? ago(c.last_activity) : '-'}</small></td></tr>`).join('')}
      </tbody></table></div></div>` : empty('해당하는 챌린지가 없습니다')}
      <p class="small muted" style="margin-top:10px">● 순조 · ▲ 주의(체크인 60% 미만 또는 6일 넘게 조용함) · ■ 위험(체크인 기록 없음 또는 10일 넘게 조용함). 위험한 그룹은 그룹장에게 먼저 연락합니다.</p>`;
    return { title: '그룹 현황', sub: '진행 중인 챌린지가 멈추지 않았는지 봅니다.', body, mount(root) {
      bindForms(root, { f(v) { go('#/admin/groups' + qs({ view, ...v })); } });
      root.querySelectorAll('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) go(tr.dataset.href); }));
    } };
  },

  async groupDetail({ params, me }) {
    const [d, counts] = await Promise.all([api('/admin/groups/' + params.id), api('/admin/counts')]);
    const c = d.challenge;
    const active = d.members.filter(m => m.status === 'active');
    const n = active.length || 1;
    const weekRates = d.checkins.map(ci => Math.round(ci.subs / n * 100));
    const L = d.ledger;
    const stageActions = {
      recruiting: [['stopped', '중단']], agreement: [['stopped', '중단'], ['recruiting', '모집 재개']], active: [['stopped', '중단'], ['closed', '종료']],
      settling: [['active', '진행으로 되돌리기'], ['closed', '종료'], ['stopped', '중단']], stopped: [['active', '재개'], ['closed', '종료']],
    }[c.stage] || [];
    const body = `
      <div class="kpi-grid kpi-4">
        ${kpi('그룹원', num(active.length) + '<small>명</small>', d.members.length > active.length ? `이탈·지원 포함 ${d.members.length}명` : '')}
        ${kpi('체크인', num(d.checkins.length) + '<small>주</small>', d.checkins.length ? `최근 ${weekRates[weekRates.length - 1]}% 제출` : '아직 없음')}
        ${kpi('외부 매출', won(L.revenue_external), `비용 ${won(L.expenses)} · 장부 ${L.entries}건`)}
        ${kpi('마일스톤', `${d.milestones.filter(m => m.done_at).length}/${d.milestones.length}`, d.milestones.find(m => !m.done_at) ? `다음: ${esc(d.milestones.find(m => !m.done_at).title)}` : '')}
      </div>
      <div class="adm-two wide-left">
        <div class="stack">
          ${d.checkins.length ? `<section class="card"><div class="card-head"><h3>주차별 체크인 제출률</h3><span class="muted small">현재 그룹원 ${active.length}명 기준</span></div>${columns(weekRates, d.checkins.map(ci => ci.week_no + '주차'), { unit: '%' })}</section>` : ''}
          <section class="card flush"><div class="card-head pad"><h3>그룹원</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>이름</th><th>역할</th><th class="num">체크인</th><th class="num">시간</th><th class="num">완료 (확인)</th><th class="num">기여율 예정→실제</th><th>마지막 제출</th></tr></thead><tbody>
            ${d.members.map(m => { const gap = m.planned_share != null && m.actual_share != null && Math.abs(m.actual_share - m.planned_share) >= 0.2; const miss = m.expected - m.submitted; return `<tr class="${m.status !== 'active' ? 'dim' : ''}"><td><a href="#/admin/users/${m.user_id}"><b>${esc(m.nickname)}</b></a> ${lvChip(m.level)}${m.status !== 'active' ? ` <span class="chip">${{ applied: '지원', left: m.leave_type === 'unannounced' ? '무단 이탈' : '이탈', removed: '제외', rejected: '거절' }[m.status] || m.status}</span>` : ''}</td><td>${esc(ROLES[m.role] || m.role)}</td><td class="num">${m.submitted}/${m.expected}${m.status === 'active' && miss >= 2 ? ' <span class="chip amber">미제출 ' + miss + '</span>' : ''}</td><td class="num">${num(m.hours)}</td><td class="num">${m.done_total} (${m.done_confirmed})</td><td class="num">${m.planned_share == null ? '-' : Math.round(m.planned_share * 100) + '%'} → ${m.actual_share == null ? '-' : Math.round(m.actual_share * 100) + '%'}${gap ? ' <span class="chip amber">차이 큼</span>' : ''}</td><td><small>${m.last_submitted ? ago(m.last_submitted) : '-'}</small></td></tr>`; }).join('')}
          </tbody></table></div></section>
          <section class="card"><div class="card-head"><h3>마일스톤</h3></div><div class="list">${d.milestones.map(m => { const late = !m.done_at && m.due_date && m.due_date < new Date().toISOString().slice(0, 10); return `<div class="list-item"><div class="grow"><div class="title">${m.done_at ? '✓' : late ? '■' : '·'} ${esc(m.title)}</div><div class="meta">${m.due_date ? '마감 ' + fmtDate(m.due_date) : ''}${m.done_at ? ' · 완료 ' + fmtDate(m.done_at) : late ? ' · 마감 지남' : ''}${m.evidence ? ' · ' + esc(m.evidence) : ''}</div></div></div>`; }).join('') || '<p class="muted small">마일스톤이 없습니다.</p>'}</div></section>
          <section class="card"><div class="card-head"><h3>처리 이력</h3></div><div class="timeline">${d.history.map(h => `<div class="tl-item"><small class="muted">${fmtDate(h.created_at, true)}</small><div><b>${esc(actionLabel(h.action))}</b> · ${esc(h.nickname || '-')}${h.detail ? `<br><small class="muted">${esc(fmtDetail(h.detail, 160))}</small>` : ''}</div></div>`).join('') || '<p class="muted small">기록이 없습니다.</p>'}</div></section>
        </div>
        <div class="stack">
          <section class="card"><div class="card-head"><h3>요약</h3></div>
            ${kv([['유형', typeChip(c.type)], ['분야', esc(c.field_name || c.field_code)], ['그룹장', `<a href="#/admin/users/${c.leader_id}">${esc(c.leader)}</a>`], ['라운드', esc(c.round_name || '-')], ['만든 날', fmtDate(c.created_at)], ['최근 변경', ago(c.updated_at)], ['합의서', d.agreement ? `v${d.agreement.version} · ${{ draft: '작성 중', signing: '서명 중', signed: '전원 서명', approved: '승인', locked: '확정' }[d.agreement.status] || d.agreement.status}` : '-'], ['배분', d.agreement?.clauses?.ratios ? `${Math.round(d.agreement.clauses.ratios.hq * 100)} / ${Math.round(d.agreement.clauses.ratios.leader * 100)} / ${Math.round(d.agreement.clauses.ratios.pool * 100)}` : '-'], ['페이퍼', d.paper ? { draft: '작성 중', review: '검토 대기', approved: '승인', published: '공개' }[d.paper.status] : '아직 없음']])}
            ${c.summary ? `<p class="small" style="margin:10px 0 0">${nl2br(c.summary)}</p>` : ''}
            <div class="btn-row" style="margin-top:12px"><a class="btn sm" href="#/groups/${c.id}">그룹 공간</a><a class="btn sm" href="#/groups/${c.id}/ledger">장부</a>${d.agreement ? `<a class="btn sm" href="#/groups/${c.id}/agreement">합의서</a>` : ''}</div>
          </section>
          <section class="card"><div class="card-head"><h3>장부</h3><a class="small" href="#/groups/${c.id}/ledger">전체 보기</a></div>
            ${kv([['외부 매출', won(L.revenue_external)], ['내부 매출', won(L.revenue_internal)], ['비용', won(L.expenses)], ['그룹원 부담 비용', won(L.member_contrib)], ['운영본부 선지원', won(L.hq_advance)]])}
            ${d.settlements.length ? `<div class="list" style="margin-top:8px">${d.settlements.map(s => `<a class="list-item small" href="#/settlements/${s.id}"><div class="grow">정산 ${fmtDate(s.period_start)}~${fmtDate(s.period_end)}</div><span>${{ confirming: '확인 중', disputed: '이의', reviewed: '검수 완료', paid: '지급 완료', carried: '이월' }[s.status] || s.status}</span></a>`).join('')}</div>` : ''}
          </section>
          ${stageActions.length ? `<section class="card"><div class="card-head"><h3>운영본부 조치</h3></div><div class="btn-row">${stageActions.map(([to, l]) => `<button class="btn sm ${to === 'stopped' ? 'danger' : ''}" data-act="stage" data-to="${to}" data-label="${l}">${l}</button>`).join('')}${c.type !== 'solo' && active.length > 1 && ['recruiting', 'agreement', 'active', 'settling'].includes(c.stage) ? '<button class="btn sm" data-act="leader">그룹장 교체</button>' : ''}</div><p class="small muted" style="margin:10px 0 0">조치마다 사유를 받아 그룹원 모두에게 알림으로 보냅니다. 중단해도 페이퍼는 냅니다.</p></section>` : ''}
          ${notesBox('challenge', c.id, d.notes, me.id, counts.is_owner)}
        </div>
      </div>`;
    return { title: `${esc(c.title)} <span class="title-chips">${stageChip(c.stage)}${c.stage === 'active' ? health(groupHealth(d)) : ''}</span>`, sub: `${esc(c.leader)} 그룹장${c.round_name ? ' · ' + esc(c.round_name) : ''}`, crumbs: [['그룹 현황', '#/admin/groups'], [c.title]], body, mount(root) {
      mountNotes(root);
      bindActions(root, {
        async stage(el) {
          const reason = await askReason(`챌린지 ${el.dataset.label}`, { hint: '그룹원 모두에게 이 사유가 알림으로 전달됩니다.', button: el.dataset.label, danger: el.dataset.to === 'stopped' });
          if (!reason) return;
          await post(`/admin/groups/${c.id}/stage`, { stage: el.dataset.to, reason }); toast('처리했습니다'); reload();
        },
        leader() {
          modal(`<h3>그룹장 교체</h3><form class="form" data-form="ld">${field('새 그룹장', select('user_id', active.filter(m => m.user_id !== c.leader_id).map(m => [m.user_id, `${m.nickname} (${ROLES[m.role] || m.role})`])))}${field('사유', input('reason', { required: true, placeholder: '예: 기존 그룹장 개인 사정으로 그룹 합의' }))}<p class="small muted" style="margin:0">교체 전에 그룹원들의 동의를 먼저 확인하세요 (MC-03 4.4). 정산 배분은 합의서를 다시 맞춰야 할 수 있습니다.</p><div class="btn-row"><button class="btn primary" type="submit">교체</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
            { onMount(m) { bindForms(m, { async ld(v) { await post(`/admin/groups/${c.id}/leader`, { user_id: Number(v.user_id), reason: v.reason }); closeModal(); toast('그룹장을 바꿨습니다'); reload(); } }); } });
        },
      });
    } };
  },

  async rounds() {
    const rows = await api('/rounds');
    const today = new Date().toISOString().slice(0, 10);
    const body = `<div class="adm-two wide-left">
      <section class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>라운드</th><th>기간</th><th>모집 마감</th><th>상태</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><b>${esc(r.name)}</b>${r.status === 'active' && r.start_date <= today ? `<br><small class="muted">${Math.min(12, Math.floor((Date.parse(today) - Date.parse(r.start_date)) / (7 * 86400e3)) + 1)}주차</small>` : ''}</td><td><small>${fmtDate(r.start_date)} ~ ${fmtDate(r.end_date)}</small></td>
          <td><input type="date" class="mini-input" name="ru_${r.id}" value="${esc(r.recruit_until || '')}"></td>
          <td>${select('st_' + r.id, Object.entries(ROUND_STATUS), r.status)}</td><td><button class="btn sm" data-act="save" data-id="${r.id}">저장</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">라운드가 없습니다.</td></tr>'}
      </tbody></table></div></section>
      <div class="stack">
        <form class="card form" data-form="nr"><h3>새 라운드</h3>${field('이름', input('name', { required: true, placeholder: '예: 2기 (2027년 봄)' }))}<div class="form-cols">${field('시작일', input('start_date', { type: 'date', required: true }))}${field('종료일', input('end_date', { type: 'date', required: true }), '12주 뒤 데모데이 날짜')}</div>
          <div class="form-cols">${field('모집 마감일', input('recruit_until', { type: 'date' }), '비우면 시작일까지')}${field('상태', select('status', Object.entries(ROUND_STATUS), 'planning'))}</div><button class="btn primary" type="submit">만들기</button></form>
        <section class="card soft small"><b>상태가 하는 일</b><ul class="tight"><li><b>모집</b> — 홈페이지 첫 화면과 가입 신청 페이지에 "○기 모집 중 · 마감일" 안내가 뜹니다.</li><li><b>진행</b> — 운영 현황에 주차가 표시됩니다.</li><li><b>종료</b> — 데모데이와 정산이 끝난 뒤 바꿉니다.</li></ul></section>
      </div></div>`;
    return { title: '라운드', sub: '12주 단위로 함께 시작하고 함께 마칩니다.', body, mount(root) {
      bindForms(root, { async nr(v) { if (v.end_date < v.start_date) throw new Error('종료일이 시작일보다 빠릅니다'); await post('/admin/rounds', v); toast('만들었습니다'); reload(); } });
      bindActions(root, { async save(el) { const id = el.dataset.id; await put(`/admin/rounds/${id}`, { status: root.querySelector(`[name=st_${id}]`).value, recruit_until: root.querySelector(`[name=ru_${id}]`).value || null }); toast('저장했습니다'); } });
    } };
  },
};
