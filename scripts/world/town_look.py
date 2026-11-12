"""街の外観（外のマップから見た壁・門・家・門前の石畳）の、国ごとの素材。大きさ・位置は全国同じ（壁 16×12・門は南の真ん中の 2 マス）。
キーは、外のマップの文字: '6' 壁・'7' 門・'8' 家（壁の中の屋根）・'9' 門前の石畳。書いていない文字は、既定（world_consts.LEGEND: city_wall・district_gate・brick_house・plaza_stone）"""
LOOK = {
    'a': {'7': 'gate_snow', '8': 'brick_house_snow', '9': 'plaza_stone_snow'},                                                   # 雪国: 雪をかぶった屋根・雪の積もった石畳
    'b': {'6': 'white_wall', '7': 'gate_marble', '8': 'white_house'},                                         # 聖国: 白亜の壁・大理石の門
    'c': {'6': 'adobe_wall', '7': 'gate_adobe', '8': 'mideast_house', '9': 'plaza_earth'},                    # 砂漠: 土壁・中東風の家・土の門前
    'd': {'7': 'gate_village', '8': 'village_house'},                                                                              # 平野の王国: 赤い瓦の家
    'e': {'6': 'ochre_wall', '7': 'gate_white', '8': 'mideast_shop'},                                         # 南国の港: 黄土色の壁・白い門
    'f': {'6': 'rock_wall', '7': 'gate_rock', '8': 'rock_house'},                                             # 獣人とドワーフ: 岩の壁・岩の門
    'g': {'6': 'wooden_wall', '7': 'gate_wood', '8': 'wooden_house', '9': 'plaza_forest'},                    # 精霊の森: 木の壁・木の門・森の地面
    'h': {'6': 'wooden_wall', '7': 'gate_plank', '8': 'plank_house'},                                          # 辺境: 木の壁・板張りの家
    'i': {'6': 'lake_wall', '7': 'gate_lake', '8': 'lake_house'},   # 湖の公国: 青みのある灰色の石（苔むした石は、洞窟の壁に見えるのでやめた）
    'j': {'6': 'mage_wall', '7': 'gate_mage', '8': 'mage_house'},   # 魔導国: 紫がかった灰色の石（真っ白な大理石は、暗い森の中で浮くのでやめた）
    'k': {'6': 'edo_wall', '7': 'edo_gate', '8': 'edo_house'},                                                # 島（江戸風）: 白い漆喰の壁・町家
    'k1': {'6': 'edo_wall', '7': 'edo_gate_town', '8': 'edo_house'},   # 町: 小さな木戸
}

INSIDE_KEEP = {'g'}   # G（精霊の森）: 中の囲いは、生け垣（森の国の作り）のまま。外の木の壁とは変えている


def apply_inside(site_id, m):
    """街の中のマップ m の、囲いの壁（凡例 'W'）と、外へ出る門（district_gate）を、外から見た素材（LOOK）と同じにする。
    壁・門は、外から入って中でも見えるので、国の見た目をそろえる（ユーザー指示 2026-11-11）。書いていない国（A・D など）は、既定の city_wall・district_gate のまま"""
    look = LOOK.get(site_id, {})
    if '6' in look and 'W' in m['legend'] and site_id not in INSIDE_KEEP: m['legend']['W'] = look['6']
    if '7' in look:
        for ch, name in list(m['legend'].items()):
            if name == 'district_gate': m['legend'][ch] = look['7']
