// 공개 사이트에 쓰는 일러스트 배치표. 그림 파일은 public/assets/img/ 에 있다.
import { img, esc } from './layout.js';
import { CATEGORIES } from './guides.js';
import { LEVEL_NAMES, FIELDS, BADGE_NAMES } from '../_lib/rules.js';

// 가이드 표지 (목록 카드와 글 머리에 같은 그림을 쓴다)
export const GUIDE_ART = {
  'side-project-start': ['act-morning-goals', '책상에서 이번 주 할 일을 노트에 적는 사람'],
  'side-job-ideas': ['act-field-visit', '지도를 들고 동네 가게를 둘러보며 메모하는 네 사람'],
  'first-sale-12-weeks': ['act-product-pack', '첫 판매를 위해 상품을 촬영하고 포장하는 사람들'],
  'why-group': ['act-peer-feedback', '테이블에 둘러앉아 서로의 시안을 보고 의견을 나누는 그룹'],
  'profit-sharing': ['act-workshop', '화이트보드 앞에서 역할과 계획을 함께 정리하는 사람들'],
  'side-job-company-rules': ['act-online-meeting', '퇴근 후 집에서 온라인으로 그룹 회의에 참여하는 사람'],
  'side-income-tax': ['act-digital-product', '표와 서류를 펼쳐 놓고 숫자를 확인하는 사람들'],
  'avoid-side-job-course-scams': ['act-exhibition', '전시물을 꼼꼼히 살펴보며 메모하는 사람들'],
  'weekly-checkin': ['act-weekly-retro', '둥글게 앉아 지난주에 끝낸 일을 돌아가며 나누는 모임'],
  'project-paper': ['act-project-showcase', '프로젝트 결과물을 펼쳐 놓고 설명하고 살펴보는 사람들'],
  'n-job-statistics': ['act-coworking', '코워킹 공간에서 각자 자기 프로젝트에 집중하는 사람들'],
};
export const guideArt = (slug, o = {}) => {
  const a = GUIDE_ART[slug];
  return a ? img(a[0], o.decorative ? '' : a[1], o) : '';
};

// 등급·배지·분야 아이콘
export const lvIcon = (code, size = 40, alt = '') => `<img class="ic" src="/assets/img/lv-${code}.webp" width="${size}" height="${size}" alt="${alt}" loading="lazy" decoding="async">`;
export const badgeIcon = (code, size = 56, alt = '') => `<img class="ic" src="/assets/img/badge-${code}.webp" width="${size}" height="${size}" alt="${alt}" loading="lazy" decoding="async">`;
export const fieldIcon = (code, size = 44, alt = '') => `<img class="ic" src="/assets/img/field-${code}.webp" width="${size}" height="${size}" alt="${alt}" loading="lazy" decoding="async">`;

export const levelStrip = () => `<ol class="lv-strip" aria-label="회원 등급 여섯 단계">${Object.entries(LEVEL_NAMES).map(([c, n]) => `<li>${lvIcon(c, 64)}<b>${c}</b><span>${n}</span></li>`).join('')}</ol>`;
export const badgeGrid = () => `<ul class="badge-grid">${Object.entries(BADGE_NAMES).map(([c, n]) => `<li>${badgeIcon(c, 64)}<span>${n}</span></li>`).join('')}</ul>`;
export const fieldGrid = () => `<ul class="field-grid">${Object.entries(FIELDS).map(([c, n]) => `<li>${fieldIcon(c, 44)}<span>${n}</span></li>`).join('')}</ul>`;

// 가이드 카드 (홈, 가이드 목록, 글 아래 '이어서 읽기')
export function guideCard(g) {
  const art = guideArt(g.slug, { decorative: true });
  return `<a class="g-card${art ? ' has-cover' : ''}" href="/guide/${g.slug}/">${art ? `<span class="g-cover">${art}</span>` : ''}<span class="g-body"><span class="g-cat">${CATEGORIES[g.category]}</span><h3>${esc(g.title)}</h3><p>${esc(g.summary)}</p><span class="g-more">읽어 보기</span></span></a>`;
}
