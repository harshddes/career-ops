import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ActionPlanStore } from '../lib/action-plan.mjs';

test('creates date-adaptive dashboard with top three and sprint clock', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-plan-'));
  const store = new ActionPlanStore(join(dir, 'action-plan.json'));
  const dashboard = store.dashboard(new Date('2026-04-28T12:00:00.000Z'));
  assert.equal(dashboard.sprint.days_left, 90);
  assert.equal(dashboard.top_three.length, 3);
  assert.equal(dashboard.minimum_win.id, 'minimum-win');
});

test('marks done and tracks active days', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-plan-'));
  const store = new ActionPlanStore(join(dir, 'action-plan.json'));
  const dashboard = store.updateTask('daily-one-outreach', 'done', {}, new Date('2026-04-28T12:00:00.000Z'));
  const task = dashboard.all_tasks.find(t => t.id === 'daily-one-outreach');
  assert.equal(task.status, 'done');
  assert.equal(dashboard.sprint.active_days_this_week, 1);
});

test('defer twice shrinks a task', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-plan-'));
  const store = new ActionPlanStore(join(dir, 'action-plan.json'));
  store.updateTask('daily-one-target', 'defer', {}, new Date('2026-04-28T12:00:00.000Z'));
  const dashboard = store.updateTask('daily-one-target', 'defer', {}, new Date('2026-04-29T12:00:00.000Z'));
  const task = dashboard.all_tasks.find(t => t.id === 'daily-one-target');
  assert.equal(task.effort, '5 min');
  assert.match(task.adaptation, /shrunk/i);
});
