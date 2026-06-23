# Feature Parity — lesson-manage Excel vs Chrome 拡張

正本: `lesson-manage/excel-vba/specs/FeatureList.md`

## 実装済（拡張でカバー）

| ID | 機能 | 拡張での位置 |
|----|------|-------------|
| F03/F08 | ブース表・設定 | `booth-grid-panel.ts` |
| F05 | PrintSheet 1行=1生徒 | `print-sheet-panel.ts` |
| F07（生徒） | 生徒繰り返し | コマ組「繰り返し配置」+ prefill / 検索 / 終了 |
| F06/R12 | 回数報告 | `report-panel.ts` + Manabie ソース |
| F13 | 請求/支払済 | Phase 6 `invoiceSyncService` |
| F15/R01 | 休校日・日曜非表示 | closed-date + booth guard |
| F19/3B/3C | SF/Manabie write | Sync Dock + Phase 7/8 |
| R07 | 1:1 モード | 生徒契約 `MANAERP__Lesson_Capacity__c` で席2グレー + Account 形式（org により `Capacity__c` またはデフォルト 1:2）— [org-configuration.md](./org-configuration.md) |
| R08/R11 | 出欠色・PrintSheet 連動 | `booth-attendance.ts` |
| R09 | 1:2 反対席イレギュラー | `pickSeat` / △ |
| R13 | 体験・未入会 | `lessonKind=体験`, `studentType=未入会` |
| F12/R03 | A3 印刷 | `print-booth-a3` CSS |
| F11（部分） | CSV | 回数報告 CSV |

## Phase 9 で追加（v0.2.0+）

| ID | 機能 | 拡張 |
|----|------|------|
| F07（講師） | 講師定期 | コマ組「繰り返し配置」+ 検索 / conflict / 終了 |
| F04 | コマ copy/paste/move | `booth-slot-clipboard.ts` + コマ組右パネル |
| F04 | 日付列一括削除 | 日見出し「全コマ削除」 |
| F04 | 一括削除（生徒/講師名） | コマ組設定「一括削除（F04）」+ `booth-bulk-delete.ts` |
| R06 | 学年自動 | 生徒名確定 → catalog `Grade__c` |
| R-UI02 | 休校化 | 日見出し「休校化」→ 休校日追加 |
| F04（部分） | 振替ウィザード | コマ組「繰り返し配置」内 + `registerTransfer` |
| — | 振替待ち | 授業一覧「振替待ちのみ」フィルタ + コマ組繰り返しパネル |
| — | 週コピー | ツールバー「前週→今週コピー」 |
| R10 | 時限開始時刻 | コマ組設定 + 表ヘッダ |
| R-UI02 | 強調ハイライト | コマ詳細「強調」 |
| — | キーボード移動 | 矢印 / Alt+矢印（日付） |

## Phase 10 で追加（Excel ブース表レイアウト + Affiliation）

| ID | 機能 | 拡張 |
|----|------|------|
| — | Excel 列レイアウト | 日付｜ブース｜時限×（講師/生徒/学年/教科）、1ブース2行 |
| — | 所属校舎自動設定 | `user-affiliation-context.ts` → Affiliation → Account ブース数（org 別: trg2 は `TRG_BoothCount__c`）— [org-configuration.md](./org-configuration.md) |
| R07 | 契約ベース 1:1 | 席1生徒が 1:1 契約かつ席2空 → 席2 `(1:1枠)` グレー |

## Phase 11 で追加（コマ組 UX + データモデル）

| ID | 機能 | 拡張 |
|----|------|------|
| — | カレンダー / ブース表切替 | コマ組コンテキストバー + `boothViewMode` |
| — | 所属校舎スコープピッカー | `center-scoped-catalog.ts` + 検索モーダル |
| — | F19 正本 Sync Dock | Manabie 連携を折りたたみ optional |
| — | 1:2 = 2 Slot | ドキュメント化（`02-lesson-domain.md`） |

## Phase 12 で追加（タブ統合・俯瞰）

| ID | 機能 | 拡張 |
|----|------|------|
| — | タブ IA | コマ組 / 授業一覧 / 回数報告 / 休校日 / Manabie登録 |
| — | ブース表俯瞰 | 週全体1テーブル + 左右パネル折りたたみ |
| — | 回数報告 A4 | Excel 相当2表横並び + 署名欄 |

## Phase 13 で追加（UI/UX 改善）

| ID | 機能 | 拡張 |
|----|------|------|
| — | sticky 日付/ブース列 | 横スクロール時も左列固定 + 週レンジ表示 |
| — | 右パネル accordion | 選択中コマ / 繰り返し / 授業一覧 + 折りたたみ永続化 |
| — | 授業一覧フィルタ | 名前検索モーダル + 振替待ちのみ |
| — | 授業一覧性能 | 200行超 tbody 仮想スクロール |
| F04 | 一括削除（生徒/講師名） | コマ組設定 + preview + confirm |

## Phase 14 で追加（R04 翌年度準備）

| ID | 機能 | 拡張 |
|----|------|------|
| R04 | 翌年度生成処理 | コマ組「翌年度を準備」+ `booth-fiscal-rollover.ts` + JSON バックアップ |
| — | Production org 表示 | ヘッダー badge + Sync Dock Execute 無効化（allowlist は Phase 16） |

## Phase 15 で追加（1:2 コマ組 UI/UX）

| ID | 機能 | 拡張 |
|----|------|------|
| — | 大規模グリッド day window | `booth-grid-virtual.ts` — 400 セル超 → 2 日分 + ◀日/日▶ |
| — | 入力フォーカス保持 | partial DOM update（`updateSlotVisuals`） |
| — | キーボード強化 | Tab 巡回 / Ctrl+C/V/X / Escape + `booth-grid-keyboard.ts` |
| F04（部分） | 振替ウィザード v2 | 選択コマ prefill + 生徒ピッカー + 2 席一括 + 待ちリストジャンプ |

## Phase 16 で追加（R04 repeat 自動整理）

| ID | 機能 | 拡張 |
|----|------|------|
| R04（部分） | repeat 自動整理 | `planRepeatCleanup` / `applyRepeatCleanup` — 終了 + 開始日クリップ |
| — | 翌年度準備 UI | preview / confirm に定期整理件数表示 |

## Phase 17 で追加（繰り返し配置 UX）

| ID | 機能 | 拡張 |
|----|------|------|
| F07 | 生徒/講師 repeat UX | 選択コマ prefill + 検索モーダル + 手動終了 + 講師 conflict プレビュー |
| — | D&D 判定 | No-Go（clipboard/keyboard 継続）— [spike](phase17-booth-ux-spike.md) |

## 残ギャップ（将来）

| ID | Excel/VBA | 状態 |
|----|-----------|------|
| Production Execute | allowlist + 本番確認フレーズ | Phase 18 |
| Playwright Dashboard E2E | 拡張読込 smoke | Phase 18 |
| 1:2 グリッド D&D | 塾マネ型配置 | Phase 18（No-Go 再評価） |
| F11 | DataExport シート | CSV のみ |
| R02 | 休校日削除後の再配置 | Excel も保留 |

## 拡張が Excel を上回る領域

- Manabie Lesson/Session 読取 + 出欠 write + Reallocation
- Sync Dock + Sync Manifest（F19/3B/3C ドット UX）
- 手動 Manabie データ更新（API 節約）
- Schedule Gap 警告
