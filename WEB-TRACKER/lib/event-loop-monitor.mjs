import { monitorEventLoopDelay, performance } from 'node:perf_hooks';

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

export function eventLoopDelaySnapshot() {
  const toMs = ns => Math.round((Number(ns) || 0) / 1e6);
  const snapshot = {
    mean_ms: toMs(histogram.mean),
    p50_ms: toMs(histogram.percentile(50)),
    p99_ms: toMs(histogram.percentile(99)),
    max_ms: toMs(histogram.max),
    event_loop_utilization: Number(performance.eventLoopUtilization?.().utilization || 0),
  };
  histogram.reset();
  return snapshot;
}
