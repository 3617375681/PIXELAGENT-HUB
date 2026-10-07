import { useMemo } from 'react';
import type { Agent } from '../types/agent';

const CARD_W = 240;
const CARD_H = 200;
const H_GAP = 140;
const V_GAP = 40;

function buildTreePositions(agents: Agent[]) {
  const nodes: Record<string, { id: string; children: string[]; parent: string | null; depth: number; x: number; y: number }> = {};
  const inDegree: Record<string, number> = {};
  agents.forEach((a) => {
    nodes[a.id] = { id: a.id, children: [], parent: null, depth: 0, x: 0, y: 0 };
    inDegree[a.id] = 0;
  });
  agents.forEach((a) => {
    a.connections.forEach((tid) => { if (nodes[tid]) inDegree[tid]++; });
  });
  const visited = new Set<string>();
  agents.forEach((a) => {
    a.connections.forEach((tid) => {
      if (nodes[tid] && !visited.has(tid)) {
        nodes[a.id].children.push(tid);
        nodes[tid].parent = a.id;
        visited.add(tid);
      }
    });
  });
  const roots = agents.filter((a) => inDegree[a.id] === 0).map((a) => a.id);
  if (roots.length === 0 && agents.length > 0) roots.push(agents[0].id);

  // BFS depth
  const queue = [...roots];
  roots.forEach((r) => (nodes[r].depth = 0));
  const seen = new Set<string>(roots);
  while (queue.length) {
    const cur = queue.shift()!;
    nodes[cur].children.forEach((childId) => {
      if (!seen.has(childId)) {
        seen.add(childId);
        nodes[childId].depth = nodes[cur].depth + 1;
        queue.push(childId);
      }
    });
  }

  // Sort leaves first
  function sortLeavesFirst(nodeId: string, seen: Set<string>) {
    if (seen.has(nodeId)) return;
    seen.add(nodeId);
    const node = nodes[nodeId];
    node.children.sort((a, b) => {
      const aLeaf = nodes[a].children.length === 0 ? 0 : 1;
      const bLeaf = nodes[b].children.length === 0 ? 0 : 1;
      return aLeaf - bLeaf;
    });
    node.children.forEach((childId) => sortLeavesFirst(childId, seen));
  }
  roots.forEach((rootId) => sortLeavesFirst(rootId, new Set<string>()));

  // Y layout: leaf-first stacking
  let nextLeafY = 0;
  function layoutY(nodeId: string, seen: Set<string>): number {
    if (seen.has(nodeId)) return nodes[nodeId].y;
    seen.add(nodeId);
    const node = nodes[nodeId];
    if (node.children.length === 0) {
      node.y = nextLeafY;
      nextLeafY += CARD_H + V_GAP;
      return node.y;
    }
    const childYs = node.children.map((c) => layoutY(c, seen));
    node.y = (childYs[0]! + childYs[childYs.length - 1]!) / 2;
    return node.y;
  }
  roots.forEach((rootId) => layoutY(rootId, new Set<string>()));

  // X layout: depth-based columns
  Object.values(nodes).forEach((n) => {
    n.x = n.depth * (CARD_W + H_GAP);
  });

  const order: string[] = [];
  function dfs(id: string, seen: Set<string>) {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(id);
    nodes[id].children.forEach((childId) => dfs(childId, seen));
  }
  roots.forEach((rootId) => dfs(rootId, new Set<string>()));

  return { nodes, roots, order };
}

function getVisibleAgents(agents: Agent[], collapsedNodes: Set<string>): Agent[] {
  const visibleIds = new Set<string>();
  function visit(id: string) {
    if (visibleIds.has(id)) return;
    visibleIds.add(id);
    if (!collapsedNodes.has(id)) {
      const agent = agents.find((a) => a.id === id);
      agent?.connections.forEach((cid) => {
        if (agents.find((a) => a.id === cid)) visit(cid);
      });
    }
  }
  const inDegree: Record<string, number> = {};
  agents.forEach((a) => (inDegree[a.id] = 0));
  agents.forEach((a) => a.connections.forEach((tid) => { if (inDegree[tid] !== undefined) inDegree[tid]++; }));
  agents.filter((a) => inDegree[a.id] === 0).forEach((r) => visit(r.id));
  return agents.filter((a) => visibleIds.has(a.id));
}

export function useForceLayout(
  agents: Agent[],
  collapsedNodes: Set<string>,
  dragOffsets: Record<string, { x: number; y: number }>,
) {
  // Compute positions during render so cards never paint at a placeholder origin first.
  const positions = useMemo(() => {
    const visibleAgents = getVisibleAgents(agents, collapsedNodes);
    if (visibleAgents.length === 0) {
      return {};
    }

    const newPositions: Record<string, { x: number; y: number }> = {};
    const uniquePresetPositions = new Set(
      visibleAgents.map((a) => `${a.position?.x ?? 0},${a.position?.y ?? 0}`)
    ).size;
    const hasMeaningfulPresetLayout = uniquePresetPositions > 1;

    if (hasMeaningfulPresetLayout) {
      visibleAgents.forEach((a) => {
        const offset = dragOffsets[a.id];
        newPositions[a.id] = {
          x: (a.position?.x ?? 0) + (offset?.x ?? 0),
          y: (a.position?.y ?? 0) + (offset?.y ?? 0),
        };
      });
      return newPositions;
    }

    const treeResult = buildTreePositions(visibleAgents);
    const treeNodes = treeResult.nodes;
    visibleAgents.forEach((a) => {
      const treePos = treeNodes[a.id];
      const offset = dragOffsets[a.id];
      newPositions[a.id] = {
        x: (offset?.x ?? 0) + (treePos?.x ?? 0),
        y: (offset?.y ?? 0) + (treePos?.y ?? 0),
      };
    });

    return newPositions;
  }, [agents, collapsedNodes, dragOffsets]);

  return { positions };
}
