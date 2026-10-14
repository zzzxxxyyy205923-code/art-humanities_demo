# -*- coding: utf-8 -*-
"""案例模块写入逻辑（常驻脚本）——Portfolio JSON + Portfolio 素材 → data/cases.json
规则清单（后续新增/更新数据自动遵循）：
  1. 院校类型：单一类型原样保留；含多种信息时按「录取院校」实际类型筛选保留
     （艺术院校 / 综合大学 / 文理学院）。
  2. 专业方向筛选：选项 = 「学术分支」字段在源数据中的去重值（按记录数多→少），
     命中规则 = 案例卡「院校类型 · 学术分支」中「·」右侧的 branch 字段值精确匹配；
     卡片底部与详情页的「案例标签」仅作展示（词库切分自「案例标签」字段），
     不作为筛选命中词。数据更新后选项自动跟随。
  3. 筛选组选项全部由源 JSON 字段动态生成（数据更新后自动重置）：
     - 申请维度 ←「申请学位」去重值；申请国家 ←「申请国家」去重值（「/」复合值拆分
       后逐国统计，多选命中任一国家即通过）；专业方向 ←「学术分支」去重值。
     - 各组均按记录数多→少排序，选项与记录值严格同源。
  4. 录取专业：分隔符「 · 」统一更正为「｜」。
  5. 其它录取院校：拆分为数组（浮层底部「录取院校」栏逐条展示）。
  6. admittedEn：录取院校官方英文名，由内置 EN_MAP 映射补齐（新增院校按同格式补充）。
  7. 素材同步（Portfolio/ 子文件夹 ↔ assets/img/portfolio/<ID>/）：
     - 首图.* → 卡片 hero；数字编号图片 → 详情页作品（按编号自然排序）；
       视频（.mov/.mp4/.webm/.m4v）→ 统一置于 works 首位；PDF 不做任何处理或写入。
     - 增量复制（目标已存在且同体积则跳过）；ID 中的「:」「/」净化为「-」。
  8. 「申请维度」=「申请学位」；全部 ID 记录全量写入（portfolioConfirmed = 记录数）。"""
import json
import os
import re
import shutil
from collections import Counter

BASE = '/Users/szhan111/Documents/GitHub/art-humanities_demo/'
SRC = ('/Users/szhan111/iCloud云盘（归档）/Desktop/SFK/SFK 教研管理/高端美研产品/'
       'SFK数据库搭建&AI智能体/艺术人文/data/Portfolio_academic_art_humanity_Portfolio.json')
ASSET_SRC = ('/Users/szhan111/iCloud云盘（归档）/Desktop/SFK/SFK 教研管理/高端美研产品/'
             'SFK数据库搭建&AI智能体/艺术人文/Portfolio')
ASSET_DEST = BASE + 'assets/img/portfolio/'

LIBERAL_ARTS = ['韦尔斯利', '格林内尔', '威廉姆斯', '史密斯', '巴德', '斯基德莫尔',
                '阿默斯特', '斯沃斯莫尔', '鲍登', '明德', '瓦萨', '科尔比', '贝茨', '哈弗福德']
KNOWN_TYPES = ['文理学院', '艺术院校', '综合大学']

# 录取院校官方英文名映射（数据源无英文字段）
EN_MAP = {
    '伦敦大学学院': 'University College London',
    '伦敦艺术大学': 'University of the Arts London',
    '南洋艺术学院': 'Nanyang Academy of Fine Arts',
    '卡内基梅隆大学': 'Carnegie Mellon University',
    '哥伦比亚大学': 'Columbia University',
    '威廉姆斯学院': 'Williams College',
    '宾夕法尼亚大学': 'University of Pennsylvania',
    '布朗大学': 'Brown University',
    '康奈尔大学': 'Cornell University',
    '新加坡拉萨尔艺术学院': 'LASALLE College of the Arts',
    '格林内尔学院': 'Grinnell College',
    '欧洲设计学院（IED）': 'Istituto Europeo di Design (IED)',
    '爱丁堡大学': 'The University of Edinburgh',
    '牛津大学': 'University of Oxford',
    '皇家艺术学院': 'Royal College of Art',
    '纽约大学': 'New York University',
    '罗德岛艺术设计学院': 'Rhode Island School of Design',
    '耶鲁大学': 'Yale University',
    '芝加哥艺术学院': 'School of the Art Institute of Chicago',
    '韦尔斯利学院': 'Wellesley College',
    '香港大学': 'The University of Hong Kong',
}

