# 操作マニュアル（教室長 / 本部事務）

Sandbox E2E Sign-off チェックリスト: [docs/e2e-sandbox-signoff.md](../e2e-sandbox-signoff.md)

## 1. インストール

1. Chrome で拡張 `Manabie Lesson Tools` を読み込む
2. trg2-extuat（Sandbox）にログイン
3. 拡張 Popup → **ダッシュボードを開く**

## 2. 前提マスタ同期

1. ダッシュボード上部の **前提マスタ同期** をクリック
2. 拠点・年度・拠点コース・クラス・教室・講師が取得されることを確認
3. 「Manabie登録」タブで件数を確認

## 3. 授業スケジュール登録

1. **授業スケジュール** タブで日付をクリック
2. 授業名 / 時間 / 拠点 / コース / クラス / 教室 / 講師を入力して保存
3. **Manabie登録** タブで ImportPlan を確認
4. **Manabieへ登録** をクリック
5. 確認フレーズ `EXECUTE SANDBOX` を入力

CSV ダウンロードは監査・フォールバック用途のみ（Data Import Wizard 代替ではありません）。

## 4. 休校日（Phase 1）

1. **休校日** タブで日付をクリック
2. 休校日名と年度を入力
3. CSV（監査）で出力可能

## 5. 休校日 Manabie 登録（Phase 1.5）

1. **Manabie登録** タブ下部で拠点を選択
2. **休校日を Manabie へ登録** をクリック
3. 確認フレーズ `EXECUTE SANDBOX` を入力

## 6. トラブルシューティング

| 症状 | 対処 |
|------|------|
| セッションなし | Salesforce を再ログイン |
| Manabieへ登録が無効 | 前提マスタ同期 + 授業入力 + Manabie登録タブで error 解消 |
| Production org | Sandbox のみ Execute 可能 |

## 7. ロールバック

Sandbox で作成されたレコードは Salesforce 標準 UI または Data Loader で削除。Execution ログの Salesforce ID を参照。

## 8. コマ組（Phase 2A）

1. **コマ組** タブで教室名・拠点（Account）・ブース数・時限を設定
2. 週ナビで日付行を表示し、各コマに講師（黄色）・生徒・教科・学年を入力
3. 休校日は自動で入力不可（休講化）
4. **Manabie 週参照** で SF の Student Session 出欠を既存セルに反映（Account 設定必須。上書き件数 confirm あり）
5. Lesson 未生成日がある場合、ツールバー下に **Schedule Gap 警告** が表示されます

## 9. PrintSheet / Manabie 同期（Sync Dock / Phase 4）

ダッシュボードのタブ順は **[コマ組] [PrintSheet] [回数報告] …** です。日常の SF 同期は **PrintSheet 下部の Sync Dock** に集約されています。

1. **PrintSheet** タブで Excel 相当列（講師・学年・種別・振替・備考）を編集
2. 種別 / 生徒 / 期間フィルタで行を絞り込み
3. 下部 **Sync Dock** の **授業データ送信（F19）** — モーダルで `EXECUTE SANDBOX` を入力
4. **Manabie 出欠同期（3B）** — 同上（出席/欠席/休講。振替・未確定はスキップ）
5. Schedule Gap 警告が出た場合、Manabie 側で Lesson 未生成 — 3B は該当日をスキップ
6. **Manabie Session 作成（3B+）** — Lesson あり / Session なし / 出席・欠席・休講。作成後に 3B 出欠同期を実行
7. **Manabie 振替登録（3C）** — 振替行（transferFrom あり）→ Reallocation create。振替元 Session + 振替先 Lesson が必要
8. 成功時はトースト + PrintSheet **SF 列**の 3 分割ドット（F19|3B|3C）で同期状態を確認（ホバーで詳細）

### Manabie データ更新（Phase 8）

コマ組 / PrintSheet を編集しても **自動では Manabie を再取得しません**（API 節約）。

1. 編集後、Sync Dock 上部が **「Manabie データ要更新」**（amber）になる
2. **Manabie データ更新** ボタンをクリック → Lesson / Session / Schedule Gap を再取得
3. 3B / 3C / F19 を Execute する前に更新推奨（未更新のまま Execute すると確認ダイアログ）
4. PrintSheet ツールバー **「未同期のみ」** で SF 未反映行を絞り込み
5. SF 列: 緑ドット = 同期済、点線ボーダー / 薄グレー行 = 編集後要再同期

