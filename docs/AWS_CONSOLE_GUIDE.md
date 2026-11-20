# Amazon S3 と CloudFront で行う公開ガイド

このガイドでは、GitHubなどのソース管理サービスやAWS Amplifyを使わず、パソコンで作ったファイルをAmazon S3に保存し、Amazon CloudFrontからHTTPSで公開します。すでに使えるAWSアカウントがあり、料金を確認したうえでAWSでの公開を選んだ人向けの手順です。

## 第1章　AWSで何ができる？

ブラウザーにページを届けるコンピューターを**サーバー**と呼びます。自分の部屋に機械を置かず、インターネット経由で他社のコンピューターや保存場所を使う仕組みが**クラウド**です。Amazon Web Services（AWS）は、この仕組みを提供しています。

このアプリのソースコードから、ブラウザーに届けるファイルを作る作業を**ビルド**といいます。ビルドしたファイルを **Amazon S3** に保存し、**Amazon CloudFront** から配信する作業を**デプロイ**といいます。ビルドとテストは自分のパソコンで行います。

**AWSマネジメントコンソール**は、AWSをブラウザーで操作する画面です。**AWS CLI**はコマンドと呼ばれる文字列を入力してAWSを操作する道具です。このガイドでは、すべてのAWS設定に画面上のボタンを使います。

## 第2章　サイトが届くまで

```text
パソコンでテスト・ビルドする
                    ↓ dist の中身をアップロード
非公開の Amazon S3 バケットにファイルを保存
                    ↓ OAC で安全に取得
Amazon CloudFront が HTTPS で配信
                    ↓
ブラウザーで公開URLを開く
                    ↓
PCやスマートフォンが経路を検索し、列車を描画
                    ↘ 地図や都市モデルは公開配信元から読み込み
```

公開に使うのは静的ファイルです。ソースコードやGitHubアカウントをAWSに接続する必要はありません。S3バケットは非公開のままにし、CloudFrontだけがファイルを読めるようにします。公開後は、利用者が検索するたびにAWS側で経路を計算する仕組みも不要です。仮想サーバーやデータベースの作成も必要ありません。

## 第3章　手元のアカウントでログインする

