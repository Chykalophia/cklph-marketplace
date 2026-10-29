// @vitest-environment jsdom
// Concurrent optimistic-delete rollback, on real hooks: TanStack Query v5 useMutation and
// SWR 2.x useSWRMutation. Seed [a, b, c]; delete B (pending); delete A (pending); assert the
// precondition [c]; then settle in one of four orders. Correct final list:
//   B fails, A succeeds -> [b, c]     B succeeds, A fails -> [a, c]
// Each variant runs with ONE shared hook instance issuing both deletes and with one hook per
// delete. Variants marked `fix` must pass every case; the others must fail at least one. Every
// case is also pinned to its exact results in expected.json, so a library bump that changes a
// number the doc states turns this suite red.
import { act, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useMutation, useQueryClient } from '@tanstack/react-query';
import { SWRConfig, useSWRConfig } from 'swr';
import useSWRMutation from 'swr/mutation';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup } from '@testing-library/react';
import EXPECTED from './expected.json' with { type: 'json' };

afterEach(cleanup);

const KEY = '/api/items';
const SEED = ['a', 'b', 'c'];

function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  // Under a TanStack scope a deferred can be rejected before its queued mutationFn attaches;
  // without this no-op catch Vitest reports an unhandled rejection and exits 1.
  promise.catch(() => {});
  return { promise, resolve, reject };
}

// Re-insert `id` into `current` right after its nearest earlier neighbour (in `before`) that is
// still present; no-op if it is already there.
function reinsert(current, before, id) {
  if (current.includes(id)) return current;
  const idx = before.indexOf(id);
  let at = 0;
  for (let i = idx - 1; i >= 0; i--) {
    const j = current.indexOf(before[i]);
    if (j !== -1) { at = j + 1; break; }
  }
  return [...current.slice(0, at), id, ...current.slice(at)];
}

// ─── TanStack adapters ───────────────────────────────────────────────

function tanstack(rollback, { scoped = false, perMutate = false } = {}) {
  return function mount(hookCount, pending) {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    client.setQueryData([KEY], SEED);
    const api = [];
    function Hook({ i }) {
      const qc = useQueryClient();
      const m = useMutation({
        ...(scoped ? { scope: { id: 'items' } } : {}),
        mutationFn: (id) => pending[id].promise,
        onMutate: async (id) => {
          await qc.cancelQueries({ queryKey: [KEY] });
          const previous = qc.getQueryData([KEY]);
          qc.setQueryData([KEY], (old) => old.filter((x) => x !== id));
          return { previous };
        },
        onError: perMutate
          ? undefined
          : (_e, id, ctx) => {
              if (rollback === 'snapshot') qc.setQueryData([KEY], ctx.previous);
              else qc.setQueryData([KEY], (cur) => reinsert(cur, ctx.previous, id));
            },
      });
      // perMutate: the same item-only rollback, but passed to mutateAsync() instead of the hook.
      const perCall = perMutate
        ? { onError: (_e, id, ctx) => qc.setQueryData([KEY], (cur) => reinsert(cur, ctx.previous, id)) }
        : undefined;
      api[i] = (id) => m.mutateAsync(id, perCall).catch(() => undefined);
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        {Array.from({ length: hookCount }, (_, i) => <Hook key={i} i={i} />)}
      </QueryClientProvider>,
    );
    return { start: (id, i) => api[i](id), read: () => client.getQueryData([KEY]) };
  };
}

// ─── SWR adapters ────────────────────────────────────────────────────

// variant: 'naive-current' | 'naive-displayed' | 'reinsert-committed' | 'fix' | 'fix-rollback-on' |
//          'catch-around-trigger'
function swr(variant) {
  return function mount(hookCount, pending) {
    const cache = new Map([[KEY, { data: SEED }]]);
    const api = [];
    function Hook({ i }) {
      const { mutate, cache: swrCache } = useSWRConfig();
      const ownRollback = ['naive-current', 'naive-displayed', 'fix-rollback-on'].includes(variant);
      const fetcher = async (_key, { arg: id }) => {
        // The fetcher runs before useSWRMutation applies optimisticData, so this is the list
        // (and the item) as it was before this delete.
        const before = swrCache.get(KEY).data;
        try {
          return await pending[id].promise;
        } catch (err) {
          if (variant === 'reinsert-committed') {
            // The idiomatic form: mutate with an updater. It receives COMMITTED data.
            await mutate(KEY, (cur) => reinsert(cur, SEED, id), { revalidate: false });
          } else if (variant === 'fix' || variant === 'fix-rollback-on') {
            // Read what is displayed now, re-insert B's item, write it back.
            const shown = swrCache.get(KEY)?.data;
            await mutate(KEY, reinsert(shown, before, id), { revalidate: false });
          }
          throw err;
        }
      };
      const { trigger } = useSWRMutation(KEY, fetcher, {
        populateCache: false,
        revalidate: false,
        rollbackOnError: ownRollback,
      });
      api[i] = (id) => {
        const before = swrCache.get(KEY).data;
        return trigger(id, {
          optimisticData:
            variant === 'naive-current'
              ? (current) => current.filter((x) => x !== id)
              : (_current, displayed) => displayed.filter((x) => x !== id),
        }).catch(async () => {
          // catch-around-trigger: the same displayed-list re-insert, but at the call site.
          if (variant !== 'catch-around-trigger') return;
          const shown = swrCache.get(KEY)?.data;
          await mutate(KEY, reinsert(shown, before, id), { revalidate: false });
        });
      };
      return null;
    }
    render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        {Array.from({ length: hookCount }, (_, i) => <Hook key={i} i={i} />)}
      </SWRConfig>,
    );
    return { start: (id, i) => api[i](id), read: () => cache.get(KEY).data };
  };
}

