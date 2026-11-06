const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
// 010-1234-5678, 02-123-4567, 031-123-4567: not part of a longer run of digits.
const PHONE = /(?<![\d-])0\d{1,2}-\d{3,4}-\d{4}(?![\d-])/g

/** Draw-time masking only: emails and Korean phone numbers, code blocks included. */
export const maskText = (text: string) => text.replace(EMAIL, '●●@가림').replace(PHONE, '●●● 가림')
