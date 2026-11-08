"""国専用のギルドの中（共通のギルドのマップを複製して、受付・ギルド長・教官の街の人だけを替える）。
  G（デイラミ精霊国）: ギルド長は、長老の一族が担う（ユーザー指定）。長老たちは、世界樹のそばの小さな家（elder_house_g）の中にいる。
  - 冒険者ギルド（guild_adv_g・guild_adv_master_g）: ギルド長は、長老の息子（elf_elder_son）
  - 魔法ギルド（guild_mage_g・guild_mage_master_g）: ギルド長は、長老の娘（elf_elder_daughter）
  C（ミレニアム自由都市）: 商人ギルド長は砂漠の住民（議長は、議長の館 mansion_chairman_c にいる）。E（ガリレオ連盟）の議長は、議長の館（mansion_chairman_e。castle_f.py）にいる。
  F（ライアン獣王国）: 受付・ギルド長・教官は、獣人（sdServer の画像）。店員（武器屋・道具屋・宿屋・鍛冶屋）も全て獣人。G の店員（武器屋・道具屋・宿屋・ギルドの受付）は、全て長老の娘か息子。
  - 冒険者ギルド（guild_adv_f・guild_adv_master_f）: 受付は狐の獣人、ギルド長は虎の獣人（部族長・女）
  - 商人ギルド（guild_merchant_f・guild_merchant_master_f）: 受付は狸の獣人、ギルド長は猫の獣人（部族長・男）と、猫の貴族の婦人
  - 職業訓練所（guild_training_f）: 教官は熊の獣人
"""
import json
import os

