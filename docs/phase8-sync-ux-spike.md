# Phase 8 — Sync UX Spike

**日付:** 2026-06-20  
**目的:** F19 / 3B / 3C 統一 Sync Manifest + 文言を増やさない同期状態表示

## Sync Manifest

```typescript
interface SlotSyncManifestEntry {
  slot?: SyncLayer;         // F19 Lesson_Slot
  attendance?: SyncLayer;   // 3B Student Session
  reallocation?: SyncLayer; // 3C（振替行のみ）
}
interface SyncLayer {
  status: 'synced' | 'failed';
  syncedAt: string;
  salesforceId?: string;
  contentHash: string;
}
```

### contentHash 対象

| Layer | フィールド |
|-------|-----------|
| slot | studentName, grade, subject, teacherName, lessonKind, note, slotKey |
| attendance | attendance, note |
| reallocation | attendance, transferFrom, transferTo |

hash 不一致 → **stale**（同期済みだがローカル変更あり）

## UX 3 案

| 案 | 概要 | 評価 |
|----|------|------|
| A | テキスト badge「同期済」維持 | 列幅・視覚ノイズ大 — 不採用 |
| B | 行全体グレー（opacity）のみ | 編集後と未同期の区別が弱い |
| **C（採用）** | ドット + 左ボーダー + 微 opacity | 多レイヤー対応、ホバーで詳細 |

## 採用案 C — 状態マトリクス

| 状態 | ブース左ボーダー | PrintSheet SF 列 | 行 |
|------|-----------------|------------------|-----|
| none | なし | — | 通常 |
| synced | 緑 solid | 3-segment 緑ドット | 通常 |
| stale | 緑 dashed | グレー/amber リング | opacity 0.92 |
| failed | amber solid | 赤ドット | — |

- テキストは `title` / `aria-label` のみ
- PrintSheet フィルタ: **未同期のみ** checkbox（任意採用）

## Migration

初回 `loadBoothSession`: `slotSyncState` → `syncManifest.slot` に変換。
