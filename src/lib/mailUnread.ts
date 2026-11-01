/**
 * Board mail thread state, shared by the Worker and the members page. A
 * thread is the visitor's enquiry, the board's replies and the visitor's
 * emailed answers (`inbound`), in order. The inbox is shared, so its read
 * state is too: one `readAt` for the whole board.
 */
export type ThreadLike = {
  submittedAt: string;
  readAt?: string;
  replies?: { at: string; inbound?: boolean }[];
};

/** Website forms whose enquiries Board mail shows; nothing else appears there. */
export const WEBSITE_TOPICS: readonly string[] = ['connect', 'bible-study'];

export const isWebsiteThread = (thread: { topic?: string }) => WEBSITE_TOPICS.includes(thread.topic ?? '');

/** The visitor spoke last — the enquiry itself, or an emailed answer to a reply. */
export function awaitingAnswer(thread: ThreadLike): boolean {
  const replies = thread.replies ?? [];
  return replies.length === 0 || replies[replies.length - 1].inbound === true;
}

/** When the visitor last wrote. */
export function lastInboundAt(thread: ThreadLike): string {
  const inbound = (thread.replies ?? []).filter((r) => r.inbound);
  return inbound.length ? inbound[inbound.length - 1].at : thread.submittedAt;
}

/**
 * Unread until someone on the board opens it after the visitor last wrote,
 * or answers it. The badges on Board mail and Inbox count these.
 */
export function isUnread(thread: ThreadLike): boolean {
  return awaitingAnswer(thread) && (!thread.readAt || thread.readAt < lastInboundAt(thread));
}