MAPS = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'data', 'maps')
# (複製元, 新しい ID, 名前, 戻り先, 替える街の人（元 → 新）, 出口の links の替え（元 → 新）)
GUILDS = [
    ('guild_merchant_master', 'elder_house_g', '長老の家（デイラミ精霊国。世界樹のそば）', 'town_g', {'merchant_master_man': 'elf_elder_man', 'merchant_master_woman': 'elf_elder_woman'}, {}),
    ('guild_adv', 'guild_adv_g', '冒険者ギルド（デイラミ精霊国）', 'town_g', {'adv_clerk_man': 'elder_son_clerk', 'adv_clerk_woman': 'elder_daughter_clerk'}, {'guild_adv_master': 'guild_adv_master_g'}),
    ('guild_adv_master', 'guild_adv_master_g', '冒険者ギルド長の部屋（デイラミ精霊国）', 'guild_adv_g', {'adv_guild_master': 'elf_elder_son'}, {}),
    ('guild_mage', 'guild_mage_g', '魔法ギルド（デイラミ精霊国）', 'town_g', {'mage_clerk_woman': 'elder_daughter_clerk', 'mage_clerk_man': 'elder_son_clerk'}, {'guild_mage_master': 'guild_mage_master_g'}),
    ('guild_mage_master', 'guild_mage_master_g', '魔法ギルド長の部屋（デイラミ精霊国）', 'guild_mage_g', {'mage_guild_master': 'elf_elder_daughter'}, {}),
    ('guild_adv', 'guild_adv_f', '冒険者ギルド（ライアン獣王国）', 'town_f', {'adv_clerk_man': 'fox_clerk_man', 'adv_clerk_woman': 'fox_clerk_woman'}, {'guild_adv_master': 'guild_adv_master_f'}),
    ('guild_adv_master', 'guild_adv_master_f', '冒険者ギルド長の部屋（ライアン獣王国）', 'guild_adv_f', {'adv_guild_master': 'tiger_adv_master'}, {}),
    ('guild_merchant', 'guild_merchant_f', '商人ギルド（ライアン獣王国）', 'town_f', {'merchant_clerk_man': 'tanuki_clerk_man', 'merchant_clerk_woman': 'tanuki_clerk_woman'}, {'guild_merchant_master': 'guild_merchant_master_f'}),
    ('guild_merchant_master', 'guild_merchant_master_f', '商人ギルド長の部屋（ライアン獣王国）', 'guild_merchant_f', {'merchant_master_man': 'cat_merchant_master', 'merchant_master_woman': 'cat_noble_woman'}, {}),
    ('guild_merchant', 'guild_merchant_c', '商人ギルド（ミレニアム自由都市）', 'town_c', {'merchant_clerk_man': 'desert_clerk_man', 'merchant_clerk_woman': 'desert_clerk_woman'}, {'guild_merchant_master': 'guild_merchant_master_c'}),
    ('guild_merchant_master', 'guild_merchant_master_c', '商人ギルド長の部屋（ミレニアム自由都市）', 'guild_merchant_c', {'merchant_master_man': 'desert_middle_man', 'merchant_master_woman': 'desert_old_woman'}, {}),
    ('city_inn', 'city_inn_f', '宿屋・酒場（ライアン獣王国）', 'town_f', {'innkeeper': 'innkeeper_f', 'inn_cook': 'inn_cook_f', 'inn_waitress': 'inn_waitress_f'}, {'city_inn_2f': 'city_inn_2f_f'}),
    ('city_inn_2f', 'city_inn_2f_f', '宿屋の客室（ライアン獣王国）', 'city_inn_f', {'inn_waitress': 'inn_waitress_f'}, {'city_inn': 'city_inn_f'}),
    ('guild_smith', 'guild_smith_f', '鍛冶屋（ライアン獣王国）', 'town_f', {'dwarf_smith': 'smith_keeper_f'}, {}),
    ('city_inn', 'city_inn_g', '宿屋・酒場（デイラミ精霊国）', 'town_g', {'innkeeper': 'innkeeper_g', 'inn_cook': 'inn_cook_g', 'inn_waitress': 'inn_waitress_g'}, {'city_inn_2f': 'city_inn_2f_g'}),
    ('city_inn_2f', 'city_inn_2f_g', '宿屋の客室（デイラミ精霊国）', 'city_inn_g', {'inn_waitress': 'inn_waitress_g'}, {'city_inn': 'city_inn_g'}),
    ('city_inn', 'city_inn_c', '宿屋・酒場（ミレニアム自由都市）', 'town_c', {}, {'city_inn_2f': 'city_inn_2f_c'}),   # 砂漠の国: 暖炉なし
    ('city_inn_2f', 'city_inn_2f_c', '宿屋の客室（ミレニアム自由都市）', 'city_inn_c', {}, {'city_inn': 'city_inn_c'}),
    ('guild_training', 'guild_training_f', '職業訓練所（ライアン獣王国）', 'town_f', {'trainer': 'bear_trainer'}, {}),
    # A（キュラビッド帝国）: 雪国なので、建物の中に暖炉を 1 部屋に 1 つ（HEARTH_A）。街の人は、共通のまま
    ('shop', 'shop_a', '店（キュラビッド帝国）', 'town_a', {}, {}),
    ('guild_adv', 'guild_adv_a', '冒険者ギルド（キュラビッド帝国）', 'town_a', {}, {'guild_adv_master': 'guild_adv_master_a'}),
    ('guild_adv_master', 'guild_adv_master_a', '冒険者ギルド長の部屋（キュラビッド帝国）', 'guild_adv_a', {}, {}),
    ('guild_training', 'guild_training_a', '職業訓練所（キュラビッド帝国）', 'town_a', {}, {}),
    ('city_inn', 'city_inn_a', '宿屋・酒場（キュラビッド帝国）', 'town_a', {}, {'city_inn_2f': 'city_inn_2f_a'}),
    ('city_inn_2f', 'city_inn_2f_a', '宿屋の客室（キュラビッド帝国）', 'city_inn_a', {}, {'city_inn': 'city_inn_a'}),
]
HEARTH_A = {   # 新しい ID → [(x, y, 種類)]。北の壁ぎわの床。宿屋の 1 階（city_inn）には、元から暖炉がある
    'shop_a': [(3, 1, 'hearth')], 'guild_adv_a': [(5, 1, 'hearth')], 'guild_adv_master_a': [(4, 1, 'hearth')],
    'guild_training_a': [(5, 1, 'hearth_stone')], 'city_inn_2f_a': [(5, 7, 'hearth'), (13, 7, 'hearth')],
}


def build():
    out = []
    for src, new, name, back, npc_map, link_map in GUILDS:
        m = json.load(open(os.path.join(MAPS, src + '.json'), encoding='utf-8'))
        m['id'] = new; m['name'] = name; m['nextMap'] = back
        for n in m.get('npcs', []): n['id'] = npc_map.get(n['id'], n['id'])
        for l in m.get('links', {}).values(): l['nextMap'] = link_map.get(l['nextMap'], l['nextMap'])
        if new.endswith('_c'):   # 砂漠の国（C）は、暖炉を置かない
            from castle_f import strip_hearth
            strip_hearth(m)
        from castle_f import add_hearth
        for x, y, kind in HEARTH_A.get(new, []): add_hearth(m, x, y, kind)
        out.append(m)
    return out
