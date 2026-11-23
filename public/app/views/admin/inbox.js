// 받은 일 — 가입 신청, 그룹리더 신청, 매출 확인, 발표 신청, 페이퍼, 승급, 이의·신고
import { api, post, esc, nl2br, toast, go, reload, field, textarea, check, bindForms, bindActions, num, won, fmtDate, fmtLocal, ago, LEVEL_NAMES, FIELDS, TYPE, EVENT_TYPES, lvChip, stageChip, typeChip, fieldChip, metricVal, empty, modal, closeModal } from '../../core.js';
import { waitChip, qs, invalidateCounts } from './shared.js';

const FORM_LABELS = [['job', '하는 일'], ['years', '경력'], ['hours_weekday', '평일 가능 시간'], ['hours_weekend', '주말 가능 시간'], ['interests', '관심 분야'], ['experience', '경험'], ['why_group', '그룹에 대해'], ['want_group', '관심 있는 그룹'], ['project_idea', '해 보고 싶은 것'], ['share_opinion', '(예전 문항) 수익 나눔에 대한 생각'], ['side_job_check', '겸업 확인'], ['can_attend', '참석 가능'], ['give', '줄 수 있는 것'], ['referrer', '추천인'], ['question', '질문']];
function formValue(k, v) {
  if (k === 'interests') return esc(String(v).split(',').map(x => FIELDS[x.trim()] || x).join(', '));
  if (k === 'side_job_check') return esc({ yes: '확인했고 문제 없음', partial: '일부 제한 있음', no: '아직 확인 안 함', na: '해당 없음' }[v] || v);
  if (k === 'can_attend') return esc({ yes: '대부분 참석', some: '절반 정도', no: '온라인만' }[v] || v);
  if (k === 'want_group') return esc({ study: '학습그룹', challenge: '도전그룹', both: '둘 다', meetup: '우선 정기모임부터' }[v] || v);
  return nl2br(v);
}
const inviteMessage = (code, email) => `안녕하세요, 마이챌린지(마챌) 운영본부입니다.\n가입 신청이 승인되었습니다.\n\n가입 페이지: ${location.origin}/app/#/register\n초대 코드: ${code}\n\n지원서에 적은 이메일(${email})로 가입해 주세요. 가입 후 5분짜리 오리엔테이션을 마치면 챌린저(L1)가 됩니다.`;
function copyBtn(text, label = '복사') { return `<button class="btn sm" type="button" data-copy="${esc(text)}">${label}</button>`; }
function bindCopy(root) { root.addEventListener('click', async e => { const b = e.target.closest('[data-copy]'); if (!b) return; try { await navigator.clipboard.writeText(b.dataset.copy); toast('복사했습니다'); } catch { toast('복사하지 못했습니다. 직접 선택해 복사해 주세요', true); } }); }
const done = msg => { invalidateCounts(); toast(msg); reload(); };

