"""国専用のギルドの中（共通のギルドのマップを複製して、受付・ギルド長・教官の街の人だけを替える）。
  G（デイラミ精霊国）: ギルド長は、長老の一族が担う（ユーザー指定）。
  - 冒険者ギルド（guild_adv_g・guild_adv_master_g）: ギルド長は、長老の息子（elf_elder_son）
  - 魔法ギルド（guild_mage_g・guild_mage_master_g）: ギルド長は、長老の娘（elf_elder_daughter）
  C（ミレニアム自由都市）・E（ガリレオ連盟）: 議長が、商人ギルドの奥の部屋にいる（C は砂漠の議長、E は金の亡者の議長）。
  F（ライアン獣王国）: 受付・ギルド長・教官は、獣人（sdServer の画像）。
  - 冒険者ギルド（guild_adv_f・guild_adv_master_f）: 受付は狐の獣人、ギルド長は虎の獣人（部族長・女）
  - 商人ギルド（guild_merchant_f・guild_merchant_master_f）: 受付は狸の獣人、ギルド長は猫の獣人（部族長・男）と、猫の貴族の婦人
  - 職業訓練所（guild_training_f）: 教官は熊の獣人
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
    ('guild_adv', 'guild_adv_f', '冒険者ギルド（ライアン獣王国）', 'town_f', {'adv_clerk_man': 'fox_clerk_man', 'adv_clerk_woman': 'fox_clerk_woman'}, {'guild_adv_master': 'guild_adv_master_f'}),
    ('guild_adv_master', 'guild_adv_master_f', '冒険者ギルド長の部屋（ライアン獣王国）', 'guild_adv_f', {'adv_guild_master': 'tiger_adv_master'}, {}),
    ('guild_merchant', 'guild_merchant_f', '商人ギルド（ライアン獣王国）', 'town_f', {'merchant_clerk_man': 'tanuki_clerk_man', 'merchant_clerk_woman': 'tanuki_clerk_woman'}, {'guild_merchant_master': 'guild_merchant_master_f'}),
    ('guild_merchant_master', 'guild_merchant_master_f', '商人ギルド長の部屋（ライアン獣王国）', 'guild_merchant_f', {'merchant_master_man': 'cat_merchant_master', 'merchant_master_woman': 'cat_noble_woman'}, {}),
    ('guild_merchant', 'guild_merchant_c', '商人ギルド（ミレニアム自由都市）', 'town_c', {'merchant_clerk_man': 'desert_clerk_man', 'merchant_clerk_woman': 'desert_clerk_woman'}, {'guild_merchant_master': 'guild_merchant_master_c'}),
    ('guild_merchant_master', 'guild_merchant_master_c', '議長の部屋（ミレニアム自由都市）', 'guild_merchant_c', {'merchant_master_man': 'desert_chairman', 'merchant_master_woman': 'desert_middle_woman'}, {}),
    ('guild_merchant', 'guild_merchant_e', '商人ギルド（ガリレオ連盟）', 'town_e', {}, {'guild_merchant_master': 'guild_merchant_master_e'}),
    ('guild_merchant_master', 'guild_merchant_master_e', '議長の部屋（ガリレオ連盟）', 'guild_merchant_e', {'merchant_master_man': 'chairman_e'}, {}),
    ('guild_training', 'guild_training_f', '職業訓練所（ライアン獣王国）', 'town_f', {'trainer': 'bear_trainer'}, {}),
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
