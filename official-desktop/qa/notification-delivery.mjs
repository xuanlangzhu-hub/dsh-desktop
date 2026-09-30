/** Read-only Windows delivery check: report only the pet's known toast titles. */
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const titles = new Set([
  '测试通知', '对话完成', '生成失败', '输出被截断',
  '正在申请权限', '模型在等你回答',
]);
const sinceArg = process.argv.find(arg => arg.startsWith('--since='));
const since = sinceArg ? Number(sinceArg.slice('--since='.length)) : Date.now() - 120_000;
if (!Number.isFinite(since) || !process.env.LOCALAPPDATA) throw new Error('Invalid time or Windows profile.');
const fileTimeEpoch = 116444736000000000n;
const sinceFileTime = BigInt(Math.floor(since)) * 10000n + fileTimeEpoch;
const databasePath = join(process.env.LOCALAPPDATA, 'Microsoft/Windows/Notifications/wpndatabase.db');
const database = new DatabaseSync(databasePath, { readOnly: true });
try {
  const rows = database.prepare(`
    SELECT CAST(n.ArrivalTime AS TEXT) AS arrival, n.Payload AS payload,
           h.PrimaryId AS handler
    FROM Notification n
    LEFT JOIN NotificationHandler h ON h.RecordId = n.HandlerId
    WHERE n.ArrivalTime >= ?
      AND h.PrimaryId IN ('electron.app.DeepSeek Harness', 'com.deepseek.dsh')
    ORDER BY n.ArrivalTime DESC
    LIMIT 64
  `).all(sinceFileTime);
  const notifications = [];
  for (const row of rows) {
    if (!row.payload) continue;
    const bytes = Buffer.from(row.payload);
    const xml = bytes.toString(bytes.includes(0) ? 'utf16le' : 'utf8');
    const text = [...xml.matchAll(/<text(?:\s[^>]*)?>([\s\S]*?)<\/text>/g)].map(match => match[1]);
    const title = text.find(value => titles.has(value));
    if (!title) continue;
    notifications.push({
      title,
      handler: row.handler,
      deliveredAt: new Date(Number((BigInt(row.arrival) - fileTimeEpoch) / 10000n)).toISOString(),
    });
  }
  console.log(JSON.stringify({ since: new Date(since).toISOString(), notifications }, null, 2));
} finally {
  database.close();
}
