export interface ModelPickerSearchItem {
  readonly name: string;
  readonly slug: string;
  readonly driverKind: string;
  readonly providerDisplayName: string;
  readonly isFavorite?: boolean;
}

export function normalizeModelPickerSearchQuery(query: string): string {
  return query
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, " ");
}

function searchFields(item: ModelPickerSearchItem): ReadonlyArray<string> {
  return [
    item.name,
    item.slug,
    item.driverKind,
    item.providerDisplayName,
    `${item.providerDisplayName} ${item.name} ${item.slug}`,
  ].map(normalizeModelPickerSearchQuery);
}

function scoreToken(field: string, token: string, fieldIndex: number): number | null {
  if (field === token) return fieldIndex * 8;
  if (field.startsWith(token)) return fieldIndex * 8 + 2;
  const boundaryIndex = field.indexOf(` ${token}`);
  if (boundaryIndex >= 0) return fieldIndex * 8 + 4 + boundaryIndex;
  const includesIndex = field.indexOf(token);
  if (includesIndex >= 0) return fieldIndex * 8 + 16 + includesIndex;
  return null;
}

export function scoreModelPickerSearch(item: ModelPickerSearchItem, query: string): number | null {
  const tokens = normalizeModelPickerSearchQuery(query)
    .split(" ")
    .filter((token) => token.length > 0);

  if (tokens.length === 0) return 0;

  const fields = searchFields(item);
  let score = item.isFavorite ? -24 : 0;
  for (const token of tokens) {
    const tokenScores = fields
      .map((field, fieldIndex) => scoreToken(field, token, fieldIndex))
      .filter((tokenScore): tokenScore is number => tokenScore !== null);
    if (tokenScores.length === 0) return null;
    score += Math.min(...tokenScores);
  }
  return score;
}

export function rankModelPickerItems<Item extends ModelPickerSearchItem>(
  items: ReadonlyArray<Item>,
  query: string,
): Item[] {
  return items
    .map((item, index) => ({
      item,
      index,
      score: scoreModelPickerSearch(item, query),
    }))
    .filter((entry): entry is { item: Item; index: number; score: number } => entry.score !== null)
    .toSorted((left, right) => left.score - right.score || left.index - right.index)
    .map((entry) => entry.item);
}
