# 本番接続・切り替え手順

## 1. Supabaseプロジェクト

専用の新しいSupabaseプロジェクトを用意してください。既存の無関係なアプリと同じDBには適用しません。プロジェクト作成時のパスワードや管理用キーをチャット・Gitに貼る必要はありません。

SQL EditorまたはSupabase CLIのmigrationで、`supabase/migrations/202609300001_workspace.sql`を一度だけ適用します。9つのテーブル、RLSポリシー、RPCをトランザクションで作成します。サンプルユーザーやサンプル案件は作成しません。

## 2. メール確認コード

- AuthenticationでEmailを有効にし、新規ユーザー登録を許可。メール確認を有効にします。匿名ログインは使用しません。
- Email Templatesの「Magic Link」と「Confirm signup」の本文に`supabase/templates/login-code.html`を設定してください。`{{ .Token }}`を表示して、リンクではなくコード入力で認証します。
- Site URLは`https://kimie-ai-development.vercel.app`に設定します。本実装は認証リンクのコールバックではなく`verifyOtp`を使います。
- Custom SMTPに送信元メール・SMTP接続情報を設定します。SMTPの認証情報はSupabaseの設定画面だけに入力し、フロントエンド環境変数には設定しません。
- 送信ドメインをプロバイダの手順に従って検証し、アプリの利用人数に合わせてAuthの送信制限・コード期限を設定します。

Supabase標準のメール送信は宛先制限があるため、本番の取引先・施主向けにはCustom SMTPが必要です。[公式SMTP設定](https://supabase.com/docs/guides/auth/auth-smtp)。コード方式は[公式OTP説明](https://supabase.com/docs/guides/auth/auth-email-passwordless)を参照。

認証登録は可能ですが、招待されていない既存組織・案件にはアクセスできません。最初の所有者はログイン後に新しい組織を作成します。ユーザーが作成した別組織は独立します。

## 3. Vercelの接続情報

A（`MasaomiF/kimie-ai-development`）に接続したVercelプロジェクトのEnvironment Variablesに設定します。

| 名前 | 内容 |
| --- | --- |
| `SUPABASE_URL` | SupabaseのProject URL（`https://<project-ref>.supabase.co`） |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key（`sb_publishable_...`）、またはlegacy anon key |

これらはブラウザ公開用の接続情報です。`service_role`・`sb_secret_...`・DBパスワードは使用しません。ビルドでも秘密キーを拒否します。[公式API key説明](https://supabase.com/docs/guides/getting-started/api-keys)。独自APIドメインを使用する場合はビルド検証とCSPの変更が別途必要です。

Build Command: `npm run build`、Output Directory: `dist`、Node.js: 24。設定は`vercel.json`に含まれます。既存の管理画面で明示的な上書きがある場合は揃えてください。環境変数はビルド時に取り込むため、変更後は再デプロイします。

## 4. 切り替え前の実環境テスト

Preview用のVercelプロジェクトか、Aのプレビューブランチにこのブランチを配信し、同じ接続情報をPreview環境に設定して確認します。本番相当の検証にサンプルの個人情報・機密情報は不要です。

- 管理者が実際のメールに届いたコードでログインし、組織・案件を作成。
- 別のメールアドレスを施主として招待登録し、URLを相手に共有。
- 別ブラウザ／端末で施主としてログインし、指定した案件だけ見えることを確認。
- 社内だけのチャットと施主を含むチャットを用意し、施主に社内の投稿・検索結果・Todoが出ないことを確認。
- 投稿、Todo、複数担当、小タスクを両方のアカウントで確認。更新が共有されることを確認。
- 同じTodoを二画面で編集し、古い編集の保存が競合エラーになることを確認。
- 参加解除後のアクセス拒否と、ログアウト後に内容が残らないことを確認。
- プレビューの開発者コンソールでCSP違反・通信エラーがないことを確認。

実環境テスト完了後にBのmainへ統合します。ActionsのVerify → BからAへの同期 → Vercel buildの順に確認します。未接続のままmainへ統合しないでください。

## 5. データと運用

旧試作版のlocalStorageは個人のブラウザごとのデータです。新しい共有DBへ自動移行すると誤共有の可能性があるため自動移行しません。必要な移行は対象データと共有先を決めて別途実施します。

この版ではファイル添付、外部AI API、通知、招待メールの自動配信、WebSocket即時配信、管理者の追加UIは含みません。会話のTodo化はサーバーの日本語ルール判定で、候補は手動修正できます。バックアップ・復元方法は採用するSupabaseプランに合わせて設定してください。

本番切り替え前のコード検証では、実SMTP送信・実Supabaseトークン・実Vercel配信は未検証です。設定後に上記の実環境テストを行って完了とします。
