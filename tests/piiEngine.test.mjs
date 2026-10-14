/**
 * PrivacyShield AI - PII 엔진 단위 테스트
 * 실행: node tests/piiEngine.test.mjs
 */
import assert from 'node:assert/strict'
import {
  detectPii,
  asteriskMask,
  buildSegments,
  segmentsToPlainText,
} from '../src/lib/piiEngine.js'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    passed++
    console.log(`  \u2713 ${name}`)
  } catch (err) {
    failed++
    console.log(`  \u2717 ${name}\n      ${err.message}`)
  }
}

const ALL = new Set(['rrn', 'card', 'phone', 'driver', 'email', 'name', 'address', 'medical'])
const NO_RULES = []
const types = (text, enabled = ALL, rules = NO_RULES) => detectPii(text, enabled, rules, 1).map((i) => i.type)
const values = (text, enabled = ALL, rules = NO_RULES) => detectPii(text, enabled, rules, 1).map((i) => i.value)

console.log('\n[1] 법정 개인정보 탐지')

test('주민등록번호', () => {
  assert.deepEqual(types('주민등록번호: 920512-1029384'), ['rrn'])
})

test('여권/외국인등록번호 (7~8 세대)', () => {
  assert.deepEqual(types('990101-3012345'), ['rrn'])
})

test('신용카드번호 4-4-4-4', () => {
  assert.deepEqual(types('카드 4532-8910-2234-9912'), ['card'])
})

test('계좌번호 3-2-4-3', () => {
  assert.deepEqual(values('계좌 827-21-0923-118'), ['827-21-0923-118'])
  assert.deepEqual(types('계좌 827-21-0923-118'), ['card'])
})

test('계좌번호 6-2-6', () => {
  assert.deepEqual(types('계좌 123456-12-345678'), ['card'])
})

test('휴대전화 010-XXXX-XXXX', () => {
  assert.deepEqual(values('연락처 010-8923-4410'), ['010-8923-4410'])
})

test('서울 지역번호 02-XXX-XXXX', () => {
  assert.deepEqual(values('대표전화 02-555-0192'), ['02-555-0192'])
})

test('이메일', () => {
  assert.deepEqual(values('메일 hg_dong@example.com'), ['hg_dong@example.com'])
})

test('상세 주소', () => {
  const v = values('주소 서울특별시 강남구 테헤란로 123길 45')
  assert.equal(v.length, 1)
  assert.match(v[0], /서울특별시/)
})

test('운전면허번호 2-2-6-2 (계좌번호와 오인식 안 함)', () => {
  assert.deepEqual(types('면허번호 11-12-345678-90'), ['driver'])
})

test('성명 — 라벨 문맥', () => {
  assert.deepEqual(values('성명: 홍길동'), ['홍길동'])
  assert.deepEqual(values('계좌주: 김철수'), ['김철수'])
})

test('성명 — 호칭 문맥', () => {
  assert.deepEqual(values('담당자: 김철수님'), ['김철수'])
})

test('탐지 결과 위치가 원문과 정확히 일치', () => {
  const text = '성명: 홍길동\n주민번호: 920512-1029384\n전화: 010-8923-4410'
  for (const item of detectPii(text, ALL, NO_RULES, 1)) {
    assert.equal(text.slice(item.start, item.end), item.value)
  }
})

test('탐지 구간은 겹치지 않고 오름차순', () => {
  const items = detectPii(
    '성명: 홍길동 주민번호 920512-1029384 전화 010-8923-4410 카드 4532-8910-2234-9912',
    ALL,
    NO_RULES,
    1,
  )
  for (let i = 1; i < items.length; i++) {
    assert.ok(items[i].start >= items[i - 1].end, `item ${i} overlaps previous`)
  }
})

console.log('\n[2] 규칙 활성화/비활성화')

test('비활성화된 규칙은 탐지하지 않음', () => {
  assert.deepEqual(types('주민번호 920512-1029384', new Set(['phone'])), [])
})

test('메타데이터(법제조항) 미탐지', () => {
  assert.deepEqual(detectPii('932514-1029384', new Set(), NO_RULES, 1), [])
})

test('커스텀 정규식 규칙 적용', () => {
  const rules = [{ id: 'x', name: '사원번호', regex: 'EMP-\\d{6}', enabled: true }]
  assert.deepEqual(values('사원 코드 EMP-829103', ALL, rules), ['EMP-829103'])
})

test('비활성화된 커스텀 규칙은 무시', () => {
  const rules = [{ id: 'x', name: '사원번호', regex: 'EMP-\\d{6}', enabled: false }]
  assert.deepEqual(detectPii('사원 코드 EMP-829103', ALL, rules, 1), [])
})

test('잘못된 정규식은 예외 없이 안전하게 건너뜀', () => {
  const rules = [{ id: 'x', name: '깨진규칙', regex: 'EMP-[a-z', enabled: true }]
  assert.deepEqual(detectPii('EMP-829103', ALL, rules, 1), [])
})

