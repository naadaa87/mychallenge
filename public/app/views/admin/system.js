// 설정 — 규칙 설정(입력 양식), 감사 로그, 데이터·백업
import { api, put, esc, toast, reload, field, input, select, bindForms, bindActions, num, won, fmtDate, LEVEL_NAMES, LEVELS, state } from '../../core.js';
import { getCounts, askReason, qs, actionLabel, ACTION_GROUPS, targetLink, fmtDetail } from './shared.js';

const pctIn = (name, v, { step = 0.1, min = 0, max = 100 } = {}) => `<div class="unit-input"><input type="number" name="${name}" value="${Math.round(v * 10000) / 100}" step="${step}" min="${min}" max="${max}"><span>%</span></div>`;
const wonIn = (name, v) => `<div class="unit-input"><input type="number" name="${name}" value="${v}" step="1000" min="0"><span>원</span></div>`;
const intIn = (name, v, unit = '', min = 0) => `<div class="unit-input"><input type="number" name="${name}" value="${v}" step="1" min="${min}"><span>${unit}</span></div>`;
const pct = v => Math.round(Number(v) * 100) / 10000;
const VIS = [['card', '챌린지 카드 보기'], ['group_logs', '다른 그룹의 기록 열람'], ['paper_full', '페이퍼 전문 열람'], ['archive', '지난 라운드 자료실'], ['swap_board', '품앗이 게시판'], ['propose', '그룹 챌린지 제안']];

