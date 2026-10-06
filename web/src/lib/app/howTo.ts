// The "How to Use this App" guide. The markdown still lives in the Django app's
// static/ folder (shared until phase 7) and is bundled at build time.
import { marked } from 'marked';
import howToMarkdown from '../../../../static/how-to.md?raw';

export function howToHtml(md: string = howToMarkdown): string {
  return marked.parse(md, { async: false });
}
