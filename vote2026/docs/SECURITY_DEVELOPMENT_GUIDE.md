# こども選挙 (vote2026) セキュリティ開発ガイドライン & 運用マニュアル

本ドキュメントは、「こども選挙」アプリケーションの開発および運用において、**APIキーの漏洩**、**不正アクセス・データ改ざん**、**XSS (Cross-Site Scripting)** などの脆弱性を防ぎ、安全なシステムを構築・維持するためのセキュリティガイドラインです。

---

## 1. APIキー・設定情報 (.env) の安全な管理

### 1.1 Supabase キーの種別と適切な取り扱い
Supabase では主に2種類のAPIキーが利用されます。それぞれの役割と秘密レベルを正しく理解し、取り扱いを徹底してください。

| キーの種類 | 秘密度 | 説明 |
| :--- | :--- | :--- |
| **`SUPABASE_ANON_KEY`** | **公開可能 (Public)** | クライアント（ブラウザ）に埋め込んで使用する公開用キー。PostgreSQL 側の **RLS (Row Level Security)** ポリシーによって安全性が担保されます。 |
| **`SUPABASE_SERVICE_ROLE_KEY`** | **極秘 (Secret / Admin Only)** | RLS を全てバイパスし、データベースに対する完全な管理者権限（全読み書き）を持つキー。**絶対にフロントエンドコードやクライアント側に露出させてはいけません。** |

> [!CAUTION]
> **`SUPABASE_SERVICE_ROLE_KEY` を `.env` やフロントエンドJavaScript内に書き込むことは絶対禁止です。**
> 万が一漏洩した場合、データベース全体の破壊・全データの不正取得が可能となります。

---

### 1.2 `.env` ファイルのクライアント取得禁止とサーバーアクセス制限

1. **クライアントでの `.env` 直リクエスト (`fetch('./.env')`) の禁止**
   - フロントエンドJavaScriptから直接 `/.env` ファイルを取得するコードは記述してはいけません。
   - アプリケーションでは `window.SUPABASE_URL` / `window.SUPABASE_ANON_KEY` または UI 上の接続設定モーダル（`localStorage` 保存）を使用してください。

2. **バージョン管理での除外 (`.gitignore`)**
   - `.env`, `.env.local`, `.env.*.local` は常に `.gitignore` に登録し、Git リポジトリにコミットされないように保持してください。

3. **Webサーバー（配信環境）での `.env` 直接アクセス拒否設定**
   - 本番環境・ホスティングサーバー（Nginx, Apache, Netlify, Vercel 等）では、ドットファイル（`.env` 等）への直接 HTTP リクエストをブロックするように設定してください。

#### Nginx 設定例
```nginx
# ドットファイル（.env や .git など）へのアクセスを禁止
location ~ /\. {
    deny all;
    return 404;
}
```

#### Apache (`.htaccess`) 設定例
```apache
<FilesMatch "^\.">
    Order allow,deny
    Deny from all
</FilesMatch>
```

---

## 2. クロスサイト・スクリプティング (XSS) 対策ガイドライン

ユーザーや外部データから取得した文字列を HTML 内に挿入する際は、**DOMベース XSS** の脆弱性を防ぐため、以下のルールを厳守してください。

