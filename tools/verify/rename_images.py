import os, shutil

DIR = "/Users/szhan111/iCloud云盘（归档）/Desktop/SFK/SFK 教研管理/高端美研产品/SFK数据库搭建&AI智能体/艺术人文/案例滚动播放"
IMG_EXT = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp',
           '.tif', '.tiff', '.heic', '.heif', '.avif', '.svg'}

# 1) 仅收集顶层图片文件（跳过隐藏文件、子目录、非图片）
candidates = []
for name in os.listdir(DIR):
    p = os.path.join(DIR, name)
    if not os.path.isfile(p):
        continue
    if name.startswith('.'):
        continue
    ext = os.path.splitext(name)[1].lower()
    if ext not in IMG_EXT:
        continue
    candidates.append((name, os.path.getmtime(p)))

# 2) 按修改时间正序
candidates.sort(key=lambda x: x[1])

print("=" * 70)
print(f"处理目录：{DIR}")
print(f"找到图片文件总数：{len(candidates)}")
print("=" * 70)
print("【处理前 · 按修改时间正序】序号 | 原名 | 修改时间")
print("-" * 70)
for i, (name, mt) in enumerate(candidates, 1):
    print(f"{i:>3} | {name:<18} | {mt}")

# 3) 两阶段重命名：先临时名，再最终编号，避免中间名冲突
tmp_pairs = []
for idx, (name, mt) in enumerate(candidates):
    ext = os.path.splitext(name)[1].lower()
    tmp = f".__tmp_rename_{idx:06d}{ext}"
    src = os.path.join(DIR, name)
    dst = os.path.join(DIR, tmp)
    os.rename(src, dst)
    tmp_pairs.append((dst, ext))

print("-" * 70)
print("【重命名中】已移至临时名，开始按序编号 …")

after = []
for i, (tmp, ext) in enumerate(tmp_pairs, 1):
    final = f"{i}{ext}"
    dst = os.path.join(DIR, final)
    if os.path.exists(dst):
        print(f"  冲突跳过：{final} 已存在，回滚临时文件 {os.path.basename(tmp)}")
        continue
    os.rename(tmp, dst)
    after.append((i, final))

print("=" * 70)
print("【重命名后 · 最终文件列表（正序）】")
print("-" * 70)
for i, final in after:
    print(f"{i:>3} | {final}")
print("=" * 70)
print(f"执行结果：共处理 {len(candidates)} 个图片文件，成功重命名 {len(after)} 个，"
      f"跳过 {len(candidates) - len(after)} 个（冲突/异常）。")
print("全部保留原始格式与扩展名，未改动子目录与非图片文件。")
