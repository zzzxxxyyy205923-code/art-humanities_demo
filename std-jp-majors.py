# -*- coding: utf-8 -*-
"""「日韩」组专业标准化 v2：从 site-data.js（损坏前最后一次同步，数据完整）恢复原始条目，
按 (学校, 原始上层名) 显式映射为（官方语言规范名, 标准中文译名），同校去重，写回 offers.json。"""
import json
import re

BASE = '/Users/szhan111/Documents/GitHub/art-humanities_demo/'
M = {
    '京都艺术大学': {
        'you hua': ('油絵', '油画'), '插画设计': ('イラストレーション', '插画'),
        'cha hua she ji': ('イラストレーション', '插画'), 'ping mian cha hua': ('イラストレーション', '插画'),
        'tao yi': ('陶芸', '陶艺'), 'はんが': ('版画', '版画'),
    },
    '多摩美术大学': {
        'コウゲイ': ('工芸', '工艺'), 'アブラエセンコウ': ('油絵専攻', '油画专攻'),
        'はんが': ('版画', '版画'), '版画': ('版画', '版画'), 'Print': ('版画', '版画'),
    },
    '神户艺术工科大学': {
        'cha hua she ji': ('イラストレーション', '插画'),
        'ビジュアルデザインがっか': ('ビジュアルデザイン学科', '视觉设计学科'),
        'Visual Design - Illustration Course': ('ビジュアルデザイン（イラストレーションコース）', '视觉设计（插画方向）'),
        'セイサンコウゲイデザイン': ('生産工芸デザイン', '生产工艺设计'),
        'メディアげいじゅつ': ('メディア芸術', '媒体艺术'),
    },
    '京都精华大学': {
        'ゾウケイガッカ': ('造形学科', '造形学科'), 'ゾウケイガッカハンガ': ('造形学科（版画）', '造形学科（版画）'),
        'Art and Design': ('アート＆デザイン', '艺术与设计'),
    },
    '名古屋艺术大学': {
        'デザインファンデーション': ('デザインファンデーション', '设计基础'), '插画设计': ('イラストレーション', '插画'),
        'デザインリョウイキファンデーション': ('デザイン領域ファンデーション', '设计领域基础'), 'ヨウガ': ('油絵', '油画'),
    },
    '东京艺术大学': {
        'グローバルアートプラクティス': ('グローバルアートプラクティス', '全球艺术实践'),
        'ゲ-ム・インタラクティプア-ト': ('ゲーム・インタラクティブアート', '游戏与交互艺术'),
        'Inter Media Art': ('インターメディアアート', '媒体艺术'),
    },
    '尚美学园大学': {
        'じょうほうひょうげんがっか': ('情報表現学科', '信息表现学科'), 'イラスト': ('イラストレーション', '插画'),
        'じょうほうひょうげん': ('情報表現', '信息表现'),
    },
    '弘益大学': {'회화과': ('회화과', '绘画科'), '纯艺': ('회화', '纯艺术')},
    '文星艺术大学': {
        'そうごうぞうけい りったいぶんや へんにゅうがく': ('総合造形（立体分野・編入学）', '综合造形（立体方向·编入）'),
        'アブラエ': ('油絵', '油画'),
    },
    '专门学校动画艺术家学院': {'アニメションデザイン': ('アニメーションデザイン', '动画设计')},
    '世宗大学': {'회화과 서양화': ('회화과（서양화）', '绘画科（西洋画）')},
    '东京学艺大学': {'Arts & Crafts Teacher Education Subprogram': ('Arts & Crafts Teacher Education Subprogram', '艺术与工艺教师教育子课程')},
    '东京工艺大学': {'Photography and Imaging (DPI)': ('写真学科（Photography and Imaging）', '摄影学科'),
                 '摄影': ('写真学科（Photography and Imaging）', '摄影学科')},
    '东京福祉大学': {'ホイクジドウ': ('保育児童', '保育儿童')},
    '东京视觉艺术学院专门学校': {'しゃしんがっか': ('写真学科', '摄影学科')},
    '九州产业大学': {'photo media': ('フォトメディア', '摄影媒体')},
    '京都情报大学院大学': {'ウェブピジネスギジュツセンコウ': ('ウェブビジネス技術専攻', '网络商务技术专攻')},
    '仓敷艺术科学大学': {'イラストレーション': ('イラストレーション', '插画')},
    '创形专门学校': {'Oil Painting': ('油絵', '油画')},
    '城西国际大学': {'ニューメデ ィアコース': ('ニューメディアコース', '新媒体方向')},
    '大阪艺术大学': {'ビジュツガッカ': ('美術学科', '美术学科')},
    '女子美术大学': {'Print': ('版画', '版画')},
    '嵯峨美术大学': {'ceramics': ('陶芸', '陶艺')},
    '建国大学': {'绘画': ('회화', '绘画')},
    '成安造形大学': {'イラストレーション': ('イラストレーション', '插画')},
    '文京学院大学': {'cha hua she ji': ('イラストレーション', '插画')},
    '日本大学': {'はんが': ('版画', '版画')},
    '武藏野美术大学': {'版画': ('版画', '版画')},
    '涩谷时尚艺术专门学校': {'びじゅつひょうげん': ('美術表現', '美术表现')},
    '爱知县立艺术大学': {'ceramics': ('陶芸', '陶艺')},
    '赤堀制果专门学校': {'スイーツ・パン': ('スイーツ・パン', '甜点·面包')},
}

# ── 从 site-data.js 恢复（损坏前）的 offers 数据 ─────────────
src = open(BASE + 'data/site-data.js', encoding='utf-8').read()
src = re.sub(r'/\*.*?\*/', '', src, flags=re.S)
class _W:
    pass
window = _W()
exec(src, {'window': window, 'null': None, 'true': True, 'false': False})
recovered = window.SFK_DATA['offers']
d = json.load(open(BASE + 'data/offers.json', encoding='utf-8'))

# 非 JP 组以 site-data 恢复（保险），JP 组按映射标准化
total, replaced, missing = 0, 0, []
for g, rows in recovered['groups'].items():
    cur = d['groups'][g]
    for i, r in enumerate(rows):
        c = cur[i]
        for k in ('count', 'zh', 'en', 'tags', 'seasons', 'seasonCounts', 'hl', 'top30', 'majors'):
            if k in r:
                c[k] = r[k]

for r in d['groups']['JP']:
    m = M.get(r['zh'])
    for b in ('ug', 'pg'):
        old = r.get('majors', {}).get(b) or []
        newlist, seen = [], set()
        for en, cn in old:
            total += 1
            if m is None or en not in m:
                missing.append(f"{r['zh']} :: {en}")
                newlist.append([en, en])
                continue
            replaced += 1
            nu, nc = m[en]
            if nu not in seen:
                seen.add(nu)
                newlist.append([nu, nc])
        if r.get('majors'):
            r['majors'][b] = newlist

json.dump(d, open(BASE + 'data/offers.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=2)
print(f'条目总数 {total}，已标准化 {replaced}，未命中 {len(missing)}')
for x in missing:
    print('  未命中:', x)
