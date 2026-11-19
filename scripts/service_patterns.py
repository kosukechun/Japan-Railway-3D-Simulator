"""Representative stopping patterns. IDs are persistent application identifiers.

Stations are explicitly listed so nearby stations, branches and sea crossings
cannot silently become passenger connections. A slash separates prefectures.
"""

WEST = "西日本旅客鉄道"
CENTRAL = "東海旅客鉄道"
SHIKOKU = "四国旅客鉄道"
HANKYU = "阪急電鉄"
KYOTO = "京都市"
KINTETSU = "近畿日本鉄道"

# Explicit, operator-specific IDs keep two different 十条 stations separate.
STATION_IDS = {
    (KINTETSU, "十条"): "十条（近鉄）",
    ("京都市交通局", "六地蔵"): "六地蔵（地下鉄）",
    ("京都市交通局", "山科"): "山科（地下鉄）",
    ("京都市交通局", "東山"): "東山（京都）",
}

# At Tennoji, N02 has distinct disconnected geometries for the loop and
# Hanwa platforms. Model the station stop without drawing a new track.
PLATFORM_GAPS_KM = {("kishuji", "天王寺"): 0.13}


def routes(operator, names):
    return [(operator, name) for name in names.split()]


def service(identifier, name, operator, kind, color, tracks, sections):
    stops = []
    for section in sections.split("/"):
        pref, *names = section.split()
        stops.extend((station, pref) for station in names)
    return dict(id=identifier, name=name, operator=operator, kind=kind,
                color=color, tracks=tracks, stations=stops)


trunk = routes(WEST, "東海道線 山陽線")
loop = routes(WEST, "大阪環状線")
west_loop = "大阪府 大阪 福島 西九条 弁天町 大正 新今宮 天王寺"