# 录取院校所在国家映射（排序第一层级依据：录取院校国家与所选申请国家一致的结果优先）
SCHOOL_COUNTRY = {
    '伦敦大学学院': '英国', '伦敦艺术大学': '英国', '皇家艺术学院': '英国',
    '爱丁堡大学': '英国', '牛津大学': '英国',
    '哥伦比亚大学': '美国', '卡内基梅隆大学': '美国', '威廉姆斯学院': '美国',
    '宾夕法尼亚大学': '美国', '布朗大学': '美国', '康奈尔大学': '美国',
    '格林内尔学院': '美国', '纽约大学': '美国', '罗德岛艺术设计学院': '美国',
    '耶鲁大学': '美国', '芝加哥艺术学院': '美国', '韦尔斯利学院': '美国',
    '南洋艺术学院': '新加坡', '新加坡拉萨尔艺术学院': '新加坡',
    '欧洲设计学院（IED）': '意大利',
    '香港大学': '中国香港',
}

# 「其它录取院校」源数据为连写串的记录：按实际院校精确拆分（后续新记录同格式补充）
OTHER_ADMITTED_SPLIT = {
    '南加州大学纽约大学加州大学圣地亚哥分校爱丁堡大学北卡罗莱纳大学教堂山分校帕森斯设计学院':
        ['南加州大学', '纽约大学', '加州大学圣地亚哥分校', '爱丁堡大学',
         '北卡罗莱纳大学教堂山分校', '帕森斯设计学院'],
}

TAG_LEXICON = [
    # 学科 / 门类（含原七类与高频方向词）
    '纯艺', '雕塑', '陶瓷', '摄影', '插画', '绘画', '油画', '影像',
    '艺术管理', '艺术史', '艺术教育', '艺术与科学',
    '叙事插画', '文学插画', '手绘与数字插画', '量子物理叙事',
    '纪实摄影', '人文摄影',
    '装置艺术', '行为装置', '大型特定场域式装置', '影像与空间装置',
    '互动装置', '互动媒体', '交互设计', '声音艺术', '综合材料', '纸艺创作',
    '空间设计', '空间与情绪', '场所依恋', '视觉艺术', '可穿戴艺术',
    '参与式行为', '行为', '装置',
    # 议题 / 概念（数据中高频出现的复合词）
    '身份认同', '身份解构', '公共议题', '公共教育', '认知偏见', '材料实验',
    '时空折叠', '超现实叙事', '心理健康', '心理创伤与自我疗愈', '成长路径',
    '华裔成长经验', '双重文化记忆', '家庭联结', '家庭档案', '家族记忆',
    '代际关系', '社会规训', '女性意识', '女性劳动', '女性身体与生殖权',
    '亲密关系', '虚拟身份', '自然反思', '自然疗愈', '生态危机', '生态材料',
    '生态艺术', '城市生态', '生物科技伦理', '动物伦理', '人类中心主义',
    '跨文化凝视', '哲学思辨', '五行哲思', '音乐跨媒介转译',
    '中国传统图像的当代转译', '跨学科研究', '战争记忆', '生死议题',
    '仪式感', '身体痕迹', '过度包装反思消费', '多媒体艺术', '综合大学',
]

IMG_EXT = ('.png', '.jpg', '.jpeg', '.webp')
VIDEO_EXT = ('.mov', '.mp4', '.webm', '.m4v')
NUM_RE = re.compile(r'^(\d+)\.(png|jpg|jpeg|webp)$', re.I)

# 素材排除清单（相对 ASSET_SRC 的「记录ID/文件名」）：不写入网站，源目录文件保持原样。
# 当前排除：XSX-上海 的 小徐risd-05.MOV（应用户要求从学生案例板块移除该视频引用）。
ASSET_EXCLUDE = {
    '艺术人文-插画-本科-XSX-上海/小徐risd-05.MOV',
}


def split_tags(raw):
    """「案例标签」→ 独立标签数组：先按「/」拆分，再按词库最长匹配贪心切分连写串；
    词库未覆盖的剩余片段整体保留为标签，保证不丢信息。"""
    out = []
    for seg in (raw or '').replace('/', ' ').split():
        buf = ''
        i = 0
        while i < len(seg):
            hit = next((t for t in sorted(TAG_LEXICON, key=len, reverse=True)
                        if seg.startswith(t, i)), None)
            if hit:
                if buf:
                    out.append(buf)
                    buf = ''
                out.append(hit)
                i += len(hit)
            else:
                buf += seg[i]
                i += 1
        if buf:
            out.append(buf)
    return out


