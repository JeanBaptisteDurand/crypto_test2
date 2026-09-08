/**
 * "Open the launch form", said from anywhere on the page.
 *
 * The hero's Create your own button is a link to `#create` -- it scrolls without JavaScript, which is how
 * it should stay -- but the form below that anchor is rolled up by default, so following the link alone
 * would land a visitor on a closed panel. This is the second half of that click.
 *
 * A hash is not enough on its own: clicking the same link twice fires no `hashchange`, so the panel would
 * refuse to reopen after being closed. An event has no such memory.
 */
const EVENT = "ponsfund:open-create";

export const CREATE_HASH = "#create";

export function openCreateForm() {
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Run `fn` when something asks for the form: the event above, or an arrival on `#create` (a bookmark, the
 * navbar, a link from elsewhere). Both are the visitor asking; nothing opens the panel on its own.
 */
export function subscribeOpenCreate(fn: () => void): () => void {
  const onHash = () => window.location.hash === CREATE_HASH && fn();
  onHash();
  window.addEventListener(EVENT, fn);
  window.addEventListener("hashchange", onHash);
  return () => {
    window.removeEventListener(EVENT, fn);
    window.removeEventListener("hashchange", onHash);
  };
}