### 2.1 `escapeHtml` 関数の必須適用
`innerHTML` を使用して文字列を出力する場合、必ず [lib/utils.js](file:///Users/urasoe/Documents/vote2026/vote2026/lib/utils.js) の `escapeHtml` または `parseFurigana`（内部でエスケープ実行）を通してください。

```javascript
import { escapeHtml } from '@/lib/utils.js';

// ❌ 危険（悪意のある script や onerror 属性が実行される）
element.innerHTML = `<span>${user.name}</span>`;

// ✅ 安全（HTML特殊文字がエスケープされる）
element.innerHTML = `<span>${escapeHtml(user.name)}</span>`;
```

### 2.2 テキスト挿入時の `textContent` 優先
HTMLタグを含める必要がない箇所の描画には、`innerHTML` ではなく `textContent` または `innerText` を使用してください。

```javascript
// ✅ 最も安全な方法
element.textContent = user.name;
```

---

## 3. 認証・認可と Supabase Row Level Security (RLS)

### 3.1 クライアント主導認可の限界とサーバー検証
フロントエンド（`localStorage` や `checkPageAccess()`）での画面制御は、**画面導線の案内目的**に過ぎません。DevTools から `localStorage` の役職（`role`）を書き換えることでフロントエンドのチェックは容易に迂回できます。

データのセキュリティは、必ず **Supabase の Row Level Security (RLS)** によってデータベースレベルで保護する必要があります。

---

### 3.2 Supabase RLS 設定用 SQL スクリプト

Supabase の SQL エディタで以下の SQL を実行し、各テーブルに対するセキュリティポリシーを適用してください。

```sql
-- ===================================================
-- こども選挙 (vote2026) Supabase RLS ポリシー設定
-- ===================================================

-- 1. 全テーブルで RLS を有効化
ALTER TABLE IF EXISTS staff_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS elections ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS voter_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tally_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS tally_results ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------
-- 2. staff_accounts (スタッフアカウント情報)
-- ---------------------------------------------------
-- 認証済みユーザーのみ参照可能
CREATE POLICY "staff_accounts_select_policy" ON staff_accounts
  FOR SELECT USING (auth.role() = 'authenticated');

-- 管理者のみ作成・更新・削除可能
CREATE POLICY "staff_accounts_insert_policy" ON staff_accounts
  FOR INSERT WITH CHECK (
    auth.jwt() -> 'user_metadata' ->> 'role' = '管理者'
  );

CREATE POLICY "staff_accounts_update_policy" ON staff_accounts
  FOR UPDATE USING (
    auth.jwt() -> 'user_metadata' ->> 'role' = '管理者'
  );

CREATE POLICY "staff_accounts_delete_policy" ON staff_accounts
  FOR DELETE USING (
    auth.jwt() -> 'user_metadata' ->> 'role' = '管理者'
  );

-- ---------------------------------------------------
-- 3. voter_registrations (受付・交付ログ)
-- ---------------------------------------------------
-- 運営および管理者のみアクセス可能
CREATE POLICY "voter_registrations_all_policy" ON voter_registrations
  FOR ALL USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('運営', '管理者')
  );

-- ---------------------------------------------------
-- 4. tally_inputs / tally_results (開票・集計データ)
-- ---------------------------------------------------
-- 開票担当者および管理者のみアクセス可能
CREATE POLICY "tally_inputs_all_policy" ON tally_inputs
  FOR ALL USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('開票担当者', '管理者')
  );

CREATE POLICY "tally_results_all_policy" ON tally_results
  FOR ALL USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('開票担当者', '管理者')
  );

-- ---------------------------------------------------
-- 5. elections / candidates (選挙・候補者データ)
-- ---------------------------------------------------
-- 一般公開参照可、編集は管理者・運営のみ
CREATE POLICY "elections_select_policy" ON elections
  FOR SELECT USING (true);

CREATE POLICY "elections_write_policy" ON elections
  FOR ALL USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('運営', '管理者')
  );

CREATE POLICY "candidates_select_policy" ON candidates
  FOR SELECT USING (true);

CREATE POLICY "candidates_write_policy" ON candidates
  FOR ALL USING (
    auth.jwt() -> 'user_metadata' ->> 'role' IN ('運営', '管理者')
  );
```

---

## 4. セキュリティチェックリスト (開発・デプロイ前)

機能追加・デプロイを行う際は、以下のチェックリストを実施してください。

- [ ] `.env` ファイルが `.gitignore` に含まれているか。
- [ ] `SUPABASE_SERVICE_ROLE_KEY` がフロントコードに含まれていないか。
- [ ] JavaScript から `fetch('./.env')` などの設定取得を行っていないか。
- [ ] 動的 HTML 生成時に `escapeHtml` または `textContent` が適用されているか。
- [ ] Supabase データベース側で RLS ポリシーが正常に有効化されているか。
- [ ] デモアカウントや初期パスワード（`password123` 等）が本番運用環境に残っていないか。
