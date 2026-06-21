# Feature Parity — lesson-manage Excel vs Chrome 拡張

正本: `lesson-manage/excel-vba/specs/FeatureList.md`

## 実装済（拡張でカバー）

| ID | 機能 | 拡張での位置 |
|----|------|-------------|
| F03/F08 | ブース表・設定 | `booth-grid-panel.ts` |
| F05 | PrintSheet 1行=1生徒 | `print-sheet-panel.ts` |
| F07（生徒） | 生徒繰り返し | PrintSheet「繰り返し配置」+ `booth-repeat.test.ts` |
| F06/R12 | 回数報告 | `report-panel.ts` + Manabie ソース |
| F13 | 請求/支払済 | Phase 6 `invoiceSyncService` |
| F15/R01 | 休校日・日曜非表示 | closed-date + booth guard |
| F19/3B/3C | SF/Manabie write | Sync Dock + Phase 7/8 |
| R07 | 1:1 モード | `oneToOneMode` |
| R08/R11 | 出欠色・PrintSheet 連動 | `booth-attendance.ts` |
| R09 | 1:2 反対席イレギュラー | `pickSeat` / △ |
| R13 | 体験・未入会 | `lessonKind=体験`, `studentType=未入会` |
| F12/R03 | A3 印刷 | `print-booth-a3` CSS |
| F11（部分） | CSV | 回数報告 CSV |

## Phase 9 で追加（v0.2.0+）

| ID | 機能 | 拡張 |
|----|------|------|
| F07（講師） | 講師定期 | PrintSheet 講師繰り返し + `booth-teacher-repeat.ts` |
| F04 | コマ copy/paste/move | `booth-slot-clipboard.ts` + コマ組サイドバー |
| F04 | 日付列一括削除 | 日見出し「全コマ削除」 |
| R06 | 学年自動 | 生徒名確定 → catalog `Grade__c` |
| R-UI02 | 休校化 | 日見出し「休校化」→ 休校日追加 |
| F04（部分） | 振替ウィザード | PrintSheet モーダル + `registerTransfer` |
| — | 振替待ち | PrintSheet フィルタ + サイドバーリスト |
| — | 週コピー | ツールバー「前週→今週コピー」 |
| R10 | 時限開始時刻 | コマ組設定 + 表ヘッダ |
| R-UI02 | 強調ハイライト | コマ詳細「強調」 |
| — | キーボード移動 | 矢印 / Alt+矢印（日付） |

## 残ギャップ（将来）

| ID | Excel/VBA | 状態 |
|----|-----------|------|
| F04 | 一括削除（生徒/講師名検索） | P1 未実装 |
| R04 | 翌年度準備 | P2 defer |
| F11 | DataExport シート | CSV のみ |
| R02 | 休校日削除後の再配置 | Excel も保留 |

## 拡張が Excel を上回る領域

- Manabie Lesson/Session 読取 + 出欠 write + Reallocation
- Sync Dock + Sync Manifest（F19/3B/3C ドット UX）
- 手動 Manabie データ更新（API 節約）
- Schedule Gap 警告
