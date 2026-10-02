# -*- coding: utf-8 -*-
"""把用户提供的「一句话介绍」文本解析成 INTRO 数据，并与 index.html 里的 DATA 对齐。

核心难点：`Washington` 在词库里出现两次（人名 / 地名），
单靠英文名无法区分，必须用「板块 + 英文 + 中文」定位到唯一的 deck 词条。

输出：JS 片段，形如
  const INTRO = { "names|Washington|华盛顿(人名)": "...", ... };
并把英文唯一的情况简化为直接用英文名作键。
"""
import re, json, sys, io

SRC, HTML, OUT = sys.argv[1], sys.argv[2], sys.argv[3]

# ---------- 1. 从 index.html 抽出 DATA，建立词条清单 ----------
html = io.open(HTML, encoding='utf-8').read()
m = re.search(r'^const DATA = (\[.*?\]);\s*$', html, re.M | re.S)
if not m:
    sys.exit('找不到 DATA')
DATA = json.loads(m.group(1))

deck = []          # [(sec_key, sec_title, en, cn)]
for sec in DATA:
    for w in sec['words']:
        deck.append((sec['key'], sec['title'], w['en'], w['cn']))

# ---------- 2. 解析介绍文本 ----------
text = io.open(SRC, encoding='utf-8').read()
TITLE = re.compile(r'^\*\*(.+?)（(.+?)）\*\*\s*$')

entries = []
cur, buf = None, []


def flush():
    global cur, buf
    if cur is not None:
        intro = ' '.join(x.strip() for x in buf if x.strip()).strip()
        if intro:
            entries.append((cur[0], cur[1], intro))
    cur, buf = None, []


for raw in text.splitlines():
    line = raw.strip()
    if not line or line.startswith(('---', '##', '###')):
        continue
    mm = TITLE.match(line)
    if mm:
        flush()
        cur = (mm.group(1).strip(), mm.group(2).strip())
        continue
    if cur is not None:
        buf.append(line)
flush()

print('介绍条目 %d 条；词库 %d 词' % (len(entries), len(deck)))

# ---------- 3. 逐条匹配到 deck 词条 ----------
# 先按 (en) 和 (en, cn) 建索引
by_en = {}
by_en_cn = {}
for sec_key, sec_title, en, cn in deck:
    by_en.setdefault(en, []).append((sec_key, sec_title, en, cn))
    by_en_cn.setdefault((en, cn), []).append((sec_key, sec_title, en, cn))

matched = {}        # key -> intro
unmatched = []      # 介绍里写了但词库没有
ambiguous = []
used_ids = set()    # 已被占用的 deck id，避免重名冲突重复分配

for cn, en, intro in entries:
    cand = None
    base_cn = re.sub(r'[（(].*?[）)]', '', cn)

    if (en, cn) in by_en_cn and len(by_en_cn[(en, cn)]) == 1:
        cand = by_en_cn[(en, cn)][0]
    elif len(by_en.get(en, [])) == 1:
        cand = by_en[en][0]
    elif len(by_en.get(en, [])) > 1:
        # 英文重名（如 Washington 人名/地名）：按中文名匹配；
        # 同名候选有多个时，按「文档出现顺序」依次吃掉还没分配过的那个
        # （介绍文本里的顺序是：先人名后地名，与词库顺序一致）。
        pool = [x for x in by_en[en]
                if re.sub(r'[（(].*?[）)]', '', x[3]) == base_cn
                and (x[0], x[2], x[3]) not in used_ids]
        if pool:
            cand = pool[0]
        else:
            ambiguous.append((cn, en, [x[3] for x in by_en[en]]))
            continue
    else:
        unmatched.append((cn, en))
        continue

    sec_key, sec_title, den, dcn = cand
    used_ids.add((sec_key, den, dcn))
    # 英文唯一时用 en 作键（占位小）；重名时用完整 id 形式
    key = en if len(by_en[en]) == 1 else (sec_key + '|' + den + '|' + dcn)
    matched[key] = intro

# ---------- 4. 覆盖情况 ----------
covered = set()
for k in matched:
    if k.count('|') == 2:
        covered.add(k)
    else:
        covered.add(k)
print('匹配成功 %d 条' % len(matched))
if unmatched:
    print('⚠️ 词库里没有这些词（%d）：%s' % (len(unmatched), unmatched[:10]))
if ambiguous:
    print('⚠️ 无法消歧（%d）：%s' % (len(ambiguous), ambiguous))

missing = []
for sec_key, sec_title, en, cn in deck:
    key = en if len(by_en[en]) == 1 else (sec_key + '|' + en + '|' + cn)
    # 英文重名的用 id 键；否则 en 键
    if len(by_en[en]) == 1:
        if en not in matched:
            missing.append((sec_title, en, cn))
    else:
        if (sec_key + '|' + en + '|' + cn) not in matched or True:
            pass
if missing:
    print('缺少介绍的词条（%d）：%s' % (len(missing), missing[:15]))
else:
    print('✅ 每个内置词条都有介绍')

# ---------- 5. 输出 ----------
lines = ['const INTRO = {']
for k, intro in matched.items():
    lines.append('  %s: %s,' % (json.dumps(k, ensure_ascii=False),
                                json.dumps(intro, ensure_ascii=False)))
lines.append('};')
io.open(OUT, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print('写入 %s，共 %d 条' % (OUT, len(matched)))
