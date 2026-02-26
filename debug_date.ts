const createdAt = new Date('2026-02-12T08:00:00.000Z');
const now = new Date('2026-02-12T09:00:00.000Z');
const diffTime = Math.abs(now.getTime() - createdAt.getTime());
const daysActive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
console.log({ createdAt, now, diffTime, daysActive });
