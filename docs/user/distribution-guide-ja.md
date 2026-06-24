# 配布ガイド（本部 IT / 導入担当者向け）

Manabie Lesson Tools **v0.3.0** を教室長・事務担当者へ配布する手順です。  
開発者向けの org 設定は [org-configuration.md](../org-configuration.md) を参照してください。

---

## 配布物

| 項目 | 内容 |
|------|------|
| 形式 | Chrome 拡張（ZIP、開発者モードで読み込み） |
| ファイル名 | `manabie-lesson-tools-v0.3.0.zip` |
| 取得元 | [GitHub Releases](https://github.com/rossoandoy/sf-manabie-lesson-tools/releases/tag/v0.3.0) |
| 検証環境 | Salesforce Sandbox **trg2--extuat** |

> Chrome Web Store 公開版はありません。パイロット期間は **ZIP 配布 + 開発者モード読み込み** です。

---

## 配布前チェック（導入担当者）

1. 対象ユーザーが **Google Chrome**（最新版推奨）を使用している
2. ユーザーが **trg2--extuat Sandbox** にログインできる Salesforce アカウントを持っている
3. ユーザーの Contact に **Affiliation（所属校舎）** が設定されている（自動で拠点・ブース数が入るため）
4. 配布 ZIP のバージョンが **v0.3.0** である（ZIP 内 `manifest.json` の `version` で確認可）

---

## 配布手順（推奨）

### 1. ZIP を入手

- GitHub Release から `manabie-lesson-tools-v0.3.0.zip` をダウンロード
- 社内共有ドライブ等へ配置する場合も **ZIP をそのまま** 渡す（展開済みフォルダの再 zip は不要）

### 2. ユーザーへ渡すもの

次をセットで共有してください。

1. **ZIP ファイル**（上記）
2. **[利用開始ガイド](./getting-started-ja.md)**（初回セットアップ手順）
3. **[操作マニュアル](./operator-manual-ja.md)**（日常業務の詳細）

### 3. ユーザー側インストール（概要）

ユーザーには [利用開始ガイド](./getting-started-ja.md) の「インストール」に従ってもらいます。要点のみ:

1. ZIP を解凍（解凍後フォルダ名は任意。中身に `manifest.json` があること）
2. Chrome → `chrome://extensions` → **デベロッパーモード ON**
3. **パッケージ化されていない拡張機能を読み込む** → 解凍フォルダを選択
4. Salesforce Sandbox にログイン → 拡張アイコン → **ダッシュボードを開く**

---

## バージョンアップ

1. 新しい Release ZIP を配布
2. ユーザー: Chrome `chrome://extensions` で拡張の **更新（↻）** または一度削除して再読み込み
3. ダッシュボードで **前提マスタ同期** を再実行

データ（コマ組入力等）はブラウザのローカルストレージに hostname 単位で保存されます。同一 PC・同一 Chrome プロファイルであれば再インストール後も残ることが多いですが、**重要データは Manabie / SF 同期後** を正本としてください。

---

## セキュリティ・運用上の注意

- 拡張は **Salesforce のログイン Cookie** を同一ブラウザ内で REST API 呼び出しに使用します（Salesforce Inspector 系と同様）。共有 PC ではログアウトを徹底してください。
- **Production org** では Manabie への書き込み（Execute）は Phase 16 時点で **Sandbox のみ** です。ヘッダーの **Sandbox** バッジを確認してください。
- ZIP の改ざん防止のため、可能であれば GitHub Release の公式 URL から直接ダウンロードさせてください。

---

## 問い合わせ時に確認すること

| 確認項目 | 期待値 |
|----------|--------|
| Chrome 拡張が有効 | `Manabie Lesson Tools` が ON |
| SF ログイン | trg2--extuat にログイン済み |
| 前提マスタ同期 | エラー toast なし |
| ブース数 | Account の値と一致（手動変更不可） |
| 拡張バージョン | manifest `0.3.0` |

詳細な検証項目: [e2e-sandbox-signoff.md](../e2e-sandbox-signoff.md) の v0.3.0 セクション（#81–#84）