1. 管理者からAWSのログイン用URLを渡されていれば、そのURLを開きます。AWS全般の入口から開く場合は [AWSマネジメントコンソール](https://console.aws.amazon.com/) を使います。
2. 学校や会社の「AWSアクセスポータル」を使う場合は、いつものユーザーでログインし、「Accounts」から指定されたアカウントと役割を選びます。IAMユーザーと案内されている場合は、アカウントIDまたは別名、ユーザー名、パスワードを入力します。本人確認が出たら、登録済みの認証機器で承認します。[AWSのサインイン方法](https://docs.aws.amazon.com/signin/latest/userguide/introduction-to-iam-user-sign-in-tutorial.html) ／ [組織のアクセスポータル](https://docs.aws.amazon.com/signin/latest/userguide/iam-id-center-sign-in-tutorial.html)
3. 上部の地域名を押し、「アジアパシフィック（東京）」を選びます。S3バケットは東京（`ap-northeast-1`）に作成します。CloudFrontはグローバルサービスなので、S3とは別にリージョンを選ぶ必要はありません。
4. 上部の検索欄でサービス名を検索できればログイン成功です。アクセス拒否が出る場合は、画面に出たサービス名を伝えてアカウント管理者に利用権限を確認します。

## 第4章　公開前に料金と予算を確認する

**S3の保存容量・リクエストとCloudFrontのリクエスト・配信量には料金が発生し得ます。** 無料利用枠や料金はアカウント、地域、利用量で変わります。WAFや独自ドメインなど、ここで必須にしていないサービスを追加すると料金が増える場合があります。[Amazon S3の料金](https://aws.amazon.com/s3/pricing/) ／ [CloudFrontの料金](https://aws.amazon.com/cloudfront/pricing/) ／ [無料利用枠の確認方法](https://docs.aws.amazon.com/ja_jp/awsaccountbilling/latest/aboutv2/tracking-free-tier-usage.html)

1. コンソール上部で「Billing and Cost Management」を検索し、該当サービスを開きます。「請求書」または「Bills」で今月を選び、利用中のサービス名と金額を見ます。無料利用枠やクレジットがある場合は該当する項目で対象と残量を確認します。[請求画面](https://console.aws.amazon.com/billing/)
2. 請求画面左の「予算（Budgets）」を開き、「予算を作成」を押します。「テンプレートを使用（シンプル）」を選びます。
3. 最初の請求発生を知りたい場合は「支出ゼロ予算」を選びます。月額の目安を設定したい場合は「月次コスト予算」を選び、画面に表示された通貨で金額を入力します。用途が分かる名前と、実際に確認できる通知先メールアドレスを入力します。
4. 表示された通知条件を読み、「予算を作成」を押します。メールで受信先の確認を求められたら認証リンクを開きます。予算一覧に名前が表示され、通知先が確認済みになったことを確かめます。[予算テンプレートの操作](https://docs.aws.amazon.com/ja_jp/cost-management/latest/userguide/budget-templates.html) ／ [受信先メールの確認](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-email-recipients.html)

予算アラートはメールで知らせます。利用状況の集計には時間がかかるため、通知が届いた時点で金額が超過していることがあります。予算を設定してもサービスや請求は自動停止しません。[AWS Budgetsの通知の仕組み](https://docs.aws.amazon.com/ja_jp/cost-management/latest/userguide/budgets-managing-costs.html)

## 第5章　パソコンでテスト・ビルドする

ビルド済みファイルには、アプリ本体のほかに駅・線路データが含まれます。ソース一式ではなく、ビルドで作られた `dist` の中身をアップロードします。**以下の公開開始操作は保存・配信などの料金につながる場合があります。第4章を確認したうえで進めてください。**

1. パソコンにNode.js 22 LTSを用意します。PowerShellでプロジェクトのフォルダーを開き、バージョンを確認します。

   ```powershell
   node --version
   ```

   `v22` で始まることを確認します。
2. 依存関係をインストールし、テストと本番ビルドを実行します。テストまたはビルドが失敗した場合は、ZIPを作ったりアップロードしたりせず、表示されたエラーを解決してください。

   ```powershell
   npm ci
   npm test
   npm run build
   ```

3. `dist` の中に `index.html` と `assets`、`data` などができたことを確認します。S3コンソールにはZIPではなく、`dist` の中身をアップロードします。ZIPを使ってファイルを移す場合は、ZIPを先に解凍してください。ZIP自体をS3に置いてもWebサイトとして公開されません。

## 第6章　S3バケットへファイルをアップロードする

1. AWSコンソール上部の検索欄に「S3」と入力し、「Amazon S3」を開きます。[Amazon S3コンソール](https://console.aws.amazon.com/s3/)
2. 「Create bucket」を押し、世界中で重複しないバケット名を入力します。リージョンは「アジアパシフィック（東京）」を選びます。
3. 「Block all public access」を有効のままにします。新規バケットの「Object Ownership」は「Bucket owner enforced」のままにします。公開アクセスを許可するバケットポリシーやACLは設定しません。
4. バケットを作成して開き、「Upload」を押します。Windowsのエクスプローラーで `dist` フォルダーを開き、その中の全項目（`index.html` と `assets`、`data` などのフォルダー）を選んでアップロード画面へドラッグします。**`dist` フォルダー自体ではなく中身を選びます。**アップロード後、バケット直下に `index.html` と各フォルダーが表示されることを確認します。[S3コンソールでのアップロード](https://docs.aws.amazon.com/AmazonS3/latest/userguide/upload-objects.html)

## 第7章　CloudFrontからHTTPSで公開する

1. AWSコンソール上部の検索欄に「CloudFront」と入力し、「Amazon CloudFront」を開きます。[CloudFrontコンソール](https://console.aws.amazon.com/cloudfront/v4/home)
2. 「Create distribution」を押し、「Single website or app」を選んで次へ進みます。
3. オリジンの種類で「Amazon S3」を選び、「Browse S3」から先ほど作成したバケットを選択します。S3ウェブサイトエンドポイントではなく、バケットをオリジンにします。
4. 「Use recommended origin settings」を選びます。これにより、CloudFrontがOrigin Access Control（OAC）を使って非公開バケットのファイルを取得する設定になります。S3バケットは公開せず、AWSが提案するバケットポリシーの更新を確認して進みます。
5. AWS WAFなどの追加保護はこの手順では選びません（別途料金が発生する場合があります）。設定を確認し、「Create distribution」を押します。[S3オリジンとOACを使うCloudFrontの公式手順](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/GettingStarted.SimpleDistribution.html)
6. CloudFrontの一覧から作成したディストリビューションを選び、「Behaviors」タブで既定の動作を選んで「Edit」を押します。「Viewer protocol policy」を「Redirect HTTP to HTTPS」にして保存します。[HTTPSへの転送設定](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-https-viewers-to-cloudfront.html)
7. 「Settings」または「General」タブの「Edit」を開き、「Default root object」に `index.html`（先頭に `/` を付けない）を設定して保存します。[デフォルトルートオブジェクトの設定](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/DefaultRootObject.html)
8. ディストリビューションの状態が「Deploying」から「Deployed」に変わるまで待ちます。詳細に表示される「Distribution domain name」をコピーし、`https://` を付けてブラウザーで開きます。S3のURLではなく、このCloudFrontのURLを公開URLとして使います。

S3ウェブサイトエンドポイントを直接公開する方式もありますが、HTTPのみでバケットを公開する設定が必要です。この手順では採用せず、HTTPSに対応し、S3を非公開に保てるCloudFront経由にしています。[S3ウェブサイトエンドポイントの制約](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteEndpoints.html)

## 第8章　公開内容を確認する

1. CloudFrontのURLを開き、ページがHTTPSで表示されることを確認します。
2. 大阪から京都を検索し、発着時刻が入った候補を選びます。地図を拡大して再生し、時計と列車の両方が動けば検索・描画・再生を確認できました。スマートフォンでも同じURLを開けます。
3. 公開URLの末尾に `/data/network.json` を付けて開き、鉄道データが表示されることも確認します。

## 第9章　サイトを更新する

更新は自動では反映されません。パソコンでビルドし直して、S3の同じバケット直下へ `dist` の中身をアップロードします。CloudFrontが以前のファイルを一時保存しているため、更新後はキャッシュを無効化します。

1. 変更後に第5章のテストとビルドをもう一度行います。
2. S3コンソールで同じバケットを開き、`dist` の中身をアップロードします。既存のオブジェクトは上書きします。
3. CloudFrontコンソールでディストリビューションを開き、「Invalidations」→「Create invalidation」を選び、パスに `/*` を入力して作成します。完了後、公開URLを再読み込みします。無効化の料金条件は事前に確認してください。[CloudFrontキャッシュの無効化](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Invalidation_Requests.html)

## 第10章　画面がおかしいとき

| 症状 | 確認する場所と操作 |
| --- | --- |
| CloudFrontのURLで403 | S3バケット直下に `index.html` があるか確認します。CloudFrontのDefault root objectが `index.html` か、OAC用のバケットポリシーが設定済みかも確認します。 |
| S3のオブジェクトURLでアクセス拒否 | バケットを非公開にしているため正常です。S3 URLではなくCloudFrontのドメインを使います。 |
| 鉄道データを読めない | S3バケット直下に `data/network.json` があるか確認します。CloudFrontのURLに `/data/network.json` を付けて開き、更新直後ならキャッシュ無効化を行います。 |
| ZIPをS3に置いたが表示されない | S3はZIPを自動展開しません。パソコン上でZIPを解凍し、その中のファイルとフォルダーをアップロードします。 |
| 3D地図が白い | 地図の読み込みメッセージを確認し、ページを再読み込みします。別のブラウザーでも比較します。ブラウザーのグラフィックアクセラレーションが有効か、外部地図のドメインが学校・社内ネットワークで遮断されていないか確認します。 |
| 建物が見えない | 大阪駅周辺まで戻って拡大し、建物レイヤーの表示を確認します。対象都市外や建物データの配信障害時は線路と地図を使えます。 |
| CORSエラー | CORSは別サイトからの読み込みを許可する仕組みです。開発者ツールの「Network」で失敗したURLを見て、配信元がブラウザー利用を許可する正規URLか確認します。自身が管理する配信元の場合は、公開サイトのドメインを許可します。 |
| メモリ不足 | 他のタブを閉じ、建物表示を切って再読み込みします。スマートフォンでは視点を引き、画面に必要な範囲からデータを読み込み直します。 |
| 料金が想定より多い | Billing and Cost Managementの「Bills」でサービス別・地域別の料金を確認します。使っていないCloudFrontディストリビューションやS3バケットは第11章の手順で削除します。 |

## 第11章　公開を終了する

**この操作で公開サイトが削除されます。** 削除対象のCloudFrontディストリビューションとS3バケットをよく確認してください。リソースを残すと料金が発生し続ける場合があります。

1. CloudFrontコンソールで対象ディストリビューションを選び、「Disable」を実行します。
2. 状態が無効になり、変更が配信拠点へ反映されるまで待ちます。その後「Delete」でディストリビューションを削除します。[CloudFrontディストリビューションの削除](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/HowToDeleteDistribution.html)
3. S3コンソールで対象バケットを開き、「Empty」でオブジェクトを空にしてから、バケットを削除します。バケット内の必要なファイルがないことを確かめてください。
4. Billing and Cost Managementで数日後にも請求を確認します。削除までに生じた料金は集計後に計上される場合があります。

## 第12章　用語集

| 言葉 | 意味 |
| --- | --- |
| Amazon S3 | ファイルをオブジェクトとして保存するAWSサービス。 |
| Amazon CloudFront | S3などのオリジンからファイルを取得し、HTTPSで利用者へ配信するAWSサービス。 |
| Origin Access Control（OAC） | CloudFrontだけが非公開S3バケットからファイルを取得できるようにする仕組み。 |
| `dist` | ビルドが出力する公開用ファイルのフォルダー。中身をS3バケット直下へアップロードします。 |
| デプロイ | 作ったWebサイトを公開して閲覧できるようにすること。 |
| ビルド | 開発用のプログラムから配信用のファイルを作ること。 |
| CDN | 閲覧者に近い配信拠点からデータを届ける仕組み。 |
| HTTPS | ブラウザーとサイトの通信を暗号化する方式。 |
| DNS | Webサイトの名前からサーバーの場所を調べる仕組み。 |
| API | アプリ同士が決められた方法で情報をやり取りする窓口。 |
| 3D Tiles | 立体の建物や地形などを細かい範囲に分けて読み込むための形式。 |
| GeoJSON | 地点や線、区域を経度・緯度などの座標で表現するデータ形式。 |
| WebGL | ブラウザーでコンピューターの描画機能を使い、立体を表示する技術。 |
