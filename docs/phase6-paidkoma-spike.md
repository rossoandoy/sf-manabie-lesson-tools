# Phase 6 Part A1: paidKomaField Discovery Spike

**Status:** TRG 合意 — 条件付き集計（2026-06-20）  
**Org:** trg2-extuat

## 調査方法

```bash
npm run discover -- trg2--extuat
```

[`scripts/discover-lesson-objects.py`](../scripts/discover-lesson-objects.py) が `MANAERP__Invoice_Bill_Item__c` を describe し、`invoiceBillItemNumericFields` を discovery JSON に出力します。

## Bill Item 数値フィールド（extuat）

| API 名 | ラベル | 型 | F13 用途 |
|--------|--------|-----|---------|
| `TRG_Purchased_Slot__c` | （レポート用）購入コマ数 | double | **請求中**（全行合計）— 既設定 |
| `MANAERP__Amount__c` | 金額 | currency | コマ数ではない |
| `MANAERP__Tax_Percentage__c` | 税率 | percent | コマ数ではない |

**専用の「支払済コマ数」フィールドは存在しない。**

## 実データ（2026/04 サンプル）

- `TRG_Purchased_Slot__c = 8` かつ `TRG_IF_PaidAmount__c = "21600"` の行あり
- 入金済行のみ slot を支払済に含めるのが Excel F13 左表「支払済」に近い

## TRG 合意（Phase 6 実装ポリシー）

| 列 | 集計 |
|----|------|
| 請求中 | `SUM(TRG_Purchased_Slot__c)` — 全 bill item |
| 支払済 | 同上フィールドだが **`TRG_IF_PaidAmount__c` が入っている行のみ** |

Discovery 設定:

```json
"invoiceBilling": {
  "billItemRelationship": "MANAERP__Invoice_Bill_Items__r",
  "billedKomaField": "TRG_Purchased_Slot__c",
  "paidKomaField": "TRG_Purchased_Slot__c",
  "paidKomaWhenField": "TRG_IF_PaidAmount__c"
}
```

## TRG 確認チェックリスト

- [x] 支払済コマ = 入金済 bill item の `TRG_Purchased_Slot__c` 合計でよいか
- [ ] 部分入金行の扱い（`TRG_IF_PaidAmount__c` のみ非 null で判定）
- [ ] 将来専用フィールドが追加された場合は `paidKomaField` を差し替え可能

## 参照

- [phase5-paidkoma-spike.md](phase5-paidkoma-spike.md) — Phase 5 defer 記録
- [`invoiceSyncService.ts`](../apps/extension/src/services/invoiceSyncService.ts)
