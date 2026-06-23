# Phase 9 G0 Review — Booth UX スコープ固定

## 判定: Go（9a–9d 実装）

## ワイヤ（操作フロー）

1. **コマ copy/move** — コマ選択 → サイドバー「コピー」→ 先コマ「貼付」または「移動」→ 移動先クリック
2. **講師定期** — PrintSheet サイドバー「講師」タブ → 曜日/時限/ブース → プレビュー → 適用（slotMeta 週展開）
3. **学年自動** — コマ組で生徒 datalist から選択 → `Grade__c` 自動入力
4. **日ツールバー** — 一括出席 / 休校化 / 全コマ削除
5. **振替** — PrintSheet「振替ウィザード」または振替待ちフィルタ → 3C

## 塾マネ比較サマリー

| 項目 | 塾マネ | TRG Phase 9 |
|------|--------|-------------|
| コマ移動 | D&D | copy/paste + 2-click move |
| 講師定期 | ○ | ○（slotMeta repeat） |
| 週コピー | ○ | ○（空き先のみ） |
| 振替待ち | ○ | ○（フィルタ+リスト） |

## TeacherRepeat 設計

- **独立** `teacherRepeatRecords[]`（生徒 `repeatRecords` と分離）
- 適用先: `slotMeta.teacherName` のみ（生徒セルは触らない）
- 休校日: `dryRunTeacherRepeat` で skip

## 非包含（再確認）

- 給与・請求 UI
- R04 翌年度
- ドラッグ D&D（Phase 10 候補）
