"""G（デイラミ精霊国）のギルドの中。ギルド長は、長老の一族が担う（ユーザー指定）。共通のギルドのマップを複製して、ギルド長の街の人だけを替える。
  - 冒険者ギルド（guild_adv_g・guild_adv_master_g）: ギルド長は、長老の息子（elf_elder_son）
  - 魔法ギルド（guild_mage_g・guild_mage_master_g）: ギルド長は、長老の娘（elf_elder_daughter）
"""
import json
import os

MAPS = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'maps')
# (複製元, 新しい ID, 名前, 戻り先, 替える街の人（元 → 新）, 出口の links の替え（元 → 新）)
GUILDS = [
    ('guild_adv', 'guild_adv_g', '冒険者ギルド（デイラミ精霊国）', 'town_g', {}, {'guild_adv_master': 'guild_adv_master_g'}),
    ('guild_adv_master', 'guild_adv_master_g', '冒険者ギルド長の部屋（デイラミ精霊国）', 'guild_adv_g', {'adv_guild_master': 'elf_elder_son'}, {}),
    ('guild_mage', 'guild_mage_g', '魔法ギルド（デイラミ精霊国）', 'town_g', {}, {'guild_mage_master': 'guild_mage_master_g'}),
    ('guild_mage_master', 'guild_mage_master_g', '魔法ギルド長の部屋（デイラミ精霊国）', 'guild_mage_g', {'mage_guild_master': 'elf_elder_daughter'}, {}),
]


def build():
    out = []
    for src, new, name, back, npc_map, link_map in GUILDS:
        m = json.load(open(os.path.join(MAPS, src + '.json'), encoding='utf-8'))
        m['id'] = new; m['name'] = name; m['nextMap'] = back
        for n in m.get('npcs', []): n['id'] = npc_map.get(n['id'], n['id'])
        for l in m.get('links', {}).values(): l['nextMap'] = link_map.get(l['nextMap'], l['nextMap'])
        out.append(m)
    return out
