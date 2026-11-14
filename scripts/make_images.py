# 마이챌린지 일러스트를 웹용으로 자르고 줄여서 public/assets/img 에 넣는다
# 사용: python3 scripts/make_images.py <원본 폴더>
#   원본 폴더 구조: <원본>/act/01_kickoff.webp … 28_invite-hero.webp (구글 드라이브 '03_활동일러스트_웹WebP_28종')
#                   <원본>/orig/*.png (드라이브 '04_기본일러스트_원본_9종', '06_아이콘과기준시트_원본_11종')
#                   <원본>/B_01_hero_a.webp (드라이브 '05_기본일러스트_웹용')
#   필요한 것: pip install pillow numpy scipy
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.art-src')
OUT = os.path.join(ROOT, 'public/assets/img')
os.makedirs(OUT, exist_ok=True)
report = []

def save(im, name, q=80, lossless=False):
    path = f'{OUT}/{name}.webp'
    if lossless:
        im.save(path, 'WEBP', lossless=True, quality=100, method=6)
    else:
        im.save(path, 'WEBP', quality=q, method=6)
    report.append((name, im.size, os.path.getsize(path)))

def crop_ratio(im, ratio, cx=0.5, cy=0.5, box=None):
    """box(x0,y0,x1,y1)로 먼저 자른 뒤, 비율(가로/세로)에 맞춰 중심(cx, cy) 기준으로 자른다"""
    if box: im = im.crop(box)
    w, h = im.size
    if w / h > ratio:
        nw = round(h * ratio); x0 = round((w - nw) * cx); return im.crop((x0, 0, x0 + nw, h))
    nh = round(w / ratio); y0 = round((h - nh) * cy); return im.crop((0, y0, w, y0 + nh))

def fit(im, width):
    w, h = im.size
    if w <= width: return im
    return im.resize((width, round(h * width / w)), Image.LANCZOS)

def content_box(im, pad=40, thr=238):
    a = np.asarray(im.convert('RGB')).astype(int)
    m = a.min(axis=2) < thr
    ys, xs = np.where(m)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    W, H = im.size
    return (max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad))

def transparent(im, thr=200):
    """테두리에서 이어진 밝은 배경만 투명하게(안쪽 흰 면은 그대로)"""
    a = np.asarray(im.convert('RGB')).astype(np.uint8)
    light = a.min(axis=2) >= thr
    lab, n = ndimage.label(light)
    edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(edge))
    alpha = np.where(bg, 0, 255).astype(np.uint8)
    # 가장자리 1px 부드럽게
    alpha = ndimage.uniform_filter(alpha.astype(float), size=2).astype(np.uint8)
    alpha[~bg] = 255
    rgba = np.dstack([a, alpha])
    return Image.fromarray(rgba, 'RGBA')

