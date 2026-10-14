/**
 * PDF 좌표/마스킹 박스 계산 단위 테스트
 * 실행: node tests/pdfCoords.test.mjs
 *
 * 회귀 방지 목적: 캔버스가 CSS 로 축소 표시될 때 박스가 어긋나던 버그와,
 * 비례폰트에서 선형 보간이 과소 가림을 만들던 버그를 막는다.
 */
import assert from 'node:assert/strict'
import { bboxFromTransform, buildRedactionBoxes, toPercentBox } from '../src/lib/parsers/pdfCoords.js'

let passed = 0
let failed = 0
function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (e) {
    failed++
    console.log(`  \u2717 ${name}\n      ${e.message.split('\n').slice(0, 3).join(' ')}`)
  }
}

// fixtures/test.pdf 1페이지의 실제 텍스트 조각 (pdf.js 출력 기준선 대로)
const RUNS = [
  { str: 'Employee Record', bbox: [72, 60, 167.4, 72], height: 12 },
  { str: 'Name: Hong Gildong', bbox: [72, 80, 184, 92], height: 12 },
  { str: 'RRN: 920512-1029384', bbox: [72, 100, 195.4, 112], height: 12 },
  { str: 'Phone: 010-8923-4410', bbox: [72, 120, 194.7, 132], height: 12 },
  { str: 'Email: hg_dong@example.com', bbox: [72, 140, 238.9, 152], height: 12 },
]
const PAGE_W = 612
const PAGE_H = 792

console.log('\n[1] bboxFromTransform')

test('정방향 텍스트: 상단 좌표가 tx[5] - height', () => {
  // scale 1, y=112(상단 기준), 12pt Helvetica
  const g = bboxFromTransform([12, 0, 0, -12, 72, 112], 123.4, 12)
  assert.deepEqual(g.bbox, [72, 100, 195.4, 112])
  assert.equal(g.height, 12)
})

test('좌우 반전 텍스트(세로쓰기)는 제외', () => {
  assert.equal(bboxFromTransform([-12, 0, 0, -12, 72, 112], 100, 12), null)
})

test('item.width 없으면 축 스케일로 근사', () => {
  const g = bboxFromTransform([12, 0, 0, -12, 50, 100], undefined, 12)
  assert.equal(g.bbox[2] - g.bbox[0], 12)
})

test('height 없으면 item.height 로 대체', () => {
  const g = bboxFromTransform([12, 0, 0, 0, 50, 100], 90, 9)
  assert.equal(g.height, 9)
})

console.log('\n[2] buildRedactionBoxes')

const items = [
  { id: 'a', type: 'rrn', value: '920512-1029384' },
  { id: 'b', type: 'phone', value: '010-8923-4410' },
  { id: 'c', type: 'email', value: 'hg_dong@example.com' },
]

test('탐지 항목마다 박스 하나 생성', () => {
  assert.equal(buildRedactionBoxes(RUNS, items).length, 3)
})

test('박스가 올바른 줄(y)에 놓임', () => {
  const boxes = buildRedactionBoxes(RUNS, items)
  const byItem = Object.fromEntries(boxes.map((b) => [b.item.id, b]))
  // RRN 줄 = y 100~112, Phone = 120~132, Email = 140~152
  assert.ok(byItem.a.y >= 98 && byItem.a.y < 112, `RRN y=${byItem.a.y}`)
  assert.ok(byItem.b.y >= 118 && byItem.b.y < 132, `Phone y=${byItem.b.y}`)
  assert.ok(byItem.c.y >= 138 && byItem.c.y < 152, `Email y=${byItem.c.y}`)
})

test('박스가 라벨 다음에 시작 (왼쪽으로 넘어가지 않음)', () => {
  const boxes = buildRedactionBoxes(RUNS, items)
  for (const b of boxes) b.x >= 72
})

test('과소 가림 방지: 값 전체를 반드시 포함하도록 여유 폭 확보', () => {
  // 핵심 회귀 테스트.
  // "Email: " 라벨 문자들이 평균보다 넓어 선형 보간만 하면 시작점이 오른쪽으로 밀린다.
  // 실제 Helvetica 폭 기준으로 'hg' 시작점은 대략 x=108.7 부근이다.
  const boxes = buildRedactionBoxes(RUNS, items)
  const email = boxes.find((b) => b.item.id === 'c')
  assert.ok(email.x <= 108.7, `이메일 박스 시작 ${email.x.toFixed(1)} 이 값 시작점보다 오른쪽 (과소 가림)`)
  assert.ok(email.x + email.w >= 238.9 - 0.01, '이메일 박스가 값 끝을 덮지 못함')
})

test('박스가 해당 조각 범위를 벗어나지 않음', () => {
  for (const b of buildRedactionBoxes(RUNS, items)) {
    assert.ok(b.x >= 72, 'run 시작보다 왼쪽으로 벗어남')
    assert.ok(b.x + b.w <= 238.9 + 0.01, 'run 끝보다 오른쪽으로 벗어남')
  }
})

test('값이 없거나 빈 배열이면 빈 결과', () => {
  assert.deepEqual(buildRedactionBoxes(RUNS, []), [])
  assert.deepEqual(buildRedactionBoxes([], items), [])
  assert.deepEqual(buildRedactionBoxes(RUNS, [{ id: 'x', value: '' }]), [])
})

test('조각에 없는 값은 박스를 만들지 않음', () => {
  assert.deepEqual(buildRedactionBoxes(RUNS, [{ id: 'z', value: '없는값' }]), [])
})

console.log('\n[3] toPercentBox (CSS 축소 대응)')

test('비율 좌표 계산', () => {
  const p = toPercentBox({ x: 153, y: 150, w: 30, h: 10 }, PAGE_W, PAGE_H)
  assert.equal(p.left, (153 / 612) * 100)
  assert.equal(p.width, (30 / 612) * 100)
})

test('축소/확대해도 상대 위치가 유지 (회귀 방지)', () => {
  const box = { x: 100, y: 200, w: 50, h: 12 }
  const p = toPercentBox(box, PAGE_W, PAGE_H)
  // 어떤 표시 크기에서도 백분율이 같으므로 실제 픽셀 좌표가 동일하게 복원된다
  for (const displayW of [400, 612, 1000, 1600]) {
    const px = (p.left / 100) * displayW
    assert.ok(Math.abs(px - (box.x / PAGE_W) * displayW) < 1e-9, `displayW=${displayW} 불일치`)
  }
})

test('0 나눗셈 방지', () => {
  const p = toPercentBox({ x: 1, y: 1, w: 1, h: 1 }, 0, 0)
  assert.ok(Number.isFinite(p.left) && Number.isFinite(p.width))
})

console.log(`\n${'='.repeat(46)}`)
console.log(`  통과 ${passed} / 실패 ${failed}`)
console.log('='.repeat(46) + '\n')
process.exit(failed === 0 ? 0 : 1)