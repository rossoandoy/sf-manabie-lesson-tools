import { describe, expect, it } from 'vitest';
import type { BoothCell, BoothGridSettings } from './booth-session-state';
import type { InvoiceCacheEntry } from './invoice-cache-state';
import { BoothActivitySource } from './lesson-activity-source';
import { buildMonthlyReport, determineContract } from './booth-report';

const settings: BoothGridSettings = {
  classroomName: '教室A',
  accountId: '001',
  boothCount: 2,
  periodCount: 3,
  hideSunday: true,
  oneToOneMode: false,
  fiscalYear: '2026',
  visiblePeriods: [1, 2, 3],
};

const cells: BoothCell[] = [
  {
    id: '1',
    date: '2026-04-10',
    booth: 1,
    period: 1,
    seat: 1,
    studentName: '山田',
    subject: '英語',
    attendance: '出席',
    countTarget: true,
  },
  {
    id: '2',
    date: '2026-04-17',
    booth: 1,
    period: 1,
    seat: 1,
    studentName: '山田',
    subject: '英語',
    attendance: '欠席',
    countTarget: true,
  },
  {
    id: '3',
    date: '2026-05-05',
    booth: 1,
    period: 1,
    seat: 1,
    studentName: '山田',
    subject: '英語',
    attendance: '振替',
    countTarget: true,
  },
  {
    id: '4',
    date: '2026-04-12',
    booth: 1,
    period: 2,
    seat: 1,
    studentName: '山田',
    subject: '体験',
    attendance: '未確定',
    countTarget: false,
  },
  {
    id: '5',
    date: '2026-03-20',
    booth: 1,
    period: 1,
    seat: 1,
    studentName: '山田',
    subject: '英語',
    attendance: '出席',
    countTarget: true,
  },
];

describe('booth-report', () => {
  it('counts monthly attendance buckets', () => {
    const source = new BoothActivitySource(cells, settings);
    const report = buildMonthlyReport(source, '山田', 2026);
    const april = report.rows.find((row) => row.monthKey === '2026/04');
    expect(april?.right).toEqual({ planned: 0, present: 1, absent: 1, makeup: 0, executed: 1 });
    const may = report.rows.find((row) => row.monthKey === '2026/05');
    expect(may?.right.makeup).toBe(1);
    expect(may?.right.executed).toBe(1);
  });

  it('excludes trial rows from count target', () => {
    const source = new BoothActivitySource(cells, settings);
    const report = buildMonthlyReport(source, '山田', 2026);
    const april = report.rows.find((row) => row.monthKey === '2026/04');
    expect(april?.right.planned).toBe(0);
  });

  it('aggregates prior fiscal year end and grand total', () => {
    const source = new BoothActivitySource(cells, settings);
    const report = buildMonthlyReport(source, '山田', 2026);
    const prior = report.rows.find((row) => row.kind === 'priorYearEnd');
    const grand = report.rows.find((row) => row.kind === 'grandTotal');
    expect(prior?.right.present).toBe(1);
    expect(grand?.right.present).toBe(2);
    expect(grand?.right.executed).toBe(3);
  });

  it('determines contract by majority capacity rows', () => {
    const source = new BoothActivitySource(cells, settings);
    expect(determineContract(source, '山田')).toBe('1:2');
    const oneToOne = new BoothActivitySource(cells, { ...settings, oneToOneMode: true });
    expect(determineContract(oneToOne, '山田')).toBe('1:1');
  });

  it('treats 未確定 as planned', () => {
    const source = new BoothActivitySource(
      [
        {
          id: 'p',
          date: '2026-06-01',
          booth: 1,
          period: 1,
          seat: 1,
          studentName: '佐藤',
          subject: '数学',
          attendance: '未確定',
          countTarget: true,
        },
      ],
      settings,
    );
    const report = buildMonthlyReport(source, '佐藤', 2026);
    const june = report.rows.find((row) => row.monthKey === '2026/06');
    expect(june?.right.planned).toBe(1);
  });

  it('fills billing columns from invoice cache', () => {
    const billing: InvoiceCacheEntry[] = [
      {
        contactId: '003',
        studentName: '山田',
        monthKey: '2026/04',
        invoiceNo: 'INV-1',
        billedKoma: 4,
        paidKoma: 2,
        syncedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        contactId: '003',
        studentName: '山田',
        monthKey: '2025/12',
        invoiceNo: 'INV-0',
        billedKoma: 1,
        paidKoma: 1,
        syncedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    const source = new BoothActivitySource(cells, settings);
    const report = buildMonthlyReport(source, '山田', 2026, { billing });
    const april = report.rows.find((row) => row.monthKey === '2026/04');
    expect(april?.left).toEqual({ billing: 4, paid: 2 });
    const prior = report.rows.find((row) => row.kind === 'priorYearEnd');
    expect(prior?.left).toEqual({ billing: 1, paid: 1 });
    const yearEnd = report.rows.find((row) => row.kind === 'yearEnd');
    expect(yearEnd?.left.billing).toBe(4);
    expect(yearEnd?.left.paid).toBe(2);
    const grand = report.rows.find((row) => row.kind === 'grandTotal');
    expect(grand?.left).toEqual({ billing: 5, paid: 3 });
  });

  it('counts makeup even when countTarget is false', () => {
    const source = new BoothActivitySource(
      [
        {
          id: 'mk',
          date: '2026-06-03',
          booth: 1,
          period: 1,
          seat: 1,
          studentName: '佐藤',
          subject: '英語',
          attendance: '振替',
          countTarget: false,
        },
      ],
      settings,
    );
    const report = buildMonthlyReport(source, '佐藤', 2026);
    const june = report.rows.find((row) => row.monthKey === '2026/06');
    expect(june?.right.makeup).toBe(1);
    expect(june?.right.executed).toBe(1);
  });

  it('excludes closed dates from right table metrics', () => {
    const source = new BoothActivitySource(cells, settings);
    const report = buildMonthlyReport(source, '山田', 2026, {
      closedDates: new Set(['2026-04-10']),
    });
    const april = report.rows.find((row) => row.monthKey === '2026/04');
    expect(april?.right.present).toBe(0);
    expect(april?.right.absent).toBe(1);
  });
});