def branch_options(recs):
    """「专业方向」筛选选项：「学术分支」字段的去重值（按记录数多→少）。
    与案例卡/详情页「院校类型 · 学术分支」中「·」右侧文字同源，数据更新后自动跟随。"""
    cnt = Counter((r.get('学术分支') or '').strip() for r in recs
                  if (r.get('学术分支') or '').strip())
    return [v for v, _ in cnt.most_common()]


def region_options(recs):
    """「申请国家」筛选选项：「申请国家」字段去重值（按记录数多→少）。
    「/」复合值（如 美国/英国）拆分后逐国统计，数据更新后自动跟随。"""
    cnt = Counter()
    for r in recs:
        for part in (r.get('申请国家') or '').split('/'):
            p = part.strip()
            if p:
                cnt[p] += 1
    return [v for v, _ in cnt.most_common()]


def degree_options(recs):
    """「申请维度」筛选选项：「申请学位」字段的去重值（按记录数多→少）。
    选项值即学位层次文字（本科 / 研究生），与记录 degree 字段直接匹配。"""
    cnt = Counter((r.get('申请学位') or '').strip() for r in recs
                  if (r.get('申请学位') or '').strip())
    return [v for v, _ in cnt.most_common()]


def classify_admitted(admitted):
    a = admitted or ''
    if re.search(r'艺术|美术|设计|视觉|插画|雕塑|摄影|音乐|传媒', a):
        return '艺术院校'
    if any(k in a for k in LIBERAL_ARTS):
        return '文理学院'
    return '综合大学'


def resolve_school_type(raw_type, admitted):
    t = (raw_type or '').strip()
    if not t:
        return classify_admitted(admitted)
    contained = [k for k in KNOWN_TYPES if k in t]
    if len(contained) <= 1:
        return contained[0] if contained else t
    actual = classify_admitted(admitted)
    return actual if actual in contained else actual


def sanitize(name):
    """目标目录名净化：URL 不友好字符替换为「-」。"""
    return re.sub(r'[:/]', '-', name)


def copy_into(src_path, dest_dir, dest_name):
    """增量复制：目标已存在且同体积则跳过。"""
    dest = os.path.join(dest_dir, dest_name)
    if os.path.exists(dest) and os.path.getsize(dest) == os.path.getsize(src_path):
        return dest
    shutil.copy2(src_path, dest)
    return dest


def find_asset_folder(record_id):
    """按 ID 定位素材文件夹；ID 含「/」时尝试「:」别名（macOS 文件名限制），
    仍无命中则按「学位-缩写-城市」后缀匹配（文件夹分支命名与 JSON 不一致时以 JSON 为准）。"""
    for name in (record_id, record_id.replace('/', ':')):
        folder = os.path.join(ASSET_SRC, name)
        if os.path.isdir(folder):
            return folder
    parts = record_id.split('-')
    if len(parts) >= 4:
        suffix = '-' + '-'.join(parts[-3:])
        for fn in os.listdir(ASSET_SRC):
            if fn.endswith(suffix):
                return os.path.join(ASSET_SRC, fn)
    return None


def trim_white_borders(path):
    """去除图片四周烤入的纯白边框：按内容边界裁切，内容比例不变、无变形；
    无 PIL 库或无边框时原样跳过。每次同步对 hero 副本执行，结果幂等。"""
    try:
        from PIL import Image
    except ImportError:
        return path
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    def row_white(y): return all(min(px[x, y][:3]) >= 245 for x in range(0, w, 4))
    def col_white(x): return all(min(px[x, y][:3]) >= 245 for y in range(0, h, 4))
    top = 0
    while top < h and row_white(top): top += 1
    bottom = h - 1
    while bottom > top and row_white(bottom): bottom -= 1
    left = 0
    while left < w and col_white(left): left += 1
    right = w - 1
    while right > left and col_white(right): right -= 1
    if (left, top, right, bottom) != (0, 0, w - 1, h - 1) and right > left and bottom > top:
        im.crop((left, top, right + 1, bottom + 1)).save(path)
    return path


