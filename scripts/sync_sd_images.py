#!/usr/bin/env python3
"""
sync_sd_images.py

sdServer の画像を、画像ID（sdId）で問い合わせて、更新のあった画像だけを取り込み直すツール。
 - 対象: public/data/enemies.json / npcs.json / objects.json の、sdId を持つエントリ（objects.json は imageFile も持つもの）
 - 判定: sdServer の image_updated_at が、scripts/sdImages.manifest.json に保存した値と違えば更新
 - 取り込み: 透明部分を自動クロップして、エントリの画像ファイルに上書き
 - 反映: 敵は scale の幅（高さは維持）、NPC・オブジェクトは aspect を、新しい画像の縦横比で更新
 - 記録: manifest に imageUpdatedAt（sdServer 側の更新時刻）と fileUpdatedAt（画像ファイルの更新時刻）を保存
画像の URL（/uploads/…）は更新のたびに変わるため、保存するのは ID だけで、URL は毎回 API から取得する。

使い方:
  python3 scripts/sync_sd_images.py            # 更新対象の一覧を表示するだけ（書き込まない）
  python3 scripts/sync_sd_images.py --apply    # 更新のあった画像を取り込む
  python3 scripts/sync_sd_images.py --apply --force   # 時刻に関係なく、全件取り込む
  python3 scripts/sync_sd_images.py --retrim   # 取り込み済みの画像の透明な余白を、すべて切り直す（sdServer には、つながない）
  オプション: --sd http://127.0.0.1:3000（sdServer の URL）、--id 121（指定IDだけ）
"""
import argparse, datetime, io, json, os, re, sys, urllib.request
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, 'scripts', 'sdImages.manifest.json')
IMG = os.path.join(ROOT, 'public', 'images')


def iso(ts):
    return datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f')[:-3] + 'Z'


def trim(im, margin=2):
    """透明部分を切る。ほぼ透明（アルファ 16 以下）のうすいにじみは、数えない。余白は 2 画素"""
    bb = im.getchannel('A').point(lambda v: 255 if v > 16 else 0).getbbox()
    if not bb: return im
    return im.crop((max(0, bb[0] - margin), max(0, bb[1] - margin), min(im.width, bb[2] + margin), min(im.height, bb[3] + margin)))


def apply_size(path, key, kind, d0, im):
    """画像の縦横比を、エントリへ反映（aspect、または scale の幅。高さは維持）"""
    ratio = im.width / im.height
    if kind in ('npc', 'object') and 'aspect' in d0:
        set_field(path, key, 'aspect', lambda _: str(round(ratio, 3)))
    elif 'scale' in d0:
        set_field(path, key, 'scale', lambda _: str(round(d0['scale'][1] * ratio, 2)))


def targets():
    """(データファイル, キー, sdId, 画像の相対パス, 種別) の一覧"""
    out = []
    p = os.path.join(ROOT, 'public/data/enemies.json')
    for k, v in json.load(open(p, encoding='utf-8')).items():
        if 'sdId' not in v:
            continue
        f = v.get('imageFile')
        if f is None:
            continue  # texture 指定の旧形式は、imageFile を持たないので対象外
        out.append((p, k, int(v['sdId']), 'enemies/' + f, 'enemy'))
    p = os.path.join(ROOT, 'public/data/npcs.json')
    for k, v in json.load(open(p, encoding='utf-8')).items():
        if 'sdId' in v:
            out.append((p, k, int(v['sdId']), v['texture'].replace('/images/', '', 1), 'npc'))
    p = os.path.join(ROOT, 'public/data/objects.json')
    for k, v in json.load(open(p, encoding='utf-8')).items():
        if 'sdId' in v and v.get('imageFile'):
            out.append((p, k, int(v['sdId']), 'objects/' + v['imageFile'], 'object'))
    return out


def set_field(path, key, field, fn):
    """JSON のテキストの書式を保ったまま、key エントリ内の最初の field を fn(旧値文字列) で置き換える"""
    t = open(path, encoding='utf-8').read()
    i = t.index('"%s": {' % key)
    m = re.compile(r'"%s": \[\s*([0-9.]+),' % field if field == 'scale' else r'"%s": ([0-9.]+)' % field).search(t, i)
    new = fn(m.group(1))
    t = t[:m.start(1)] + new + t[m.end(1):]
    open(path, 'w', encoding='utf-8').write(t)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--sd', default='http://127.0.0.1:3000')
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--force', action='store_true')
    ap.add_argument('--id', type=int)
    ap.add_argument('--retrim', action='store_true')
    a = ap.parse_args()

    if a.retrim:                                    # 取り込み済みの画像を、切り直す（sdServer には、つながない）
        man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
        n = 0
        for path, key, sid, rel, kind in targets():
            dst = os.path.join(IMG, rel)
            if not os.path.exists(dst): continue
            im0 = Image.open(dst).convert('RGBA'); im = trim(im0)
            if im.size == im0.size: continue
            im.save(dst, optimize=True)
            apply_size(path, key, kind, json.load(open(path, encoding='utf-8'))[key], im)
            if str(sid) in man: man[str(sid)]['fileUpdatedAt'] = iso(os.path.getmtime(dst))
            print('  ID %-4d %-32s %dx%d → %dx%d' % (sid, rel, im0.width, im0.height, im.width, im.height)); n += 1
        json.dump(dict(sorted(man.items(), key=lambda x: int(x[0]))), open(MANIFEST, 'w'), indent=2)
        open(MANIFEST, 'a').write('\n')
        print('切り直し: %d 枚' % n)
        return

    api = {int(i['id']): i for i in json.load(urllib.request.urlopen(a.sd + '/api/images?limit=1000'))['items']}
    man = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {}
    todo, seen = [], {}
    for path, key, sid, rel, kind in targets():
        if a.id and sid != a.id:
            continue
        if sid not in api:
            print('sdServer に ID %d がない: %s' % (sid, key)); continue
        stale = a.force or man.get(str(sid), {}).get('imageUpdatedAt') != api[sid]['image_updated_at'] \
            or not os.path.exists(os.path.join(IMG, rel))
        if stale:
            todo.append((path, key, sid, rel, kind))
    print('更新対象: %d 件' % len(todo))
    for path, key, sid, rel, kind in todo:
        print('  ID %-4d %-28s %s (sd: %s)' % (sid, rel, '' if a.apply else '←更新あり', api[sid]['image_updated_at']))
    if not a.apply:
        return

    done = set()
    for path, key, sid, rel, kind in todo:
        if sid not in done:
            src = Image.open(io.BytesIO(urllib.request.urlopen(a.sd + api[sid]['image_path']).read())).convert('RGBA')
            seen[sid] = trim(src)
            done.add(sid)
        im = seen[sid]
        dst = os.path.join(IMG, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.save(dst, optimize=True)
        apply_size(path, key, kind, json.load(open(path, encoding='utf-8'))[key], im)
        man[str(sid)] = {'imageUpdatedAt': api[sid]['image_updated_at'], 'fileUpdatedAt': iso(os.path.getmtime(dst))}
    json.dump(dict(sorted(man.items(), key=lambda x: int(x[0]))), open(MANIFEST, 'w'), indent=2)
    open(MANIFEST, 'a').write('\n')
    print('取り込み完了: %d 件（画像 %d 枚）' % (len(todo), len(done)))


if __name__ == '__main__':
    main()
