# GitHub Pages で無料公開する

GitHub Freeの公開リポジトリでは、GitHub Pagesで静的サイトを配信できます。このアプリではGitHub側がテスト、ビルド、公開を行います。AWSアカウントやAPIキーを用意する手順はありません。[GitHub Pagesの利用条件](https://docs.github.com/ja/pages/getting-started-with-github-pages/what-is-github-pages)

## 1　公開するコードを確認する

1. GitHubにログインし、対象リポジトリの「Code」を開きます。[このプロジェクト](https://github.com/kosukechun/Japan-Railway-3D-Simulator)
2. ブランチを `main` にします。一番上の階層に `package.json` と `index.html`、`.github/workflows` に `deploy.yml` があれば、次の設定に進めます。
3. 自分のアカウントに複製する場合は「Fork」で公開リポジトリを作ると、フォルダー構成とワークフローも引き継げます。複製先に移動し、Actionsの有効化を求められた場合は「Actions」タブで有効化します。

空のリポジトリへブラウザーで入れる場合は「Add file」→「Upload files」を選びます。コードとデータを元のフォルダー構成のまま入れ、`.github/workflows` も含めてください。ローカルの `node_modules`、`dist`、`.git`、未加工の全国ZIPは配布に含めません。GitHubではブラウザーによるアップロードに1回100ファイルまでの上限があります。多い場合はフォルダーを分けて保存し、すべて揃ってから次へ進みます。[GitHubでのファイル追加](https://docs.github.com/ja/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)

## 2　初回だけ公開元を設定する

1. リポジトリ上部の「Settings」を開きます。表示されないときは、タブ右端のメニューか自分の管理権限を確認してください。
2. 左側のメニューで「Pages」をクリックします。
3. 「Build and deployment」の「Source」で **GitHub Actions** を選びます。設定後はこのリポジトリの `.github/workflows/deploy.yml` が公開担当です。[GitHub公式の公開元設定](https://docs.github.com/ja/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
4. リポジトリの「Actions」を開き、左側から「Deploy to GitHub Pages」を選びます。「Run workflow」を押し、`main` を選んで実行します。すでに `main` に保存した更新で実行中であれば、その処理を開きます。

## 3　公開結果を確認する

1. 最新の実行を開いて `build` と `deploy` に緑のチェックが付くのを待ちます。ビルドはNode.js 22で `npm ci`、`npm test`、`npm run build` を順番に実行し、`dist` の内容を公開します。テストが失敗した場合は更新が止まります。
2. `deploy` の結果に表示されるリンク、または「Settings」→「Pages」の公開URLを押します。このプロジェクトの標準URLは `https://kosukechun.github.io/Japan-Railway-3D-Simulator/` です。自分のフォークでは先頭のアカウント名が変わります。
3. 大阪→京都で検索し、候補から再生します。地図、駅名、発着時刻、再生時計が表示されることを確かめます。

共有用の検索条件はURLのクエリ（「?」の後の部分）に記録されます。静的ファイルには相対パスを用いているため、リポジトリ名が入るURLからも読み込めます。

## 4　次の更新と失敗時の確認

- `main` への変更をGitHubに送ると、同じ処理が自動で走ります。ブラウザーでファイルを編集して `main` に保存した場合も同様です。プルリクエスト（変更の取り込み提案）では「Test and build」が先に変更内容を検査します。
- 「Run workflow」が見つからないときは `main` の `.github/workflows/deploy.yml` が存在すること、Actionsが有効であること、操作している人に書き込み権限があることを確認します。
- `build` が赤いときは、該当ステップを押して最初のエラーを確認します。`npm ci` で止まる場合はロックファイルを、テストで止まる場合は表示されたデータ・テスト名を確認します。
- `deploy` が失敗した場合は、PagesのSourceと、エラーに示された権限を確認します。付属のワークフローは配信用のジョブだけに `pages: write` と `id-token: write` を指定しています。[公式ワークフロー仕様](https://docs.github.com/ja/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- 404が出るときは、成功した `deploy` のURLを開き直します。画面は開くのに駅が読めない場合は、同じサイトの `data/network.json` を開き、ファイルの収録と英字の大小を確かめます。
