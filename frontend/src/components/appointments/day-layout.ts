export interface DayInterval {
  id: string;
  startMin: number;
  endMin: number;
}

export interface LanePlacement {
  lane: number;
  laneCount: number;
}

/**
 * Assigns each interval a side-by-side lane. Intervals are half-open [start, end), so
 * back-to-back appointments share a lane. Intervals that transitively overlap form a cluster
 * whose members all get the same laneCount, equal to the cluster's peak concurrency.
 * Zero or negative length intervals are treated as one minute long.
 */
export function layoutDay(items: readonly DayInterval[]): Map<string, LanePlacement> {
  const sorted = items
    .map(({ id, startMin, endMin }) => ({ id, startMin, endMin: Math.max(endMin, startMin + 1) }))
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const result = new Map<string, LanePlacement>();
  let cluster: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;

  const closeCluster = () => {
    for (const { id, lane } of cluster) result.set(id, { lane, laneCount: laneEnds.length });
    cluster = [];
    laneEnds = [];
  };

  for (const item of sorted) {
    if (item.startMin >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= item.startMin);
    if (lane === -1) lane = laneEnds.push(item.endMin) - 1;
    else laneEnds[lane] = item.endMin;
    cluster.push({ id: item.id, lane });
    clusterEnd = Math.max(clusterEnd, item.endMin);
  }
  closeCluster();
  return result;
}
