import pypdf
p = '/Users/szhan111/iCloud云盘（归档）/Desktop/SFK/SFK 教研管理/高端美研产品/SFK数据库搭建&AI智能体/艺术人文/'
r = pypdf.PdfReader(p + '艺术人文科系-全链路成长发展手册.pdf')
o = []
for i in range(46, 63):
    o.append('=== P%d ===\n%s' % (i + 1, (r.pages[i].extract_text() or '').replace(' ', '')))
open(p + 'art-humanities-site/tools/.tmp-crops/manual.txt', 'w').write('\n'.join(o))
print('ok')
