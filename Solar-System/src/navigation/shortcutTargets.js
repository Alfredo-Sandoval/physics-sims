// Text fields and dropdowns own every key; buttons, links, and summaries only need
// Space and Enter, so other shortcuts keep working after a click leaves focus there.
const TEXT_ENTRY_SELECTOR = "input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox']";
const ACTIVATABLE_SELECTOR = "button, a[href], summary, [role='button']";

export function isTextEntryTarget(target) {
  if (!(target instanceof Element)) return false;
  return target.isContentEditable || Boolean(target.closest(TEXT_ENTRY_SELECTOR));
}

export function targetOwnsKey(event) {
  const target = event.target;
  if (isTextEntryTarget(target)) return true;
  if (!(target instanceof Element)) return false;
  return (event.key === " " || event.key === "Enter") && Boolean(target.closest(ACTIVATABLE_SELECTOR));
}
