/**
 * DOCX → 텍스트 파서 (OOXML / ECMA-376)
 *
 * word/document.xml 의 <w:t> 런 텍스트를 추출하고,
 * <w:p>(문단) · <w:tr>(표 행) 단위로 줄바꿈을 구성합니다.
 * 머리말/바닥글, 각주, 주석, 텍스트 상자, SmartArt 텍스트까지 포함합니다.
 */
import { unzipToText, xmlToText, extractTagTexts } from '../ooxml.js'

/** 줄 끝의 공백만 제거 (중간 공백은 보존) */
function tidy(text) {
  return text
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ text: string, parts: string[] }}
 */
export function parseDocx(bytes) {
  const files = unzipToText(bytes)

  const main = files['word/document.xml']
  if (!main) {
    throw new Error('DOCX 구조를 인식할 수 없습니다 (word/document.xml 없음).')
  }

  // 본문 + 머리말/바닥글 + 각주/주석 (감사 시 누락 방지)
  const extra = []
  for (const [name, xml] of Object.entries(files)) {
    if (/^word\/(header\d*|footer\d*|footnotes|endnotes|comments)\.xml$/i.test(name)) {
      extra.push(xmlToText(xml))
    }
  }

  // <w:p> 단위로 분리해 문단 경계를 보존 (표 셀은 탭으로 구분)
  const paragraphs = main
    .split(/<w:p(?:\s[^>]*)?>/i)
    .slice(1)
    .map((p) => {
      const runs = extractTagTexts(p, 'w:t').join('')
      if (runs.trim()) return runs
      // <w:br/> 이 있는 문단은 줄을 나눈다
      const breaks = (p.match(/<w:br(?:\s[^>]*)?\/>/gi) ?? []).length
      return breaks ? '\n'.repeat(breaks) : ''
    })

  // 표: 행을 " | " 로 연결해 셀 경계를 드러낸다
  const tables = main
    .split(/<w:tbl(?:\s[^>]*)?>/i)
    .slice(1)
    .map((tbl) =>
      tbl
        .split(/<w:tr(?:\s[^>]*)?>/i)
        .slice(1)
        .map((row) => extractTagTexts(row, 'w:tc').map((c) => c.replace(/\s+/g, ' ').trim()).join(' | '))
        .filter((r) => r.replace(/[|\s]/g, ''))
        .join('\n'),
    )

  let text = paragraphs.join('\n')
  if (tables.length) text += `\n\n${tables.join('\n\n')}`

  const headFoot = extra.filter(Boolean).join('\n\n')
  if (headFoot) text += `\n\n${headFoot}`

  return { text: tidy(text), parts: tables }
}
