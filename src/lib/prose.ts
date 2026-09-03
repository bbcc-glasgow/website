/**
 * Turn an editor's plain-text field into paragraphs.
 *
 * Every prose field in the CMS is a `text` widget, which is a plain textarea.
 * It keeps the newlines an editor types, and until this file nothing
 * downstream did anything with them: the string went straight into one `<p>`,
 * where HTML collapses a blank line to a space. An editor who wrote two
 * paragraphs got one run-on, with nothing failing and nothing to see in the
 * CMS. The workaround, in the single place anyone noticed, was to add a second
 * field, which put the layout's paragraph count into the content schema and
 * capped Our Area at exactly two paragraphs forever.
 *
 * Splitting here rather than switching those fields to a markdown widget is
 * deliberate. Astro escapes a text node, so a CMS field still cannot introduce
 * markup into the page; a markdown widget has to be rendered through `set:html`
 * and would let an editor put a heading or an image inside a band whose
 * typography is fixed. What was missing was paragraphs, not rich text.
 */

/**
 * Split a text field on blank lines.
 *
 * A single newline stays inside its paragraph, where HTML collapses it to a
 * space: an editor wrapping a line in the textarea means nothing by it. Runs
 * of more than one blank line, and trailing whitespace on an otherwise blank
 * line, are treated the same as one blank line, because they look identical in
 * a textarea.
 */
export function paragraphs(text: string): string[] {
  return text
    .split(/\r?\n[ \t]*\r?\n/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}
