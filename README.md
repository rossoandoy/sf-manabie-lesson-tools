# Manabie Lesson Tools

Salesforce Inspector Reloaded 方式の Chrome 拡張。Lesson チームの CSV Web アプリ（授業スケジュール / 休校日）を統合し、**Manabie へ直接登録**できる UI を提供します。

**バージョン: v0.2.0** — Phase 1〜8 完了 + Phase 9 コマ組 UX

## What it is

- Chrome MV3 拡張（Sandbox Manabie ブリッジ）
- コマ組 1:2 グリッド + PrintSheet + Sync Dock + 回数報告
- Excel `lesson-manage` の代替（[機能対応表](docs/feature-parity.md)）

## Quick start

```bash
npm install
npm run verify
```

Chrome で `apps/extension/dist` を読み込み、Salesforce Sandbox にログイン → Popup → **ダッシュボードを開く**。

配布 zip: `npm run package` → `dist-packages/manabie-lesson-tools-v0.2.0.zip`

## Phase ロードマップ

| Phase | 内容 | 状態 |
|-------|------|------|
| 1–1.5 | 授業スケジュール / 休校日 / Manabie 登録 | ✅ |
| 2A–2H | コマ組 / PrintSheet / 出欠 / SF F19 | ✅ |
| 3A–3D | Manabie 読取 / 3B 出欠 / Schedule Gap | ✅ |
| 4–5 | Sync Dock / Session create / 仮想スクロール | ✅ |
| 6–7 | F13 / 休講 write / Reallocation 3C | ✅ |
| 8 | 手動 Manabie 更新 / Sync Manifest | ✅ v0.2.0 |
| 9 | コマ copy/move / 講師定期 / 振替 UX / 週コピー | ✅ [spike](docs/phase9-booth-ux-spike.md) |

## 主な機能

- 前提マスタ同期（拠点 / 年度 / 拠点コース / クラス / 教室 / 講師）
- 授業スケジュール・休校日カレンダー
- **コマ組**: ブース表 1:2、コピー/移動、日次ツールバー、A3 印刷
- **PrintSheet**: 繰り返し（生徒/講師）、振替ウィザード、Sync Dock（F19 / 3B / 3C）
- **回数報告**: コマ組 / Manabie SF、F13 請求キャッシュ
- Sandbox **Manabieへ登録**（確認フレーズ: `EXECUTE SANDBOX`）

## Docs index

| 種別 | リンク |
|------|--------|
| Architecture | [01-architecture.md](docs/01-architecture.md) |
| Feature parity | [feature-parity.md](docs/feature-parity.md) |
| Booth design | [phase2-booth-grid-design.md](docs/phase2-booth-grid-design.md) |
| Phase 9 UX | [phase9-booth-ux-spike.md](docs/phase9-booth-ux-spike.md) · [G0](docs/phase9-booth-ux-review-g0.md) · [G1](docs/phase9-booth-ux-review-g1.md) |
| Phase 8 | [phase8-perf-api-spike.md](docs/phase8-perf-api-spike.md) |
| Operator manual | [user/operator-manual-ja.md](docs/user/operator-manual-ja.md) |
| E2E signoff | [e2e-sandbox-signoff.md](docs/e2e-sandbox-signoff.md) |

## Discovery

```bash
npm run discover -- trg2--extuat
```

## ベース

[sf-manabie-product-creator](https://github.com/rossoandoy/sf-manabie-product-creator) の MV3 / Cookie Broker / RegistrationExecutor パターンを再利用しています。
