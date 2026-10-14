# -*- coding: utf-8 -*-
"""导师团队写入逻辑（常驻脚本）——instructors JSON + 导师照片 → data/instructors.json
规则清单（后续新增/更新数据自动遵循）：
  1. 数据源：艺术人文/data/instructors_art_humanity.json（导师ID / 称呼 / 角色 /
     毕业院校 / 学术分支 / 照片路径 / 是否隐藏）。
  2. 排除：是否隐藏 = True 的记录不写入（当前为学术导师 Xia.Y 及其照片 Xia.Y.jpg）。
  3. 字段映射：称呼 → name；毕业院校 → background；学术分支 → title；
     角色 → category（海外教授 / 教研导师 / 学术导师 / 业界导师 / 顶尖学者）。
  4. 专业领域提炼：「教研导师」「学术导师」的 title 不写原文，仅按 FIELD_OF 映射
     写入专业领域关键词（如 纯艺、插画叙事、动态插画），其余头衔/经历/奖项文字不进站。
  5. 照片：按角色子文件夹匹配（先同名、后去空格前缀匹配，兼容 .JPG 大小写），
     增量复制为 assets/img/instructors/<照片路径文件名>；匹配不到 → img 留空（前端显示待提供占位）。
  6. regions 留空数组（源数据无地区信息）。"""
import json
import os
import shutil

BASE = '/Users/szhan111/Documents/GitHub/art-humanities_demo/'
SRC = ('/Users/szhan111/iCloud云盘（归档）/Desktop/SFK/SFK 教研管理/高端美研产品/'
       'SFK数据库搭建&AI智能体/艺术人文/data/instructors_art_humanity.json')
PHOTO_SRC = ('/Users/szhan111/iCloud云盘（归档）/Desktop/SFK/SFK 教研管理/高端美研产品/'
             'SFK数据库搭建&AI智能体/艺术人文/instructors')
PHOTO_DEST = BASE + 'assets/img/instructors/'

# 「教研导师 / 学术导师」专业领域提炼（按导师ID；只保留领域词，头衔/经历/奖项不进站）
FIELD_OF = {
    # ── 教研导师 ──
    'inst-aca-001': '视觉叙事 · 艺术疗愈',
    'inst-aca-002': '当代艺术',
    'inst-aca-003': '插画 · 商业视觉',
    'inst-aca-004': '绘本 · 跨学科',
    'inst-aca-005': '当代艺术 · 升学规划',
    'inst-aca-006': '视觉媒体 · 艺术疗愈',
    # ── 学术导师 ──
    'inst-aca-007': '纯艺 · 雕塑装置',
    'inst-aca-008': '纯艺 · 版画',
    'inst-aca-009': '纯艺 · 实验艺术',
    'inst-aca-010': '纯艺 · 摄影 · 影像',
    'inst-aca-011': '纯艺 · 绘画装置',
    'inst-aca-012': '纯艺',
    'inst-aca-013': '纯艺 · 多媒介',
    'inst-aca-014': '插画 · 艺术管理',
    'inst-aca-015': '插画叙事 · 绘本',
    'inst-aca-016': '绘本叙事 · 编辑插画',
    'inst-aca-017': '动态插画',
    'inst-aca-018': '摄影 · 实验影像',
    'inst-aca-019': '插画叙事 · 编辑插画',
    'inst-aca-020': '插画 · 绘本叙事',
    'inst-aca-021': '纯艺 · 生物艺术 · 艺术疗愈',
    'inst-aca-022': '插画 · 多模态叙事',
    'inst-aca-023': '插画',
    'inst-aca-024': '纯艺 · 雕塑',
    'inst-aca-026': '纯艺 · 摄影',
    'inst-aca-027': '插画',
    'inst-aca-028': '插画 · 综合材料',
    'inst-aca-029': '纯艺 · 摄影',
    'inst-aca-030': '插画',
    'inst-aca-031': '插画',
    'inst-aca-032': '纯艺 · 版画 · 油画',
    'inst-aca-033': '纯艺 · 装置',
    'inst-aca-034': '纯艺 · 摄影 · 策展',
    'inst-aca-035': '纯艺 · 油画 · 版画',
    'inst-aca-036': '纯艺 · 综合材料 · 雕塑',
    'inst-aca-037': '纯艺 · 摄影 · 实验影像',
    'inst-aca-038': '绘画 · 摄影 · 数字媒体 · 艺术疗愈',
}

IMG_EXT = {'.jpg', '.jpeg', '.png', '.webp'}

# 照片别名：JSON 照片路径与实际文件不一致时的显式映射（导师ID → 实际文件名）。
# 依据（可追溯）：全量配对校验中，Du.S 是唯一无照片记录、D.Shu.jpg 是「学术导师」文件夹中
# 唯一未被引用的照片，构成 1:1 消除配对；Du.S ↔ D.Shu 为同一人名两种缩写（姓名变体）。
PHOTO_ALIAS = {
    'inst-aca-021': 'D.Shu.jpg',
}


def norm(s):
    return s.replace(' ', '').replace('\u3000', '').lower()


