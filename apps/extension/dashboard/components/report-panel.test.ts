import { describe, expect, it } from 'vitest';
import { buildMonthlyReport } from '../../lib/booth-report';
import { BoothActivitySource } from '../../lib/lesson-activity-source';
import type { BoothCell, BoothGridSettings, BoothSlotMeta } from '../../lib/booth-session-state';
import { renderReportTablesHtml } from './report-panel';

const settings: BoothGridSettings = {
  classroomName: 'テスト教室0801',
  fiscalYear: '2026',
  boothCount: 2,
  periodCount: 4,
  hideSunday: true,
  accountId: 'acc-1',
  accountSource: 'manual',
  visiblePeriods: [1, 2, 3, 4],
};

const cells: BoothCell[] = [
  {
    date: '2026-04-10',
    booth: 1,
    period: 1,
    seat: 1,
    studentName: 'テスト生徒A',
    subject: '算数',
    grade: '小5',
    attendance: '出席',
    countTarget: true,
  },
];

describe('renderReportTablesHtml', () => {
  it('renders split tables with meta header and signature-friendly structure', () => {
    const source = new BoothActivitySource(cells, settings, [] as BoothSlotMeta[]);
    const report = buildMonthlyReport(source, 'テスト生徒A', '2026');
    const html = renderReportTablesHtml(report);

    expect(html).toContain('授業回数報告');
    expect(html).toContain('テスト生徒A');
    expect(html).toContain('report-table-left');
    expect(html).toContain('report-table-right');
    expect(html).toContain('授業申込・支払状況');
    expect(html).toContain('授業予定・実施状況');
    expect(html).toContain('通常月講');
    expect(html).not.toContain('実施</th>');
  });
});
