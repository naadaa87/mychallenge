// 그룹 — 그룹 현황, 그룹 상세(출석·경고·성과), 시즌
import { api, post, put, esc, nl2br, toast, go, reload, field, input, select, textarea, bindForms, bindActions, num, won, fmtDate, fmtLocal, ago, FIELDS, ROLES, ATTEND, LOG_KINDS, attendChip, metricVal, lvChip, stageChip, typeChip, fieldChip, empty, modal, closeModal } from '../../core.js';
import { health, kpi, kv, qs, notesBox, mountNotes, askReason, columns, actionLabel, fmtDetail } from './shared.js';
import { policyLines } from '../group.js';

const ROUND_STATUS = { planning: '준비', open: '신규 회원 모집', active: '진행', closed: '종료' };
const LEAVE = { self: '스스로 나감', attendance: '출석 기준 퇴출', leader: '리더가 내보냄', staff: '운영진 조치' };
const rate = v => (v == null ? '-' : v + '%');

export const groups = {
  async groups({ query }) {
    const view = query.view || 'running';
    const rows = await api('/admin/groups' + qs({ view: view === 'all' ? '' : view, type: query.type }));
    const running = rows.filter(r => r.stage === 'active');
    const bad = running.filter(r => r.health === 'bad').length, warn = running.filter(r => r.health === 'warn').length;
    const rated = running.filter(r => r.recent_rate != null);
    const avgRate = rated.length ? Math.round(rated.reduce((s, r) => s + r.recent_rate, 0) / rated.length) : null;
    const body = `
      <div class="toolbar"><div class="pill-tabs">${[['running', '진행 중'], ['forming', '모집 중'], ['done', '끝남'], ['all', '전체']].map(([k, l]) => `<a href="#/admin/groups${qs({ view: k, type: query.type })}" class="${view === k ? 'active' : ''}">${l}</a>`).join('')}</div>
        <form class="toolbar-search" data-form="f">${select('type', [['', '학습·도전 모두'], ['study', '학습그룹'], ['challenge', '도전그룹']], query.type || '')}<button class="btn sm" type="submit">적용</button></form></div>
      ${view === 'running' && running.length ? `<div class="kpi-grid kpi-4">${kpi('진행 중', num(running.length) + '<small>개</small>')}${kpi('위험', num(bad) + '<small>개</small>', '3주 넘게 모임 없음 또는 출석률 40% 미만')}${kpi('주의', num(warn) + '<small>개</small>', '출석률 60% 미만, 경고 발생, 10일 넘게 조용함')}${kpi('최근 출석률 평균', rate(avgRate), '그룹별 최근 마감 모임 3번 기준')}</div>` : ''}
      ${rows.length ? `<div class="card flush"><div class="table-wrap"><table class="tbl hover"><thead><tr><th>그룹</th><th>상태</th><th class="num">인원</th><th class="num">모임</th><th class="num">출석률 (최근 3번)</th><th class="num">경고</th><th class="num">목표 진행</th><th>다음 모임 · 마지막 움직임</th></tr></thead><tbody>
        ${rows.map(c => `<tr data-href="#/admin/groups/${c.id}"><td><a href="#/admin/groups/${c.id}"><b>${esc(c.title)}</b></a><br><small class="muted">${typeChip(c.type)} ${esc(c.field_name || '')} · ${esc(c.leader)}</small></td>
          <td>${stageChip(c.stage)}<br>${c.stage === 'active' ? health(c.health) : ''}</td>
          <td class="num">${num(c.members)}/${num(c.capacity)}${c.applicants ? `<br><small class="muted">신청 ${c.applicants}</small>` : ''}</td>
          <td class="num">${num(c.sessions_done)}</td>
          <td class="num">${rate(c.recent_rate)}</td>
          <td class="num">${c.warnings ? `<b class="error">${c.warnings}</b>` : '0'}</td>
          <td class="num">${c.goal_metric && c.goal_target ? `${Math.min(100, Math.round(c.goal_value / c.goal_target * 100))}%<br><small class="muted">${esc(c.goal_metric_name)} ${metricVal(c.goal_metric, c.goal_value, c.goal_unit)}</small>` : '-'}</td>
          <td><small>${c.next_session ? '다음 ' + fmtLocal(c.next_session).slice(5) : '<span class="muted">잡힌 모임 없음</span>'}<br><span class="muted">${c.last_log ? '기록 ' + ago(c.last_log) : c.last_session ? '모임 ' + fmtLocal(c.last_session).slice(5, 10) : '움직임 없음'}</span></small></td></tr>`).join('')}
      </tbody></table></div></div>` : empty('해당하는 그룹이 없습니다', view === 'forming' ? '승인된 그룹리더가 그룹을 만들면 모집 중으로 올라옵니다' : '')}
      <p class="small muted" style="margin-top:10px">● 순조 · ▲ 주의(최근 출석률 60% 미만, 경고가 있음, 10일 넘게 모임 없음) · ■ 위험(최근 출석률 40% 미만, 3주 넘게 모임도 일정도 없음). 위험한 그룹은 그룹리더에게 먼저 연락해 사정을 듣습니다.</p>`;
    return { title: '그룹 현황', sub: '학습그룹과 도전그룹이 멈추지 않고 모이고 있는지, 출석과 목표가 어떻게 가고 있는지 봅니다.', body, mount(root) {
      bindForms(root, { f(v) { go('#/admin/groups' + qs({ view, ...v })); } });
      root.querySelectorAll('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) go(tr.dataset.href); }));
    } };
  },

  async groupDetail({ params, me }) {
    const [d, counts] = await Promise.all([api('/admin/groups/' + params.id), api('/admin/counts')]);
    const c = d.group;
    const active = d.members.filter(m => m.status === 'active');
    const closed = d.sessions.filter(s => s.status === 'closed').slice(0, 12).reverse();
    const sessRates = closed.map(s => { const n = s.attended + s.absent; return n ? Math.round(s.attended / n * 100) : 0; });
    const rates = active.map(m => m.attendance?.rate).filter(v => v != null);
    const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
    const revenue = d.results.filter(r => r.metric === 'revenue').reduce((s, r) => s + r.value, 0);
    const pendingRev = d.results.filter(r => r.metric === 'revenue' && !r.verified_at);
    const goalVal = c.goal_metric ? d.results.filter(r => r.metric === c.goal_metric).reduce((s, r) => s + r.value, 0) : null;
    const p = c.policy;
    const stageActions = {
      recruiting: [['active', '진행으로'], ['stopped', '중단']], active: [['closed', '종료'], ['stopped', '중단']],
      stopped: [['active', '재개'], ['closed', '종료']], closed: [['active', '다시 열기']],
    }[c.stage] || [];
    const body = `
      <div class="kpi-grid kpi-4">
        ${kpi('그룹원', num(active.length) + `<small>/${c.capacity}명</small>`, d.members.length > active.length ? `신청·나감 포함 ${d.members.length}명` : '')}
        ${kpi('마감한 모임', num(closed.length) + '<small>번</small>', d.sessions.find(s => ['scheduled', 'open'].includes(s.status)) ? '다음 일정 있음' : '잡힌 일정 없음')}
        ${kpi('평균 출석률', rate(avg), p.min_rate ? `기준 ${p.min_rate}%` : '출석률 기준 없음')}
        ${kpi(c.goal_metric ? `목표 · ${esc({ revenue: '매출', customers: '유료 고객', sales: '판매', users: '사용자', content: '콘텐츠', study: '학습 과제', custom: '지표' }[c.goal_metric] || '')}` : '매출 기록', c.goal_metric ? metricVal(c.goal_metric, goalVal, c.goal_unit) : won(revenue), c.goal_target ? `목표 ${metricVal(c.goal_metric, c.goal_target, c.goal_unit)} · ${Math.min(100, Math.round(goalVal / c.goal_target * 100))}%` : pendingRev.length ? `확인 대기 ${pendingRev.length}건` : '')}
      </div>
      <div class="adm-two wide-left">
        <div class="stack">
          ${closed.length ? `<section class="card"><div class="card-head"><h3>모임별 출석률</h3><span class="muted small">마감한 모임 최근 ${closed.length}번 · 공결 제외</span></div>${columns(sessRates, closed.map(s => fmtLocal(s.starts_at).slice(5, 10)), { unit: '%' })}</section>` : ''}
          <section class="card flush"><div class="card-head pad"><h3>그룹원</h3></div><div class="table-wrap"><table class="tbl"><thead><tr><th>이름</th><th>역할</th><th class="num">출석률</th><th class="num">출석·지각·결석·공결</th><th class="num">경고</th><th class="num">기록</th><th>마지막 접속</th><th></th></tr></thead><tbody>
            ${d.members.map(m => { const st = m.attendance || {}; const kick = m.status === 'active' && p.kick_warnings > 0 && m.warnings >= p.kick_warnings && m.role !== 'leader'; return `<tr class="${m.status !== 'active' ? 'dim' : ''}"><td><a href="#/admin/users/${m.user_id}"><b>${esc(m.nickname)}</b></a> ${lvChip(m.level)}${m.status !== 'active' ? ` <span class="chip">${m.status === 'applied' ? '신청' : LEAVE[m.leave_type] || '나감'}</span>` : ''}${kick ? ' <span class="chip red">퇴출 기준</span>' : ''}</td>
              <td>${esc(m.role_name)}</td><td class="num">${m.status === 'active' ? `<b class="${p.min_rate && st.rate != null && st.rate < p.min_rate ? 'error' : ''}">${rate(st.rate)}</b>` : '-'}</td>
              <td class="num">${m.status === 'active' ? `${st.present || 0}·${st.late || 0}·${st.absent || 0}·${st.excused || 0}` : '-'}</td><td class="num">${m.warnings ? `<b class="error">${m.warnings}</b>` : '0'}</td><td class="num">${num(m.logs)}</td><td><small class="muted">${m.last_seen_at ? ago(m.last_seen_at) : '-'}</small></td>
              <td class="btn-cell">${m.status === 'removed' ? `<button class="btn sm" data-act="restore" data-uid="${m.user_id}" data-name="${esc(m.nickname)}">복귀</button>` : ''}</td></tr>`; }).join('')}
          </tbody></table></div></section>
          <section class="card"><div class="card-head"><h3>모임</h3><a class="small" href="#/groups/${c.id}/sessions">그룹 화면에서 보기</a></div>${d.sessions.length ? `<div class="list">${d.sessions.slice(0, 15).map(s => `<div class="list-item"><div class="grow"><div class="title">${esc(s.title)} <span class="chip ${s.status === 'open' ? 'green' : s.status === 'cancelled' ? '' : s.status === 'closed' ? '' : 'blue'}">${{ scheduled: '예정', open: '출석 받는 중', closed: '마감', cancelled: '취소' }[s.status]}</span></div><div class="meta">${fmtLocal(s.starts_at)} · ${s.mode === 'offline' ? '오프라인' : '온라인'}${s.status === 'closed' ? ` · 출석 ${s.attended} · 결석 ${s.absent} · 공결 ${s.excused}` : ''}</div></div></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">아직 잡힌 모임이 없습니다.</p>'}</section>
          <section class="card"><div class="card-head"><h3>경고 기록</h3></div>${d.warnings.length ? `<div class="list">${d.warnings.map(w => `<div class="list-item"><div class="grow"><div class="title">${esc(w.nickname)} · ${esc(w.reason)} ${w.cleared_at ? '<span class="chip">취소됨</span>' : ''}</div><div class="meta">${w.issued_by ? `${esc(w.issuer || '')} 경고` : '출석 규칙 자동 경고'} · ${fmtDate(w.created_at, true)}</div></div></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">경고가 없습니다.</p>'}</section>
          <section class="card"><div class="card-head"><h3>성과 기록</h3><a class="small" href="#/admin/results">매출 확인</a></div>${d.results.length ? `<div class="list">${d.results.map(r => `<div class="list-item"><div class="grow"><div class="title">${esc(r.metric_name)} <b>${metricVal(r.metric, r.value, r.unit)}</b> ${r.verified_at ? `<span class="chip green">확인 · ${esc(r.verifier || '')}</span>` : r.metric === 'revenue' ? '<span class="chip amber">확인 대기</span>' : ''}</div><div class="meta">${esc(r.label || '')} · ${fmtDate(r.happened_on)} · ${esc(r.nickname)}${r.evidence ? ` · 증빙: ${/^https?:\/\//.test(r.evidence) ? `<a href="${esc(r.evidence)}" target="_blank" rel="noopener">열기</a>` : esc(r.evidence)}` : ''}</div></div>${!r.verified_at && r.metric === 'revenue' ? `<button class="btn sm primary" data-act="verify" data-id="${r.id}">확인</button>` : ''}</div>`).join('')}</div>` : '<p class="small muted" style="margin:0">아직 없습니다.</p>'}</section>
          <section class="card"><div class="card-head"><h3>최근 도전 기록</h3><a class="small" href="#/groups/${c.id}/records">전체</a></div>${d.logs.length ? `<div class="list">${d.logs.slice(0, 8).map(l => `<div class="list-item"><div class="grow"><div class="small"><span class="chip">${esc(LOG_KINDS[l.kind] || l.kind)}</span> <b>${esc(l.nickname)}</b> <span class="muted">${ago(l.created_at)}</span></div><div class="small clamp1">${esc(l.body)}</div></div></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">아직 없습니다.</p>'}</section>
          <section class="card"><div class="card-head"><h3>처리 이력</h3></div><div class="timeline">${d.history.map(h => `<div class="tl-item"><small class="muted">${fmtDate(h.created_at, true)}</small><div><b>${esc(actionLabel(h.action))}</b> · ${esc(h.nickname || '-')}${h.detail ? `<br><small class="muted">${esc(fmtDetail(h.detail, 160))}</small>` : ''}</div></div>`).join('') || '<p class="muted small">기록이 없습니다.</p>'}</div></section>
        </div>
        <div class="stack">
          <section class="card"><div class="card-head"><h3>요약</h3></div>
            ${kv([['종류', typeChip(c.type)], ['분야', esc(c.field_name || c.field_code)], ['그룹리더', `<a href="#/admin/users/${c.leader_id}">${esc(c.leader_nickname)}</a>`], ['목표', esc(c.goal_text || '-')], ['모이는 주기', esc(c.schedule_text || '-')], ['기간', c.start_date ? `${fmtDate(c.start_date)} ~ ${c.end_date ? fmtDate(c.end_date) : ''}` : '-'], ['참여 방식', c.join_mode === 'open' ? '바로 참여' : '리더 승인'], ['만든 날', fmtDate(c.created_at)], ['최근 변경', ago(c.updated_at)], ['페이퍼', d.paper ? { draft: '작성 중', review: '검토 대기', approved: '승인', published: '공개' }[d.paper.status] || d.paper.status : '-']])}
            ${c.summary ? `<p class="small" style="margin:10px 0 0">${nl2br(c.summary)}</p>` : ''}
            <div class="btn-row" style="margin-top:12px"><a class="btn sm" href="#/groups/${c.id}">그룹 공간</a><a class="btn sm" href="#/groups/${c.id}/members">그룹원·출석표</a></div>
          </section>
          <section class="card"><div class="card-head"><h3>출석 규칙</h3><span class="small muted">그룹리더가 정함</span></div><ul class="rule-list small">${policyLines(p).map(l => `<li>${esc(l)}</li>`).join('')}</ul></section>
          ${d.milestones.length ? `<section class="card"><div class="card-head"><h3>마일스톤</h3></div>${d.milestones.map(m => { const late = !m.done_at && m.due_date && m.due_date < new Date().toISOString().slice(0, 10); return `<div class="milestone ${m.done_at ? 'done' : late ? 'late' : ''}"><span class="dotm"></span><span class="grow small">${esc(m.title)}</span><small class="muted">${m.done_at ? '완료' : m.due_date ? fmtDate(m.due_date) : ''}</small></div>`; }).join('')}</section>` : ''}
          ${stageActions.length || active.length > 1 ? `<section class="card"><div class="card-head"><h3>운영진 조치</h3></div><div class="btn-row">${stageActions.map(([to, l]) => `<button class="btn sm ${to === 'stopped' ? 'danger' : ''}" data-act="stage" data-to="${to}" data-label="${l}">${l}</button>`).join('')}${active.length > 1 && ['recruiting', 'active'].includes(c.stage) ? '<button class="btn sm" data-act="leader">그룹리더 교체</button>' : ''}</div><p class="small muted" style="margin:8px 0 0">중단·종료·리더 교체는 사유와 함께 그룹원 모두에게 알림이 갑니다. 그룹리더와 먼저 이야기한 뒤 처리해 주세요.</p></section>` : ''}
          ${notesBox('challenge', c.id, d.notes, me.id, counts.is_owner)}
        </div>
      </div>`;
    return { title: `${esc(c.title)} <span class="title-chips">${typeChip(c.type)}${stageChip(c.stage)}</span>`, sub: `그룹리더 ${esc(c.leader_nickname)}`, crumbs: [['그룹 현황', '#/admin/groups'], [c.title]], body, mount(root) {
      mountNotes(root);
      bindActions(root, {
        async stage(el) {
          const reason = await askReason(`그룹 ${el.dataset.label}`, { hint: '그룹원 모두에게 이 사유가 알림으로 전달됩니다.', button: el.dataset.label, danger: el.dataset.to === 'stopped' });
          if (!reason) return;
          await post(`/admin/groups/${c.id}/stage`, { stage: el.dataset.to, reason }); toast('처리했습니다'); reload();
        },
        async verify(el) { const r = await post(`/groups/${c.id}/results/${el.dataset.id}`, { action: 'verify' }); toast(r.granted?.length ? `확인했습니다. 첫 매출 배지 ${r.granted.length}명` : '확인했습니다'); reload(); },
        async restore(el) {
          if (!confirm(`${el.dataset.name}님을 다시 그룹원으로 받을까요? 이전 경고는 모두 취소됩니다.`)) return;
          await post(`/groups/${c.id}/members/${el.dataset.uid}`, { action: 'restore' }); toast('복귀시켰습니다'); reload();
        },
        leader() {
          modal(`<h3>그룹리더 교체</h3><form class="form" data-form="ld">${field('새 그룹리더', select('user_id', active.filter(m => m.user_id !== c.leader_id).map(m => [m.user_id, `${m.nickname} (${ROLES[m.role] || m.role})`])))}${field('사유', input('reason', { required: true, placeholder: '예: 기존 그룹리더 개인 사정으로 그룹원들과 합의' }))}<p class="small muted" style="margin:0">교체 전에 그룹원들의 의견을 먼저 들어 주세요. 새 그룹리더는 그룹리더 자격도 함께 받습니다.</p><div class="btn-row"><button class="btn primary" type="submit">교체</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
            { onMount(m) { bindForms(m, { async ld(v) { await post(`/admin/groups/${c.id}/leader`, { user_id: Number(v.user_id), reason: v.reason }); closeModal(); toast('그룹리더를 바꿨습니다'); reload(); } }); } });
        },
      });
    } };
  },

  async rounds() {
    const rows = await api('/rounds');
    const body = `<div class="adm-two wide-left">
      <section class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>시즌</th><th>기간</th><th>신규 모집 마감</th><th>상태</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><b>${esc(r.name)}</b></td><td><small>${fmtDate(r.start_date)} ~ ${fmtDate(r.end_date)}</small></td>
          <td><input type="date" class="mini-input" name="ru_${r.id}" value="${esc(r.recruit_until || '')}"></td>
          <td>${select('st_' + r.id, Object.entries(ROUND_STATUS), r.status)}</td><td><button class="btn sm" data-act="save" data-id="${r.id}">저장</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">시즌이 없습니다.</td></tr>'}
      </tbody></table></div></section>
      <div class="stack">
        <form class="card form" data-form="nr"><h3>새 시즌</h3>${field('이름', input('name', { required: true, placeholder: '예: 2027년 봄 시즌' }))}<div class="form-cols">${field('시작일', input('start_date', { type: 'date', required: true }))}${field('종료일', input('end_date', { type: 'date', required: true }), '보통 성과발표회 날짜')}</div>
          <div class="form-cols">${field('신규 회원 모집 마감', input('recruit_until', { type: 'date' }), '비우면 시작일까지')}${field('상태', select('status', Object.entries(ROUND_STATUS), 'planning'))}</div><button class="btn primary" type="submit">만들기</button></form>
        <section class="card soft small"><b>시즌은 무엇인가요?</b><ul class="tight"><li>그룹은 언제든 만들 수 있습니다. 시즌은 신규 회원 모집과 성과발표회 주기를 맞추는 달력입니다.</li><li><b>신규 회원 모집</b>으로 두면 홈페이지 첫 화면과 가입 신청 페이지에 "모집 중 · 마감일" 안내가 뜹니다.</li><li>시즌 마지막에 성과발표회 일정을 잡아 두면 그룹들이 목표를 맞추기 좋습니다.</li></ul></section>
      </div></div>`;
    return { title: '시즌', sub: '분기 단위로 신규 회원을 모으고, 시즌 끝에 성과발표회를 엽니다.', body, mount(root) {
      bindForms(root, { async nr(v) { if (v.end_date < v.start_date) throw new Error('종료일이 시작일보다 빠릅니다'); await post('/admin/rounds', v); toast('만들었습니다'); reload(); } });
      bindActions(root, { async save(el) { const id = el.dataset.id; await put(`/admin/rounds/${id}`, { status: root.querySelector(`[name=st_${id}]`).value, recruit_until: root.querySelector(`[name=ru_${id}]`).value || null }); toast('저장했습니다'); } });
    } };
  },
};
