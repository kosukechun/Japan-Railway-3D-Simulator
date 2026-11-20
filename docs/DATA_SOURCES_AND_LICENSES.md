# 使用データと利用条件

原典・表示条件の確認日は **2026年11月20日（日本時間）** です。ビルドに含む静的データは11月19日に取得した原典から作成しました。外部配信レイヤーは閲覧時に取得するため、更新日はタイルや地域によって異なります。

## 駅・線形・時刻表

| データと提供元 | 基準日・更新日 | 使用方法と帰属表示 | 商用利用・加工・再配布と公式資料 |
| --- | --- | --- | --- |
| 国土交通省「国土数値情報（鉄道データ）」N02-25 | 2025年12月31日基準、2026年4月公開更新 | 駅位置と鉄道区間の頂点から駅間の経路を算出。「国土交通省『国土数値情報（鉄道データ）』を加工」と表示 | CC BY 4.0。いずれも可。原典・ライセンス・変更を明示。[国土交通省](https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html)・[ライセンス](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 京都市交通局「京都市営地下鉄時刻表」 | 2026年3月13日更新、3月14日版。東西線は2025年2月22日改正の内容を継続 | 全8表を列車別・営業日別に変換。「京都市交通局 市営地下鉄時刻表を加工」と表示 | CC BY 4.0。いずれも可。著作権者は京都市。[京都市・データセット00692](https://data.city.kyoto.lg.jp/dataset/00692/)・[ライセンス](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 神戸市交通局「地下鉄オープンデータ」 | 西神・山手線／北神線は2025年3月15日改正。市カタログ2026年3月5日更新。海岸線に同梱した版は同年3月13日まで適用 | 平日・土休日、両方向のCSVから各便の停車時刻を抽出。「神戸市交通局 地下鉄オープンデータを加工」と表示 | CC BY 2.1 JP。いずれも可。配布元・著作権者・ライセンスを表示。[神戸市交通局の利用条件](https://kotsu.city.kobe.lg.jp/company/overview/open-data/subway-opendata/)・[公式カタログ](https://catalog.city.kobe.lg.jp/dataset/3541-5-2-2-2-f6a28b58cd4c8777-6741f3e3e026f2c8)・[ライセンス](https://creativecommons.org/licenses/by/2.1/jp/) |
| 岡山電気軌道株式会社「路面電車」GTFS（Bus-Vision） | 2026年11月1日～2027年10月31日。版名「20261101_おかやまマラソン2026」 | 運転日・運休日・停留場別発着・路線形状を加工。「岡山電気軌道株式会社／Bus-Vision 公開GTFSを加工」と出典、事業者HPを掲載 | CC BY 4.0。いずれも可。静的GTFSはテスト配信。[配布元と利用条件](https://loc.bus-vision.jp/ryobi/view/opendata.html)・[岡山電気軌道株式会社](https://okayama-kido.co.jp/tramway/)・[ライセンス](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 明知鉄道・伊勢鉄道のGTFS | 2026年3月14日改正。各フィードの収録期間は2027年3月31日まで | 停車時刻・運行日・例外日を加工して列車別に収録。配布元を出典表示 | CC BY 4.0。出典と変更を表示。[明知鉄道GTFS](https://api.gtfs-data.jp/v2/organizations/aketetsu/feeds/akechirailway/files/feed.zip?rid=current)・[伊勢鉄道GTFS](https://api.gtfs-data.jp/v2/organizations/isetetu/feeds/iserailway/files/feed.zip?rid=current)・[ライセンス](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 富山地方鉄道・市内軌道線／富山港線GTFS | 2026年3月14日～2027年3月13日 | 路線・運行日・停留場別発着を加工。GTFSの環状線終着を別駅IDで表現 | CC0 1.0。複製・加工・再配布に制限なし。[GTFSデータリポジトリ](https://gtfs-data.jp/search?agencyId=chitetsu&feedId=chitetsushinaidensha)・[ライセンス](https://creativecommons.org/publicdomain/zero/1.0/deed.ja) |
| とさでん交通・路面電車GTFS | 2026年8月1日～2027年4月30日 | 運行日・停車時刻を加工。route IDだけでなく便ごとの停車順で枝線を分類 | CC BY 4.0。出典と変更を表示。[ODPTデータセット](https://ckan.odpt.org/dataset/tosaden_traffic_streetcar)・[ライセンス](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 豊橋鉄道・渥美線／市内線GTFS | 2026年1月8日～2027年4月24日。特定日追加は2027年4月29日 | 2線の列車時刻・運行日・例外日を加工。「Bus-Vision 公開GTFSを加工」と出典、豊橋鉄道HPを掲載 | CC BY 4.0。出典と変更を表示。[Bus-Vision配布・利用条件](https://bus-viewer.jp/toyotetsu/view/opendataToyotetsu.html)・[GTFS配布](https://loc.bus-vision.jp/gtfs_v2/toyohashitetsudo/gtfsFeed)・[豊橋鉄道](https://www.toyotetsu.com/)・[ライセンス](https://creativecommons.org/licenses/by/4.0/deed.ja) |
| 内閣府「国民の祝日」CSV | 1955～2027年収録版。CSVに更新日の記載なし | 市営地下鉄の国民の祝日・休日判定に加工。神戸の2025年末年始は交通局告知を併用 | 内閣府ホームページ利用規約、公共データ利用規約第1.0版。商用・加工利用可。「内閣府『国民の祝日』を加工」。[内閣府](https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html)・[利用規約](https://www.cao.go.jp/notice/rule.html)・[神戸市の告知](https://kotsu.city.kobe.lg.jp/news/information/bus/2025winterholiday/) |

実ダイヤの収録期間は路線ごとに異なります。既存のJR西日本の駅時刻表と乗換案内サービスは、停車パターン・代表的な所要時間の照合と、利用者が旅程を確認するための外部リンクに使用しています。JR・私鉄のモデル時刻や徒歩時間はアプリ側の設定です。列車一覧や運賃表を転載していません。[時刻表の取り込み手順・対象日](TIMETABLE_SOURCES.md)・[駅と線路の加工方法](NETWORK_DATA.md)

## 地図・地形・建物

| データと提供元 | 更新日・取得方法 | 使用方法と帰属表示 | 商用利用・加工と公式資料 |
| --- | --- | --- | --- |
| 国土地理院「地理院タイル・淡色地図」 | 閲覧時配信。個別タイルの更新日は未収録 | 緯度経度上の背景地図。線路と列車を重ね、時間帯により画面の色を調整。地図上に「地理院タイル」および国土地理院へのリンクを表示 | 国土地理院コンテンツ利用規約。出典を表示したリアルタイム読込みに対応。商用・加工は規約に従い可。測量成果の複製・再配布など別用途では公式の利用手続を確認。[タイル仕様と縮尺別出典](https://maps.gsi.go.jp/development/ichiran.html#pale)・[コンテンツ利用規約](https://www.gsi.go.jp/kikakuchousei/kikakuchousei40182.html)・[出典の記載](https://www.gsi.go.jp/LAW/2930-meizi.html) |
| 3D都市モデル（Project PLATEAU）大阪市（2025年度） | 公式カタログのメタデータは2026年4月9日更新。2026年11月19日に北区の建築物LOD1を抽出 | 駅付近の約2.6km四方で、建物の平面を簡略化し高低差を保存。「3D都市モデル（Project PLATEAU）大阪市（2025年度）を加工」。出力は `public/data/osaka-buildings.json` | 国土交通省が指定するPLATEAU Site Policy第3項に従いCC BY 4.0で利用。商用・加工・再配布可。[大阪市データセット](https://www.geospatial.jp/ckan/dataset/plateau-27100-osaka-shi-2025)・[利用条件](https://www.mlit.go.jp/plateau/site-policy/) |
| 国土交通省 Project PLATEAU 配信サービス・建築物LOD1複合3D Tiles | 閲覧時配信。対象都市・地域別に年度は異なる | 表示範囲に応じて建物タイルを読み込む。出典「Project PLATEAU」。複合タイルセットの構成は配信元で更新される | 各都市の3D都市モデルとPLATEAU利用条件に準拠。商用・加工可。地域別の個別条件を保持。[配信仕様](https://docs.plateauview.mlit.go.jp/datasets/3d-tiles/)・[PLATEAU利用条件](https://www.mlit.go.jp/plateau/site-policy/) |
| PLATEAU-Terrain（国土交通省、Mapterhorn、国土地理院） | 閲覧時にCesium用地形タイルを取得。個別の測量・加工日は未収録 | 楕円体高に変換済みの標高を3D表示。地図上の指定表示は「PLATEAU ｜ Mapterhorn ｜ 国土地理院」 | 配信元の地形利用例と指定表示に従う。原データは供給元ごとの条件。合成地形を別製品として加工・再配布する場合の一律ライセンスは未確認。[配信・帰属表示](https://docs.plateauview.mlit.go.jp/datasets/terrain/)・[Mapterhorn原典別帰属](https://mapterhorn.com/attribution/) |
| OpenStreetMap contributors（大阪周辺） | 同梱したOSMスナップショットは2026年11月19日12:16:45 UTC。抽出にOverpass APIを使用 | 道路、川、水面、公園を抽出して座標を丸め、独立した `public/data/osaka-streets.json` として提供。「© OpenStreetMap contributors」を地図上に表示 | Open Database License 1.0。商用・加工可。加工済みOSMデータベースもODbL 1.0で再配布。利用時はOSMとライセンスを表示。[OSMの利用条件](https://www.openstreetmap.org/copyright)・[ODbL本文](https://opendatacommons.org/licenses/odbl/1-0/)・[加工データ](../public/data/osaka-streets.json)・[抽出スクリプト](../scripts/prepare-streets.py) |

淡色地図のズーム5～8の海岸線には、国土地理院が指定する米国 National Imagery and Mapping Agency の「Vector Map Level 0 (VMAP0)」（1997）の帰属表示も適用されます。詳細は淡色地図の公式備考に従います。[地理院タイル一覧](https://maps.gsi.go.jp/development/ichiran.html#pale)

## 車両・ソフトウェア

| 対象 | 作成・提供元と利用条件 |
| --- | --- |
| 3D列車のGLB | 本プロジェクトが生成した車両。ロゴ・車両設計図・市販モデルは使っていません。2026年11月19～20日作成。外部データのCC BY／ODbLは適用されません。プロジェクトの権利者による独立した車両素材ライセンスは現時点で未指定です。[生成スクリプト](../scripts/prepare-trains.mjs) |
| CesiumJS | 使用版は1.121.0。Apache License 2.0。商用・改変・再配布可、著作権・ライセンス・第三者の表示を保持。ビルドの `cesium/LICENSE.md` に同梱。内包する第三者コードの条件も同ファイルに含まれます。[CesiumJS配布版のライセンス](https://github.com/CesiumGS/cesium/blob/1.121/LICENSE.md) |
| React、React DOM、Scheduler | React／React DOMは18.3.1。MIT、商用・改変・再配布可、著作権表示と許諾文を保持。3パッケージの同一のライセンス原文を静的ファイルとして同梱。[同梱のMIT原文](../public/licenses/react-react-dom-scheduler-MIT.txt) |
| Vite、TypeScript、Vitest、Playwright、Draco 3D | 開発・検証・前処理用。Vite、VitestはMIT、TypeScript、Playwright、DracoはApache License 2.0。各パッケージ内の第三者ライセンスも保持。依存版はロックファイルに記録。[package-lock.json](../package-lock.json) |

ファイルを更新する際は、配布元の版・適用日・特別ダイヤ、利用条件、アプリ内の「データ情報」と地図上の帰属表示も合わせて確認してください。
