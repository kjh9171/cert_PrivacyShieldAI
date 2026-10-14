/**
 * XLSX → 텍스트 파서 (OOXML SpreadsheetML)
 *
 * xl/workbook.xml 에서 시트 순서를 읽고, 각 시트를 탭 구분 텍스트로 변환합니다.
 * sharedStrings 인덱스 해석, 인라인 문자열(t="inlineStr"), 숫자/날짜/서식 값까지 처리합니다.
 */
import { unzipToText, decodeXmlEntities } from '../ooxml.js'
import { columnToIndex } from '../ooxml.js'

/** 셀 값 노드에서 텍스트를 뽑는다 (숫자·날짜·수식 결과) */
function cellValue(body, type) {
  // t="s" → sharedStrings 인덱스
  if (type === 's') {
    const v = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)
    return { shared: v ? decodeXmlEntities(v[1]) : '' }
  }
  // t="inlineStr" → <is><t>...</t></is>
  if (type === 'inlineStr') {
    const ts = [...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)]
    return { text: ts.map((m) => decodeXmlEntities(m[1])).join('') }
  }
  // t="str"(수식 결과 문자열) / t="b"(불리언) / 기본 숫자·날짜
  const v = body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/i)
  if (!v) return { text: '' }
  const raw = decodeXmlEntities(v[1]).trim()
  if (raw === '') return { text: '' }
  if (type === 'b') return { text: raw === '1' ? 'TRUE' : 'FALSE' }
  return { text: raw }
}

function sharedStrings(files) {
  const xml = files['xl/sharedStrings.xml']
  if (!xml) return []
  const out = []
  for (const si of xml.split(/<si(?:\s[^>]*)?>/i).slice(1)) {
    // <si> 안의 모든 <t> 를 이어붙인다 (서식(run) 분할 대응)
    const ts = [...si.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/gi)]
    out.push(ts.map((m) => decodeXmlEntities(m[1])).join(''))
  }
  return out
}

/** 시트 XML → 행 배열 (셀 속성을 보존하며 파싱) */
function sheetToRows(sheetXml, sst) {
  const rows = []
  // 셀은 반드시 "속성 + 본문"을 함께 캡처해야 한다 (t="s" 등 타입 판별에 필요)
  const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/gi

  for (const rowXml of sheetXml.split(/<row(?:\s[^>]*)?>/i).slice(1)) {
    const cells = []
    for (const m of rowXml.matchAll(cellRe)) {
      const attrs = m[1] ?? ''
      const body = m[2] ?? ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1] ?? ''
      const type = attrs.match(/\bt="([^"]+)"/i)?.[1] ?? 'n'
      const col = ref ? columnToIndex(ref) : cells.length

      const v = cellValue(body, type)
      const text = v.shared !== undefined ? (sst[Number(v.shared)] ?? '') : v.text
      cells[col] = text
    }
    // 빈 셀 채우기 후 문자열로
    const width = cells.reduce((m, c, i) => (c !== undefined ? Math.max(m, i) : m), -1)
    if (width < 0) continue
    const row = []
    for (let i = 0; i <= width; i++) row.push((cells[i] ?? '').replace(/\s+/g, ' ').trim())
    rows.push(row)
  }
  return rows
}

function rowsToText(rows, maxRowsPerSheet = 5000) {
  return rows
    .slice(0, maxRowsPerSheet)
    .filter((r) => r.some((c) => c !== ''))
    .map((r) => r.join('\t'))
    .join('\n')
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ sheets: {name: string, rows: string[][], text: string}[], text: string }}
 */
export function parseXlsx(bytes) {
  const files = unzipToText(bytes)

  if (!files['xl/workbook.xml']) {
    throw new Error('XLSX 구조를 인식할 수 없습니다 (xl/workbook.xml 없음).')
  }

  const sst = sharedStrings(files)

  // 시트 이름과 순서, 그리고 실제 시트 파일 경로(r:id) 매핑
  const relsXml = files['xl/_rels/workbook.xml.rels'] ?? ''
  const relMap = new Map()
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*\/?>/gi)) {
    const id = m[0].match(/\bId="([^"]+)"/i)?.[1]
    const target = m[0].match(/\bTarget="([^"]+)"/i)?.[1]
    if (id && target) relMap.set(id, target.replace(/^\//, '').replace(/^xl\//, ''))
  }

  const sheets = []
  const sheetTags = [...files['xl/workbook.xml'].matchAll(/<sheet\b[^>]*\/?>/gi)].map((m) => m[0])

  for (const [i, tag] of sheetTags.entries()) {
    const name = decodeXmlEntities(tag.match(/\bname="([^"]*)"/i)?.[1] ?? `Sheet${i + 1}`)
    const rid = tag.match(/\br:id="([^"]+)"/i)?.[1]
    const target = (rid && relMap.get(rid)) || `worksheets/sheet${i + 1}.xml`
    const xml = files[`xl/${target}`] ?? files[`xl/worksheets/sheet${i + 1}.xml`]
    if (!xml) continue

    const rows = sheetToRows(xml, sst)
    sheets.push({ name, rows, text: rowsToText(rows) })
  }

  if (sheets.length === 0) {
    throw new Error('XLSX 시트를 하나도 읽지 못했습니다.')
  }

  const text = sheets
    .map((s) => `===== 시트: ${s.name} (${s.rows.length}행) =====\n${s.text}`)
    .join('\n\n')
    .trim()

  return { sheets, text }
}
