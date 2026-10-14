/**
 * OOXML(ZIP + XML) 기반 문서 파서 유틸
 *
 * DOCX / XLSX / PPTX 는 모두 ZIP 아카이브에 XML이 들어있는 동일한 규격(ECMA-376)입니다.
 * 외부 라이브러리(vuln 있는 xlsx/mammoth) 대신 fflate + 직접 파싱을 사용해
 * "사용자가 올린 신뢰할 수 없는 파일"을 다루는 런타임 의존성을 최소화합니다.
 */
import { unzipSync, strFromU8 } from 'fflate'

/** ZIP 폭탄(압축 해제 크기) 상한 — 악성 DOCX/XLSX로 브라우저를 멈추지 않기 위한 가드 */
const MAX_INFLATED_BYTES = 120 * 1024 * 1024
const MAX_ENTRIES = 4000

/**
 * ZIP 아카이브를 { path: string } 맵으로 연다.
 * @param {Uint8Array} bytes
 * @returns {Record<string,string>}
 */
export function unzipToText(bytes) {
  let files
  try {
    files = unzipSync(bytes, {
      // ZIP64 malformed 아카이브 무한루프 및 zip bomb 방지
      filter: (f) => f.size < MAX_INFLATED_BYTES,
    })
  } catch (e) {
    throw new Error('ZIP 아카이브를 열 수 없습니다. 손상되었거나 암호가 걸린 파일일 수 있습니다.')
  }

  const names = Object.keys(files)
  if (names.length > MAX_ENTRIES) {
    throw new Error(`ZIP 엔트리 ${names.length}개로 안전 한도를 초과했습니다.`)
  }

  let total = 0
  const out = Object.create(null)
  for (const name of names) {
    const data = files[name]
    total += data.length
    if (total > MAX_INFLATED_BYTES) {
      throw new Error('압축 해제 크기가 안전 한도를 초과했습니다 (zip bomb suspected).')
    }
    // 바이너리(이미지 등)는 파싱 불필요하므로 텍스트만 디코드
    if (/\.(xml|rels)$/i.test(name)) {
      out[name] = strFromU8(data)
    }
  }
  return out
}

/* ------------------------- XML 유틸 ------------------------- */

const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
}

/** XML 엔티티를 디코딩한다 (순수 문자열 치환 — DOM에 의존하지 않음). */
export function decodeXmlEntities(str) {
  return str.replace(/&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-fA-F]+);/g, (m) => {
    if (ENTITIES[m]) return ENTITIES[m]
    const num = m.match(/^&#(x?)([0-9a-fA-F]+);$/)
    if (!num) return m
    return String.fromCodePoint(parseInt(num[2], num[1] ? 16 : 10))
  })
}

/**
 * 태그를 제거하고 텍스트만 남긴다. `<w:p>` 처럼 블록 요소는 줄바꿈으로 치환한다.
 * @param {string} xml
 * @param {string[]} blockTags 줄바꿈으로 바꿀 태그명들
 */
export function xmlToText(xml, blockTags = ['p', 'br', 'tr']) {
  // 주의 1: /g 정규식에 .test() 를 반복 호출하면 lastIndex 가 유지되어 결과가 번갈아 나온다.
  //         따라서 판별용 정규식에는 g 플래그를 쓰지 않는다.
  // 주의 2: OOXML 태그는 네임스페이스가 붙는다 (w:p, w:tr ...) → 접두사를 허용해야 한다.
  // 주의 3: 줄바꿈은 "닫는 태그" 또는 "자체닫힘 태그"에서만 낸다.
  //         (여는 태그까지 새면 문단 사이에 빈 줄이 하나 더 생긴다)
  const names = blockTags.join('|')
  const blockRe = new RegExp(
    `^(?:</(?:[\\w-]+:)?(?:${names})(?:\\s[^>]*)?>|<(?:[\\w-]+:)?(?:${names})\\b[^>]*/>)$`,
    'i',
  )
  return decodeXmlEntities(
    xml
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<[^>]+>/g, (tag) => (blockRe.test(tag.trim()) ? '\n' : '')),
  )
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** XML에서 특정 태그의 텍스트 값을 모두 추출한다. */
export function extractTagTexts(xml, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</${tagName}>`, 'gi')
  const out = []
  let m
  while ((m = re.exec(xml)) !== null) {
    out.push(decodeXmlEntities(m[1].replace(/<[^>]+>/g, '')))
  }
  return out
}

/** 컬럼 인덱스(A=0, B=1, ... AA=26) 를 숫자로 변환 */
export function columnToIndex(ref) {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}
