# Org 別設定ガイド（開発者向け）

Manabie Lesson Tools は Salesforce org ごとに **Account / Contact のカスタムフィールド名が異なる** ことがあります。  
コード上の API 名が discovery や別 org のドキュメントと一致していても、**実 org の describe で必ず確認**してください。

**検証済み baseline:** `trg2--extuat`（[`discovery-trg2-extuat.json`](../apps/extension/data/discovery-trg2-extuat.json)）

---

## ブース数・教室形式（Account）

コマ組の「ブース数」は前提マスタ同期で取得した Account レコードから読み取ります。  
SOQL に **存在しないフィールドを SELECT すると前提マスタ同期全体が失敗**します（`INVALID_FIELD`）。

| 項目 | trg2--extuat | デフォルト（その他 org） |
|------|--------------|-------------------------|
| ブース数 | `TRG_BoothCount__c`（ラベル: ブース数） | `Booth__c` |
| 1:1 / 1:2 形式 | Account に `Capacity__c` **なし** → UI はデフォルト 1:2 | `Capacity__c` |
| hostname 判定 | `trg2--extuat` を含む host | 上記以外 |

### 実装

- [`apps/extension/lib/booth-count-from-account.ts`](../apps/extension/lib/booth-count-from-account.ts)
  - `accountLocationFieldConfig(hostname)` — org ごとの SELECT フィールド
  - `buildLocationAccountsSoql(hostname)` — 前提マスタ locations クエリ
  - `boothCountFromAccountFields()` — 読取時は `Booth__c` と `TRG_BoothCount__c` の両方をフォールバック
- [`apps/extension/src/services/lessonMasterCatalog.ts`](../apps/extension/src/services/lessonMasterCatalog.ts) — マスタ同期時に hostname から SOQL 生成
- [`apps/extension/src/services/user-affiliation-context.ts`](../apps/extension/src/services/user-affiliation-context.ts) — Affiliation 解決時の Account 直接 SOQL

### trg2--extuat で起きた事例

- discovery JSON 上は `Booth__c` が Account にあるように見えたが、**実 org では Account に存在せず** `INVALID_FIELD`
- 逆に `TRG_BoothCount__c` は describe で確認済み（例: テスト教室0801 = 5）
- `Capacity__c` も Account 上に存在しないため SOQL から除外

---

## 新 org を追加するときのチェックリスト

1. **describe で実フィールドを確認**

   ```bash
   sf org login web --alias my-org
   sf sobject describe --target-org my-org --sobject Account --json \
     | node -e "const d=JSON.parse(require('fs').readFileSync(0)).result; d.fields.filter(f=>/booth|capacity|Booth|Capacity/i.test(f.name)).forEach(f=>console.log(f.name,f.label))"
   ```

2. **`accountLocationFieldConfig()` に分岐を追加**（hostname または orgId）

3. **テストを追加** — [`booth-count-from-account.test.ts`](../apps/extension/lib/booth-count-from-account.test.ts)

4. **discovery を更新**（任意だが推奨）

   ```bash
   npm run discover -- my-org-alias
   ```

5. **`npm run verify`** — ユニット + ビルド + zip

6. **手動:** 前提マスタ同期 → コマ組「表示設定」でブース数が SF Account と一致するか

---

## Discovery

```bash
npm run discover -- trg2--extuat
```

出力: `apps/extension/data/discovery-<alias>.json`  
[`getBundledLessonDiscoveryForHost()`](../apps/extension/lib/bundled-discovery.ts) は trg2--extuat のみ同梱。他 org は discover 後に設定をコードへ反映する。

---

## 関連ドキュメント

- [master-catalog-soql.md](./master-catalog-soql.md) — org 別 locations SOQL 例
- [feature-parity.md](./feature-parity.md) — 機能対応表
- [e2e-sandbox-signoff.md](./e2e-sandbox-signoff.md) — Sandbox 手動検証

---

## 将来改善

hostname のハードコードは暫定です。discovery JSON に `config.fields.account.boothCount` / `capacity` を持たせ、`accountLocationFieldConfig` が bundled discovery から読む形に移行する余地があります。
