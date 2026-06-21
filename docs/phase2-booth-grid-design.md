# Phase 2: lesson-manage 1:2 コマ組 Chrome 化 設計

## 目的

Excel コマ組（lesson-manage）を同一 Chrome 拡張の第2モジュールとして実装し、Excel 依存を排除する。

## 参照

- [lesson-manage FeatureList](https://github.com/rossoandoy/sf-manabie-lesson-tools) — `excel-vba/specs/FeatureList.md`
- Phase 1 基盤: Master Catalog / sf-api / RegistrationExecutor

## サブフェーズ

| Phase | FeatureList | モジュール | 概要 |
|-------|-------------|-----------|------|
| 2A | F03,F04,F08,R07 | `booth-grid-panel.ts` | ブース表 1:2 グリッド、Settings |
| 2B | F05,F07,R09 | `print-sheet-panel.ts` | 1行=1生徒、繰り返し、座席ロジック |
| 2C | F04出欠,R08,R11 | `attendance-panel.ts` | 出欠/振替、日曜非表示 |
| 2D | F14,F19 | SF sync | マスタ取得 + `Lesson_Slot__c` upsert |
| 2E | F06,F12,F11 | `report-panel.ts` | 回数報告、A3印刷、データ出力 |
| 2F | F13,F15 | billing + closed | 請求キャッシュ、休校日統合 |

## UI 参考

Excel Task Pane + 添付 UI（コマ組サイドバー）:

- 表示設定: 年度 / 週ナビ / 時限フィルタ
- 選択中のコマ: 削除
- 出欠記録

## データモデル

```
BoothGrid (2 seats × booth × period × date)
  → PrintSheet row (1 student per row)
  → Lesson_Slot__c upsert (Slot_Key__c)
```

マスタ: SF → 拡張（生徒/教室/教科）。講師: Excel/拡張正本（テキスト名で SF 送信）。

## 技術要点

1. **仮想スクロール**: 日付×ブース×時限×2席の DOM 量を抑制
2. **hostname スコープ storage**: Phase 1 `session-state.ts` パターン拡張
3. **Executor 再利用**: `Lesson_Slot__c` upsert batch を registrationExecutor に追加
4. **休校日統合**: Phase 1.5 closed date と F15 ガードを共有

## Dashboard タブ追加案

```text
[授業スケジュール] [休校日] [コマ組] [回数報告] [登録内容の確認]
```

## 最初の 2A スコープ（MVP）

- Settings: 教室名 / Account ID / ブース数 / 時限
- Booth grid: 2行/ブース、1:1 下段グレーアウト
- 週ナビ / 日曜トグル
- PrintSheet への同期（読み取り専用プレビュー）

2A 完了時点で Excel ブース表の核心操作を Web 化。SF 同期は 2D で追加。

**Phase 9（2026-06）**: 2A MVP に加え、コマ copy/paste/move、講師繰り返し、学年自動、日次ツールバー、振替 UX、週コピーを実装。残ギャップは [feature-parity.md](./feature-parity.md) 参照。
