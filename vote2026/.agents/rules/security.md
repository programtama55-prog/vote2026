# セキュリティ開発・コード生成永続ルール

本ルールは「こども選挙 (vote2026)」リポジトリ全体に適用される開発およびAIエージェントのコード生成ガイドラインです。開発時・リファクタリング時・機能追加時には本ルールを常時維持してください。

---

## 1. 機密情報・APIキー管理の自動ルール

1. **`.env` ファイルのクライアント直読み禁止**
   - フロントエンドJavaScriptコードで `fetch('./.env')` や `fetch('/.env')` などを実行・提案してはならない。
   - クライアント用環境設定は `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY` または `localStorage` 経由で取得する。

2. **Service Role Key の暴露厳禁**
   - `SUPABASE_SERVICE_ROLE_KEY` などの管理者秘密キーをクライアントサイドコード、公開ドキュメント、バージョン管理下コードに埋め込んでとしてはならない。

3. **.gitignore の整合性保持**
   - `.env`, `.env.local` などのシークレットファイルをコミット対象に含めてはならない。

---

## 2. XSS (Cross-Site Scripting) 防御ルール

1. **`innerHTML` 使用時のエスケープ義務**
   - ユーザー入力値（氏名、説明文、理由テキスト、検索クエリ等）やデータベースから取得した不特定の文字列を `innerHTML` やテンプレート文字列内で直接展開してはならない。
   - 必ず `escapeHtml(unsafeString)` または `parseFurigana(text)`（エスケープ内包）を通すか、`textContent` を使用すること。

```javascript
// ✅ 適切な実装パターン
import { escapeHtml } from '@/lib/utils.js';
element.innerHTML = `<span>${escapeHtml(user.name)}</span>`;
```

---

## 3. 認証・認可に関する設計ルール

1. **クライアント認可は画面誘導用途に限定**
   - `localStorage` に保存されたユーザーロール情報は UI 表示制御（画面遷移やボタン非表示）のみに使用し、これをセキュリティの唯一の防壁として扱ってはならない。
   - データの保護は必ず Supabase の Row Level Security (RLS) ポリシーでデータベース側に設定する。

2. **ハードコーディングされた認証情報の防止**
   - 本番環境向けのモジュールにデフォルトパスワードや認証パスのハードコードを行わないこと。

---

## 4. ルール変更時のガイドライン

- 本ルールを変更・緩和する場合は、セキュリティリスク分析および [docs/SECURITY_DEVELOPMENT_GUIDE.md](file:///Users/urasoe/Documents/vote2026/vote2026/docs/SECURITY_DEVELOPMENT_GUIDE.md) の更新を同時に行うこと。