def sync_assets(record_id):
    """Portfolio/<ID>/ 素材 → assets/img/portfolio/<ID>/
    返回 (hero_rel_path, works_rel_paths)。视频统一置于 works 首位；PDF 跳过。"""
    folder = find_asset_folder(record_id)
    if not folder:
        return '', []
    sid = sanitize(record_id)
    dest_dir = os.path.join(ASSET_DEST, sid)
    os.makedirs(dest_dir, exist_ok=True)
    rel = lambda p: os.path.relpath(p, BASE).replace(os.sep, '/')

    hero, videos, images = '', [], []
    for fn in sorted(os.listdir(folder)):
        if fn.startswith('.'):
            continue
        if record_id + '/' + fn in ASSET_EXCLUDE:
            continue
        ext = os.path.splitext(fn)[1].lower()
        src_path = os.path.join(folder, fn)
        if not os.path.isfile(src_path):
            continue
        if fn == '视频' or ext in VIDEO_EXT:                     # 视频居首
            videos.append(rel(copy_into(src_path, dest_dir, fn)))
        elif ext in IMG_EXT and fn.startswith('首图'):           # 卡片首图（自动去白边，无缝撑满）
            hero = rel(trim_white_borders(copy_into(src_path, dest_dir, fn)))
        else:
            m = NUM_RE.match(fn)                                 # 编号作品图（自然排序）
            if m:
                images.append((int(m.group(1)), rel(copy_into(src_path, dest_dir, fn))))
    images.sort(key=lambda x: x[0])
    return hero, videos + [p for _, p in images]


def convert(r):
    segs = (r.get('ID') or '').split('-')
    branch = (r.get('学术分支') or '').strip()
    admitted = (r.get('录取院校') or '').strip()
    hero, works = sync_assets(r['ID'])
    other_raw = (r.get('其它录取院校') or '').strip()
    other = OTHER_ADMITTED_SPLIT.get(other_raw,
                                     [other_raw] if other_raw and other_raw != '无' else [])
    return {
        'id': r['ID'],
        'degree': (r.get('申请学位') or '').strip(),
        'schoolType': resolve_school_type(r.get('院校类型'), admitted),
        'branch': branch,
        'region': (r.get('申请国家') or '').strip(),
        'admitted': admitted,
        'admittedEn': EN_MAP.get(admitted, ''),   # 官方英文名：内置映射补齐
        'admittedCountry': SCHOOL_COUNTRY.get(admitted, ''),   # 录取院校所在国家（排序用）
        'admittedMajor': (r.get('录取专业') or '').strip().replace(' · ', '｜'),
        'otherAdmitted': other,
        'tags': split_tags(r.get('案例标签')),
        'language': (r.get('语言成绩') or '').strip(),
        'gpa': (r.get('标化成绩') or '').strip(),
        'origin': (r.get('生源学校背景') or '').strip(),
        'hero': hero,
        'works': works,
        'idCity': segs[-1] if len(segs) >= 2 else '',
        'idInitials': re.sub(r'[^A-Z]', '', segs[-2]) if len(segs) >= 3 else '',
    }


src = json.load(open(SRC, encoding='utf-8'))
recs = [r for r in src if (r.get('ID') or '').strip()]

cases_path = BASE + 'data/cases.json'
cases = json.load(open(cases_path, encoding='utf-8'))
existing = {c['id']: c for c in cases.get('portfolio', [])}

portfolio = []
for r in recs:
    c = convert(r)
    old = existing.get(c['id'], {})
    if old.get('hero') and os.path.exists(BASE + old['hero']):
        c['hero'] = old['hero']               # 人工维护的 hero（文件须真实存在）优先
    if old.get('admittedEn') and not c['admittedEn']:
        c['admittedEn'] = old['admittedEn']
    portfolio.append(c)
cases['portfolio'] = portfolio
cases['portfolioConfirmed'] = len(portfolio)

cases['dimension'] = {
    'id': 'dimension', 'label': '申请维度', 'labelEn': 'DIMENSION',
    'options': [{'value': v, 'label': v} for v in degree_options(recs)],
}
cases['filters'] = [
    {'id': 'region', 'label': '申请国家', 'labelEn': 'COUNTRY', 'row': 1,
     'options': [{'value': v, 'label': v} for v in region_options(recs)]},
    {'id': 'branch', 'label': '专业方向', 'labelEn': 'MAJOR', 'row': 2,
     'options': [{'value': v, 'label': v} for v in branch_options(recs)]},
]

json.dump(cases, open(cases_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
c = portfolio[0]
n_works = sum(len(x['works']) for x in portfolio)
n_video = sum(1 for x in portfolio for w in x['works'] if w.lower().endswith(VIDEO_EXT))
n_hero = sum(1 for x in portfolio if x['hero'])
print('记录数:', len(portfolio), '| hero:', n_hero, '| works 总数:', n_works,
      '| 视频居首记录数:', n_video)
print('首条:', c['id'], '| admittedEn =', c['admittedEn'], '| works =', len(c['works']),
      '| 首个作品为视频:', bool(c['works']) and c['works'][0].lower().endswith(VIDEO_EXT))
missing_en = sorted({x['admitted'] for x in portfolio if not x['admittedEn']})
print('缺英文名院校:', missing_en or '无')
