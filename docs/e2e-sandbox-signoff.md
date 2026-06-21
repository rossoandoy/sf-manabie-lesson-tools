# Sandbox E2E Sign-off（Phase 1）

trg2-extuat で Phase 1 登録フロー（授業スケジュール + 休校日）が Dashboard から end-to-end で動作することを確認するチェックリストです。

CLI 自動テストは [`npm run e2e:live`](../README.md) を参照。本ドキュメントは **Chrome 拡張 + Cookie Broker** 経由の手動 Sign-off 用です。

## 事前条件

- [ ] Salesforce CLI: `sf org login --alias trg2--extuat` 済み（CLI テスト用）
- [ ] Chrome で trg2-extuat にログイン済み
- [ ] 拡張 `apps/extension/dist` を読み込み済み
- [ ] `npm run verify` が成功している

## Sign-off 記録

| 項目 | 値 |
|------|-----|
| 実施日 | |
| 実施者 | |
| Org | trg2-extuat |
| 拡張バージョン | |
| 結果 | Pass / Fail |

## チェックリスト

| # | 操作 | 期待結果 | Pass |
|---|------|----------|------|
| 1 | **前提マスタ同期** をクリック | 拠点/年度/拠点コース/クラス/教室/講師が取得される | |
| 2 | 授業タブ: 日付クリック → 右ドロワーで保存 | カレンダーに授業チップが表示される | |
| 3 | 授業チップを D&D で別日へ移動 | チップが移動し、「Manabie登録」タブの ImportPlan が更新される | |
| 4 | **Manabie登録** タブを開く | validation error がない | |
| 5 | **Manabieへ登録** + 確認フレーズ `EXECUTE SANDBOX` | Execution log が success、Salesforce ID が表示される | |
| 6 | **休校日** タブで日付をクリックして保存 | 休校日チップ表示。授業タブでも休校日背景が見える | |
| 7 | **Manabie登録** 下部で休校日を Manabie へ登録 | success、Execution log に ID | |
| 8 | 休校日セルへ授業チップを D&D | 「休校日には授業を配置できません」警告でブロック | |

## Phase 2 チェックリスト（コマ組 / PrintSheet / 回数報告）

| # | 操作 | 期待結果 | Pass |
|---|------|----------|------|
| 9 | **コマ組** タブ: 講師・生徒・学年を入力 | 黄色講師セル + 学年が保存される | |
| 10 | **PrintSheet** タブ: 種別/期間フィルタ | 行が絞り込まれる | |
| 11 | PrintSheet / 登録確認: **授業データ送信（F19）** | success、PrintSheet SF 列が「同期済」 | |
| 12 | **回数報告**: 振替登録 → 更新 | 右表「振替/実施」に反映 | |
| 13 | **回数報告**: 請求データ同期（F13） | 左表「請求中」列にコマ数が入る（`TRG_Purchased_Slot__c` 合計） | |
| 14 | データソース **Manabie SF** → 更新 | SOQL 取得成功、コマ組との差分 notice（不一致時） | |
| 15 | 休校日削除 | 自動休講化したコマの出欠が復元される | |
| 16 | PrintSheet Sync Dock: **Manabie 出欠同期（3B）** | モーダル → `EXECUTE SANDBOX` → SF Session の出欠が更新される | |
| 17 | **回数報告**: Manabie SF + 月別差分 | 不一致月行が `.report-row-diff` でハイライトされる | |
| 18 | **コマ組**: Schedule Gap 警告 | Lesson 未生成日がある週でツールバー / Sync Dock に warning が表示される | |

## Phase 4 チェックリスト（Dashboard UX / Sync Dock）

| # | 操作 | 期待結果 | Pass |
|---|------|----------|------|
| 19 | **コマ組** → **PrintSheet** | Sync Dock が PrintSheet 下部に 1 つ。F19 + 3B が同一タブで完走 | |
| 20 | Sync Dock / 回数報告: **モーダル Execute** | ネイティブ prompt なし。フレーズ一致まで実行ボタン disabled | |
| 21 | マスタ未同期 or Account 未選択 | ヘッダー下 **Setup checklist** 表示 + タブジャンプ | |