# ───────── 아이콘: 등급 6 · 배지 7 · 분야 6 ─────────
def icons(sheet, boxes, names, size=160):
    im = Image.open(f'{RAW}/orig/{sheet}').convert('RGB')
    for (y0, x0, y1, x1), name in zip(boxes, names):
        pad = 14
        c = im.crop((x0 - pad, y0 - pad, x1 + pad, y1 + pad))
        w, h = c.size; s = max(w, h)
        sq = Image.new('RGB', (s, s), (255, 255, 255)); sq.paste(c, ((s - w) // 2, (s - h) // 2))
        t = transparent(sq).resize((size, size), Image.LANCZOS)
        save(t, name, lossless=False, q=92)

lv = [(58, 39, 311, 267), (57, 286, 311, 514), (56, 531, 311, 759), (56, 776, 311, 1005), (56, 1022, 311, 1251), (56, 1269, 311, 1498)]
bd = [(355, 193, 650, 446), (355, 488, 650, 743), (355, 786, 650, 1042), (355, 1084, 650, 1339), (678, 333, 977, 591), (678, 636, 977, 894), (678, 939, 977, 1200)]
fd = [(419, 52, 609, 268), (405, 303, 619, 495), (417, 516, 618, 755), (405, 775, 619, 991), (417, 1017, 607, 1232), (418, 1265, 619, 1491)]
icons('D_00_levels-badges_sheet.png', lv, [f'lv-L{i}' for i in range(6)])
icons('D_00_levels-badges_sheet.png', bd, ['badge-first_sale', 'badge-repeat_sale', 'badge-completion', 'badge-leader_completion', 'badge-contributor', 'badge-founder', 'badge-mentor'])
icons('E_00_fields_sheet.png', fd, ['field-S-01', 'field-S-02', 'field-S-03', 'field-S-04', 'field-S-05', 'field-S-06'], size=128)

# ───────── 기본 일러스트(흰 배경 스팟) ─────────
def whiten(im, lo=234, hi=246):
    """종이 질감처럼 남은 아주 옅은 회색을 순백으로 바꾼다(흰 바탕에 그림 테두리가 보이지 않게)"""
    a = np.asarray(im.convert('RGB')).astype(float)
    m = a.min(axis=2, keepdims=True)
    t = np.clip((m - lo) / (hi - lo), 0, 1)
    out = a * (1 - t) + 255 * t
    return Image.fromarray(out.round().astype(np.uint8), 'RGB')

def spot(src, name, width, pad=30):
    im = Image.open(f'{RAW}/orig/{src}').convert('RGB')
    im = im.crop(content_box(im, pad=pad))
    save(whiten(fit(im, width)), name, q=84)
spot('B_02_seminar.png', 'spot-seminar', 640)
spot('B_03_challenge-building.png', 'spot-building', 640)
spot('B_04_sharing-demo.png', 'spot-sharing', 640)
spot('C_01_honest-results.png', 'spot-honest-results', 520, pad=20)
spot('C_02_completed-work.png', 'spot-completed-work', 560)
spot('C_03_agreement.png', 'spot-agreement', 520)

# ───────── 홈 히어로 ─────────
hero = Image.open(f'{RAW}/B_01_hero_a.webp').convert('RGB').crop((366, 0, 1200, 800))
save(hero, 'hero-group-table', q=84)

# ───────── 활동 일러스트 ─────────
def A(n): return Image.open(f'{RAW}/act/{n}.webp').convert('RGB')
# (원본, 이름, 비율, cx, cy, 미리 자를 상자, 가로 크기)
SCENES = [
  # 16:10 카드용 (홈 활동, 프로그램, 가이드 표지)
  ('01_kickoff', 'act-kickoff', 1.6, .5, .25, (375, 0, 1200, 800), 960),
  ('02_seminar', 'act-seminar', 1.6, .5, .4, None, 960),
  ('03_workshop', 'act-workshop', 1.6, .5, .22, None, 800),
  ('04_content-video', 'act-content-video', 1.6, .5, .32, None, 800),
  ('05_digital-product', 'act-digital-product', 1.6, .5, .3, None, 800),
  ('06_product-shoot-pack', 'act-product-pack', 1.6, .5, .55, None, 960),
  ('07_web-app', 'act-web-app', 1.6, .5, .6, None, 960),
  ('08_mentoring', 'act-mentoring', 1.6, .5, .55, None, 800),
  ('09_peer-feedback', 'act-peer-feedback', 1.6, .5, .66, None, 800),
  ('10_weekly-retro', 'act-weekly-retro', 1.6, .5, .62, None, 800),
  ('11_demo-day', 'act-demo-day', 1.6, .5, .4, None, 960),
  ('12_networking', 'act-networking', 1.6, .5, .5, (0, 0, 820, 800), 800),
  ('13_book-club', 'act-book-club', 1.6, .5, .6, None, 800),
  ('14_online-meeting', 'act-online-meeting', 1.6, .5, .45, None, 800),
  ('15_coworking', 'act-coworking', 1.6, .5, .5, None, 960),
  ('16_morning-goals', 'act-morning-goals', 1.6, .5, .45, None, 800),
  ('17_field-visit', 'act-field-visit', 1.6, .5, .55, None, 960),
  ('18_exhibition', 'act-exhibition', 1.6, .5, .3, None, 800),
  ('19_popup-store', 'act-popup-store', 1.6, .5, .55, None, 960),
  ('20_customer-interview', 'act-customer-interview', 1.6, .5, .2, None, 800),
  ('21_upcycle', 'act-upcycle', 1.6, .5, .35, None, 800),
  ('22_photo-walk', 'act-photo-walk', 1.6, .5, .5, None, 960),
  ('23_walking', 'act-walking', 1.6, .5, .5, None, 960),
  ('24_garden', 'act-garden', 1.6, .5, .3, None, 800),
  ('25_event-checkin', 'act-event-checkin', 1.6, .5, .5, None, 960),
  ('26_project-showcase', 'act-project-showcase', 1.6, .5, .5, None, 960),
  ('27_podcast', 'act-podcast', 1.6, .5, .45, None, 800),
  ('28_invite-hero', 'act-invite', 1.6, .5, .4, (430, 0, 1200, 800), 770),
]
for src, name, ratio, cx, cy, box, width in SCENES:
    im = crop_ratio(A(src), ratio, cx, cy, box)
    save(fit(im, 960), name, q=80)            # 큰 화면·글 머리용
    save(fit(im, 480), name + '-sm', q=78)    # 목록 카드용

# 페이지 머리 그림 (정사각에 가까운 비율)
HEROES = [
  ('24_garden', 'ph-about', 1.0, .5, .5, None),
  ('01_kickoff', 'ph-how', 1.04, .5, .5, (375, 0, 1200, 800)),
  ('21_upcycle', 'ph-programs', 1.0, .5, .5, None),
  ('27_podcast', 'ph-faq', 1.0, .5, .5, None),
  ('28_invite-hero', 'ph-apply', .97, .5, .5, (425, 0, 1200, 800)),
  ('22_photo-walk', 'ph-404', 1.5, .5, .5, None),
  ('23_walking', 'cta-walking', 1.5, .5, .5, None),
]
for src, name, ratio, cx, cy, box in HEROES:
    im = crop_ratio(A(src), ratio, cx, cy, box)
    save(fit(im, 640), name, q=80)

tot = 0
for n, s, b in report:
    tot += b
    print(f'{n:28s} {s[0]:4d}x{s[1]:<4d} {b/1024:6.1f}KB')
print(f'합계 {len(report)}개 {tot/1024:.0f}KB')

# ───────── 지금 페이지에서 쓰지 않는 판은 지운다 (쓰게 되면 이 목록에서 빼면 된다) ─────────
UNUSED = ['act-garden', 'act-garden-sm', 'act-invite', 'act-photo-walk', 'act-photo-walk-sm', 'act-podcast', 'act-podcast-sm',
          'act-upcycle', 'act-upcycle-sm', 'act-walking', 'act-walking-sm', 'spot-seminar']
for n in UNUSED:
    f = f'{OUT}/{n}.webp'
    if os.path.exists(f): os.remove(f)

# ───────── 크기 목록 (사이트 빌드가 width/height 속성에 쓴다) ─────────
import json, glob
dims = {}
for f in sorted(glob.glob(f'{OUT}/*.webp')):
    n = os.path.basename(f)[:-5]
    dims[n] = list(Image.open(f).size)
with open(os.path.join(ROOT, 'functions/_site/images.generated.js'), 'w', encoding='utf-8') as fp:
    fp.write('// scripts: make_images.py 가 만든 파일입니다. 직접 고치지 마세요.\n')
    fp.write('export const IMG = ' + json.dumps(dims, ensure_ascii=False, separators=(',', ':')) + ';\n')
print('manifest', len(dims))