export const inbox = {
  async applications({ query }) {
    const status = query.status || 'pending';
    const rows = await api('/admin/applications' + qs({ status, q: query.q }));
    const tabs = [['pending', '대기'], ['approved', '승인 · 가입 전'], ['joined', '가입 완료'], ['rejected', '반려']];
    const body = `<div class="toolbar"><div class="pill-tabs">${tabs.map(([k, l]) => `<a href="#/admin/applications${qs({ status: k, q: query.q })}" class="${status === k ? 'active' : ''}">${l}</a>`).join('')}</div>
      <form class="toolbar-search" data-form="q"><input type="search" name="q" value="${esc(query.q || '')}" placeholder="이름·이메일"><button class="btn sm" type="submit">찾기</button></form></div>
      ${status === 'pending' && rows.length ? `<div class="bulkbar"><label class="check"><input type="checkbox" data-all> <span>전체 선택</span></label><button class="btn sm primary" data-act="bulk">선택한 신청 승인</button><span class="muted small">지원서를 읽고 고른 것만 승인하세요. 반려는 한 건씩 사유를 남깁니다.</span></div>` : ''}
      ${rows.length ? rows.map(a => `<article class="card app-card" style="margin-bottom:10px">
        <div class="row between"><div class="row">${status === 'pending' ? `<input type="checkbox" class="pick" value="${a.id}" aria-label="${esc(a.name)} 선택">` : ''}<h3 style="margin:0">${esc(a.name)} <small class="muted">${esc(a.email)}${a.phone ? ' · ' + esc(a.phone) : ''}</small></h3></div>
          <div class="row">${status === 'pending' ? waitChip(a.waiting_days, 3) : `<span class="muted small">${fmtDate(a.decided_at || a.created_at)}</span>`}${a.notes ? `<span class="chip blue">메모 ${a.notes}</span>` : ''}</div></div>
        <div class="app-form">${FORM_LABELS.filter(([k]) => a.form[k]).map(([k, l]) => `<div><b>${l}</b><span>${formValue(k, a.form[k])}</span></div>`).join('')}</div>
        ${a.status === 'approved' ? `<div class="notice ok" style="margin-top:10px">초대 코드 <span class="kbd">${esc(a.invite_code)}</span> · 아직 가입하지 않았습니다. ${copyBtn(inviteMessage(a.invite_code, a.email), '안내문 복사')}</div>` : ''}
        ${a.note ? `<p class="small muted" style="margin:8px 0 0">처리 메모: ${esc(a.note)}</p>` : ''}
        <div class="btn-row" style="margin-top:10px">${a.status === 'pending' ? `<button class="btn primary sm" data-act="approve" data-id="${a.id}">승인 → 초대 코드 발급</button><button class="btn sm" data-act="reject" data-id="${a.id}">반려</button>` : ''}<button class="btn sm ghost" data-act="notes" data-id="${a.id}" data-name="${esc(a.name)}">내부 메모</button></div>
      </article>`).join('') : empty(query.q ? '찾는 신청이 없습니다' : '해당 상태의 신청이 없습니다', status === 'pending' ? '새 신청이 들어오면 운영진 모두에게 알림이 갑니다' : '')}`;
    const codesModal = list => modal(`<h3>초대 코드가 발급됐습니다</h3><p class="small">각자에게 아래 안내문을 보내 주세요. 코드는 신청서 이메일로만 가입할 수 있습니다.</p>
      <div class="stack">${list.map(r => `<div class="card soft" style="padding:12px"><div class="row between"><b>${esc(r.name || r.email)}</b>${copyBtn(inviteMessage(r.invite_code, r.email), '안내문 복사')}</div><div class="small muted">${esc(r.email)} · <span class="kbd">${esc(r.invite_code)}</span></div></div>`).join('')}</div>
      <div class="btn-row" style="margin-top:14px"><button class="btn primary" data-close-modal>닫기</button></div>`, { onMount: bindCopy });
    return { title: '가입 신청', sub: '지원서를 읽고 3일 안에 승인하거나 반려합니다. 승인하면 초대 코드가 만들어집니다.', body, mount(root) {
      bindCopy(root);
      bindForms(root, { q(d) { go('#/admin/applications' + qs({ status, q: d.q })); } });
      const all = root.querySelector('[data-all]'); if (all) all.addEventListener('change', () => root.querySelectorAll('.pick').forEach(c => { c.checked = all.checked; }));
      bindActions(root, {
        async approve(el) { const r = await post(`/admin/applications/${el.dataset.id}`, { decision: 'approve' }); const a = rows.find(x => x.id === Number(el.dataset.id)); invalidateCounts(); codesModal([{ ...r, name: a?.name }]); afterClose(reload); },
        async bulk() { const ids = [...root.querySelectorAll('.pick:checked')].map(c => Number(c.value)); if (!ids.length) throw new Error('승인할 신청을 골라 주세요'); if (!confirm(`${ids.length}건을 승인할까요?`)) return; const r = await post('/admin/applications/bulk', { ids }); invalidateCounts(); codesModal(r.approved); afterClose(reload); },
        reject(el) { modal(`<h3>반려</h3><form class="form" data-form="rj">${field('사유 (내부 기록)', textarea('note', { rows: 2, required: true, placeholder: '예: 겸업 금지 조항 확인 필요 — 확인 후 재지원 안내' }))}<p class="small muted" style="margin:0">반려 사실은 직접 연락해 알려 주세요. 처리 후 6개월이 지나면 신청서는 자동 파기됩니다.</p><div class="btn-row"><button class="btn danger" type="submit">반려</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async rj(d) { await post(`/admin/applications/${el.dataset.id}`, { decision: 'reject', note: d.note }); closeModal(); done('반려했습니다'); } }); } }); },
        notes(el) { notesModal('application', Number(el.dataset.id), `${el.dataset.name} 신청서 메모`); },
      });
    } };
  },

  async leaders({ query }) {
    const view = query.view === 'decided' ? 'decided' : 'pending';
    const d = await api('/admin/leaders' + qs({ view }));
    const tabs = [['pending', '대기'], ['decided', '처리함']];
    const appCard = a => `<article class="card" style="margin-bottom:10px">
      <div class="row between"><h3 style="margin:0"><a href="#/admin/users/${a.user_id}">${esc(a.nickname)}</a> ${lvChip(a.level)} <small class="muted">${esc(a.name || '')}</small></h3>
        <div class="row">${a.status === 'pending' ? waitChip(Math.floor((Date.now() - Date.parse(a.created_at.replace(' ', 'T') + 'Z')) / 86400e3), 5) : `<span class="chip ${a.status === 'approved' ? 'green' : 'red'}">${a.status === 'approved' ? '승인' : '반려'}</span> <span class="muted small">${fmtDate(a.decided_at)}</span>`}</div></div>
      <div class="app-form" style="margin-top:8px">${[['그룹 종류', esc(TYPE[a.form.kind] || a.form.kind || '-')], ['주제', esc(a.form.topic || '')], ['분야', esc(FIELDS[a.form.field_code] || '-')], ['운영 계획', nl2br(a.form.plan || '')], ['관련 경험', nl2br(a.form.experience || '-')], ['쓸 수 있는 시간', esc(a.form.time || '-')]].map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join('')}</div>
      <p class="small muted" style="margin:8px 0">활동 기록 · 정기모임 출석 ${num(a.events_attended)} · 그룹 모임 출석 ${num(a.sessions_attended)} · 도전 기록 ${num(a.logs)} · 그룹 완주 ${num(a.completions)} · 가입 ${fmtDate(a.joined_at)}</p>
      ${a.note && a.status !== 'pending' ? `<p class="small" style="margin:0 0 8px">처리 메모: ${esc(a.note)}</p>` : ''}
      ${a.status === 'pending' ? `<form class="form" data-form="lead" data-id="${a.id}">${field('신청자에게 보낼 말', textarea('note', { rows: 2, placeholder: '승인이면 환영 인사나 첫 그룹 운영 팁, 반려면 이유와 다시 신청할 때 보완할 점' }))}<div class="btn-row"><button class="btn primary" type="submit" name="decision" value="approve">승인 → 그룹 만들기 가능</button><button class="btn" type="submit" name="decision" value="reject">반려</button><button class="btn ghost" type="button" data-act="notes" data-id="${a.user_id}" data-name="${esc(a.nickname)}">내부 메모</button></div></form>` : ''}
    </article>`;
    const body = `<div class="toolbar"><div class="pill-tabs">${tabs.map(([k, l]) => `<a href="#/admin/leaders${qs({ view: k })}" class="${view === k ? 'active' : ''}">${l}</a>`).join('')}</div></div>
      <div class="adm-two"><div>${d.applications.length ? d.applications.map(appCard).join('') : empty(view === 'pending' ? '검토할 그룹리더 신청이 없습니다' : '처리한 신청이 없습니다', view === 'pending' ? '회원이 내 정보 → 그룹리더에서 신청하면 여기에 올라옵니다' : '')}</div>
      <div><div class="card"><h3>승인된 그룹리더 ${d.leaders.length}명</h3>${d.leaders.length ? `<div class="list">${d.leaders.map(l => `<a class="list-item" href="#/admin/users/${l.id}" style="color:inherit"><div class="grow"><div class="title">${esc(l.nickname)} ${lvChip(l.level)}</div><div class="meta">${l.leader_since ? fmtDate(l.leader_since) + ' 승인 · ' : ''}진행 ${l.running} · 마친 그룹 ${l.closed}</div></div></a>`).join('')}</div>` : '<p class="small muted" style="margin:0">아직 없습니다.</p>'}
        <p class="small muted" style="margin:10px 0 0">회원 화면에서 신청 없이 바로 자격을 주거나 거둘 수도 있습니다.</p></div>
        <div class="card soft small" style="margin-top:12px"><b>승인할 때 보는 것</b><ul class="rule-list"><li>정기모임이나 그룹에 꾸준히 나왔는지</li><li>주제가 구체적이고, 목표를 숫자나 결과물로 말할 수 있는지</li><li>모임 주기와 시간을 현실적으로 잡았는지</li><li>수익을 보장하거나 과장하는 표현이 없는지</li></ul></div></div></div>`;
    return { title: '그룹리더 신청', sub: '승인된 그룹리더는 언제든 학습그룹이나 도전그룹을 만들 수 있습니다. 5일 안에 답해 주세요.', body, mount(root) {
      bindForms(root, { async lead(f, form, sub) { await post(`/admin/leader-applications/${form.dataset.id}`, { decision: sub.value, note: f.note }); done(sub.value === 'approve' ? '승인했습니다' : '반려했습니다'); } });
      bindActions(root, { notes(el) { notesModal('user', Number(el.dataset.id), `${el.dataset.name} 메모`); } });
    } };
  },

  async results({ query }) {
    const all = query.view === 'all';
    const rows = await api('/admin/results' + qs({ view: all ? 'all' : '' }));
    const tabs = [['', '확인 대기 (매출)'], ['all', '전체 성과 기록']];
    const body = `<div class="toolbar"><div class="pill-tabs">${tabs.map(([k, l]) => `<a href="#/admin/results${qs({ view: k })}" class="${(all ? 'all' : '') === k ? 'active' : ''}">${l}</a>`).join('')}</div></div>
      ${rows.length ? `<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>그룹</th><th>기록</th><th class="num">값</th><th>증빙</th><th>기록한 사람</th><th>상태</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td><a href="#/admin/groups/${r.challenge_id}">${esc(r.group_title)}</a><br><small class="muted">${esc(TYPE[r.group_type] || '')}</small></td><td>${esc(r.metric_name)}${r.label ? `<br><small class="muted">${esc(r.label)}</small>` : ''}</td><td class="num"><b>${metricVal(r.metric, r.value, r.unit)}</b><br><small class="muted">${fmtDate(r.happened_on)}</small></td>
          <td><span class="detail-cell small">${r.evidence ? (/^https?:\/\//.test(r.evidence) ? `<a href="${esc(r.evidence)}" target="_blank" rel="noopener">증빙 열기</a>` : esc(r.evidence)) : '<span class="muted">없음</span>'}</span></td><td>${esc(r.nickname)}<br><small class="muted">${ago(r.created_at)}</small></td>
          <td>${r.verified_at ? '<span class="chip green">확인함</span>' : r.metric === 'revenue' ? waitChip(Math.floor((Date.now() - Date.parse(r.created_at.replace(' ', 'T') + 'Z')) / 86400e3), 7) : '<span class="muted small">확인 대상 아님</span>'}</td>
          <td class="btn-cell">${!r.verified_at && r.metric === 'revenue' ? `<button class="btn sm primary" data-act="verify" data-gid="${r.challenge_id}" data-id="${r.id}">확인</button>` : ''}${!r.verified_at ? `<button class="btn sm ghost" data-act="del" data-gid="${r.challenge_id}" data-id="${r.id}" data-confirm="이 기록을 지울까요? 기록한 사람에게는 따로 알려 주세요.">지우기</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : empty(all ? '성과 기록이 없습니다' : '확인할 매출 기록이 없습니다', '그룹원이 목표·성과 탭에서 매출을 기록하면 여기에 올라옵니다')}
      <div class="card soft small" style="margin-top:12px"><b>매출 확인 기준</b><ul class="rule-list"><li>그룹 밖의 고객에게서 받은 돈인지 (가족·지인·그룹원 간 거래는 확인하지 않습니다)</li><li>입금 화면, 판매 플랫폼 정산 내역, 세금계산서처럼 돈이 오간 흔적이 있는지</li><li>금액을 확인할 수 없으면 그룹리더에게 먼저 물어봅니다</li></ul><p class="muted" style="margin:6px 0 0">확인하면 그 그룹의 활동 중인 그룹원 모두에게 첫 매출 배지가 나갑니다 (이미 받은 사람 제외).</p></div>`;
    return { title: '매출 확인', sub: '도전그룹의 최종 목표는 성과와 수익입니다. 그룹이 기록한 매출을 증빙과 맞춰 보고 확인합니다.', body, mount(root) { bindActions(root, {
      async verify(el) { const r = await post(`/groups/${el.dataset.gid}/results/${el.dataset.id}`, { action: 'verify' }); done(r.granted?.length ? `확인했습니다. 첫 매출 배지 ${r.granted.length}명` : '확인했습니다'); },
      async del(el) { await post(`/groups/${el.dataset.gid}/results/${el.dataset.id}`, { action: 'delete' }); done('지웠습니다'); },
    }); } };
  },

  async presentations() {
    const rows = await api('/admin/presentations');
    const byEvent = {};
    for (const p of rows) (byEvent[p.event_id] ||= { id: p.event_id, title: p.event_title, type: p.event_type, starts_at: p.starts_at, list: [] }).list.push(p);
    const ST = { applied: ['검토 중', 'amber'], confirmed: ['확정', 'blue'], presented: ['발표함', 'green'], declined: ['이번엔 어려움', ''] };
    const body = Object.values(byEvent).length ? Object.values(byEvent).map(e => `<div class="card" style="margin-bottom:12px"><div class="card-head"><h3>${esc(e.title)} <small class="muted">${esc(EVENT_TYPES[e.type] || e.type)} · ${fmtLocal(e.starts_at)}</small></h3><a class="small" href="#/admin/events/${e.id}">일정 보기</a></div>
      <div class="list">${e.list.map(p => `<div class="list-item"><div class="grow"><div class="title">${esc(p.title)} <span class="chip ${ST[p.status][1]}">${ST[p.status][0]}</span></div><div class="meta">${esc(p.nickname)}${p.group_title ? ` · 그룹 「${esc(p.group_title)}」` : ' · 개인 발제'} · ${ago(p.created_at)}${p.link ? ` · <a href="${esc(p.link)}" target="_blank" rel="noopener">자료</a>` : ''}</div>${p.summary ? `<div class="small" style="margin-top:4px">${nl2br(p.summary)}</div>` : ''}</div>
        <div class="btn-row">${p.status === 'applied' ? `<button class="btn sm primary" data-act="st" data-id="${p.id}" data-s="confirmed">확정</button><button class="btn sm" data-act="decline" data-id="${p.id}">이번엔 어려움</button>` : ''}${p.status === 'confirmed' ? `<button class="btn sm primary" data-act="st" data-id="${p.id}" data-s="presented">발표함 (포인트)</button><button class="btn sm ghost" data-act="st" data-id="${p.id}" data-s="applied">확정 취소</button>` : ''}</div></div>`).join('')}</div></div>`).join('')
      : empty('처리할 발표 신청이 없습니다', '회원이 정기모임·일정 화면에서 발제나 그룹 발표를 신청하면 여기에 모입니다');
    return { title: '발표 신청', sub: '정기모임 발제와 성과발표회 그룹 발표를 확정합니다. 일정 3일 전까지 정해 주세요. 발표를 마치면 "발표함"을 눌러 포인트를 줍니다.', body, mount(root) { bindActions(root, {
      async st(el) { await post(`/admin/presentations/${el.dataset.id}`, { status: el.dataset.s }); done('바꿨습니다'); },
      decline(el) { modal(`<h3>이번엔 어려움</h3><form class="form" data-form="dc">${field('신청자에게 보낼 말', textarea('note', { rows: 2, placeholder: '예: 이번 정기모임은 발제가 다 찼습니다. 다음 달에 먼저 순서를 드릴게요.' }))}<div class="btn-row"><button class="btn primary" type="submit">보내기</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`,
        { onMount(m) { bindForms(m, { async dc(d) { await post(`/admin/presentations/${el.dataset.id}`, { status: 'declined', note: d.note }); closeModal(); done('알렸습니다'); } }); } }); },
    }); } };
  },

  async papers() {
    const rows = await api('/admin/papers');
    const body = rows.length ? rows.map(p => `<article class="card" style="margin-bottom:10px"><div class="row">${fieldChip(p.field_code)}${p.form.has_sales ? '<span class="chip green">매출 발생</span>' : '<span class="chip">매출 없음</span>'}${p.submitted_at ? waitChip(Math.floor((Date.now() - Date.parse(p.submitted_at.replace(' ', 'T') + 'Z')) / 86400e3), 5) : ''}</div><h3 style="margin-top:6px">${esc(p.title)} <small class="muted">· ${esc(p.leader)}</small></h3>
      <div class="app-form"><div><b>문제 · 배우려던 것</b><span>${esc(p.form.pain || '')}</span></div><div><b>숫자</b><span>매출 ${won(p.form.revenue_external)} · 비용 ${won(p.form.expenses)} · 고객 ${num(p.form.customers)}명 · ${num(p.form.hours)}시간</span></div><div><b>잘된 것</b><span>${(p.form.good || []).map(esc).join(' / ') || '-'}</span></div><div><b>안 된 것</b><span>${(p.form.bad || []).map(esc).join(' / ') || '-'}</span></div></div>
      <p class="small muted" style="margin:8px 0">검토 기준: 수익 보장 표현이 없는지 · 다른 사람의 정보가 드러나지 않는지 · 숫자가 성과 기록과 크게 어긋나지 않는지 · 안 된 것이 솔직하게 적혀 있는지</p>
      <form class="form" data-form="pr" data-id="${p.id}">${field('의견', textarea('note', { rows: 2 }))}<div class="btn-row"><button class="btn primary" type="submit" name="decision" value="approve">승인 · 공개</button><button class="btn" type="submit" name="decision" value="return">보완 요청</button><a class="btn ghost" href="#/groups/${p.challenge_id}/paper">전문 보기</a></div></form></article>`).join('') : empty('검토할 페이퍼가 없습니다');
    return { title: '페이퍼 검토', sub: '그룹을 마치면 그룹리더가 페이퍼를 냅니다. 목표에 닿지 못한 그룹도 마찬가지입니다.', body, mount(root) { bindForms(root, { async pr(d, f, sub) { await post(`/admin/papers/${f.dataset.id}/review`, { decision: sub.value, note: d.note }); done('처리했습니다'); } }); } };
  },

  async promotions() {
    const rows = await api('/admin/promotions');
    const body = rows.length ? rows.map(r => `<article class="card" style="margin-bottom:10px"><div class="row between"><h3 style="margin:0"><a href="#/admin/users/${r.user_id}">${esc(r.nickname)}</a> ${lvChip(r.level)} → <span class="lv lv-${r.target_level}">${LEVEL_NAMES[r.target_level]}</span></h3>${waitChip(Math.floor((Date.now() - Date.parse(r.created_at.replace(' ', 'T') + 'Z')) / 86400e3), 7)}</div>
      <div class="app-form" style="margin-top:8px"><div><b>신청 내용</b><span>${nl2br(r.note || '')}</span></div>${r.evidence ? `<div><b>증빙</b><span>${nl2br(r.evidence)}</span></div>` : ''}</div>
      <div class="check-list">${r.progress.items.map(i => `<div class="${i.done ? 'ok' : ''}"><span>${i.done ? '✓' : '·'}</span>${esc(i.label)} ${i.manual ? '<small class="muted">(심사에서 확인)</small>' : `<small class="muted">${num(i.cur)} / ${num(i.goal)}</small>`}</div>`).join('')}</div>
      <div style="margin:8px 0"><span class="chip ${r.progress.eligible ? 'green' : 'amber'}">${r.progress.eligible ? '기록상 조건 충족' : '기록상 조건 미충족 — 보류를 권합니다'}</span></div>
      <form class="form" data-form="pm" data-id="${r.id}">${field('결정 사유 (신청자에게 전달)', textarea('note', { rows: 2 }))}<div class="btn-row"><button class="btn primary" type="submit" name="decision" value="approve">승인</button><button class="btn" type="submit" name="decision" value="hold">보류</button><button class="btn danger" type="submit" name="decision" value="reject">반려</button></div></form></article>`).join('') : empty('대기 중인 승급 신청이 없습니다', 'L1→L2는 조건을 채우면 자동으로 올라갑니다. L3 이상만 심사합니다');
    return { title: '승급 심사', sub: '등급은 실행 기록으로 올라갑니다. 보류·반려에는 사유를 꼭 남깁니다.', body, mount(root) { bindForms(root, { async pm(d, f, sub) { await post(`/admin/promotions/${f.dataset.id}`, { decision: sub.value, note: d.note }); done('처리했습니다'); } }); } };
  },

  async disputes() {
    const rows = await api('/admin/disputes');
    const body = rows.length ? rows.map(d => `<article class="card" style="margin-bottom:10px"><div class="row between"><h3 style="margin:0">${{ settlement: '예전 정산 이의', report: '게시물 신고', removal: '그룹 퇴출 이의' }[d.ref_type] || '기타'} <small class="muted">· ${esc(d.nickname)} · ${d.stage}차</small></h3><div class="row">${waitChip(Math.floor((Date.now() - Date.parse(d.created_at.replace(' ', 'T') + 'Z')) / 86400e3), 7)}<span class="chip ${d.status === 'open' ? 'red' : 'amber'}">${d.status === 'open' ? '접수' : '조정 중'}</span></div></div><p class="small" style="margin:8px 0">${nl2br(d.note || '')}</p>
      <div class="btn-row">${d.ref_type === 'removal' && d.group_id ? `<a class="btn sm" href="#/admin/groups/${d.group_id}">그룹 출석·경고 보기</a>` : d.ref_type === 'report' ? `<a class="btn sm" href="#/community/posts/${d.ref_id}">게시물</a><a class="btn sm" href="#/admin/community">커뮤니티 관리</a>` : ''}${d.status === 'open' ? `<button class="btn sm" data-act="mediate" data-id="${d.id}">2차 조정 시작</button>` : ''}<button class="btn sm primary" data-act="resolve" data-id="${d.id}">종결</button></div></article>`).join('') : empty('처리할 이의·신고가 없습니다');
    return { title: '이의·신고', sub: '그룹 퇴출에 대한 이의와 게시물 신고입니다. 퇴출 이의는 출석 기록과 경고 사유를 보고 그룹리더와 이야기한 뒤 결정합니다. 다시 받아야 하면 그룹 화면에서 복귀시킵니다.', body, mount(root) { bindActions(root, {
      async mediate(el) { await post(`/admin/disputes/${el.dataset.id}`, { status: 'mediating', stage: 2 }); done('2차 조정을 시작했습니다'); },
      resolve(el) { modal(`<h3>종결</h3><form class="form" data-form="rs">${field('결과 기록', textarea('result', { rows: 3, required: true }))}<div class="btn-row"><button class="btn primary" type="submit">종결</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async rs(d) { await post(`/admin/disputes/${el.dataset.id}`, { status: 'resolved', result: d.result }); closeModal(); done('종결했습니다'); } }); } }); },
    }); } };
  },
};

