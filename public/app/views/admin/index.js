// 운영본부 콘솔 진입점 — #/, #/:section, #/:section/:id
import { go } from '../../core.js';
import { shell, mountShell, labelOf, canSee, getCounts } from './shared.js';
import { home as dashboard } from './home.js';
import { inbox } from './inbox.js';
import { people } from './people.js';
import { groups } from './groups.js';
import { comms } from './comms.js';
import { system } from './system.js';
import { kpiPage } from './kpi.js';
import { chatAdmin } from './chat.js';
import { ownerPages } from './owner.js';

const SECTIONS = {
  ...inbox,
  users: people.users, staff: people.staff,
  groups: groups.groups, rounds: groups.rounds,
  broadcast: comms.broadcast, community: comms.community, events: comms.events,
  settings: system.settings, audit: system.audit, data: system.data,
  kpi: kpiPage,
  chat: chatAdmin.chat, onboarding: chatAdmin.onboarding,
  overview: ownerPages.overview, security: ownerPages.security, site: ownerPages.site,
};
const DETAILS = { users: people.userDetail, groups: groups.groupDetail, events: comms.eventDetail };
// 예전 주소 호환
const ALIASES = { dashboard: '', challenges: 'groups', agreements: 'groups', settlements: 'groups', payouts: '', hq: '' };

export const home = dashboard;

export async function section(ctx) {
  const sec = ctx.params.section;
  if (sec in ALIASES) { go('#/' + (ALIASES[sec] || '')); return ''; }
  const handler = ctx.params.id ? DETAILS[sec] : SECTIONS[sec];
  if (!handler) { go('#/'); return ''; }
  // 담당 영역 밖의 메뉴는 열지 않는다 (서버에서도 막는다)
  const counts = await getCounts();
  const out = canSee(sec, counts) ? await handler(ctx)
    : { title: labelOf(sec), body: `<div class="empty"><strong>담당 영역이 아닌 메뉴입니다</strong><span>${counts.scopes ? '필요하면 총괄관리자에게 담당 영역을 요청해 주세요.' : '총괄관리자만 볼 수 있는 화면입니다.'}</span><a class="btn sm" href="#/">현황으로</a></div>` };
  const html = await shell(sec, { title: out.title || labelOf(sec), sub: out.sub, actions: out.actions, crumbs: out.crumbs }, out.body);
  return { html, async mount(root) { mountShell(root); if (out.mount) await out.mount(root); } };
}
