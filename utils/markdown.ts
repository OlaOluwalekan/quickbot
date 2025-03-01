import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import html from 'remark-html'

export const convertToHTML = async (markdown: string) => {
  const processedContent = await remark()
    .use(remarkGfm)
    .use(html)
    .process(markdown)

  return processedContent.toString()
}
