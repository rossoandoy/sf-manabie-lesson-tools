# Phase 4 UX Review — Codex G2（ダッシュボード UX 総合）

**日付:** 2026-06-20  
**ゲート:** G2（Part E 着手前）  
**合格基準:** 教室長向け文言・空状態・エラー回復の網羅、A11y 最低限

## 結論

**合格。**

## 教室長向け文言

| 領域 | 改善 |
|------|------|
| Schedule Gap | `operator-messages.ts` で「Manabie 授業未生成 → 出欠同期スキップ」 |
| SESSION_NOT_MATCHED | 「Manabie に授業が未作成のため出欠を送れません」 |
| タブ | 「登録内容の確認」→ **Manabie登録** |

## 空状態・導線

- ヘッダー下 **Setup checklist**（マスタ / Account / 任意 F13）
- F13 未同期時: 回数報告 → Sync Dock ジャンプリンク
- コマ組サイドバー: PrintSheet タブへの導線（既存）

## ビジュアル

- Booth セル: 同期済 / gap警告 / 休講 の左ボーダー
- Sticky booth ツールバー + gap バナー
- PrintSheet 行ホバー / フィルタ focus
- modal / toast / sync-dock CSS トークン

## A11y 最低限

- モーダル: `role="dialog"` / `aria-modal`
- トースト: `role="status"` / `aria-live="polite"`
- フレーズ一致: `aria-live` フィードバック
- Escape でモーダル閉じ

## 残課題（Phase 5）

- 仮想スクロール
- Production 書き込み
- キーボードのみでの booth グリッド操作強化
