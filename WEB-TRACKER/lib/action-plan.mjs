import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const DAY_MS = 86_400_000;
const ACTIVE_STATUSES = new Set(['today', 'in_progress', 'blocked', 'waiting', 'deferred']);
const CLOSED_STATUSES = new Set(['done', 'archived']);

function isoDate(date = new Date()) {
  return date.toISOString().split('T')[0];
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return isoDate(d);
}

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const diff = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diff);
  return isoDate(d);
}

function endOfMonth(date = new Date()) {
  return isoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function daysUntil(dateString, now = new Date()) {
  const target = new Date(`${dateString}T00:00:00`);
  const today = new Date(`${isoDate(now)}T00:00:00`);
  return Math.round((target - today) / DAY_MS);
}

function defaultTasks(now = new Date()) {
  const today = isoDate(now);
  const tomorrow = addDays(now, 1);
  const weekEnd = addDays(new Date(`${startOfWeek(now)}T00:00:00`), 6);
  const monthEnd = endOfMonth(now);

  return [
    {
      id: 'daily-update-dashboard',
      title: 'Update the dashboard',
      category: 'admin',
      horizon: 'daily',
      due_date: today,
      effort: '10 min',
      impact: 'high',
      status: 'today',
      next_action: 'Click “Update my dashboard” so today starts from fresh jobs, follow-ups, and deadlines.',
      if_blocked: 'If the update fails, do not debug for an hour. Mark it blocked and continue with one outreach message.',
      why: 'Fresh data prevents you from applying to stale or visa-dead roles.',
      defer_count: 0,
    },
    {
      id: 'daily-one-outreach',
      title: 'Send one useful message',
      category: 'outreach',
      horizon: 'daily',
      due_date: today,
      effort: '20 min',
      impact: 'high',
      status: 'today',
      next_action: 'Pick one academic, industry, or HR contact and send one short reviewed message.',
      if_blocked: 'If you freeze, use the draft generator and send the shortest honest version.',
      why: 'Warm conversations beat cold applications when time is short.',
      defer_count: 0,
    },
    {
      id: 'daily-one-target',
      title: 'Move one role forward',
      category: 'job',
      horizon: 'daily',
      due_date: today,
      effort: '45 min',
      impact: 'high',
      status: 'today',
      next_action: 'Choose one non-visa-dead role and queue it for AI review or prepare the application.',
      if_blocked: 'If the role feels too hard, save it and pick one easier adjacent STEM role.',
      why: 'A small daily pipeline beats a giant weekend panic session.',
      defer_count: 0,
    },
    {
      id: 'minimum-win',
      title: 'Minimum win if the day is wrecked',
      category: 'fallback',
      horizon: 'daily',
      due_date: today,
      effort: '5 min',
      impact: 'medium',
      status: 'today',
      next_action: 'Save one role or copy one outreach draft. That is enough to keep the chain alive.',
      if_blocked: 'Open the dashboard and mark why you are blocked.',
      why: 'This prevents all-or-nothing failure.',
      defer_count: 0,
    },
    {
      id: 'weekly-quality-applications',
      title: 'Submit 8-12 quality applications this week',
      category: 'job',
      horizon: 'weekly',
      due_date: weekEnd,
      effort: 'weekly',
      impact: 'high',
      status: 'in_progress',
      next_action: 'Keep only three applications actively in progress at once.',
      if_blocked: 'If quality applications are too slow, lower the bar to one tailored paragraph plus a clean CV.',
      target: 10,
      unit: 'applications',
      progress: 0,
      defer_count: 0,
    },
    {
      id: 'weekly-warm-contacts',
      title: 'Send 5-8 warm contact messages this week',
      category: 'outreach',
      horizon: 'weekly',
      due_date: weekEnd,
      effort: 'weekly',
      impact: 'high',
      status: 'in_progress',
      next_action: 'Prioritize alumni, lab contacts, hiring managers, and recruiters who can answer visa/process questions.',
      if_blocked: 'If cold outreach feels awkward, ask one technical question instead of asking for a job.',
      target: 6,
      unit: 'messages',
      progress: 0,
      defer_count: 0,
    },
    {
      id: 'weekly-review',
      title: 'Run the weekly review',
      category: 'review',
      horizon: 'weekly',
      due_date: weekEnd,
      effort: '30 min',
      impact: 'high',
      status: 'in_progress',
      next_action: 'Check what moved: applications, contacts, follow-ups, interviews, and blockers.',
      if_blocked: 'If review feels heavy, answer only: what got stuck and what is the next smallest action?',
      defer_count: 0,
    },
    {
      id: 'monthly-expand-adjacent-fields',
      title: 'Expand into OPT-plausible adjacent STEM fields',
      category: 'strategy',
      horizon: 'monthly',
      due_date: monthEnd,
      effort: '60 min',
      impact: 'high',
      status: 'in_progress',
      next_action: 'Add aerospace systems, instrumentation, sensors, RF test, semiconductor metrology, and research engineering roles to your target mix.',
      if_blocked: 'If the field feels unrelated, write the OPT story in one sentence before applying.',
      defer_count: 0,
    },
  ];
}

function defaultPlan(now = new Date()) {
  const start = isoDate(now);
  return {
    version: '1.0.0',
    sprint_start: start,
    sprint_end: addDays(now, 90),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    active_days: [],
    tasks: defaultTasks(now),
  };
}

export class ActionPlanStore {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
  }

  load(now = new Date()) {
    if (!existsSync(this.filePath)) {
      const plan = defaultPlan(now);
      this.save(plan);
      return plan;
    }
    try {
      const plan = JSON.parse(readFileSync(this.filePath, 'utf-8'));
      return this.normalize(plan, now);
    } catch {
      const plan = defaultPlan(now);
      this.save(plan);
      return plan;
    }
  }

  normalize(plan, now = new Date()) {
    const base = defaultPlan(now);
    const existing = new Map((plan.tasks || []).map(task => [task.id, task]));
    const merged = base.tasks.map(task => ({ ...task, ...(existing.get(task.id) || {}) }));
    const extras = (plan.tasks || []).filter(task => !base.tasks.some(t => t.id === task.id));
    const next = {
      ...base,
      ...plan,
      tasks: [...merged, ...extras],
    };
    this.adaptOverdue(next, now);
    return next;
  }

  save(plan) {
    plan.updated_at = new Date().toISOString();
    writeFileSync(this.filePath, JSON.stringify(plan, null, 2));
  }

  dashboard(now = new Date()) {
    const plan = this.load(now);
    this.save(plan);
    return this.summarize(plan, now);
  }

  updateTask(id, action, input = {}, now = new Date()) {
    const plan = this.load(now);
    const task = plan.tasks.find(t => t.id === id);
    if (!task) return null;

    const today = isoDate(now);
    const nowIso = new Date().toISOString();
    if (action === 'done') {
      task.status = 'done';
      task.completed_at = nowIso;
      task.progress = task.target || task.progress || 1;
      task.last_action = 'done';
      task.last_action_at = nowIso;
      if (!plan.active_days.includes(today)) plan.active_days.push(today);
    } else if (action === 'defer') {
      task.defer_count = (task.defer_count || 0) + 1;
      task.due_date = addDays(now, task.defer_count >= 2 ? 1 : 1);
      task.status = 'deferred';
      task.adaptation = task.defer_count >= 2
        ? 'This kept slipping, so it has been shrunk to the smallest useful next step.'
        : 'Moved to tomorrow. Do not let it become weekend debt.';
      task.last_action = 'defer';
      task.last_action_at = nowIso;
      if (task.defer_count >= 2) {
        task.effort = '5 min';
        task.next_action = this.tinyAction(task);
      }
    } else if (action === 'blocked') {
      task.status = 'blocked';
      task.blocked_reason = input.reason || 'unclear';
      task.next_action = this.nextActionForBlocker(task.blocked_reason, task);
      task.last_action = 'blocked';
      task.last_action_at = nowIso;
    } else if (action === 'waiting') {
      task.status = 'waiting';
      task.waiting_on = input.waiting_on || 'someone else';
      task.follow_up_date = input.follow_up_date || addDays(now, 3);
      task.next_action = `Wait until ${task.follow_up_date}, then follow up if there is no response.`;
      task.last_action = 'waiting';
      task.last_action_at = nowIso;
    } else if (action === 'progress') {
      task.progress = Math.max(0, Number(input.progress || 0));
      task.last_action = 'progress';
      task.last_action_at = nowIso;
    } else if (action === 'reactivate') {
      task.status = 'today';
      task.due_date = today;
      task.last_action = 'reactivate';
      task.last_action_at = nowIso;
    }

    this.save(plan);
    return this.summarize(plan, now);
  }

  adaptOverdue(plan, now = new Date()) {
    const today = isoDate(now);
    for (const task of plan.tasks) {
      if (!task.due_date || CLOSED_STATUSES.has(task.status) || task.status === 'waiting') continue;
      const delta = daysUntil(task.due_date, now);
      if (delta >= 0) continue;
      const overdueDays = Math.abs(delta);
      task.overdue_days = overdueDays;

      if (overdueDays === 1 && task.status !== 'blocked') {
        task.status = 'today';
        task.due_date = today;
        task.adaptation = 'This slipped by one day, so it is back on today. Do the smallest useful version.';
      } else if (overdueDays >= 2 && (task.defer_count || 0) >= 1) {
        task.status = 'today';
        task.due_date = today;
        task.effort = '5 min';
        task.next_action = this.tinyAction(task);
        task.adaptation = 'This slipped more than once, so the dashboard shrank it. Tiny action only.';
      } else if (overdueDays >= 3 && task.impact === 'low') {
        task.status = 'archived';
        task.adaptation = 'Archived because it stayed overdue and was low impact.';
      }
    }
  }

  summarize(plan, now = new Date()) {
    const today = isoDate(now);
    const days_left = Math.max(0, daysUntil(plan.sprint_end, now));
    const tasks = [...plan.tasks];
    const open = tasks.filter(task => !CLOSED_STATUSES.has(task.status));
    const dueToday = open.filter(task => task.status === 'today' || task.due_date === today);
    const topThree = dueToday
      .sort((a, b) => this.taskRank(b) - this.taskRank(a))
      .slice(0, 3);
    const minimumWin = tasks.find(task => task.id === 'minimum-win');
    const weekly = tasks.filter(task => task.horizon === 'weekly');
    const monthly = tasks.filter(task => task.horizon === 'monthly');
    const blocked = open.filter(task => task.status === 'blocked');
    const waiting = open.filter(task => task.status === 'waiting');
    const doneThisWeek = tasks.filter(task => task.completed_at && task.completed_at.slice(0, 10) >= startOfWeek(now));

    return {
      generated_at: new Date().toISOString(),
      sprint: {
        start: plan.sprint_start,
        end: plan.sprint_end,
        days_left,
        active_days_this_week: (plan.active_days || []).filter(day => day >= startOfWeek(now)).length,
      },
      next_best_action: topThree[0] || minimumWin,
      top_three: topThree,
      minimum_win: minimumWin,
      weekly_goals: weekly,
      monthly_goals: monthly,
      blocked,
      waiting,
      done_this_week: doneThisWeek,
      all_tasks: tasks,
      review: this.reviewSummary(tasks),
    };
  }

  taskRank(task) {
    const impact = { high: 3, medium: 2, low: 1 }[task.impact] || 1;
    const effort = { '5 min': 3, '10 min': 3, '20 min': 2, '30 min': 2, '45 min': 1, '60 min': 1, '90 min': 1 }[task.effort] || 1;
    return impact * 10 + effort - (task.status === 'blocked' ? 20 : 0);
  }

  tinyAction(task) {
    if (task.category === 'outreach') return 'Open the draft generator and write only the first sentence.';
    if (task.category === 'job') return 'Open one role and decide: apply, save, or discard. No tailoring yet.';
    if (task.category === 'review') return 'Write one sentence: what got stuck this week?';
    return 'Open the dashboard and complete the smallest visible step.';
  }

  nextActionForBlocker(reason, task) {
    const map = {
      too_big: this.tinyAction(task),
      unclear: 'Rewrite it as one physical action you can do in five minutes.',
      scary: 'Use the tiny version. The goal is exposure, not perfection.',
      low_value: 'Archive it unless it directly creates an interview, contact, or application.',
      waiting: 'Move it to Waiting and set a follow-up date.',
    };
    return map[reason] || 'Pick the smallest next action and do only that.';
  }

  reviewSummary(tasks) {
    const activeApplications = tasks.filter(t => t.category === 'job' && ACTIVE_STATUSES.has(t.status)).length;
    const activeOutreach = tasks.filter(t => t.category === 'outreach' && ACTIVE_STATUSES.has(t.status)).length;
    return {
      wip: {
        applications: activeApplications,
        outreach: activeOutreach,
        application_limit: 3,
        outreach_limit: 5,
      },
      bottleneck: activeOutreach === 0
        ? 'No active outreach. Add one warm message today.'
        : activeApplications === 0
          ? 'No active applications. Move one role forward today.'
          : 'Keep moving one application and one contact at a time.',
    };
  }
}