export const system = {
  async settings() {
    const [d, counts, hist] = await Promise.all([api('/admin/settings'), getCounts(true), api('/admin/audit?action=settings&limit=15')]);
    const s = d.settings; const owner = !!counts.is_owner;
    const over = new Set(d.overrides.map(o => o.key));
    const tag = keys => keys.some(k => over.has(k)) ? `<span class="chip amber">기본값에서 바꿈</span>${owner ? keys.filter(k => over.has(k)).map(k => `<button class="btn sm ghost" type="button" data-act="reset" data-key="${k}">${k} 기본값으로</button>`).join('') : ''}` : '<span class="chip">기본값</span>';
    const card = (form, title, desc, keys, inner) => `<form class="card form set-card" data-form="${form}"><div class="card-head"><div><h3>${title}</h3><p class="small muted" style="margin:2px 0 0">${desc}</p></div><div class="row">${tag(keys)}</div></div>${inner}${owner ? '<div class="btn-row"><button class="btn primary sm" type="submit">이 묶음 저장</button></div>' : ''}</form>`;
    const body = `
      <div class="notice warn" style="margin-bottom:14px"><b>규칙은 라운드 시작 전에만 바꾸고, 바꾼 내용은 마챌데이에서 공지합니다.</b> 이미 승인된 합의서에는 소급되지 않습니다 (합의서에 그때의 값이 저장됩니다). 저장할 때 바꾸는 이유를 함께 남깁니다.${owner ? '' : '<br>지금 계정은 운영진이라 보기만 할 수 있습니다. 변경은 운영자가 합니다.'}</div>
      <div class="set-grid${owner ? '' : ' readonly'}">
      ${card('money', '돈 규칙', '정산·예산·배분 한도', ['min_settlement', 'budget_cap_person', 'budget_cap_group', 'hq_ratio_range', 'agency_rate', 'withholding_rate', 'share_adjust_limit', 'share_alert_gap'], `
        <div class="form-cols">${field('최소 정산 금액', wonIn('min_settlement', s.min_settlement), '이보다 적으면 다음 정산으로 넘깁니다')}${field('정산 대행 수수료', pctIn('agency_rate', s.agency_rate))}</div>
        <div class="form-cols">${field('1인 예산 상한', wonIn('budget_cap_person', s.budget_cap_person))}${field('그룹 예산 상한', wonIn('budget_cap_group', s.budget_cap_group))}</div>
        <div class="form-cols">${field('운영본부 몫 최소', pctIn('hq_min', s.hq_ratio_range[0]))}${field('운영본부 몫 최대', pctIn('hq_max', s.hq_ratio_range[1]))}</div>
        <div class="form-cols">${field('원천징수 참고 비율', pctIn('withholding_rate', s.withholding_rate))}${field('그룹장 기여율 조정 한도', pctIn('share_adjust_limit', s.share_adjust_limit), '자동 산정값에서 ± 몇 %p까지')}</div>
        ${field('예정·실제 기여율 차이 경고', pctIn('share_alert_gap', s.share_alert_gap), '이만큼 차이 나면 운영 현황의 "주의가 필요한 곳"에 뜹니다')}`)}
      ${card('group', '그룹·심사', '그룹 인원과 심사 통과 점수', ['min_group', 'max_group', 'review_pass_score'], `
        <div class="form-cols">${field('그룹 최소 인원', intIn('min_group', s.min_group ?? 4, '명', 2), '그룹장 포함')}${field('그룹 최대 인원', intIn('max_group', s.max_group ?? 8, '명', 2))}</div>
        ${field('챌린지 심사 통과 점수', intIn('review_pass_score', s.review_pass_score, '점', 1), `가중 합계 만점 ${s.review_items.reduce((t, it) => t + it.weight * 5, 0)}점`)}`)}
      ${card('levels', '승급 조건', 'L1→L2는 조건을 채우면 자동으로 올라갑니다', ['levels'], `
        <div class="form-cols">${field('메이커(L2) 필요 포인트', intIn('l2_points', s.levels.L2.points, '점'))}${field('마챌데이·세미나 참석', intIn('l2_event', s.levels.L2.require_event, '회'))}</div>
        <div class="form-cols">${field('가입 후 최소 기간', intIn('l2_days', s.levels.L2.min_days, '일'))}${field('자기 자산 진단', select('l2_diag', [['1', '제출해야 함'], ['0', '필요 없음']], s.levels.L2.require_asset_diag ? '1' : '0'))}</div>
        <p class="small muted" style="margin:0">L3 어치버(완주 1회 또는 첫 매출) · L4 리더(완주 2회 + 리더 교육) · L5 마스터(그룹장 성공 2건 또는 3개월 연속 매출)는 승급 심사에서 판단합니다.</p>`)}
      ${card('vis', '열람 권한', '각 기능을 몇 등급부터 쓸 수 있는지', ['visibility'], `<div class="form-cols">${VIS.map(([k, l]) => field(l, select('v_' + k, LEVELS.slice(1).map(x => [x, `${x} ${LEVEL_NAMES[x]} 이상`]), s.visibility[k]))).join('')}</div>`)}
      </div>
      ${card('points', '활동 포인트', '하루 상한이 0이면 제한 없음', ['points'], `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>활동</th><th class="num">포인트</th><th class="num">하루 상한</th></tr></thead><tbody>${Object.entries(s.points).map(([k, v]) => `<tr><td>${esc(v.label)} <small class="muted">${k}</small></td><td class="num"><input class="mini-input num" type="number" name="p_${k}" value="${v.points}" min="0" step="1"></td><td class="num"><input class="mini-input num" type="number" name="c_${k}" value="${v.daily_cap}" min="0" step="1"></td></tr>`).join('')}</tbody></table></div>`)}
      ${card('presets', '배분 프리셋', '운영본부 / 그룹장 / 그룹원 풀 — 합이 100%여야 합니다. 합의서에서 ±10%p까지 조정할 수 있습니다', ['presets'], `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>프리셋</th><th class="num">운영본부</th><th class="num">그룹장</th><th class="num">그룹원 풀</th><th>그룹장 풀 참여</th></tr></thead><tbody>${Object.entries(s.presets).map(([k, v]) => `<tr><td><b>${esc(v.label)}</b><br><small class="muted">${esc(v.desc || '')}</small></td>${['hq', 'leader', 'pool'].map(x => `<td class="num"><input class="mini-input num" type="number" name="${k}_${x}" value="${Math.round(v[x] * 1000) / 10}" min="0" max="100" step="0.5"></td>`).join('')}<td>${select(k + '_lip', [['0', '아니요'], ['1', '예']], v.leader_in_pool ? '1' : '0')}</td></tr>`).join('')}</tbody></table></div>`)}
      <section class="card"><div class="card-head"><h3>최근 규칙 변경</h3><a class="small" href="#/admin/audit?action=settings">전체 보기</a></div><div class="list">${hist.rows.map(r => { let det = {}; try { det = JSON.parse(r.detail || '{}'); } catch {} return `<div class="list-item"><div class="grow"><div class="title">${esc(actionLabel(r.action))} · ${esc(String(r.target || '').replace('settings:', ''))}</div><div class="meta">${esc(r.nickname || '-')} · ${fmtDate(r.created_at, true)}${det.reason ? ' · ' + esc(det.reason) : ''}</div></div></div>`; }).join('') || '<p class="muted small">아직 바꾼 적이 없습니다.</p>'}</div></section>`;

    const save = async (pairs) => {
      const changed = pairs.filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(k === 'min_group' ? (s.min_group ?? 4) : k === 'max_group' ? (s.max_group ?? 8) : s[k]));
      if (!changed.length) { toast('바뀐 값이 없습니다'); return; }
      const reason = await askReason('규칙 변경', { label: '바꾸는 이유', hint: `${changed.map(([k]) => k).join(', ')} 값을 바꿉니다. 이유는 변경 이력에 남고, 공지할 때 그대로 쓸 수 있게 적어 주세요.`, button: '저장', placeholder: '예: 2기부터 예산 상한을 현실에 맞게 조정' });
      if (!reason) return;
      for (const [key, value] of changed) await put('/admin/settings', { key, value, reason });
      state.settings = null; toast('저장했습니다. 변경 내용을 공지해 주세요'); reload();
    };
    return { title: '규칙 설정', sub: '정산, 등급, 포인트, 배분 규칙의 기준값입니다.', body, mount(root) {
      if (!owner) root.querySelectorAll('.set-card input, .set-card select').forEach(x => { x.disabled = true; });
      bindForms(root, {
        async money(v) {
          if (v.hq_min > v.hq_max) throw new Error('운영본부 몫 최소가 최대보다 큽니다');
          await save([['min_settlement', v.min_settlement], ['budget_cap_person', v.budget_cap_person], ['budget_cap_group', v.budget_cap_group], ['hq_ratio_range', [pct(v.hq_min), pct(v.hq_max)]], ['agency_rate', pct(v.agency_rate)], ['withholding_rate', pct(v.withholding_rate)], ['share_adjust_limit', pct(v.share_adjust_limit)], ['share_alert_gap', pct(v.share_alert_gap)]]);
        },
        async group(v) { if (v.min_group > v.max_group) throw new Error('최소 인원이 최대 인원보다 큽니다'); await save([['min_group', v.min_group], ['max_group', v.max_group], ['review_pass_score', v.review_pass_score]]); },
        async levels(v) { await save([['levels', { ...s.levels, L2: { ...s.levels.L2, points: v.l2_points, require_event: v.l2_event, min_days: v.l2_days, require_asset_diag: v.l2_diag === '1' } }]]); },
        async vis(v) { await save([['visibility', { ...s.visibility, ...Object.fromEntries(VIS.map(([k]) => [k, v['v_' + k]])) }]]); },
        async points(v) { const p = {}; for (const [k, o] of Object.entries(s.points)) p[k] = { ...o, points: Number(v['p_' + k]) || 0, daily_cap: Number(v['c_' + k]) || 0 }; await save([['points', p]]); },
        async presets(v) {
          const p = {};
          for (const [k, o] of Object.entries(s.presets)) {
            const hq = Number(v[k + '_hq']), leader = Number(v[k + '_leader']), pool = Number(v[k + '_pool']);
            if (Math.abs(hq + leader + pool - 100) > 0.01) throw new Error(`${o.label}: 세 비율의 합이 100%가 아닙니다 (${hq + leader + pool}%)`);
            p[k] = { ...o, hq: Math.round(hq * 10) / 1000, leader: Math.round(leader * 10) / 1000, pool: Math.round(pool * 10) / 1000, leader_in_pool: v[k + '_lip'] === '1' };
          }
          await save([['presets', p]]);
        },
      });
      bindActions(root, { async reset(el) { const reason = await askReason(`${el.dataset.key} 기본값으로 되돌리기`, { label: '이유', button: '되돌리기' }); if (!reason) return; await api('/admin/settings/' + el.dataset.key, { method: 'DELETE' }); state.settings = null; toast('기본값으로 되돌렸습니다'); reload(); } });
    } };
  },

  async audit({ query }) {
    const d = await api('/admin/audit' + qs({ actor: query.actor, action: query.action, q: query.q, limit: 100 }));
    const row = r => { const det = fmtDetail(r.detail, 220); return `<tr><td><small>${fmtDate(r.created_at, true)}</small></td><td>${esc(r.nickname || '-')}</td><td><b>${esc(actionLabel(r.action))}</b><br><small class="muted">${esc(r.action)}</small></td><td><small>${targetLink(r.target)}</small></td><td><small class="muted detail-cell" title="${esc(r.detail || '')}">${esc(det)}</small></td></tr>`; };
    const body = `<form class="filters adm-filters" data-form="f">${select('actor', [['', '모든 사람'], ...d.actors.map(a => [a.id, a.nickname])], query.actor || '')}${select('action', ACTION_GROUPS, query.action || '')}<input type="search" name="q" value="${esc(query.q || '')}" placeholder="대상·내용 검색 (예: users:12)"><button class="btn sm primary" type="submit">적용</button>${query.actor || query.action || query.q ? '<a class="btn sm ghost" href="#/admin/audit">초기화</a>' : ''}</form>
      <section class="card flush"><div class="table-wrap"><table class="tbl"><thead><tr><th>일시</th><th>처리한 사람</th><th>행동</th><th>대상</th><th>내용</th></tr></thead><tbody id="audit-body">${d.rows.map(row).join('') || '<tr><td colspan="5" class="muted">기록이 없습니다.</td></tr>'}</tbody></table></div></section>
      ${d.next_before ? '<div style="text-align:center;margin-top:12px"><button class="btn" data-act="more">더 보기</button></div>' : ''}
      <p class="small muted" style="margin-top:10px">감사 로그는 지울 수 없습니다. 돈·등급·권한·개인정보와 관련된 모든 처리가 남습니다.</p>`;
    let before = d.next_before;
    return { title: '감사 로그', sub: '누가 언제 무엇을 처리했는지 기록합니다.', body, mount(root) {
      bindForms(root, { f(v) { location.hash = '#/admin/audit' + qs(v); } });
      bindActions(root, { async more(el) { const r = await api('/admin/audit' + qs({ actor: query.actor, action: query.action, q: query.q, limit: 100, before })); root.querySelector('#audit-body').insertAdjacentHTML('beforeend', r.rows.map(row).join('')); before = r.next_before; if (!before) el.remove(); } });
    } };
  },

  async data() {
    const [sys, counts] = await Promise.all([api('/admin/system'), getCounts(true)]);
    const owner = !!counts.is_owner;
    const T = { users: '회원', applications: '가입 신청', challenges: '챌린지', group_members: '그룹원', checkins: '체크인', checkin_entries: '체크인 제출', done_logs: '완료 로그', ledger_entries: '장부', settlements: '정산', settlement_payouts: '지급', papers: '페이퍼', posts: '게시글', comments: '댓글', events: '일정', registrations: '일정 신청', notifications: '알림', points_ledger: '포인트', badges: '배지', audit_logs: '감사 로그', consents: '동의 기록', broadcasts: '단체 알림', hq_expenses: '재원 사용', admin_notes: '내부 메모' };
    const exports = [['challenges', '챌린지'], ['ledger', '장부'], ['settlements', '정산'], ['payouts', '지급 내역'], ['papers', '페이퍼'], ['points', '포인트'], ['users', '회원', 1], ['applications', '가입 신청', 1], ['consents', '동의 기록', 1]];
    const body = `<div class="adm-two">
      <section class="card"><div class="card-head"><h3>CSV 내려받기</h3><span class="muted small">엑셀에서 바로 열립니다</span></div>
        <div class="btn-row">${exports.map(([k, l, pii]) => pii && !owner ? `<span class="btn sm" aria-disabled="true" title="운영자만 내려받을 수 있습니다" style="opacity:.5;cursor:not-allowed">${l} · 운영자 전용</span>` : `<a class="btn sm" href="/api/admin/export?table=${k}" download>${l}${pii ? ' <small class="muted">개인정보</small>' : ''}</a>`).join('')}</div>
        <p class="small muted" style="margin:10px 0 0">개인정보가 담긴 파일(회원, 가입 신청, 동의 기록)은 운영자만 내려받습니다. 내려받은 기록은 감사 로그에 남고, 쓴 뒤에는 바로 지워 주세요.</p>
      </section>
      <section class="card"><div class="card-head"><h3>전체 백업</h3></div>
        <p class="small" style="margin:0 0 10px">모든 표를 JSON 파일 하나로 받습니다. 비밀번호 해시, 로그인 세션, 열람 기록은 빠집니다. 라운드가 끝날 때마다 한 번씩 받아 안전한 곳에 보관하세요.</p>
        ${owner ? '<a class="btn primary sm" href="/api/admin/backup" download>백업 파일 받기</a>' : '<span class="muted small">운영자만 받을 수 있습니다.</span>'}
        <p class="small muted" style="margin:10px 0 0">Cloudflare D1 자체도 30일 동안 시점 복구(Time Travel)를 지원합니다. 큰 사고가 나면 대시보드에서 복구할 수 있습니다.</p>
      </section></div>
      <section class="card flush" style="margin-top:14px"><div class="card-head pad"><h3>데이터 현황</h3><span class="muted small">표 ${sys.tables.length}개 · 규칙 변경 ${sys.settings_overrides}개 적용 중</span></div>
        <div class="table-wrap"><table class="tbl compact"><thead><tr><th>표</th><th class="num">행</th><th>표</th><th class="num">행</th></tr></thead><tbody>${(() => { const list = sys.tables.filter(t => t.rows || T[t.name]); const half = Math.ceil(list.length / 2); return Array.from({ length: half }, (_, i) => { const a = list[i], b = list[i + half]; const cell = t => t ? `<td>${esc(T[t.name] || t.name)} <small class="muted">${t.name}</small></td><td class="num">${num(t.rows)}</td>` : '<td></td><td></td>'; return `<tr>${cell(a)}${cell(b)}</tr>`; }).join(''); })()}</tbody></table></div>
      </section>
      <section class="card soft small" style="margin-top:14px"><b>보관 기간</b> · 가입하지 않은 신청서는 처리 후 6개월이 지나면 운영 현황을 열 때 자동으로 파기됩니다. 탈퇴한 회원의 이름·연락처는 바로 지우고, 정산·장부 기록은 세무 보관 기간 동안 익명으로 남깁니다.<br><b>적용된 구조 변경</b> · ${sys.migrations.map(m => `<span class="kbd">${esc(m.id)}</span>`).join(' ') || '없음'}</section>`;
    return { title: '데이터·백업', sub: '내려받기, 백업, 보관 정책', body };
  },
};
