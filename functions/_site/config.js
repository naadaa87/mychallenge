// 마이챌린지(마챌) 공개 사이트 설정
// ─────────────────────────────────────────────────────────────
// 도메인을 바꾸거나 네이버·구글 소유확인 코드를 받으면 이 파일만 고치면 됩니다.
// GitHub 웹에서 이 파일 → 연필(Edit) 아이콘 → 값 수정 → Commit changes.
// Cloudflare 환경 변수(SITE_URL, NAVER_SITE_VERIFICATION, GOOGLE_SITE_VERIFICATION)를
// 넣어 두면 그 값이 이 파일보다 우선합니다.
// ─────────────────────────────────────────────────────────────

export const SITE = {
  // 대표 주소. 끝에 / 를 붙이지 않습니다. 커스텀 도메인을 연결하면 여기를 바꾸세요. 예: 'https://www.mychallenge.kr'
  url: 'https://mychallenge.kr',
  name: '마이챌린지',
  alt: '마챌',
  fullName: '마이챌린지(마챌)',
  tagline: '함께 배우고 함께 도전하는 사이드프로젝트 커뮤니티',
  locale: 'ko_KR',
  lang: 'ko',
  themeColor: '#2457F5',

  // 검색엔진 소유확인 코드 (meta 태그 방식). 받은 코드의 content 값만 넣습니다.
  // 네이버 서치어드바이저: <meta name="naver-site-verification" content="여기 값">
  naverVerification: '379c68b11b3d1e9b5afb28d36885bfb247e820e4',
  // 구글 서치콘솔: <meta name="google-site-verification" content="여기 값">
  googleVerification: '',

  // 운영 주체 정보. 개인정보처리방침과 푸터에 쓰입니다. 정식 공개 전에 반드시 채워 주세요.
  operator: {
    name: '마이챌린지 운영본부',
    company: '',          // 운영 법인 또는 상호. 예: '주식회사 ○○○'
    ceo: '',              // 대표자
    bizNumber: '',        // 사업자등록번호
    address: '',          // 사업장 주소
    email: '',            // 문의 이메일
    privacyOfficer: '',   // 개인정보 보호책임자 이름(직책)
    privacyEmail: '',     // 개인정보 문의 이메일 (비우면 email 사용)
  },

  // 홈페이지 제작·유지관리자. 제작자 관리 프로그램으로 방문 현황 일부를 보냅니다(개인정보처리방침 1·2·5·9항).
  // start 전에는 스크립트를 불러오지 않습니다(처리방침 시행일). 추적 안 함·GPC를 켠 브라우저도 불러오지 않습니다.
  maintainer: {
    name: '최시준',
    site: 'choisijun.com',
    script: 'https://choisijun.com/k1.js',
    integrity: 'sha384-E7Xl7wiU1vNu5AUY41kJB1uV52L+UEvqwYRzRj4zdaBGAeyRfCll926ETRo39Jm6',
    start: '2026-11-27',
  },

  // 이용약관·개인정보처리방침 시행일. 문서를 고치면 이 날짜도 바꿉니다. 가입 동의 기록에 이 값이 남습니다.
  policyVersion: '2026-11-23',

  // 사이트 콘텐츠 기준일 (사이트맵 lastmod 기본값)
  updated: '2026-11-23',
};

// 런타임(Functions)과 빌드(Node)에서 환경 변수로 덮어쓰기
export function siteUrl(env) {
  const v = (env && env.SITE_URL) || (typeof process !== 'undefined' && process.env && process.env.SITE_URL) || SITE.url;
  return String(v).trim().replace(/\/+$/, '');
}
export function verification(env) {
  const pick = k => (env && env[k]) || (typeof process !== 'undefined' && process.env && process.env[k]) || '';
  return {
    naver: pick('NAVER_SITE_VERIFICATION') || SITE.naverVerification,
    google: pick('GOOGLE_SITE_VERIFICATION') || SITE.googleVerification,
  };
}
export const POLICY_VERSION = SITE.policyVersion;
