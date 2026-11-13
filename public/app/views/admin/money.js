// 돈 — 지급 관리, 운영본부 재원
import { api, post, esc, toast, reload, field, input, select, bindForms, bindActions, num, won, fmtDate, ago, empty } from '../../core.js';
import { kpi, qs, invalidateCounts } from './shared.js';

const KIND = { leader: '그룹장 몫', member: '그룹원 몫', refund_member: '그룹원 비용 환급', refund_hq: '운영본부 선지원 회수', fee: '정산 대행 수수료', hq: '운영본부 몫' };

export const money = {
  async payouts({ query }) {
    const status = query.status || 'pending';
    const d = await api('/admin/payouts' + qs({ status }));
    const tot = Object.fromEntries(d.totals.map(t => [t.status, t]));
    const people = d.rows.filter(r => r.user_id);
    const hqRows = d.rows.filter(r => !r.user_id);
    const bySettlement = {};
    for (const r of people) (bySettlement[r.settlement_id] = bySettlement[r.settlement_id] || { title: r.title, leader: r.leader, sid: r.settlement_id, reviewed_at: r.reviewed_at, period: `${fmtDate(r.period_start)}~${fmtDate(r.period_end)}`, rows: [] }).rows.push(r);
    const groupsHtml = Object.values(bySettlement).map(g => `<section class="card flush" style="margin-bottom:12px"><div class="card-head pad"><div><h3><a href="#/settlements/${g.sid}">${esc(g.title)}</a></h3><small class="muted">${g.period} · 그룹장 ${esc(g.leader)}${g.reviewed_at ? ' · 검수 ' + ago(g.reviewed_at) : ''}</small></div>${status !== 'paid' ? `<label class="check small"><input type="checkbox" data-group="${g.sid}"> <span>이 정산 전체</span></label>` : ''}</div>
      <div class="table-wrap"><table class="tbl"><thead><tr>${status !== 'paid' ? '<th></th>' : ''}<th>받는 사람</th><th>항목</th><th class="num">세전</th><th class="num">원천징수</th><th class="num">실지급</th>${status === 'paid' ? '<th>지급일</th>' : ''}</tr></thead><tbody>
      ${g.rows.map(r => `<tr>${status !== 'paid' ? `<td><input type="checkbox" class="pick" data-sid="${g.sid}" value="${r.id}" aria-label="${esc(r.nickname)} 선택"></td>` : ''}<td><a href="#/admin/users/${r.user_id}"><b>${esc(r.nickname)}</b></a>${r.name ? ` <small class="muted">${esc(r.name)}</small>` : ''}</td><td>${KIND[r.kind] || r.kind}</td><td class="num">${won(r.gross)}</td><td class="num">${r.withholding ? won(r.withholding) + ` <small class="muted">${Math.round(r.withholding_rate * 1000) / 10}%</small>` : '-'}</td><td class="num"><b>${won(r.net)}</b></td>${status === 'paid' ? `<td><small>${fmtDate(r.paid_at, true)}</small></td>` : ''}</tr>`).join('')}
      </tbody></table></div></section>`).join('');
    const body = `
      <div class="kpi-grid kpi-3">
        ${kpi('지급 대기', won(tot.pending?.net || 0), `${num(tot.pending?.n || 0)}건`, { accent: status === 'pending', href: '#/admin/payouts?status=pending' })}
        ${kpi('보류', won(tot.held?.net || 0), `${num(tot.held?.n || 0)}건`, { href: '#/admin/payouts?status=held' })}
        ${kpi('지급 완료', won(tot.paid?.net || 0), `${num(tot.paid?.n || 0)}건 · 원천징수 ${won(tot.paid?.withholding || 0)}`, { href: '#/admin/payouts?status=paid' })}
      </div>
      <div class="toolbar"><div class="pill-tabs">${[['pending', '지급 대기'], ['held', '보류'], ['paid', '지급 완료']].map(([k, l]) => `<a href="#/admin/payouts?status=${k}" class="${status === k ? 'active' : ''}">${l}</a>`).join('')}</div><a class="btn sm" href="/api/admin/export?table=payouts" download>지급 내역 CSV</a></div>
      ${status !== 'paid' && d.rows.length ? `<div class="bulkbar sticky"><span class="small"><b class="sel-count">0</b>건 선택 · <b class="sel-sum">0원</b></span>${status === 'pending' ? '<button class="btn sm primary" data-act="bulk" data-to="paid">입금했어요 → 지급 처리</button><button class="btn sm" data-act="bulk" data-to="held">보류</button>' : '<button class="btn sm primary" data-act="bulk" data-to="pending">대기로 되돌리기</button>'}</div>` : ''}
      ${people.length ? groupsHtml : empty(status === 'pending' ? '지급할 건이 없습니다' : '해당하는 건이 없습니다', status === 'pending' ? '정산 검수가 끝나면 그룹원별 지급 건이 여기에 생깁니다' : '')}
      ${hqRows.length ? `<details class="card" style="margin-top:12px"><summary><b>운영본부로 들어오는 몫</b> <small class="muted">${hqRows.length}건 · ${won(hqRows.reduce((s, r) => s + r.net, 0))}</small></summary><div class="table-wrap" style="margin-top:8px"><table class="tbl"><tbody>${hqRows.map(r => `<tr><td>${esc(r.title)}</td><td>${KIND[r.kind] || r.kind}</td><td class="num">${won(r.net)}</td>${status !== 'paid' ? `<td><input type="checkbox" class="pick" value="${r.id}" aria-label="선택"></td>` : ''}</tr>`).join('')}</tbody></table></div><p class="small muted" style="margin:8px 0 0">운영본부 몫과 수수료는 <a href="#/admin/hq">운영본부 재원</a>의 분기별 수입으로 집계됩니다.</p></details>` : ''}
      <div class="card soft small" style="margin-top:12px"><b>지급 순서</b> · ① 정산표 검수 → ② 그룹원 계좌로 이체 (원천징수 대상은 세후 금액) → ③ 이 화면에서 지급 처리 → 받는 사람에게 알림이 갑니다. 계좌 정보는 사이트에 저장하지 않습니다. 각자에게 따로 받아 주세요.</div>`;
    return { title: '지급 관리', sub: '검수가 끝난 정산금을 입금하고 기록합니다.', body, mount(root) {
      const rowsById = Object.fromEntries(d.rows.map(r => [String(r.id), r]));
      const upd = () => { const picked = [...root.querySelectorAll('.pick:checked')]; const c = root.querySelector('.sel-count'), s = root.querySelector('.sel-sum'); if (c) c.textContent = picked.length; if (s) s.textContent = won(picked.reduce((t, p) => t + (rowsById[p.value]?.net || 0), 0)); };
      root.addEventListener('change', e => { const g = e.target.closest('[data-group]'); if (g) root.querySelectorAll(`.pick[data-sid="${g.dataset.group}"]`).forEach(p => { p.checked = g.checked; }); upd(); });
      bindActions(root, { async bulk(el) {
        const ids = [...root.querySelectorAll('.pick:checked')].map(p => Number(p.value));
        if (!ids.length) throw new Error('처리할 건을 골라 주세요');
        const sum = ids.reduce((t, id) => t + (rowsById[id]?.net || 0), 0);
        const msg = { paid: `${ids.length}건, 모두 ${won(sum)}을 입금했나요? 지급 처리하면 받는 사람에게 알림이 갑니다.`, held: `${ids.length}건을 보류할까요?`, pending: `${ids.length}건을 지급 대기로 되돌릴까요?` }[el.dataset.to];
        if (!confirm(msg)) return;
        await post('/admin/payouts/bulk', { ids, status: el.dataset.to }); invalidateCounts(); toast('처리했습니다'); reload();
      } });
    } };
  },

  async hq() {
    const d = await api('/admin/hq');
    const cats = d.categories;
    const q = d.quarters;
    const today = new Date().toISOString().slice(0, 10);
    const totIn = q.reduce((s, r) => s + r.income, 0), totOut = q.reduce((s, r) => s + r.spent, 0);
    const body = `
      <div class="kpi-grid kpi-3">${kpi('누적 수입', won(totIn), '운영본부 몫 + 정산 대행 수수료')}${kpi('누적 사용', won(totOut), `${d.expenses.length}건 기록`)}${kpi('남은 재원', won(totIn - totOut), totIn - totOut < 0 ? '선지원 등으로 사용이 더 많습니다' : '', { accent: true })}</div>
      <section class="card flush"><div class="card-head pad"><h3>분기별 수입과 쓰임</h3><a class="small" href="/rules/#hq-report" target="_blank" rel="noopener">공개 화면 보기</a></div>
        ${q.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>분기</th><th class="num">운영본부 몫</th><th class="num">수수료</th><th class="num">수입 합계</th>${Object.values(cats).map(l => `<th class="num">${esc(l)}</th>`).join('')}<th class="num">사용 합계</th></tr></thead><tbody>
          ${q.map(r => `<tr><td><b>${esc(r.quarter.replace('-Q', '년 ') + '분기')}</b></td><td class="num">${won(r.hq_share)}</td><td class="num">${won(r.fee)}</td><td class="num"><b>${won(r.income)}</b></td>${Object.keys(cats).map(k => `<td class="num">${r.by_category[k] ? won(r.by_category[k]) : '-'}</td>`).join('')}<td class="num"><b>${won(r.spent)}</b></td></tr>`).join('')}
        </tbody></table></div>` : '<p class="muted small pad">아직 정산 수입이나 사용 기록이 없습니다.</p>'}
      </section>
      <div class="adm-two" style="margin-top:14px">
        <form class="card form" data-form="ex"><h3>쓴 돈 기록</h3><div class="form-cols">${field('사용일', input('spent_on', { type: 'date', value: today, required: true }))}${field('항목', select('category', Object.entries(cats)))}</div>${field('금액 (원)', input('amount', { type: 'number', min: 1, required: true }))}${field('내용', input('memo', { placeholder: '예: 1기 사례집 인쇄 200부' }))}${field('증빙', input('evidence', { placeholder: '영수증 보관 위치나 링크' }))}<button class="btn primary" type="submit">기록</button></form>
        <section class="card"><div class="card-head"><h3>최근 기록</h3></div><div class="list">${d.expenses.slice(0, 30).map(e => `<div class="list-item"><div class="grow"><div class="title">${won(e.amount)} <small class="muted">· ${esc(cats[e.category] || e.category)}</small></div><div class="meta">${fmtDate(e.spent_on)} · ${esc(e.memo || '')}${e.evidence ? ' · 증빙 ' + esc(e.evidence) : ''} · ${esc(e.author || '')}</div></div><button class="btn sm ghost" data-act="del" data-id="${e.id}" data-confirm="이 기록을 지울까요? 공개 보고에서도 빠집니다.">지우기</button></div>`).join('') || '<p class="muted small">기록이 없습니다.</p>'}</div></section>
      </div>
      <p class="small muted" style="margin-top:10px">수익 배분 규칙 페이지에 최근 4개 분기의 수입과 항목별 쓰임이 공개됩니다. 운영본부 몫은 사례집·강사비·홈페이지 운영·다음 라운드 선지원에만 씁니다.</p>`;
    return { title: '운영본부 재원', sub: '정산에서 들어온 운영본부 몫을 어디에 썼는지 분기마다 공개합니다.', body, mount(root) {
      bindForms(root, { async ex(v) { await post('/admin/hq/expenses', v); toast('기록했습니다'); reload(); } });
      bindActions(root, { async del(el) { await api('/admin/hq/expenses/' + el.dataset.id, { method: 'DELETE' }); toast('지웠습니다'); reload(); } });
    } };
  },
};
