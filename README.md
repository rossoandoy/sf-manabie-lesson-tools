# Manabie Lesson Tools

Salesforce Inspector Reloaded 方式の Chrome 拡張。Lesson チームの CSV Web アプリ（授業スケジュール / 休校日）を統合し、**Manabie へ直接登録**できる UI を提供します。

**バージョン: v0.3.0** — ユーザー検証可能（Phase 1–17）

## What it is

- Chrome MV3 拡張（Sandbox Manabie ブリッジ）
- コマ組 1:2 グリッド + 授業一覧 + Sync Dock + 回数報告
- Excel `lesson-manage` の代替（[機能対応表](docs/feature-parity.md)）
- **Production org**: Execute は Phase 16 まで Sandbox のみ（ヘッダー badge で識別）

## Quick start

```bash
npm install
npm run verify
```

Chrome で `apps/extension/dist` を読み込み、Salesforce Sandbox にログイン → Popup → **ダッシュボードを開く**。

配布 zip: `npm run package` → `dist-packages/manabie-lesson-tools-v0.3.0.zip`

## Developer

新しい Salesforce org へ展開する前に **Account フィールド差**を確認してください（特にブース数）。

| 手順 | コマンド / ドキュメント |
|------|-------------------------|
| Org 別設定 | [docs/org-configuration.md](docs/org-configuration.md) |
| SOQL 一覧 | [docs/master-catalog-soql.md](docs/master-catalog-soql.md) |
| Schema discover | `npm run discover -- <org-alias>` |
| テスト + ビルド | `npm run verify` |

**trg2--extuat 検証済み:** Account ブース数は `TRG_BoothCount__c`（`Booth__c` は存在しない）。他 org は describe で確認し `accountLocationFieldConfig` を拡張。

## Phase ロードマップ

| Phase | 内容 | 状態 |
|-------|------|------|
| 1–1.5 | 授業スケジュール / 休校日 / Manabie 登録 | ✅ |
| 2A–2H | コマ組 / PrintSheet / 出欠 / SF F19 | ✅ |
| 3A–3D | Manabie 読取 / 3B 出欠 / Schedule Gap | ✅ |
| 4–5 | Sync Dock / Session create / 仮想スクロール | ✅ |
| 6–7 | F13 / 休講 write / Reallocation 3C | ✅ |
| 8 | 手動 Manabie 更新 / Sync Manifest | ✅ |
| 9 | コマ copy/move / 講師定期 / 振替 UX / 週コピー | ✅ [spike](docs/phase9-booth-ux-spike.md) |
| 10–12 | Excel ブース表 / Affiliation / タブ統合 / 回数報告 A4 | ✅ |
| 13 | UI/UX（sticky / accordion / 名前モーダル / 仮想スクロール / F04） | ✅ |
| 14 | R04 翌年度準備 + Production badge | ✅ [spike](docs/phase14-r04-spike.md) |
| 15 | コマ組 UX（day window / フォーカス / キーボード / 振替 v2） | ✅ [spike](docs/phase15-booth-ux-spike.md) |
| 16 | R04 repeat 自動整理 | ✅ [spike](docs/phase16-r04-repeat-spike.md) |
| 17 | 繰り返し配置 UX（prefill / 検索 / 終了 / conflict） | ✅ [spike](docs/phase17-booth-ux-spike.md) |

## 主な機能

- 前提マスタ同期（拠点 / 年度 / 拠点コース / クラス / 教室 / 講師 / 生徒 / 教科）
- 授業スケジュール・休校日カレンダー
- **コマ組**: ブース表 1:2、コピー/移動、日次ツールバー、A3 印刷、**翌年度準備（R04）**
- **授業一覧**: 繰り返し参照、振替フィルタ、Sync Dock（F19 / 3B / 3C）
- **回数報告**: コマ組 / Manabie SF、F13 請求キャッシュ
- Sandbox **Manabieへ登録**（確認フレーズ: `EXECUTE SANDBOX`）

## Docs index

| 種別 | リンク |
|------|--------|
| **Org 設定（開発者）** | [org-configuration.md](docs/org-configuration.md) |
| Master SOQL | [master-catalog-soql.md](docs/master-catalog-soql.md) |
| Architecture | [01-architecture.md](docs/01-architecture.md) |
| Feature parity | [feature-parity.md](docs/feature-parity.md) |
| Booth design | [phase2-booth-grid-design.md](docs/phase2-booth-grid-design.md) |
| Phase 9 UX | [phase9-booth-ux-spike.md](docs/phase9-booth-ux-spike.md) · [G0](docs/phase9-booth-ux-review-g0.md) · [G1](docs/phase9-booth-ux-review-g1.md) |
| Phase 14 R04 | [phase14-r04-spike.md](docs/phase14-r04-spike.md) |
| Phase 15 Booth UX | [phase15-booth-ux-spike.md](docs/phase15-booth-ux-spike.md) |
| Phase 16 R04 repeat | [phase16-r04-repeat-spike.md](docs/phase16-r04-repeat-spike.md) |
| Phase 17 Booth UX | [phase17-booth-ux-spike.md](docs/phase17-booth-ux-spike.md) · [G0](docs/phase17-booth-ux-review-g0.md) |
| Phase 8 | [phase8-perf-api-spike.md](docs/phase8-perf-api-spike.md) |
| Operator manual | [user/operator-manual-ja.md](docs/user/operator-manual-ja.md) |
| E2E signoff | [e2e-sandbox-signoff.md](docs/e2e-sandbox-signoff.md) |

## Discovery

```bash
npm run discover -- trg2--extuat
```

## ベース

[sf-manabie-product-creator](https://github.com/rossoandoy/sf-manabie-product-creator) の MV3 / Cookie Broker / RegistrationExecutor パターンを再利用しています。
