# セキュリティ脆弱性分析報告書 (2026年8月)

本ドキュメントは、「こども選挙 (vote2026)」アプリケーションに対して実施したセキュリティ診断・脆弱性分析の成果物および改修履歴です。

---

## 1. 診断の概要

- **対象アプリケーション**: こども選挙 Webシステム (vote2026)
- **診断対象コンポーネント**:
  - フロントエンドJavaScript (`lib/supabase.js`, `lib/auth.js`, `login.js`, `reception.js`, `tally.js` 等)
  - 認証・認可フローおよび Supabase 連携
  - 設定ファイルおよび APIキーの取り扱い
- **主な評価軸**: OWASP Top 10（特に API Key 露出、DOM XSS、認可制御欠如、設定ミス）

---

## 2. 検出された脆弱性と改修内容

### 【脆弱性 1】 クライアントサイドでの `.env` ファイル取得によるシークレット漏洩リスク (緊急)
- **分析内容**: `lib/supabase.js` で `await fetch('./.env')` が実行されており、公開 Web サーバーで `.env` への直接 HTTP アクセス制限が有効化されていない場合、第三者が `https://example.com/.env` から APIキーや DB 接続URL を丸ごと取得できる状態でした。
- **改修措置**: `fetch('./.env')` 処理を完全に削除。Supabase 設定は `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY` または LocalStorage ベースのモーダル設定から安全に解決するロジックに刷新しました。

### 【脆弱性 2】 DOMベース Cross-Site Scripting (XSS) (高)
- **分析内容**: アカウント名（`user.name`）をはじめとするユーザー入力値が `innerHTML` 内でエスケープされずにレンダリングされており、スクリプト注入（Stored XSS）が実行可能な箇所が存在しました。
- **改修措置**: [lib/utils.js](file:///Users/urasoe/Documents/vote2026/vote2026/lib/utils.js) 内の `escapeHtml` ユーティリティ関数を整備し、`lib/auth.js` の `renderAuthHeaderWidget` を含む動的 HTML 生成箇所でエスケープを徹底適用しました。

### 【脆弱性 3】 クライアント主導認可依存および Supabase RLS 未設定リスク (高)
- **分析内容**: フロントエンドの `localStorage` 値（`role`）のみでページアクセス判定を行っており、DevTools から容易に認可バイパスが可能でした。また Supabase 側での Row Level Security (RLS) 未定義の場合に Anon Key 経由でデータベース全件の操作が可能でした。
- **改修措置**: 認可の防壁を Supabase PostgreSQL の RLS で完全に保護するための SQL スクリプトおよび適用手順を整備しました。

---

## 3. 作成・整備した資産

1. **セキュリティ開発ガイドライン**: [docs/SECURITY_DEVELOPMENT_GUIDE.md](file:///Users/urasoe/Documents/vote2026/vote2026/docs/SECURITY_DEVELOPMENT_GUIDE.md)
   - APIキー管理基準、Webサーバーの `.env` 遮断設定、Supabase RLS ポリシー用 SQL コードを収録。
2. **リポジトリ永続セキュリティルール**: [.agents/rules/security.md](file:///Users/urasoe/Documents/vote2026/vote2026/.agents/rules/security.md)
   - エージェントおよび開発者が継続してセキュリティルール（XSSエスケープ義務、.env fetch禁止等）を守るための設定。