// ─── Scenario runner ─────────────────────────────────────────────────

const ORDERS = {
  'B fails after A succeeds': { steps: [['a', 'resolve'], ['b', 'reject']], want: ['b', 'c'] },
  'B fails while A pending': { steps: [['b', 'reject'], ['a', 'resolve']], want: ['b', 'c'] },
  'A fails after B succeeds': { steps: [['b', 'resolve'], ['a', 'reject']], want: ['a', 'c'] },
  'A fails while B pending': { steps: [['a', 'reject'], ['b', 'resolve']], want: ['a', 'c'] },
};
const SHAPES = { 'one shared hook': [1, 0, 0], 'a hook per delete': [2, 0, 1] };

async function runCase(mount, order, shape) {
  const [hookCount, hookB, hookA] = SHAPES[shape];
  // Deferreds exist up front: under a TanStack scope, A's mutationFn only runs once B settles.
  const pending = { a: deferred(), b: deferred() };
  const h = mount(hookCount, pending);
  const promises = [];
  await act(async () => { promises.push(h.start('b', hookB)); });
  await act(async () => { promises.push(h.start('a', hookA)); });
  const pre = [...h.read()];
  for (const [id, how] of ORDERS[order].steps) {
    await act(async () => {
      if (how === 'resolve') pending[id].resolve(undefined);
      else pending[id].reject(new Error('500'));
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  await act(async () => { await Promise.all(promises); });
  const final = [...h.read()];
  const ok = pre.join() === 'c' && final.join() === ORDERS[order].want.join();
  return { pre: pre.join(','), final: final.join(','), ok };
}

const VARIANTS = {
  'TanStack, snapshot restore': { mount: tanstack('snapshot'), fix: false },
  'TanStack, item-only rollback': { mount: tanstack('item-only'), fix: true },
  'TanStack + scope, snapshot restore': { mount: tanstack('snapshot', { scoped: true }), fix: false },
  'TanStack + scope, item-only rollback': { mount: tanstack('item-only', { scoped: true }), fix: true },
  'TanStack, item-only rollback in a per-mutate() onError': { mount: tanstack('item-only', { perMutate: true }), fix: false },
  'SWR, optimisticData (current)': { mount: swr('naive-current'), fix: false },
  'SWR, optimisticData (_, displayed)': { mount: swr('naive-displayed'), fix: false },
  'SWR, re-insert via mutate(updater)': { mount: swr('reinsert-committed'), fix: false },
  'SWR, re-insert in a catch around trigger': { mount: swr('catch-around-trigger'), fix: false },
  'SWR, re-insert from displayed in the fetcher': { mount: swr('fix'), fix: true },
  'SWR, same fix but rollbackOnError left on': { mount: swr('fix-rollback-on'), fix: true },
};

const results = {};
for (const [name, v] of Object.entries(VARIANTS)) {
  describe(name, () => {
    for (const shape of Object.keys(SHAPES)) {
      for (const order of Object.keys(ORDERS)) {
        it(`${shape}: ${order}`, async () => {
          const r = await runCase(v.mount, order, shape);
          (results[name] ??= []).push({ shape, order, ...r });
          // Pinned: the exact in-flight list and final list, in displayed order.
          if (process.env.PIN_DUMP) return;
          const [pre, final] = EXPECTED[name][shape][order];
          expect(r.pre, 'pinned precondition').toBe(pre);
          expect(r.final, 'pinned final').toBe(final);
          if (v.fix) {
            expect(r.pre, 'precondition').toBe('c');
            // Order matters: the fix re-inserts B's item where it was, not at the end.
            expect(r.final.split(',')).toEqual(ORDERS[order].want);
          }
        });
      }
    }
    if (!v.fix) {
      it('fails at least one case (the suite has teeth for this variant)', () => {
        expect(results[name].some((r) => !r.ok)).toBe(true);
      });
    }
  });
}

describe('matrix', () => {
  it('prints every result', () => {
    const lines = [];
    for (const [name, rows] of Object.entries(results)) {
      for (const r of rows) {
        lines.push(`${r.ok ? 'PASS' : 'FAIL'}  ${name} | ${r.shape} | ${r.order} | pre=[${r.pre}] final=[${r.final}]`);
      }
    }
    console.log(`\n${lines.join('\n')}\n`);
    if (process.env.PIN_DUMP) console.log('PINS' + JSON.stringify(results));
  });
});
