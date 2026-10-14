/**
 * 문서 파서 통합 테스트 — 실제 파일 바이트에 대해 검증
 * 실행: node tests/parsers.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseDocx } from '../src/lib/parsers/docx.js'
import { parseXlsx } from '../src/lib/parsers/xlsx.js'
import { unzipToText, xmlToText, decodeXmlEntities, columnToIndex } from '../src/lib/ooxml.js'
import { detectPii } from '../src/lib/piiEngine.js'

const DIR = new URL('../fixtures/', import.meta.url).pathname
const ALL = new Set(['rrn', 'card', 'phone', 'driver', 'email', 'name', 'address', 'medical'])

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    console.log(`  \u2717 ${name}\n      ${e.message.split('\n')[0]}`)
  }
}

console.log('\n[1] XML / OOXML 유틸')

test('엔티티 디코딩', () => {
  assert.equal(decodeXmlEntities('a &amp; b &lt;c&gt; &quot;d&quot;'), 'a & b <c> "d"')
})
test('숫자/16진수 엔티티 디코딩', () => {
  assert.equal(decodeXmlEntities('&#xAC00;'), '가')
  assert.equal(decodeXmlEntities('&#44032;'), '가')
  assert.equal(decodeXmlEntities('&#xB300;'), '대')
})
test('블록 태그를 줄바꿈으로 (네임스페이스 w:p 지원)', () => {
  assert.equal(xmlToText('<w:p><w:t>A</w:t></w:p><w:p><w:t>B</w:t></w:p>', ['p']), 'A\nB')
  assert.equal(xmlToText('<p>A</p><p>B</p>', ['p']), 'A\nB')
})
test('컬럼 인덱스 변환 (A/AA/BA)', () => {
  assert.equal(columnToIndex('A1'), 0)
  assert.equal(columnToIndex('B2'), 1)
  assert.equal(columnToIndex('AA1'), 26)
  assert.equal(columnToIndex('BA1'), 52)
})

console.log('\n[2] DOCX 파서')

const docx = parseDocx(new Uint8Array(readFileSync(`${DIR}test.docx`)))

test('본문 텍스트 추출', () => {
  assert.ok(docx.text.includes('사원 인사기록장'), '제목 누락')
  assert.ok(docx.text.includes('홍길동'))
})
test('DOCX 바이너리 garbage 미노출', () => {
  for (const bad of ['PK\u0003\u0004', 'word/document.xml', '<?xml', 'w:t']) {
    assert.ok(!docx.text.includes(bad), `누출됨: ${JSON.stringify(bad)}`)
  }
})
test('XML 엔티티 디코딩 (이메일 <> / &amp;)', () => {
  assert.ok(docx.text.includes('hg_dong@example.com'), '엔티티 미디코딩')
  assert.ok(!docx.text.includes('&lt;'), '엔티티 잔존')
})
test('표 셀 추출', () => {
  assert.ok(docx.text.includes('827-21-0923-118'), '표 내용 누락')
})
test('DOCX에서 개인정보 탐지', () => {
  const found = detectPii(docx.text, ALL, [], 1).map((i) => i.value)
  assert.ok(found.includes('920512-1029384'), '주민번호 미탐지')
  assert.ok(found.includes('010-8923-4410'), '전화번호 미탐지')
  assert.ok(found.includes('827-21-0923-118'), '계좌번호 미탐지')
})
test('손상된 DOCX는 예외를 던지되 크래시하지 않음', () => {
  assert.throws(() => parseDocx(new Uint8Array([1, 2, 3, 4, 5])), /ZIP|인식/)
})

console.log('\n[3] XLSX 파서')

const xlsx = parseXlsx(new Uint8Array(readFileSync(`${DIR}test.xlsx`)))

test('시트 목록 및 이름', () => {
  assert.equal(xlsx.sheets.length, 1)
  assert.equal(xlsx.sheets[0].name, '거래내역')
})
test('sharedStrings 해석', () => {
  assert.ok(xlsx.text.includes('거래처'), 'sharedStrings 미해석')
  assert.ok(xlsx.text.includes('김철수'))
})
test('inlineStr 해석', () => {
  assert.ok(xlsx.text.includes('4532-8910-2234-9912'), 'inlineStr 미해석')
})
test('숫자 셀 값 보존', () => {
  assert.ok(xlsx.text.includes('1240000'), '숫자 셀 손실')
})
test('셀 참조 순서대로 재배열 (빈 셀 채움)', () => {
  const [hdr] = xlsx.sheets[0].rows
  assert.equal(hdr[0], '거래처')
  assert.equal(hdr[1], '카드번호')
  assert.equal(hdr[2], '금액')
})
test('유니코드(☎) 보존', () => {
  assert.ok(xlsx.text.includes('☎'), '유니코드 손실')
})
test('XLSX에서 개인정보 탐지', () => {
  const found = detectPii(xlsx.text, ALL, [], 1).map((i) => i.value)
  assert.ok(found.includes('4532-8910-2234-9912'), '카드번호 미탐지')
  assert.ok(found.includes('850310-2193847'), '주민번호 미탐지')
})
test('XLSX 바이너리 garbage 미노출', () => {
  for (const bad of ['PK\u0003\u0004', 'sharedStrings', 'worksheet', '<row']) {
    assert.ok(!xlsx.text.includes(bad), `누출됨: ${JSON.stringify(bad)}`)
  }
})

console.log('\n[4] 안전성 (zip bomb / 잘못된 입력)')

test('비 ZIP 바이트는 예외 처리', () => {
  assert.throws(() => unzipToText(new Uint8Array([1, 2, 3, 4])), /ZIP/)
})
test('빈 입력은 예외 처리', () => {
  assert.throws(() => unzipToText(new Uint8Array(0)), /ZIP/)
})
test('지원하지 않는 확장자(ZIP)도 오염 없이 거부', () => {
  // index.js 디스패처가 unknown 으로 분류하는 경로 (파서 직접 호출 아님)
  const files = unzipToText(new Uint8Array(readFileSync(`${DIR}test.zip`)))
  assert.deepEqual(Object.keys(files), [], '텍스트 XML 이 없어야 함')
})

console.log(`\n${'='.repeat(46)}`)
console.log(`  통과 ${passed} / 실패 ${failed}`)
console.log('='.repeat(46) + '\n')
process.exit(failed === 0 ? 0 : 1)