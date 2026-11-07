/** Jak `Promise.all`, ale najwyżej `limit` zadań naraz, więc nie wyczerpie uchwytów plików. */
export async function mapLimit<Item, Result>(
  items: Item[],
  limit: number,
  run: (item: Item) => Promise<Result>
): Promise<Result[]> {
  const results = new Array<Result>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await run(items[index] as Item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/**
 * Kolejka, która może rosnąć w trakcie pracy. Zwrócona funkcja uruchamia kolejne zadania
 * do limitu, a `onIdle` dostaje znać, gdy nie ma nic do zrobienia i nic już nie trwa.
 */
export function startQueue<Item>(
  limit: number,
  take: () => Item | undefined,
  run: (item: Item) => Promise<void>,
  onIdle: () => void
): () => void {
  let active = 0
  const pump = (): void => {
    while (active < limit) {
      const item = take()
      if (item === undefined) break
      active += 1
      void run(item).finally(() => {
        active -= 1
        pump()
      })
    }
    if (active === 0) onIdle()
  }
  return pump
}
