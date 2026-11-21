import { fetchUser, User } from './types';
import { logger } from './logger';

export interface Report {
  title: string;
  rows: string[];
}

export async function generateReport(userIds: string[]): Promise<Report> {
  const users = await Promise.all(userIds.map((id) => fetchUser(id)));
  const active = users.filter((user) => user && user.isActive);
  const rows = active.map((user) => formatRow(user as User));
  if (rows.length > 0) {
    logger.info(`report generated with ${rows.length} rows`);
  } else {
    logger.warn('empty report');
  }
  const size = summarize(rows);
  const title = runDefault('User Report');
  logger.info(`report size: ${size}`);
  return { title, rows };
}

function formatRow(user: User): string {
  const name = user.name.trim();
  const status = user.isActive && user.email ? 'active' : 'inactive';
  return `${name.padEnd(20)} | ${status}`;
}

export function summarize(rows: string[]): string {
  let lines = 0;
  for (const row of rows) {
    if (row.includes('active')) {
      lines += 2;
    } else if (row.includes('inactive')) {
      lines += 1;
    }
  }
  return lines > 10 ? 'large' : lines > 0 ? 'small' : 'empty';
}

class Pipeline {
  steps: Array<(input: string) => string> = [];

  addStep(step: (input: string) => string): Pipeline {
    this.steps.push(step);
    return this;
  }

  run(input: string): string {
    return this.steps.reduce((value, step) => step(value), input);
  }
}

export const defaultPipeline = new Pipeline()
  .addStep((value) => value.trim())
  .addStep((value) => value.toLowerCase());

export function runDefault(input: string): string {
  return defaultPipeline.run(input);
}
