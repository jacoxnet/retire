// The "How to Use this App" guide, bundled from src/lib/content/how-to.md at build time.
import { marked } from 'marked';
import howToMarkdown from '../content/how-to.md?raw';

export function howToHtml(md: string = howToMarkdown): string {
  return marked.parse(md, { async: false });
}
