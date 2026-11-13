// 운영본부 콘솔 진입점 — #/admin, #/admin/:section, #/admin/:section/:id
import { go } from '../../core.js';
import { shell, mountShell, labelOf } from './shared.js';
import { home as dashboard } from './home.js';
import { inbox } from './inbox.js';
import { people } from './people.js';
import { groups } from './groups.js';
import { money } from './money.js';
import { comms } from './comms.js';
import { system } from './system.js';

const SECTIONS = {
  ...inbox,
  users: people.users, staff: people.staff,
  groups: groups.groups, rounds: groups.rounds,
  payouts: money.payouts, hq: money.hq,
  broadcast: comms.broadcast, community: comms.community, events: comms.events,
  settings: system.settings, audit: system.audit, data: system.data,
};
const DETAILS = { users: people.userDetail, groups: groups.groupDetail, events: comms.eventDetail };
// 예전 주소 호환
const ALIASES = { dashboard: '' };

export const home = dashboard;

export async function section(ctx) {
  const sec = ctx.params.section;
  if (sec in ALIASES) { go('#/admin' + (ALIASES[sec] ? '/' + ALIASES[sec] : '')); return ''; }
  const handler = ctx.params.id ? DETAILS[sec] : SECTIONS[sec];
  if (!handler) { go('#/admin'); return ''; }
  const out = await handler(ctx);
  const html = await shell(sec, { title: out.title || labelOf(sec), sub: out.sub, actions: out.actions, crumbs: out.crumbs }, out.body);
  return { html, async mount(root) { mountShell(root); if (out.mount) await out.mount(root); } };
}