// 모달이 닫힐 때 화면을 새로 그린다
function afterClose(fn) {
  const root = document.getElementById('modal-root');
  const obs = new MutationObserver(() => { if (!root.firstChild) { obs.disconnect(); fn(); } });
  obs.observe(root, { childList: true });
}

export async function notesModal(refType, refId, title) {
  const notes = await api(`/admin/notes?ref_type=${refType}&ref_id=${refId}`);
  modal(`<h3>${esc(title)}</h3><form class="form" data-form="n">${textarea('body', { rows: 3, required: true, placeholder: '운영진만 보는 메모입니다' })}<div class="btn-row"><button class="btn primary" type="submit">남기기</button><button class="btn" type="button" data-close-modal>닫기</button></div></form>
    <div class="list" style="margin-top:10px">${notes.map(n => `<div class="list-item"><div class="grow"><div class="small">${nl2br(n.body)}</div><div class="meta">${esc(n.author || '-')} · ${fmtDate(n.created_at, true)}</div></div></div>`).join('') || '<p class="muted small">아직 메모가 없습니다.</p>'}</div>`,
    { onMount(m) { bindForms(m, { async n(d) { await post('/admin/notes', { ref_type: refType, ref_id: refId, body: d.body }); toast('메모를 남겼습니다'); notesModal(refType, refId, title); } }); } });
}