def find_photo(role, photo_path, record):
    """在角色子文件夹中定位照片：
    ① 别名表（PHOTO_ALIAS）；② 照片路径同名文件；③ 去空格前缀匹配（兼容 .JPG 与文件名附注），
    多个候选时按「毕业院校」关键词消歧（如两条 M.H 记录分别对应 耶鲁 / 坎伯韦尔 文件）。"""
    folder = os.path.join(PHOTO_SRC, role)
    if not os.path.isdir(folder):
        return None
    files = [f for f in os.listdir(folder)
             if not f.startswith('.') and os.path.splitext(f)[1].lower() in IMG_EXT]
    rid = (record.get('导师ID') or '').strip()
    if rid in PHOTO_ALIAS and PHOTO_ALIAS[rid] in files:
        return os.path.join(folder, PHOTO_ALIAS[rid])
    base = os.path.basename(photo_path)
    if base in files:
        return os.path.join(folder, base)
    stem = os.path.splitext(base)[0]
    hits = [f for f in files if norm(os.path.splitext(f)[0]).startswith(norm(stem))]
    if len(hits) > 1:
        school = norm(record.get('毕业院校') or '')
        hits = [f for f in files] if not school else hits
        refined = [f for f in hits if school and school in norm(f)]
        if refined:
            hits = refined
    return os.path.join(folder, hits[0]) if hits else None


def sync_photo(role, photo_path, record, dest_names):
    """照片增量复制到 assets/img/instructors/（目标名 = 照片路径文件名；
    多条记录共用同一照片路径时追加导师ID消歧）。
    返回 (站点相对路径, 实际源文件相对路径或'')；无匹配照片返回 ('', '')。"""
    src = find_photo(role, photo_path, record)
    if not src:
        return '', ''
    os.makedirs(PHOTO_DEST, exist_ok=True)
    base = os.path.basename(photo_path)
    stem, ext = os.path.splitext(base)
    if dest_names.get(base) is not None and dest_names[base] != record['导师ID']:
        dest = PHOTO_DEST + '%s-%s%s' % (stem, record['导师ID'], ext)
    else:
        dest = PHOTO_DEST + base
    dest_names.setdefault(base, record['导师ID'])
    if not os.path.exists(dest) or os.path.getsize(dest) != os.path.getsize(src):
        shutil.copy2(src, dest)
    rel_src = os.path.relpath(src, os.path.dirname(PHOTO_SRC)).replace(os.sep, '/')
    return 'assets/img/instructors/' + os.path.basename(dest), rel_src


src = json.load(open(SRC, encoding='utf-8'))
cases_path = BASE + 'data/instructors.json'
out = json.load(open(cases_path, encoding='utf-8'))

instructors = []
skipped = []
dest_names = {}
src_dirty = False
for r in src:
    if (r.get('是否隐藏') or '').strip().lower() == 'true':
        skipped.append('%s(%s)' % (r['称呼'], r['角色']))
        continue
    role = (r.get('角色') or '').strip()
    rid = (r.get('导师ID') or '').strip()
    img, photo_src = sync_photo(role, (r.get('照片路径') or '').strip(), r, dest_names)
    # 关联关系写回源 JSON：实际引用的照片文件路径 + 配对依据（仅在与照片路径文件名不一致时）
    if photo_src and photo_src != 'instructors/' + os.path.basename(r.get('照片路径') or ''):
        r['照片实际文件'] = photo_src
        src_dirty = True
    if rid == 'inst-aca-021' and photo_src:
        note = ('与 instructors/学术导师/D.Shu.jpg 为同一数据源：全量配对校验中本记录是唯一'
                '无照片记录、D.Shu.jpg 是唯一未被引用照片（1:1 消除配对），且 Du.S ↔ D.Shu 为姓名变体')
        if r.get('照片匹配') != note:
            r['照片匹配'] = note
            src_dirty = True
    instructors.append({
        'id': rid,
        'name': (r.get('称呼') or '').strip(),
        'background': (r.get('毕业院校') or '').strip(),
        # 教研/学术导师：title 只保留专业领域关键词；其余角色沿用原文
        'title': FIELD_OF.get(rid, (r.get('学术分支') or '').strip()),
        'category': role,
        'img': img,
        # 照片溯源：实际引用文件相对路径（与照片路径文件名一致时省略）
        'photoSource': photo_src if photo_src and
                       photo_src != 'instructors/' + os.path.basename(r.get('照片路径') or '') else '',
        'regions': [],
    })

out['instructors'] = instructors
json.dump(out, open(cases_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
if src_dirty:   # 关联关系写回源 JSON（保持字段完整、可追溯）
    json.dump(src, open(SRC, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

from collections import Counter
print('导师总数:', len(instructors), '| 分类:', dict(Counter(i['category'] for i in instructors)))
print('已排除(隐藏):', skipped or '无')
print('有照片:', sum(1 for i in instructors if i['img']), '| 待提供:', sum(1 for i in instructors if not i['img']))
print('照片溯源字段:', sum(1 for i in instructors if i.get('photoSource')))
for i in instructors:
    if i.get('photoSource') or i['id'] == 'inst-aca-021':
        print(' ', i['id'], i['name'], '→', i['img'], '<-', i.get('photoSource'))
print('专业领域提炼条数(教研+学术):', sum(1 for i in instructors
      if i['category'] in ('教研导师', '学术导师') and i['id'] in FIELD_OF))