## Phase 5 チェックリスト（Session create / 性能）

| # | 操作 | 期待結果 | Pass |
|---|------|----------|------|
| 22 | Sync Dock: **Manabie Session 作成（3B+）** | Lesson あり / Session なし / 出席・欠席行で create → 続けて 3B update が Pass | |
| 23 | **コマ組**: 大規模グリッド（8×8×6 相当） | 仮想スクロール起動、日ナビでスクロール、週ナビで offset リセット | |
| 24 | **回数報告**: F13「支払済」列 | 入金済 bill item の `TRG_Purchased_Slot__c` 合計が表示される | |
| 25 | **PrintSheet**: 休講セル → 3B Execute | SF Session が `Absent` + Note `休講` | |

## Phase 6 チェックリスト（F13 + 出欠拡張）

| # | 操作 | 期待結果 | Pass |
|---|------|----------|------|
| 26 | **回数報告**: F13 再同期 | #24 と同様（CLI live でも検証可） | |
| 27 | 振替セル → 3B | スキップ（`ATTENDANCE_NOT_MAPPED` は振替のみ） | |

## Phase 7 チェックリスト（振替 / Reallocation）

| # | 操作 | 期待結果 | Pass |
|---|------|----------|------|
| 28 | Sync Dock: **Manabie 振替登録（3C）** | transferFrom あり振替行 → Reallocation 1 件 create | |
| 29 | 振替先 Lesson 未生成 | warning 表示、3C create しない | |

### Phase 7 Sign-off 記録（#28–#29）

| 項目 | 値 |
|------|-----|
| 実施日 | 2026-06-20 |
| 実施者 | Phase 7 実装 + CLI verify |
| 結果 | CLI: Pass（手動 #28–#29 は Chrome で実施） |

## Phase 8 チェックリスト（パフォーマンス / 同期 UX）

| # | 操作 | 期待結果 | Pass |
|---|------|----------|------|
| 30 | コマ組 20 セル編集 | SOQL 再取得なし（Network / stale badge のみ） | |
| 31 | Sync Dock **Manabie データ更新** | 3B/3C プレビュー再生成、badge が「最新」 | |
| 32 | F19 Execute 後に生徒名編集 | SF 列ドットが stale（点線ボーダー / 薄グレー行） | |

### Phase 8 Sign-off 記録（#30–#32）

| 項目 | 値 |
|------|-----|
| 実施日 | 2026-06-20 |
| 実施者 | Phase 8 実装 + CLI verify |
| 結果 | CLI: Pass（手動 #30–#32 は Chrome で実施） |

## Phase 9 チェックリスト（コマ組 UX）

| # | 操作 | 期待結果 | Pass |
|---|------|----------|------|
| 33 | コマ組: コピー → 別コマ貼付 | 講師+生徒が複製される | |
| 34 | PrintSheet: 講師繰り返し適用 | 該当曜日の slotMeta に講師名 | |
| 35 | 生徒 datalist 選択 | 学年が catalog から自動入力 | |
| 36 | 前週→今週コピー | 空きコマにのみコピー、占有はスキップ | |

### Phase 9 Sign-off 記録（#33–#36）

| 項目 | 値 |
|------|-----|
| 実施日 | 2026-06-20 |
| 実施者 | Phase 9 実装 + CLI verify |
| 結果 | CLI: Pass（手動 #33–#36 は Chrome で実施） |

## CLI 自動 E2E

```bash
# マスタ SOQL smoke
npm run e2e:master-sync

# ImportPlan 構築 + Execute + cleanup（要 sf org login）
npm run e2e:live

# Execute を dryRun のみ（初回デバッグ）
npm run e2e:live:dry
```

