// 설정 — 규칙 설정(입력 양식), 감사 로그, 데이터·백업
import { api, put, esc, toast, reload, field, input, select, bindForms, bindActions, num, fmtDate, LEVEL_NAMES, LEVELS, state } from '../../core.js';
import { getCounts, askReason, qs, actionLabel, ACTION_GROUPS, targetLink, fmtDetail } from './shared.js';

const intIn = (name, v, unit = '', min = 0) => `<div class="unit-input"><input type="number" name="${name}" value="${v}" step="1" min="${min}"><span>${unit}</span></div>`;
const VIS = [['card', '그룹 목록·그룹 소개 보기'], ['group_logs', '다른 그룹의 도전 기록 전체 열람'], ['paper_full', '페이퍼 전문 열람']];
const chk = (name, label, on) => `<label class="check"><input type="checkbox" name="${name}" ${on ? 'checked' : ''}><span>${label}</span></label>`;

export const system = {
  async settings() {
    const [d, counts, hist] = await Promise.all([api('/admin/settings'), getCounts(true), api('/admin/audit?action=settings&limit=15')]);
    const s = d.settings; const owner = !!counts.is_owner;
    const over = new Set(d.overrides.map(o => o.key));
    const tag = keys => keys.some(k => over.has(k)) ? `<span class="chip amber">기본값에서 바꿈</span>${owner ? keys.filter(k => over.has(k)).map(k => `<button class="btn sm ghost" type="button" data-act="reset" data-key="${k}">${k} 기본값으로</button>`).join('') : ''}` : '<span class="chip">기본값</span>';
    const card = (form, title, desc, keys, inner) => `<form class="card form set-card" data-form="${form}"><div class="card-head"><div><h3>${title}</h3><p class="small muted" style="margin:2px 0 0">${desc}</p></div><div class="row">${tag(keys)}</div></div>${inner}${owner ? '<div class="btn-row"><button class="btn primary sm" type="submit">이 묶음 저장</button></div>' : ''}</form>`;
    const body = `
      <div class="notice warn" style="margin-bottom:14px"><b>규칙을 바꾸면 정기모임이나 공지 게시판에서 꼭 알려 주세요.</b> 출석 규칙 기본값은 새로 만드는 그룹에만 쓰입니다. 이미 있는 그룹의 출석 규칙은 그룹리더가 정한 값을 그대로 씁니다. 저장할 때 바꾸는 이유를 적으면 변경 이력에 남습니다.</div>
      <div class="set-grid${owner ? '' : ' readonly'}">
      ${card('group', '그룹 규칙', '그룹 인원, 그룹리더와 그룹원이 동시에 할 수 있는 그룹 수', ['groups'], `
        <div class="form-cols">${field('기본 정원', intIn('capacity_default', s.groups.capacity_default, '명', 2), '그룹리더 포함. 그룹을 만들 때 미리 채워지는 값')}${field('최대 정원', intIn('capacity_max', s.groups.capacity_max, '명', 2))}</div>
        <div class="form-cols">${field('그룹리더 한 명이 동시에 이끄는 그룹', intIn('leader_max_groups', s.groups.leader_max_groups, '개', 1))}${field('회원 한 명이 동시에 참여하는 그룹', intIn('member_max_groups', s.groups.member_max_groups, '개', 1))}</div>
        <div class="form-cols">${field('그룹 참여 가능 등급', select('join_level', LEVELS.slice(1).map(x => [x, `${x} ${LEVEL_NAMES[x]} 이상`]), s.groups.join_level))}${field('그룹리더 신청 가능 등급', select('leader_level', LEVELS.slice(1).map(x => [x, `${x} ${LEVEL_NAMES[x]} 이상`]), s.groups.leader_level))}</div>`)}
      ${card('att', '출석 규칙 기본값', '새 그룹을 만들 때 미리 채워지는 값. 그룹리더가 그룹마다 바꿀 수 있습니다', ['attendance_default'], (() => { const a = s.attendance_default; return `
        <div class="form-cols">${field('최소 출석률', intIn('min_rate', a.min_rate, '%'), '0이면 기준 없음')}${field('출석률 확인 시작', intIn('rate_after', a.rate_after, '번째 모임부터', 1))}</div>
        <div class="form-cols">${field('지각 기준', intIn('late_minutes', a.late_minutes, '분'))}${field('지각 환산', intIn('late_per_absence', a.late_per_absence, '번 = 결석 1번'))}</div>
        <div class="form-cols">${field('연속 결석 경고', intIn('warn_absences', a.warn_absences, '번'))}${field('퇴출 기준', intIn('kick_warnings', a.kick_warnings, '번 경고'))}</div>
        <div class="form-cols">${field('공결 인정 횟수', intIn('excuse_limit', a.excuse_limit, '번'))}${field('출석 코드 입력', intIn('checkin_before', a.checkin_before, '분 전부터'))}</div>
        <div class="row" style="gap:14px;flex-wrap:wrap">${chk('warn_on_low_rate', '출석률이 기준 아래로 내려가면 경고', a.warn_on_low_rate)}${chk('excuse', '모임 전 불참 사유는 공결로 인정', a.excuse)}${chk('auto_remove', '퇴출 기준에 닿으면 자동으로 내보내기', a.auto_remove)}</div>`; })())}
      ${card('levels', '승급 조건', 'L1→L2는 조건을 채우면 자동으로 올라갑니다', ['levels'], `
        <div class="form-cols">${field('메이커(L2) 필요 포인트', intIn('l2_points', s.levels.L2.points, '점'))}${field('정기모임·세미나 참석', intIn('l2_event', s.levels.L2.require_event, '회'))}</div>
        <div class="form-cols">${field('가입 후 최소 기간', intIn('l2_days', s.levels.L2.min_days, '일'))}${field('자기 자산 진단', select('l2_diag', [['1', '제출해야 함'], ['0', '필요 없음']], s.levels.L2.require_asset_diag ? '1' : '0'))}</div>
        <p class="small muted" style="margin:0">L3 어치버(그룹 완주 1회 또는 첫 매출) · L4 리더(그룹 완주 2회 + 그룹리더 워크숍) · L5 마스터(그룹리더로 완주 2회 또는 반복 매출)는 승급 심사에서 판단합니다.</p>`)}
      ${card('vis', '열람 권한', '각 기능을 몇 등급부터 쓸 수 있는지', ['visibility'], `<div class="form-cols">${VIS.map(([k, l]) => field(l, select('v_' + k, LEVELS.slice(1).map(x => [x, `${x} ${LEVEL_NAMES[x]} 이상`]), s.visibility[k]))).join('')}</div>`)}
      </div>
      ${card('points', '활동 포인트', '하루 상한이 0이면 제한 없음', ['points'], `<div class="table-wrap"><table class="tbl compact"><thead><tr><th>활동</th><th class="num">포인트</th><th class="num">하루 상한</th></tr></thead><tbody>${Object.entries(s.points).map(([k, v]) => `<tr><td>${esc(v.label)} <small class="muted">${k}</small></td><td class="num"><input class="mini-input num" type="number" name="p_${k}" value="${v.points}" min="0" step="1"></td><td class="num"><input class="mini-input num" type="number" name="c_${k}" value="${v.daily_cap}" min="0" step="1"></td></tr>`).join('')}</tbody></table></div>`)}
      <section class="card"><div class="card-head"><h3>최근 규칙 변경</h3><a class="small" href="#/admin/audit?action=settings">전체 보기</a></div><div class="list">${hist.rows.map(r => { let det = {}; try { det = JSON.parse(r.detail || '{}'); } catch {} return `<div class="list-item"><div class="grow"><div class="title">${esc(actionLabel(r.action))} · ${esc(String(r.target || '').replace('settings:', ''))}</div><div class="meta">${esc(r.nickname || '-')} · ${fmtDate(r.created_at, true)}${det.reason ? ' · ' + esc(det.reason) : ''}</div></div></div>`; }).join('') || '<p class="muted small">아직 바꾼 적이 없습니다.</p>'}</div></section>`;

    const save = async (pairs) => {
      const changed = pairs.filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(s[k]));
      if (!changed.length) { toast('바뀐 값이 없습니다'); return; }
      const reason = await askReason('규칙 변경', { label: '바꾸는 이유', hint: `${changed.map(([k]) => k).join(', ')} 값을 바꿉니다. 이유는 변경 이력에 남고, 공지할 때 그대로 쓸 수 있게 적어 주세요.`, button: '저장', placeholder: '예: 2기부터 예산 상한을 현실에 맞게 조정' });
      if (!reason) return;
      for (const [key, value] of changed) await put('/admin/settings', { key, value, reason });
      state.settings = null; toast('저장했습니다. 변경 내용을 공지해 주세요'); reload();
    };
    return { title: '규칙 설정', sub: '그룹, 출석, 등급, 포인트, 열람 권한의 기준값입니다.', body, mount(root) {
      if (!owner) root.querySelectorAll('.set-card input, .set-card select').forEach(x => { x.disabled = true; });
      bindForms(root, {
        async group(v) {
          if (v.capacity_default > v.capacity_max) throw new Error('기본 정원이 최대 정원보다 큽니다');
          await save([['groups', { ...s.groups, capacity_default: v.capacity_default, capacity_max: v.capacity_max, leader_max_groups: v.leader_max_groups, member_max_groups: v.member_max_groups, join_level: v.join_level, leader_level: v.leader_level }]]);
        },
        async att(v) {
          const keys = ['min_rate', 'rate_after', 'late_minutes', 'late_per_absence', 'warn_absences', 'kick_warnings', 'excuse_limit', 'checkin_before'];
          if (v.min_rate > 100) throw new Error('출석률은 100% 이하로 적어 주세요');
          await save([['attendance_default', { ...s.attendance_default, ...Object.fromEntries(keys.map(k => [k, Number(v[k]) || 0])), rate_after: Math.max(1, Number(v.rate_after) || 1), warn_on_low_rate: !!v.warn_on_low_rate, excuse: !!v.excuse, auto_remove: !!v.auto_remove }]]);
        },
        async levels(v) { await save([['levels', { ...s.levels, L2: { ...s.levels.L2, points: v.l2_points, require_event: v.l2_event, min_days: v.l2_days, require_asset_diag: v.l2_diag === '1' } }]]); },
        async vis(v) { await save([['visibility', { ...s.visibility, ...Object.fromEntries(VIS.map(([k]) => [k, v['v_' + k]])) }]]); },
        async points(v) { const p = {}; for (const [k, o] of Object.entries(s.points)) p[k] = { ...o, points: Number(v['p_' + k]) || 0, daily_cap: Number(v['c_' + k]) || 0 }; await save([['points', p]]); },
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
    const T = { users: '회원', applications: '가입 신청', challenges: '그룹', group_members: '그룹원', group_sessions: '그룹 모임', session_attendance: '모임 출석', group_warnings: '출석 경고', group_logs: '도전 기록', log_cheers: '응원', group_results: '성과 기록', milestones: '마일스톤', leader_applications: '그룹리더 신청', event_presentations: '발표 신청', papers: '페이퍼', posts: '게시글', comments: '댓글', events: '정기모임·일정', registrations: '일정 신청', notifications: '알림', points_ledger: '포인트', badges: '배지', audit_logs: '감사 로그', consents: '동의 기록', broadcasts: '단체 알림', admin_notes: '내부 메모', rounds: '시즌' };
    const exports = [['groups', '그룹'], ['members', '그룹원'], ['sessions', '그룹 모임'], ['attendance', '모임 출석'], ['results', '성과 기록'], ['papers', '페이퍼'], ['points', '포인트'], ['users', '회원', 1], ['applications', '가입 신청', 1], ['consents', '동의 기록', 1]];
    const body = `<div class="adm-two">
      <section class="card"><div class="card-head"><h3>CSV 내려받기</h3><span class="muted small">엑셀에서 바로 열립니다</span></div>
        <div class="btn-row">${exports.map(([k, l, pii]) => pii && !owner ? `<span class="btn sm" aria-disabled="true" title="운영자만 내려받을 수 있습니다" style="opacity:.5;cursor:not-allowed">${l} · 운영자 전용</span>` : `<a class="btn sm" href="/api/admin/export?table=${k}" download>${l}${pii ? ' <small class="muted">개인정보</small>' : ''}</a>`).join('')}</div>
        <p class="small muted" style="margin:10px 0 0">개인정보가 담긴 파일(회원, 가입 신청, 동의 기록)은 운영자만 내려받습니다. 내려받은 기록은 감사 로그에 남고, 쓴 뒤에는 바로 지워 주세요.</p>
      </section>
      <section class="card"><div class="card-head"><h3>전체 백업</h3></div>
        <p class="small" style="margin:0 0 10px">모든 표를 JSON 파일 하나로 받습니다. 비밀번호 해시, 로그인 세션, 열람 기록은 빠집니다. 시즌이 끝날 때마다 한 번씩 받아 안전한 곳에 보관하세요.</p>
        ${owner ? '<a class="btn primary sm" href="/api/admin/backup" download>백업 파일 받기</a>' : '<span class="muted small">운영자만 받을 수 있습니다.</span>'}
        <p class="small muted" style="margin:10px 0 0">Cloudflare D1 자체도 30일 동안 시점 복구(Time Travel)를 지원합니다. 큰 사고가 나면 대시보드에서 복구할 수 있습니다.</p>
      </section></div>
      <section class="card flush" style="margin-top:14px"><div class="card-head pad"><h3>데이터 현황</h3><span class="muted small">표 ${sys.tables.length}개 · 규칙 변경 ${sys.settings_overrides}개 적용 중</span></div>
        <div class="table-wrap"><table class="tbl compact"><thead><tr><th>표</th><th class="num">행</th><th>표</th><th class="num">행</th></tr></thead><tbody>${(() => { const list = sys.tables.filter(t => t.rows || T[t.name]); const half = Math.ceil(list.length / 2); return Array.from({ length: half }, (_, i) => { const a = list[i], b = list[i + half]; const cell = t => t ? `<td>${esc(T[t.name] || t.name)} <small class="muted">${t.name}</small></td><td class="num">${num(t.rows)}</td>` : '<td></td><td></td>'; return `<tr>${cell(a)}${cell(b)}</tr>`; }).join(''); })()}</tbody></table></div>
      </section>
      <section class="card soft small" style="margin-top:14px"><b>보관 기간</b> · 가입하지 않은 신청서는 처리 후 6개월이 지나면 운영 현황을 열 때 자동으로 파기됩니다. 탈퇴한 회원의 이름·연락처는 바로 지우고, 그룹에 함께 남긴 출석·기록·성과는 이름 없이 남깁니다.<br><b>적용된 구조 변경</b> · ${sys.migrations.map(m => `<span class="kbd">${esc(m.id)}</span>`).join(' ') || '없음'}</section>`;
    return { title: '데이터·백업', sub: '내려받기, 백업, 보관 정책', body };
  },
};