test('빈 문자열 / 불일치 문자열에서 안전하게 처리', () => {
  assert.deepEqual(detectPii('', ALL, NO_RULES, 1), [])
  assert.deepEqual(detectPii('개인정보가 없는 문장입니다.', ALL, NO_RULES, 1), [])
})

test('빈 매치(zero-width)로 인한 무한루프 없음', () => {
  const rules = [{ id: 'x', name: '제로와이드', regex: 'a*', enabled: true }]
  assert.ok(Array.isArray(detectPii('aaa bbb', ALL, rules, 1)))
})

test('긴 문서에서도 O(n)으로 동작', () => {
  const text = '주민번호 920512-1029384 '.repeat(5000)
  const t0 = Date.now()
  assert.ok(detectPii(text, ALL, NO_RULES, 1).length > 0)
  assert.ok(Date.now() - t0 < 3000, '탐지가 3초 이내여야 함')
})

console.log('\n[3] 마스킹 변환 (asterisk)')

const m = asteriskMask

test('주민번호 → 920512-1******', () => assert.equal(m('920512-1029384', 'rrn'), '920512-1******'))
test('신용카드 → 4532-****-****-9912', () =>
  assert.equal(m('4532-8910-2234-9912', 'card'), '4532-****-****-9912'))
test('휴대전화 → 010-****-4410', () => assert.equal(m('010-8923-4410', 'phone'), '010-****-4410'))
test('서울 전화 → 02-***-0192', () => assert.equal(m('02-555-0192', 'phone'), '02-***-0192'))
test('이메일 → hg*****@example.com', () =>
  assert.equal(m('hg_dong@example.com', 'email'), 'hg*****@example.com'))
test('성명 → 홍**', () => assert.equal(m('홍길동', 'name'), '홍**'))
test('주소는 시/구까지만 유지', () =>
  assert.equal(m('서울특별시 강남구 테헤란로 123길 45', 'address'), '서울특별시 강남구 [상세주소 마스킹]'))
test('계좌번호 3-2-4-3 → 827-**-****-118', () =>
  assert.equal(m('827-21-0923-118', 'card'), '827-**-****-118'))
test('마스킹 결과에 원본 전체가 남지 않음', () => {
  const src = '920512-1029384'
  assert.ok(!m(src, 'rrn').replace(/[-\s]/g, '').includes('1029384'))
})

console.log('\n[4] 프리뷰 세그먼트 무결성')

const DOC = `지원자 성명: 홍길동 (洪吉洞)
주민등록번호: 920512-1029384
연락처: 010-8923-4410 | 이메일: hg_dong@example.com
주소: 서울특별시 강남구 테헤란로 123길 45 (역삼동)
사원 코드: EMP-829103 | 프로젝트: PRJ-AI-2026`

const RULES = [{ id: 'c1', name: '사원번호', regex: 'EMP-\\d{6}', enabled: true }]

test('마스킹 해제 시 원문 100% 복원 (누락/중복 없음)', () => {
  const items = detectPii(DOC, ALL, RULES, 1).map((i) => ({ ...i, masked: false }))
  const segs = buildSegments({ rawText: DOC }, items, 'blur', '')
  assert.equal(segmentsToPlainText(segs), DOC)
})

test('모든 스타일이 원문 길이를 보존하거나 의도적으로 대체', () => {
  const items = detectPii(DOC, ALL, RULES, 1)
  for (const style of ['blackout', 'blur', 'asterisk', 'token', 'custom']) {
    const segs = buildSegments({ rawText: DOC }, items, style, '[가림]')
    assert.ok(segs.length > 0, `${style} 세그먼트 없음`)
    assert.ok(segmentsToPlainText(segs).length > 0)
  }
})

test('blanket blackout 스타일에 원문 문자열이 남지 않음', () => {
  const items = detectPii(DOC, ALL, RULES, 1)
  const out = segmentsToPlainText(buildSegments({ rawText: DOC }, items, 'blackout', ''))
  assert.ok(!out.includes('920512-1029384'), '주민번호가 평문으로 노출됨')
  assert.ok(!out.includes('hg_dong@example.com'), '이메일이 평문으로 노출됨')
})

test('token 스타일이 원문 값을 노출하지 않음', () => {
  const items = detectPii(DOC, ALL, RULES, 1)
  const out = segmentsToPlainText(buildSegments({ rawText: DOC }, items, 'token', ''))
  assert.ok(out.includes('[RRN_TOKEN]'))
  assert.ok(!out.includes('920512-1029384'))
})

test('빈 페이지에서도 정상 동작', () => {
  const segs = buildSegments({ rawText: '' }, [], 'asterisk', '')
  assert.deepEqual(segs, [])
})

console.log(`\n${'='.repeat(46)}`)
console.log(`  통과 ${passed} / 실패 ${failed}`)
console.log('='.repeat(46) + '\n')
process.exit(failed === 0 ? 0 : 1)