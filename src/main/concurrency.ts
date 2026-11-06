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