### 振替の Manabie 同期フロー（Phase 7）

振替は **3B 出欠同期では書き込まれません**（`attendance=振替` はスキップ）。Manabie へ反映する手順:

1. コマ組で振替を登録すると PrintSheet に `振替` + `transferFrom`（元日）/ `transferTo`（先日）が付きます
2. **振替元** — 元日の Student Session が Manabie に存在すること（3B で出欠済み、または既存 Session）
3. **振替先 Lesson** — 先日の `MANAERP__Lesson__c` が生成済みであること（未生成週は Schedule Gap 警告）
4. （任意）**振替先 Session** — 先日に Session が無い場合、**Manabie Session 作成（3B+）** で先日分を create → **3B** で出欠を反映
5. Sync Dock **Manabie 振替登録（3C）** を Execute — `MANAERP__Reallocation__c` を 1 件 create（Status: Open）
6. 先日 Session が無くても 3C は create 可能（Phase 7 スコープ）。先日 Session の自動 create + Reallocation 一括は Phase 7 外

詳細: [phase7-reallocation-spike.md](../phase7-reallocation-spike.md)

## 10. 回数報告（Phase 2E–2G / 3A / 3B）

1. **回数報告** タブで生徒・年度を選択
2. **データソース** を「コマ組」または「Manabie SF」に切替
3. **回数報告を更新** で右表（予定/実施）を集計
4. **請求データ同期（F13）** で左表「請求中/支払済」コマ数を充填（請求中: 全 bill item の `TRG_Purchased_Slot__c` 合計。支払済: 入金済行のみ — [phase6-paidkoma-spike.md](../phase6-paidkoma-spike.md)）
5. Manabie SF 選択時、月別 executed 不一致行が黄色ハイライトされます
6. F13 未同期時は **Sync Dock へ** リンクから PrintSheet にジャンプできます
7. **印刷（A4）** / **CSV 出力（F11）**

## 11. セットアップチェックリスト（Phase 4）

初回または未設定時、ヘッダー下にチェックリストが表示されます。

1. **前提マスタ同期**（ヘッダーボタン）
2. **コマ組** で拠点（Account）を選択
3. （任意）**回数報告** で請求データ F13 を初回同期

## 12. コマ組 仮想スクロール（Phase 5）

ブース数 × 時限 × 曜日のセル数が閾値（400）を超えると、コマ組グリッドは **2 日分ずつ** 表示し、ツールバーの **◀ 日 / 日 ▶** でスクロールします。週ナビ（◀ 週 / 週 ▶）では表示位置が先頭日にリセットされます。

## 13. 休校日とコマ組の連動（Phase 2H）

休校日を追加すると該当日のコマは **休講** になります。休校日を削除すると、休講化前の出欠に **自動復元** されます（手動で休講にしたコマは対象外）。

## 14. コマ組 UX（Phase 9 / v0.2.0）

### コマ操作（F04）

1. コマをクリックして選択
2. 右サイドバー: **コピー** → 先コマで **貼付**、または **移動** → 移動先コマをクリック
3. 日見出し: **一括出席** / **休校化** / **全コマ削除**

### 講師繰り返し（F07）

PrintSheet サイドバー → **講師** タブ → 曜日・時限・ブース → プレビュー → 適用

### 学年自動（R06）

前提マスタ同期後、コマ組で生徒名を datalist から選択すると catalog の学年が自動入力されます。

### 振替

- **振替ウィザード**（PrintSheet サイドバー）: 元日/先日/席を指定
- **振替待ち** フィルタ: 出欠=振替 かつ 振替先未入力
- Manabie 反映: Phase 7 の 3C フロー（[§9](#9-printsheet--manabie-同期sync-dock--phase-4)）

### 週コピー

コマ組ツールバー **前週→今週コピー** — 講師+生徒が揃ったコマのみ、空き先へコピー

### SF 列ドット（Phase 8）

PrintSheet **SF** 列は 3 分割ドット（F19 | 3B | 3C）。緑=同期済、点線/薄グレー=編集後要再同期。詳細はホバー。

---

Manabie Lesson Tools v0.2.0
