// 소통 — 단체 알림, 커뮤니티 관리, 일정·출석
import { api, post, put, esc, nl2br, toast, go, reload, field, input, textarea, select, check, bindForms, bindActions, num, fmtDate, fmtLocal, ago, LEVEL_NAMES, LEVELS, BOARDS, EVENT_TYPES, lvChip, empty, modal, closeModal } from '../../core.js';
import { kv, qs, askReason, invalidateCounts } from './shared.js';

const SEGMENTS = [['all', '활동 중인 모든 회원'], ['level', '특정 등급 이상'], ['round', '특정 라운드 참여자'], ['challenge', '특정 챌린지 그룹원'], ['leaders', '진행 중인 챌린지의 그룹장'], ['staff', '운영진']];
const segLabel = s => { const base = SEGMENTS.find(x => x[0] === s.type)?.[1] || s.type; return s.type === 'level' ? `${s.level} ${LEVEL_NAMES[s.level] || ''} 이상` : s.type === 'round' ? `라운드 #${s.round_id}` : s.type === 'challenge' ? `챌린지 #${s.challenge_id}` : base; };

export const comms = {
  async broadcast() {
    const [hist, rounds, groups] = await Promise.all([api('/admin/broadcasts'), api('/rounds'), api('/admin/groups?view=running')]);
    const forming = await api('/admin/groups?view=forming');
    const chs = [...groups, ...forming];
    const body = `<div class="adm-two">
      <form class="card form" data-form="bc"><h3>새 알림</h3>
        ${field('받는 사람', select('type', SEGMENTS))}
        <div class="seg-extra" data-for="level">${field('등급', select('level', LEVELS.slice(1).map(l => [l, `${l} ${LEVEL_NAMES[l]} 이상`]), 'L1'))}</div>
        <div class="seg-extra" data-for="round" hidden>${field('라운드', select('round_id', rounds.map(r => [r.id, r.name])))}</div>
        <div class="seg-extra" data-for="challenge" hidden>${field('챌린지', select('challenge_id', chs.map(c => [c.id, `${c.title} (${c.leader})`])))}</div>
        <div class="recipients small"><span class="muted">받는 사람</span> <b id="rc">-</b></div>
        ${field('제목', input('title', { required: true, placeholder: '예: 12월 마챌데이 장소가 바뀌었습니다' }), '알림 목록에 보이는 한 줄입니다. 100자 이내')}
        ${field('내용', textarea('body', { rows: 4, placeholder: '필요한 내용만 짧게' }))}
        ${field('누르면 열 화면 (선택)', input('link', { placeholder: '#/events 또는 /papers/ 또는 https://…' }))}
        ${check('post_notice', '커뮤니티 공지 게시판에도 같은 글을 올립니다')}
        <div class="btn-row"><button class="btn primary" type="submit">보내기</button></div>
        <p class="small muted" style="margin:0">회원 공간의 알림으로 갑니다. 이메일·문자는 보내지 않습니다. 보낸 알림은 되돌릴 수 없으니 받는 사람 수를 확인하세요.</p>
      </form>
      <section class="card"><div class="card-head"><h3>보낸 알림</h3><span class="muted small">최근 100건</span></div>
        <div class="list">${hist.map(b => `<div class="list-item"><div class="grow"><div class="title">${esc(b.title)}</div><div class="meta">${esc(segLabel(b.segment))} · ${num(b.recipients)}명 · ${esc(b.author || '')} · ${fmtDate(b.created_at, true)}${b.post_id ? ` · <a href="#/community/posts/${b.post_id}">공지 글</a>` : ''}</div>${b.body ? `<div class="small" style="margin-top:4px;color:var(--ink-2)">${nl2br(b.body.slice(0, 160))}</div>` : ''}</div></div>`).join('') || '<p class="muted small">아직 보낸 알림이 없습니다.</p>'}</div>
      </section></div>`;
    return { title: '단체 알림', sub: '등급·라운드·챌린지별로 골라서 회원 공간 알림을 보냅니다.', body, mount(root) {
      const f = root.querySelector('form[data-form=bc]');
      const rc = root.querySelector('#rc');
      let t;
      const refresh = () => {
        const type = f.type.value;
        root.querySelectorAll('.seg-extra').forEach(x => { x.hidden = x.dataset.for !== type; });
        clearTimeout(t);
        t = setTimeout(async () => { try { const r = await api('/admin/broadcast/preview' + qs({ type, level: f.level.value, round_id: f.round_id?.value, challenge_id: f.challenge_id?.value })); rc.textContent = `${num(r.count)}명`; } catch (e) { rc.textContent = e.message; } }, 150);
      };
      f.addEventListener('change', refresh); refresh();
      bindForms(root, { async bc(v) {
        if (!confirm(`${rc.textContent}에게 보낼까요?`)) return;
        const r = await post('/admin/broadcast', v);
        toast(`${num(r.recipients)}명에게 보냈습니다`); reload();
      } });
    } };
  },

  async community({ query }) {
    const view = query.view || 'reported';
    const d = await api('/admin/community' + qs({ view }));
    const postRow = p => `<div class="list-item"><div class="grow"><div class="row"><span class="chip">${esc(BOARDS[p.board] || p.board)}</span>${p.reported ? `<span class="chip red">신고 ${p.reported}</span>` : ''}${p.hidden ? '<span class="chip">숨김</span>' : ''}<a class="title" href="#/community/posts/${p.id}">${esc(p.title)}</a></div>
      <div class="small" style="margin:6px 0;color:var(--ink-2)">${esc(String(p.body || '').slice(0, 220))}${String(p.body || '').length > 220 ? '…' : ''}</div>
      <div class="meta"><a href="#/admin/users/${p.author_id}">${esc(p.nickname)}</a> ${lvChip(p.level)} · ${ago(p.created_at)} · 댓글 ${p.comments} · 도움 ${p.helpful_count}</div></div>
      <div class="btn-col">${p.hidden ? `<button class="btn sm" data-act="post" data-id="${p.id}" data-hidden="0">다시 보이기</button>` : `<button class="btn sm danger" data-act="hide" data-id="${p.id}">숨기기</button>`}${p.reported && !p.hidden ? `<button class="btn sm" data-act="post" data-id="${p.id}" data-clear="1">신고 기각</button>` : ''}</div></div>`;
    const body = `<div class="toolbar"><div class="pill-tabs">${[['reported', `신고된 글 ${d.counts.reported || ''}`], ['hidden', `숨긴 글·댓글 ${d.counts.hidden || ''}`], ['recent', '최근 글·댓글']].map(([k, l]) => `<a href="#/admin/community?view=${k}" class="${view === k ? 'active' : ''}">${l.trim()}</a>`).join('')}</div></div>
      <div class="adm-two wide-left">
        <section class="card"><div class="card-head"><h3>글</h3></div><div class="list">${d.posts.map(postRow).join('') || `<p class="muted small">${view === 'reported' ? '신고된 글이 없습니다.' : '해당하는 글이 없습니다.'}</p>`}</div></section>
        <section class="card"><div class="card-head"><h3>댓글</h3></div><div class="list">${d.comments.map(c => `<div class="list-item"><div class="grow"><div class="small">${esc(String(c.body).slice(0, 160))}</div><div class="meta"><a href="#/admin/users/${c.author_id}">${esc(c.nickname)}</a> · <a href="#/community/posts/${c.post_id}">${esc(c.post_title)}</a> · ${ago(c.created_at)}${c.hidden ? ' · <b>숨김</b>' : ''}</div></div><button class="btn sm ${c.hidden ? '' : 'ghost'}" data-act="cm" data-id="${c.id}" data-hidden="${c.hidden ? 0 : 1}">${c.hidden ? '다시 보이기' : '숨기기'}</button></div>`).join('') || '<p class="muted small">해당하는 댓글이 없습니다.</p>'}</div></section>
      </div>
      <div class="card soft small" style="margin-top:12px"><b>숨김 기준</b> · 수익·원금 보장 표현, 다단계·대출·도박 권유, 다른 사람의 개인정보, 비방. 애매하면 숨기지 말고 작성자에게 먼저 묻습니다. 신고 처리 결과는 <a href="#/admin/disputes">이의·신고</a>에서 종결로 남겨 주세요.</div>`;
    return { title: '커뮤니티 관리', sub: '신고된 글을 확인하고, 원칙에 어긋나는 글과 댓글을 숨깁니다.', body, mount(root) {
      bindActions(root, {
        async hide(el) { const reason = await askReason('글 숨기기', { label: '숨기는 이유 (작성자에게 알림으로 전달)', button: '숨기기', danger: true, placeholder: '예: 수익 보장 표현 (마챌 원칙 1)' }); if (!reason) return; await post(`/admin/posts/${el.dataset.id}`, { hidden: true, clear_reports: true, notify_author: true, reason }); invalidateCounts(); toast('숨겼습니다'); reload(); },
        async post(el) { await post(`/admin/posts/${el.dataset.id}`, el.dataset.clear ? { clear_reports: true } : { hidden: false }); invalidateCounts(); toast('처리했습니다'); reload(); },
        async cm(el) { await post(`/admin/comments/${el.dataset.id}`, { hidden: el.dataset.hidden === '1' }); toast('처리했습니다'); reload(); },
      });
    } };
  },

  async events({ query }) {
    const when = query.when === 'past' ? 'past' : 'upcoming';
    const rows = await api('/admin/events' + qs({ when }));
    const body = `<div class="adm-two wide-left">
      <div><div class="toolbar"><div class="pill-tabs"><a href="#/admin/events" class="${when === 'upcoming' ? 'active' : ''}">다가오는 일정</a><a href="#/admin/events?when=past" class="${when === 'past' ? 'active' : ''}">지난 일정</a></div></div>
      ${rows.length ? `<section class="card flush"><div class="table-wrap"><table class="tbl hover"><thead><tr><th>일정</th><th>일시</th><th class="num">신청</th><th class="num">출석</th><th>출석 코드</th></tr></thead><tbody>
        ${rows.map(e => `<tr data-href="#/admin/events/${e.id}" class="${e.status === 'cancelled' ? 'dim' : ''}"><td><a href="#/admin/events/${e.id}"><b>${esc(e.title)}</b></a>${e.status === 'cancelled' ? ' <span class="chip red">취소</span>' : ''}<br><small class="muted">${EVENT_TYPES[e.type] || e.type} · ${esc(e.location || '장소 미정')} · ${e.min_level} 이상</small></td><td><small>${fmtLocal(e.starts_at)}</small></td><td class="num">${num(e.registered)}${e.capacity ? `/${e.capacity}` : ''}</td><td class="num">${num(e.attended)}</td><td><span class="kbd">${esc(e.attendance_code || '')}</span></td></tr>`).join('')}
      </tbody></table></div></section>` : empty(when === 'past' ? '지난 일정이 없습니다' : '다가오는 일정이 없습니다', '오른쪽에서 새 일정을 만드세요')}</div>
      <form class="card form" data-form="ne"><h3>새 일정</h3><div class="form-cols">${field('유형', select('type', Object.entries(EVENT_TYPES)))}${field('참여 가능 등급', select('min_level', LEVELS.slice(1).map(l => [l, `${l} ${LEVEL_NAMES[l]} 이상`])))}</div>${field('제목', input('title', { required: true }))}<div class="form-cols">${field('일시 (한국 시간)', input('starts_at', { type: 'datetime-local', required: true }))}${field('장소 / 링크', input('location'))}</div><div class="form-cols">${field('정원', input('capacity', { type: 'number', min: 1 }), '비우면 제한 없음')}${field('출석 코드', input('attendance_code', { placeholder: '예: MD11' }), '비우면 자동으로 만듭니다')}</div>${field('설명', textarea('description', { rows: 3 }))}<button class="btn primary" type="submit">만들기</button></form>
    </div>`;
    return { title: '일정·출석', sub: '마챌데이, 세미나, 오피스아워 일정을 만들고 출석을 확인합니다.', body, mount(root) {
      bindForms(root, { async ne(v) { v.starts_at = v.starts_at.replace('T', ' ') + (v.starts_at.length === 16 ? ':00' : ''); const r = await post('/admin/events', v); toast('만들었습니다'); go('#/admin/events/' + r.id); } });
      root.querySelectorAll('tr[data-href]').forEach(tr => tr.addEventListener('click', e => { if (!e.target.closest('a')) go(tr.dataset.href); }));
    } };
  },

  async eventDetail({ params }) {
    const d = await api('/admin/events/' + params.id);
    const e = d.event;
    const regs = d.registrations;
    const active = regs.filter(r => r.status !== 'cancelled');
    const att = regs.filter(r => r.status === 'attended').length;
    const body = `<div class="adm-two wide-left">
      <div class="stack">
        <section class="card attend-code"><div><small class="muted">출석 코드 · 현장에서 화면에 띄워 주세요</small><div class="code">${esc(e.attendance_code || '-')}</div></div><div class="attend-num"><b>${att}</b><small>/ ${active.length}명 출석</small></div></section>
        <section class="card flush"><div class="card-head pad"><h3>신청자</h3><span class="muted small">코드를 못 넣은 사람은 여기서 출석 처리합니다</span></div>
          ${regs.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>회원</th><th>신청</th><th>상태</th><th></th></tr></thead><tbody>${regs.map(r => `<tr class="${r.status === 'cancelled' ? 'dim' : ''}"><td><a href="#/admin/users/${r.user_id}"><b>${esc(r.nickname)}</b></a> ${lvChip(r.level)}</td><td><small>${ago(r.created_at)}</small></td><td>${{ registered: '신청', attended: '✓ 출석', cancelled: '취소' }[r.status] || r.status}${r.attended_at ? ` <small class="muted">${fmtDate(r.attended_at, true).slice(11)}</small>` : ''}</td><td>${r.status === 'attended' ? `<button class="btn sm ghost" data-act="att" data-uid="${r.user_id}" data-on="0">출석 취소</button>` : r.status !== 'cancelled' ? `<button class="btn sm" data-act="att" data-uid="${r.user_id}" data-on="1">출석 처리</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small pad">아직 신청자가 없습니다.</p>'}
        </section>
      </div>
      <form class="card form" data-form="ed"><h3>일정 정보</h3>
        ${e.status === 'cancelled' ? '<div class="notice danger">취소된 일정입니다. 회원에게 보이지 않습니다.</div>' : ''}
        ${field('제목', input('title', { value: e.title, required: true }))}
        <div class="form-cols">${field('일시 (한국 시간)', input('starts_at', { type: 'datetime-local', value: String(e.starts_at).replace(' ', 'T').slice(0, 16), required: true }))}${field('장소 / 링크', input('location', { value: e.location || '' }))}</div>
        <div class="form-cols">${field('정원', input('capacity', { type: 'number', min: 1, value: e.capacity ?? '' }))}${field('참여 가능 등급', select('min_level', LEVELS.slice(1).map(l => [l, `${l} ${LEVEL_NAMES[l]} 이상`]), e.min_level))}</div>
        ${field('출석 코드', input('attendance_code', { value: e.attendance_code || '' }))}
        ${field('설명', textarea('description', { rows: 3, value: e.description || '' }))}
        ${check('notify_change', '일시나 장소가 바뀌면 신청자에게 알림 보내기', true)}
        <div class="btn-row"><button class="btn primary" type="submit">저장</button>${e.status === 'cancelled' ? '<button class="btn" type="button" data-act="restore">취소 철회</button>' : '<button class="btn danger" type="button" data-act="cancel">일정 취소</button>'}</div>
      </form></div>`;
    return { title: `${esc(e.title)}${e.status === 'cancelled' ? ' <span class="title-chips"><span class="chip red">취소</span></span>' : ''}`, sub: `${EVENT_TYPES[e.type] || e.type} · ${fmtLocal(e.starts_at)} · ${esc(e.location || '장소 미정')}`, crumbs: [['일정·출석', '#/admin/events'], [e.title]], body, mount(root) {
      bindForms(root, { async ed(v) { v.starts_at = v.starts_at.replace('T', ' '); if (v.capacity === null) v.capacity = ''; await put('/admin/events/' + e.id, v); toast('저장했습니다'); reload(); } });
      bindActions(root, {
        async att(el) { await post(`/admin/events/${e.id}/attendance`, { user_id: Number(el.dataset.uid), attended: el.dataset.on === '1' }); reload(); },
        async cancel() { const reason = await askReason('일정 취소', { label: '취소 사유 (신청자 모두에게 알림으로 전달)', button: '일정 취소', danger: true }); if (!reason) return; await put('/admin/events/' + e.id, { status: 'cancelled', reason }); toast('취소했습니다'); reload(); },
        async restore() { await put('/admin/events/' + e.id, { status: 'scheduled' }); toast('다시 열었습니다'); reload(); },
      });
    } };
  },
};
