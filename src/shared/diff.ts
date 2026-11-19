export type DiffSegment = {
  type: 'equal' | 'insert' | 'delete';
  text: string;
};

/** Words, runs of whitespace, and individual punctuation marks are separate tokens. */
const TOKEN_PATTERN = /[\p{L}\p{N}\p{M}_'’-]+|\s+|[^\s\p{L}\p{N}\p{M}_'’-]/gu;

/** Above this many LCS cells the diff is skipped (keeps the UI responsive). */
const MAX_CELLS = 4_000_000;

export const tokenize = (text: string): string[] => text.match(TOKEN_PATTERN) ?? [];

const pushSegment = (segments: DiffSegment[], type: DiffSegment['type'], text: string): void => {
  if (!text) return;
  const last = segments[segments.length - 1];
  if (last && last.type === type) {
    last.text += text;
  } else {
    segments.push({ type, text });
  }
};

/**
 * Word-level diff (longest common subsequence). Returns null when the inputs
 * are too large to diff cheaply; callers then show the plain result.
 */
export const diffWords = (before: string, after: string): DiffSegment[] | null => {
  const a = tokenize(before);
  const b = tokenize(after);

  // Trim the common prefix/suffix first: corrections usually touch few words.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);
  const n = midA.length;
  const m = midB.length;

  if ((n + 1) * (m + 1) > MAX_CELLS) return null;

  // lengths[i][j] = LCS length of midA[i:] and midB[j:], stored row-major.
  const width = m + 1;
  const lengths = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lengths[i * width + j] =
        midA[i] === midB[j]
          ? (lengths[(i + 1) * width + j + 1] ?? 0) + 1
          : Math.max(lengths[(i + 1) * width + j] ?? 0, lengths[i * width + j + 1] ?? 0);
    }
  }

  const segments: DiffSegment[] = [];
  pushSegment(segments, 'equal', a.slice(0, prefix).join(''));

  let i = 0;
  let j = 0;
  // Collect deletions before insertions inside each changed run, so a replaced
  // word reads "old → new" instead of interleaving characters.
  let pendingDelete = '';
  let pendingInsert = '';
  const flushChanges = () => {
    pushSegment(segments, 'delete', pendingDelete);
    pushSegment(segments, 'insert', pendingInsert);
    pendingDelete = '';
    pendingInsert = '';
  };

  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      flushChanges();
      pushSegment(segments, 'equal', midA[i] ?? '');
      i += 1;
      j += 1;
    } else if ((lengths[(i + 1) * width + j] ?? 0) >= (lengths[i * width + j + 1] ?? 0)) {
      pendingDelete += midA[i] ?? '';
      i += 1;
    } else {
      pendingInsert += midB[j] ?? '';
      j += 1;
    }
  }
  pendingDelete += midA.slice(i).join('');
  pendingInsert += midB.slice(j).join('');
  flushChanges();

  pushSegment(segments, 'equal', a.slice(a.length - suffix).join(''));
  return segments;
};

export const hasChanges = (segments: DiffSegment[] | null): boolean =>
  !!segments && segments.some((segment) => segment.type !== 'equal');
