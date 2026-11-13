// 받은 일 — 가입 신청, 챌린지 심사, 합의서, 정산, 페이퍼, 승급, 이의·신고
import { api, post, esc, nl2br, toast, go, reload, field, textarea, check, bindForms, bindActions, num, won, fmtDate, ago, LEVEL_NAMES, FIELDS, lvChip, stageChip, typeChip, fieldChip, empty, modal, closeModal } from '../../core.js';
import { settleStatus } from '../group.js';
import { waitChip, qs, invalidateCounts } from './shared.js';

const FORM_LABELS = [['job', '하는 일'], ['years', '경력'], ['hours_weekday', '평일 가능 시간'], ['hours_weekend', '주말 가능 시간'], ['interests', '관심 분야'], ['experience', '경험'], ['why_group', '그룹에 대해'], ['share_opinion', '배분에 대한 생각'], ['side_job_check', '겸업 확인'], ['can_attend', '참석 가능'], ['give', '줄 수 있는 것'], ['referrer', '추천인'], ['question', '질문']];
function formValue(k, v) {
  if (k === 'interests') return esc(String(v).split(',').map(x => FIELDS[x.trim()] || x).join(', '));
  if (k === 'side_job_check') return esc({ yes: '확인했고 문제 없음', partial: '일부 제한 있음', no: '아직 확인 안 함', na: '해당 없음' }[v] || v);
  if (k === 'can_attend') return esc({ yes: '대부분 참석', some: '절반 정도', no: '온라인만' }[v] || v);
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

  async challenges() {
    const rows = await api('/admin/challenges');
    const s = (await api('/admin/settings')).settings;
    const maxScore = s.review_items.reduce((t, it) => t + it.weight * 5, 0);
    const body = rows.length ? rows.map(c => `<article class="card" style="margin-bottom:12px"><div class="row">${typeChip(c.type)}${stageChip(c.stage)}${fieldChip(c.field_code)}<span class="muted small">${ago(c.updated_at || c.created_at)}</span></div><h3 style="margin-top:6px">${esc(c.title)} <small class="muted">· ${esc(c.leader_nickname)}</small></h3><p class="small">${esc(c.summary || '')}</p>
      <details open><summary class="small" style="cursor:pointer">제안서 전문</summary><div class="app-form" style="margin-top:8px">${Object.entries(c.proposal).filter(([, v]) => v).map(([k, v]) => `<div><b>${esc(k)}</b><span>${nl2br(typeof v === 'object' ? JSON.stringify(v) : v)}</span></div>`).join('')}</div></details>
      ${c.stage === 'review' ? `<form class="form" data-form="rv" data-id="${c.id}" style="margin-top:12px"><h3 class="small">심사표 · 항목별 1~5점, 가중 합계 ${s.review_pass_score}점 이상이면 통과 (만점 ${maxScore}점)</h3><div class="table-wrap"><table class="tbl"><tbody>${s.review_items.map(it => `<tr><td>${esc(it.label)} <small class="muted">×${it.weight}</small></td><td class="score-row">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="s_${it.key}" value="${n}" ${n === 3 ? 'checked' : ''}> ${n}</label>`).join('')}</td></tr>`).join('')}<tr class="total"><td>가중 합계</td><td class="live-total">-</td></tr></tbody></table></div>
        <div class="row">${check('banned', '금지 유형 해당 (다단계·대출·도박·보장 표현 등)')}${check('conflict', '이해충돌 미해결')}</div>${field('의견 (제안자에게 그대로 전달됩니다)', textarea('comment', { rows: 2 }))}
        <div class="btn-row"><button class="btn primary" type="submit" name="decision" value="approve">승인 → 모집 시작</button><button class="btn" type="submit" name="decision" value="revise">보완 요청</button><button class="btn danger" type="submit" name="decision" value="reject">반려</button><a class="btn ghost" href="#/challenges/${c.id}">챌린지 화면</a></div></form>` : `<p class="small muted" style="margin-top:8px">보완 요청 상태 — 제안자가 다시 제출하기를 기다리는 중${c.review?.comment ? ` · 의견: ${esc(c.review.comment)}` : ''}</p>`}</article>`).join('') : empty('심사할 챌린지가 없습니다', '제안이 들어오면 여기에 쌓입니다');
    return { title: '챌린지 심사', sub: '제안서를 심사표로 평가합니다. 금지 유형이나 이해충돌이 있으면 점수와 관계없이 통과하지 않습니다.', body, mount(root) {
      root.querySelectorAll('form[data-form=rv]').forEach(f => { const upd = () => { let t = 0; for (const it of s.review_items) t += Number(f.querySelector(`[name=s_${it.key}]:checked`)?.value || 0) * it.weight; const el = f.querySelector('.live-total'); el.innerHTML = `<b>${Math.round(t * 10) / 10}점</b> ${t >= s.review_pass_score ? '<span class="chip green">통과 기준 이상</span>' : '<span class="chip amber">통과 기준 미달</span>'}`; }; f.addEventListener('change', upd); upd(); });
      bindForms(root, { async rv(d, f, sub) { const scores = {}; for (const it of s.review_items) scores[it.key] = Number(d['s_' + it.key]); const r = await post(`/admin/challenges/${f.dataset.id}/review`, { scores, banned: !!d.banned, conflict: !!d.conflict, comment: d.comment, decision: sub.value }); done(`처리했습니다 (합계 ${r.review.total}점)`); } });
    } };
  },

  async agreements() {
    const rows = await api('/admin/agreements');
    const body = rows.length ? rows.map(a => `<article class="card" style="margin-bottom:10px"><div class="row between"><h3 style="margin:0">${esc(a.title)} <small class="muted">v${a.version} · 그룹장 ${esc(a.leader)}</small></h3><span class="chip ${a.status === 'signed' ? 'blue' : 'amber'}">${{ draft: '서명 대기', signing: '서명 중', signed: '전원 서명' }[a.status] || a.status}</span></div>
      <dl class="kv" style="margin-top:10px"><div><dt>배분 프리셋</dt><dd>${esc(a.clauses.preset)} · 운영본부 ${Math.round(a.clauses.ratios.hq * 100)}% / 그룹장 ${Math.round(a.clauses.ratios.leader * 100)}% / 그룹원 풀 ${Math.round(a.clauses.ratios.pool * 100)}%</dd></div><div><dt>소유</dt><dd>${esc(a.clauses.ownership_type)}형</dd></div><div><dt>예산 상한</dt><dd>1인 ${won(a.clauses.budget_cap_person)} · 그룹 ${won(a.clauses.budget_cap_group)}</dd></div><div><dt>정산</dt><dd>${esc(a.clauses.settlement_mode)}</dd></div>${a.clauses.special_terms ? `<div><dt>특약</dt><dd>${nl2br(a.clauses.special_terms)}</dd></div>` : ''}</dl>
      <p class="small muted" style="margin:8px 0">확인할 것: 배분이 프리셋 ±10%p 안인지 · 소유와 이탈 조건이 분명한지 · 특약이 원칙(수익 보장 금지)과 충돌하지 않는지</p>
      <div class="btn-row"><a class="btn sm" href="#/groups/${a.challenge_id}/agreement">합의서 전문</a>${a.status === 'signed' ? `<button class="btn sm primary" data-act="ok" data-id="${a.id}">승인 → 챌린지 시작</button><button class="btn sm" data-act="back" data-id="${a.id}">보완 요청</button>` : ''}</div></article>`).join('') : empty('승인할 합의서가 없습니다', '그룹원 전원이 서명하면 여기에 올라옵니다');
    return { title: '합의서 승인', sub: '돈과 소유는 시작 전에 합의합니다. 전원 서명이 끝난 합의서를 확인하고 승인하면 챌린지가 시작됩니다.', body, mount(root) { bindActions(root, {
      async ok(el) { await post(`/admin/agreements/${el.dataset.id}`, { approve: true }); done('승인했습니다. 챌린지가 시작됩니다'); },
      back(el) { modal(`<h3>보완 요청</h3><form class="form" data-form="bk">${field('그룹장에게 보낼 의견', textarea('note', { rows: 3, required: true }))}<div class="btn-row"><button class="btn primary" type="submit">보내기</button><button class="btn" type="button" data-close-modal>취소</button></div></form>`, { onMount(m) { bindForms(m, { async bk(d) { await post(`/admin/agreements/${el.dataset.id}`, { approve: false, note: d.note }); closeModal(); done('보완을 요청했습니다'); } }); } }); },
    }); } };
  },

  async settlements() {
    const rows = await api('/admin/settlements');
    const body = rows.length ? `<div class="card"><div class="table-wrap"><table class="tbl"><thead><tr><th>챌린지</th><th>기간</th><th class="num">정산 가능 금액</th><th class="num">운영본부 몫</th><th>상태</th><th></th></tr></thead><tbody>${rows.map(s => `<tr><td><b>${esc(s.title)}</b><br><small class="muted">${ago(s.created_at)} 작성</small></td><td><small>${fmtDate(s.period_start)} ~ ${fmtDate(s.period_end)}</small></td><td class="num">${won(s.result.D)}</td><td class="num">${won(s.result.A)}</td><td>${settleStatus(s.status)}</td><td><a class="btn sm" href="#/settlements/${s.id}">정산표 열기</a></td></tr>`).join('')}</tbody></table></div></div>
      <p class="small muted" style="margin-top:10px">정산표에서 장부·증빙과 금액을 맞춰 보고 검수합니다. 검수가 끝난 지급 건은 <a href="#/admin/payouts">지급 관리</a>에서 입금 처리합니다.</p>` : empty('검수할 정산이 없습니다', '그룹장이 정산표를 만들면 그룹원 확인을 거쳐 여기에 올라옵니다');
    return { title: '정산 검수', sub: '그룹원 확인이 끝났거나 이의가 걸린 정산표입니다.', body };
  },

  async papers() {
    const rows = await api('/admin/papers');
    const body = rows.length ? rows.map(p => `<article class="card" style="margin-bottom:10px"><div class="row">${fieldChip(p.field_code)}${p.form.has_sales ? '<span class="chip green">매출 발생</span>' : '<span class="chip">매출 없음</span>'}${p.submitted_at ? waitChip(Math.floor((Date.now() - Date.parse(p.submitted_at.replace(' ', 'T') + 'Z')) / 86400e3), 5) : ''}</div><h3 style="margin-top:6px">${esc(p.title)} <small class="muted">· ${esc(p.leader)}</small></h3>
      <div class="app-form"><div><b>풀려던 문제</b><span>${esc(p.form.pain || '')}</span></div><div><b>숫자</b><span>외부 매출 ${won(p.form.revenue_external)} · 비용 ${won(p.form.expenses)} · 고객 ${num(p.form.customers)}명 · ${num(p.form.hours)}시간</span></div><div><b>잘된 것</b><span>${(p.form.good || []).map(esc).join(' / ') || '-'}</span></div><div><b>안 된 것</b><span>${(p.form.bad || []).map(esc).join(' / ') || '-'}</span></div></div>
      <p class="small muted" style="margin:8px 0">검토 기준: 수익 보장 표현이 없는지 · 다른 사람의 정보가 드러나지 않는지 · 숫자가 장부와 크게 어긋나지 않는지 · 안 된 것이 솔직하게 적혀 있는지</p>
      <form class="form" data-form="pr" data-id="${p.id}">${field('의견', textarea('note', { rows: 2 }))}<div class="btn-row"><button class="btn primary" type="submit" name="decision" value="approve">승인 · 공개</button><button class="btn" type="submit" name="decision" value="return">보완 요청</button><a class="btn ghost" href="#/groups/${p.challenge_id}/paper">전문 보기</a></div></form></article>`).join('') : empty('검토할 페이퍼가 없습니다');
    return { title: '페이퍼 검토', sub: '라운드가 끝나면 모든 챌린지가 페이퍼를 냅니다. 중단한 챌린지도 마찬가지입니다.', body, mount(root) { bindForms(root, { async pr(d, f, sub) { await post(`/admin/papers/${f.dataset.id}/review`, { decision: sub.value, note: d.note }); done('처리했습니다'); } }); } };
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
    const body = rows.length ? rows.map(d => `<article class="card" style="margin-bottom:10px"><div class="row between"><h3 style="margin:0">${d.ref_type === 'settlement' ? '정산 이의' : d.ref_type === 'report' ? '게시물 신고' : '기타'} <small class="muted">· ${esc(d.nickname)} · ${d.stage}차</small></h3><div class="row">${waitChip(Math.floor((Date.now() - Date.parse(d.created_at.replace(' ', 'T') + 'Z')) / 86400e3), 7)}<span class="chip ${d.status === 'open' ? 'red' : 'amber'}">${d.status === 'open' ? '접수' : '조정 중'}</span></div></div><p class="small" style="margin:8px 0">${nl2br(d.note || '')}</p>
      <div class="btn-row">${d.ref_type === 'settlement' ? `<a class="btn sm" href="#/settlements/${d.ref_id}">정산표</a>` : d.ref_type === 'report' ? `<a class="btn sm" href="#/community/posts/${d.ref_id}">게시물</a><a class="btn sm" href="#/admin/community">커뮤니티 관리</a>` : ''}${d.status === 'open' ? `<button class="btn sm" data-act="mediate" data-id="${d.id}">2차 조정 시작</button>` : ''}<button class="btn sm primary" data-act="resolve" data-id="${d.id}">종결</button></div></article>`).join('') : empty('처리할 이의·신고가 없습니다');
    return { title: '이의·신고', sub: '1차는 당사자끼리, 2차는 운영본부가 조정합니다. 결과는 기록으로 남깁니다.', body, mount(root) { bindActions(root, {
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
