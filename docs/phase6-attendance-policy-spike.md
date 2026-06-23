# Phase 6 Part A2: 振替 / 休講 Manabie Write ポリシー

**Status:** 狭義ポリシー合意（2026-06-20）  
**Org:** trg2-extuat

## MANAERP 制約

`MANAERP__Attendance_Status__c` picklist（extuat）:

- Attend / Absent / Late / Leave Early / Late, Leave Early
- **振替・休講の値は存在しない**

振替の Manabie 標準フローは `MANAERP__Reallocation__c` + `Session_Type__c = Reallocate` 系（[manaerp-lesson-mapping-spike.md](manaerp-lesson-mapping-spike.md)）。

## ポリシー表

| TRG 出欠 | Phase 5 現行 | Phase 6 採用（狭義） | 広義（Phase 7 defer） |
|---------|-------------|---------------------|----------------------|
| 出席 | Attend write | **Attend** | — |
| 欠席 | Absent write | **Absent** | — |
| 休講 | スキップ | **Absent** + `MANAERP__Attendance_Note__c = "休講"` | — |
| 振替 | スキップ | **ローカルのみ**（Manabie write なし） | Reallocation 自動作成 |
| 未確定 | スキップ | **スキップ維持** | — |

## TRG 確認項目

1. 休講を Manabie 上 `Absent` として記録してよいか（休校日ガードと整合）
2. 休講時の Note に `"休講"` 固定でよいか
3. 振替は引き続きコマ組 / PrintSheet ローカルのみでよいか
4. Reallocation API 連携は Phase 7 以降でよいか

## 合意結果（Phase 6 実装）

- **休講 → Absent + Note** を 3B update / 3B+ create に含める
- **振替 → スキップ**（`ATTENDANCE_NOT_MAPPED` は振替のみ）
- Reallocation 自動化は **Phase 6 非包含**
