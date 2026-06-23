# MANAERP Lesson Allocation 回避調査（Phase 11 スパイク）

**調査日**: 2026-06-21  
**結論**: 運用正本は **Option A — `Lesson_Slot__c` のみ（F19）**。Manabie `Student_Session` 作成は Lesson Allocation 前提のため、コマ組日常運用では **3B+（Session create）を非推奨** とする。

## 背景

Manabie 標準では `MANAERP__Student_Sessions__c` が `MANAERP__Lesson_Allocation__c` を参照する formula / 複合キーが存在する（extuat discovery）。

TRG は **Lesson Allocation なし** でコマ配置し、回数報告タブで予実管理したい。

## 調査結果

| 経路 | Allocation 要否 | 拡張での位置 |
|------|----------------|-------------|
| F19 `Lesson_Slot__c` upsert | **不要** | Sync Dock 第一セクション（正本） |
| 3B Student Session 出欠 update | 既存 Session のみ | 任意（Manabie Lesson 生成済み前提） |
| 3B+ Session create | **Allocation / Lesson 整合が必要** | Sync Dock 折りたたみ・非推奨 |
| 3C Reallocation | Allocation 要否は Manabie 側未確定 | 振替時のみ |

## 推奨運用

1. コマ組 → PrintSheet → **F19 のみ** で SF 反映（1:2 ブース = 生徒2名 = Slot 2 レコード）
2. Manabie 出欠は Session が既にある場合のみ 3B
3. Allocation 回避の公式 API が Manabie に無い限り、Session create 自動化は行わない

## 今後の確認事項（Manabie / TRG 合意）

- Custom Settings で Allocation なし Session 作成が許可されるか
- TRG 既存 Apex / Flow の有無
- Reallocation 時の Allocation 代替モデル

## 参照

- [manaerp-lesson-mapping-spike.md](./manaerp-lesson-mapping-spike.md)
- [02-lesson-domain.md](./02-lesson-domain.md)
