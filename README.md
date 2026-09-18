# Relay

日本語のチームチャットアプリ。チャンネル、メッセージ投稿、参加者限定のDMを備えます。

## 機能

- チャンネル一覧・作成・履歴のページング
- チームメンバー間の1対1 DM
- Cloudflare D1へのメッセージ永続保存
- SSEによる約1秒間隔の新着反映、再接続時の差分取得
- 送信IDによる投稿の重複防止、失敗時の入力保持
- ChatGPTログイン、サーバー側のDMアクセス制御
- 日本語IME対応、モバイルレイアウト、キーボード操作

## 実行

Node.js 22.13以上とnpmを使用します。

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_bitter_mephistopheles.sql
npm run dev
```

表示されたローカルURLを開き、ChatGPTでログインを押してください。portable開発環境のみテストユーザーSeedyとして入れます。本番ビルドにはこのテスト認証は含まれません。

## 公開とセキュリティ境界

アプリはOpenAI Sitesの認証・アクセス制御を前提とするCloudflare Workerです。サイトを招待者限定にし、共有設定で許可された人だけが参加する運用を想定しています。招待されたユーザーが初めてログインすると、メンバー一覧に追加されます。

公開チャンネルは、そのサイトにアクセスを許可された全メンバーが閲覧できます。DMは参加している2人だけが一覧・履歴・投稿・イベント取得にアクセスできます。アプリには独自のパスワード管理や公開登録はありません。

**重要:** `oai-authenticated-user-*` ヘッダーはSitesの信頼されたディスパッチャーから受け取ります。ビルド済みWorkerを認証プロキシなしでインターネットへ直接公開しないでください。GitHub Pages単独ではAPI、認証、D1が動作しません。他のホスティングへ移す場合は認証と招待制の参加権限を実装し直してください。

GitHubで公開するソースにチャット内容、ユーザーDB、認証情報は含めません。`.wrangler`、`.sites-runtime`、`.env*`、ビルド出力はGit対象外です。

## 検証

`node tests/api.mjs` は `http://127.0.0.1:5174` の**ローカルテスト用Workerのみ**に対して、未認証拒否、CSRF、DMの権限分離、再送の冪等性、SSEの差分取得を確認します。テストは架空ユーザーとメッセージを作成します。本番URLには実行しないでください。

```sh
node node_modules/typescript/bin/tsc --noEmit
```

## 初版の範囲

1サイトが1ワークスペースです。添付ファイル、スレッド、通知配信、全文検索、管理者によるメッセージ削除は未実装です。新規メンバー・チャンネル一覧は15秒ごとに更新します。SSEはD1を1秒ごとに確認する小規模チーム向けの実装です。大規模利用には専用の配信基盤、流量制限と運用監視が必要です。

## 開発分担

インストール済みのUI Designer、Frontend Developer、Backend Architect、Identity & Access Engineer、Realtime Collaboration Engineerの定義に基づき設計を分担し、Rapid Prototyperの方針で統合しました。Code Reviewerがレビューし、チャンネル再作成の重複と履歴取得の競合を修正しています。