環境変数:

| 変数 | デフォルト | 用途 |
|------|------------|------|
| `E2E_ORG` | `trg2--extuat` | SF CLI org alias |
| `E2E_DRY_RUN=1` | — | Execute を dryRun のみ |
| `E2E_SKIP_CLEANUP=1` | — | 作成レコードの自動削除をスキップ |
| `E2E_LIVE=1` | — | slot / invoice / manaerp / schedule-gap live テストを実行 |
| `E2E_BILL_KOMA_FIELD` | — | （非推奨）discovery 設定前の legacy。現在は `discovery-trg2-extuat.json` の `TRG_Purchased_Slot__c` を使用 |

## CLI 自動 Sign-off（2026-06-20）

`E2E_LIVE=1` + `sf org login --alias trg2--extuat` 済みの環境で以下が Pass:

| テスト | カバー |
|--------|--------|
| `e2e-invoice-sandbox.live.test.ts` | #24 F13 bill_item + 左表請求中/支払済 |
| `manaerp-attendance-map.test.ts` + update/create builder tests | #25 休講 → Absent write |
| `reallocationPlanBuilder.test.ts` | #28–#29 Reallocation プラン |
| `sync-manifest.test.ts` | #32 stale 検知 + F19/3B/3C レイヤー |
| `booth-slot-clipboard.test.ts` | #33 コマ copy/move |
| `booth-teacher-repeat.test.ts` | #34 講師繰り返し |
| `booth-grade-lookup.test.ts` | #35 学年自動 |
| `booth-week-copy.test.ts` | #36 週コピー |
| `e2e-reallocation-sandbox.live.test.ts` | #28 Reallocation create + delete |
| `e2e-student-session-sandbox.live.test.ts` | #16 3B 出欠 update + ロールバック |
| `e2e-schedule-gap-sandbox.live.test.ts` | #18 Schedule Gap SOQL |
| `confirm-modal.test.ts` + `sync-dock-panel.test.ts` + `operator-messages.test.ts` | #20 モーダル / Sync Dock / 平易メッセージ |
| `studentSessionCreatePlanBuilder.test.ts` | #22 Session create プラン |
| `manabie-query-cache.test.ts` | Phase 5 gap キャッシュ再利用 |

```bash
cd apps/extension && E2E_LIVE=1 npx vitest run \
  src/services/e2e-invoice-sandbox.live.test.ts \
  src/services/e2e-student-session-sandbox.live.test.ts \
  src/services/e2e-schedule-gap-sandbox.live.test.ts
```

## 付録: トラブルシュート

### 休校日 Execute が SKIP される

trg2-extuat に `MANAERP__Closed_Date__c` が未デプロイの場合、CLI live テストは休校日ケースをスキップします。Dashboard 手動 Sign-off #7 は org 側の object デプロイ後に実施してください。

### ImportPlan に placeholder が残る

Discovery JSON が古い可能性があります。

```bash
npm run discover -- trg2--extuat
npm run verify
```

### Manabieへ登録ボタンが無効

- 前提マスタ同期を実行
- 授業が 1 件以上あること
- 「Manabie登録」で error 級 validation がないこと

### Execute 失敗

- Execution log の `errorMessage` と batch ごとの `rowResults` を確認
- Sandbox ユーザーに対象 sObject の create 権限があるか Setup で確認
- 確認フレーズが `EXECUTE SANDBOX` と完全一致しているか

### マスタ不足（class / classroom なし）

CLI テストの `pickScheduleFixture` が失敗する場合、対象拠点に Location Course / Class / Classroom が紐づいているか Salesforce UI で確認してください。

### ロールバック

- CLI live テスト: 通常は自動 cleanup。`E2E_SKIP_CLEANUP=1` 時は Execution log の ID を手動削除
- Dashboard 手動登録: [操作マニュアル 7章](user/operator-manual-ja.md#7-ロールバック) を参照
