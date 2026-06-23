# Phase 5 Part B: paidKomaField Discovery Spike

**Status:** Deferred — org field name not agreed (2026-06-20)

## Context

F13 左表「支払済」列は `discovery-trg2-extuat.json` の `invoiceBilling.paidKomaField` が `null` のため常に空です。`billedKomaField: TRG_Purchased_Slot__c` は設定済みで「請求中」は動作します。

## Discovery command

```bash
npm run discover -- trg2--extuat
```

## Findings (trg2-extuat)

| Item | Value |
|------|-------|
| Bill item relationship | `MANAERP__Invoice_Bill_Items__r` |
| Billed field (confirmed) | `TRG_Purchased_Slot__c` |
| Paid field (candidate) | **未確定** — `paidKomaField: null` のまま |

`npm run discover` 実行後も `config.invoiceBilling.paidKomaField` は自動設定されません。Manabie 標準の支払済コマ相当 API 名は org カスタムの可能性が高く、TRG 担当とのフィールド名合意が必要です。

## Recommended next step

1. TRG / Manabie 担当に `MANAERP__Invoice_Bill_Items__r` 上の「支払済コマ数」相当フィールド API 名を確認
2. 合意後 `discovery-trg2-extuat.json` に `paidKomaField` を設定
3. `invoiceSyncService.test.ts` / `booth-report.test.ts` / `e2e-invoice-sandbox.live.test.ts` に paid 列アサーション追加

## Defer rationale (Phase 5 plan)

Part B 実装はフィールド確定後。Part A + C + D で Sandbox パイロット価値を先に交付。