SERVICES = [
    service("special-rapid", "JR神戸・京都・琵琶湖線 新快速", "JR西日本", "jr", "#50b4ec",
            trunk, "兵庫県 姫路 加古川 西明石 明石 神戸 三ノ宮 芦屋 尼崎 / 大阪府 大阪 新大阪 高槻 / 京都府 京都 山科 / 滋賀県 大津 石山 南草津 草津 守山 野洲 近江八幡 能登川 彦根 米原"),
    service("kyoto-rapid", "JR京都線 快速", "JR西日本", "jr", "#e99d49",
            routes(WEST, "東海道線"), "大阪府 大阪 新大阪 茨木 高槻 島本 / 京都府 山崎 長岡京 向日町 桂川 西大路 京都"),
    service("kyoto-local", "JR京都線 普通", "JR西日本", "jr", "#66c5bc",
            routes(WEST, "東海道線"), "大阪府 大阪 新大阪 東淀川 吹田 岸辺 千里丘 茨木 JR総持寺 摂津富田 高槻 島本 / 京都府 山崎 長岡京 向日町 桂川 西大路 京都"),
    service("yamatoji", "大和路快速", "JR西日本", "jr", "#66bf76",
            loop + routes(WEST, "関西線"), west_loop + " 久宝寺 / 奈良県 王寺 法隆寺 大和小泉 郡山 奈良"),
    service("kishuji", "紀州路快速", "JR西日本", "jr", "#60b9ed",
            loop + routes(WEST, "阪和線 関西線"), west_loop + " 堺市 三国ヶ丘 鳳 和泉府中 東岸和田 熊取 日根野 長滝 新家 和泉砂川 和泉鳥取 山中渓 / 和歌山県 紀伊 六十谷 紀伊中ノ島 和歌山"),
    service("miyakoji", "奈良線 みやこ路快速", "JR西日本", "jr", "#c69868",
            routes(WEST, "奈良線 関西線"), "京都府 京都 東福寺 六地蔵 宇治 城陽 玉水 木津 / 奈良県 奈良"),
    service("tokaido", "東海道新幹線 のぞみ", "JR東海", "shinkansen", "#5da9ee",
            routes(CENTRAL, "東海道新幹線"), "大阪府 新大阪 / 京都府 京都 / 愛知県 名古屋"),
    service("sanyo", "山陽新幹線 のぞみ", "JR西日本", "shinkansen", "#ed9080",
            routes(WEST, "山陽新幹線"), "大阪府 新大阪 / 兵庫県 新神戸 / 岡山県 岡山 / 広島県 広島"),
    service("sanyo-kodama", "山陽新幹線 こだま", "JR西日本", "shinkansen", "#ddab73",
            routes(WEST, "山陽新幹線"), "大阪府 新大阪 / 兵庫県 新神戸 西明石 姫路 相生 / 岡山県 岡山 新倉敷 / 広島県 福山 新尾道 三原 東広島 広島"),
    service("marine", "瀬戸大橋線 快速マリンライナー", "JR西日本・JR四国", "jr", "#63caca",
            routes(WEST, "宇野線 本四備讃線") + routes(SHIKOKU, "本四備讃線 予讃線"),
            "岡山県 岡山 妹尾 茶屋町 児島 / 香川県 坂出 高松"),
    service("thunderbird", "特急サンダーバード", "JR西日本", "express", "#ab9cdd",
            routes(WEST, "東海道線 湖西線 北陸線"), "大阪府 大阪 新大阪 / 京都府 京都 / 福井県 敦賀"),
    service("hokuriku", "北陸新幹線 つるぎ", "JR西日本", "shinkansen", "#d5a36f",
            routes(WEST, "北陸新幹線"), "福井県 敦賀 越前たけふ 福井 芦原温泉 / 石川県 加賀温泉 小松 金沢"),
    service("karasuma", "京都市営地下鉄 烏丸線", "京都市交通局", "subway", "#74ba86",
            routes(KYOTO, "烏丸線"), "京都府 国際会館 松ヶ崎 北山 北大路 鞍馬口 今出川 丸太町 烏丸御池 四条 五条 京都 九条 十条 くいな橋 竹田"),
    service("kyoto-tozai", "京都市営地下鉄 東西線", "京都市交通局", "subway", "#d27761",
            routes(KYOTO, "東西線"), "京都府 太秦天神川 西大路御池 二条 二条城前 烏丸御池 京都市役所前 三条京阪 東山 蹴上 御陵 山科 東野 椥辻 小野 醍醐 石田 六地蔵"),
    service("hankyu", "阪急京都線 特急", HANKYU, "private", "#ce7897",
            routes(HANKYU, "京都線 宝塚線"), "大阪府 大阪梅田 十三 淡路 茨木市 高槻市 / 京都府 長岡天神 桂 烏丸 京都河原町"),
    service("kintetsu-local", "近鉄京都線 普通", KINTETSU, "private", "#ce8192",
            routes(KINTETSU, "京都線"),
            "京都府 京都 東寺 十条 上鳥羽口 竹田 伏見 近鉄丹波橋 桃山御陵前 向島 小倉 伊勢田 大久保 久津川 寺田 富野荘 新田辺"),
    service("kintetsu-rapid", "近鉄京都・奈良線 急行", KINTETSU, "private", "#ed8c71",
            routes(KINTETSU, "京都線 奈良線"), "京都府 京都 東寺 竹田 近鉄丹波橋 桃山御陵前 大久保 新田辺 新祝園 / 奈良県 高の原 大和西大寺 新大宮 近鉄奈良"),
    service("kobe-seishin", "神戸市営地下鉄 西神・山手線・北神線", "神戸市交通局", "subway", "#72bc77",
            routes("神戸市", "西神延伸線 西神線 山手線 北神線"),
            "兵庫県 西神中央 西神南 伊川谷 学園都市 総合運動公園 名谷 妙法寺 板宿 新長田 長田 上沢 湊川公園 大倉山 県庁前 三宮 新神戸 谷上"),
    service("kobe-kaigan", "神戸市営地下鉄 海岸線", "神戸市交通局", "subway", "#59b5d7",
            routes("神戸市", "海岸線"), "兵庫県 新長田 駒ヶ林 苅藻 御崎公園 和田岬 中央市場前 ハーバーランド みなと元町 旧居留地・大丸前 三宮・花時計前"),
]
