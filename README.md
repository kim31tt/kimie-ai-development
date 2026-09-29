# KIMIE AI Development

公開URL: https://kimie-ai-development.vercel.app/

公開・自動デプロイ確認用の静的ページです。`index.html` をブラウザで開けます。ビルドや環境変数は不要です。

## 更新と公開

1. 開発元 `kim31tt/kimie-ai-development` の `main` に変更をpushします。
2. GitHub Actionsが配信用 `MasaomiF/kimie-ai-development` の `main` に同期します。
3. 配信用リポジトリに接続したVercelが公開します。

`.github` は配信用リポジトリへ同期しません。変更は開発元で行ってください。

Vercel設定: Framework Preset `Other`、Root Directory `./`、ビルドコマンドなし。
