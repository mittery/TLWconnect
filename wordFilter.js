// TLWconnect — Server-Side Word & Profanity Filter Engine
// ป้องกันคำหยาบคาย การบูลลี่ และคำไม่เหมาะสมในสถานศึกษา

// รายการคำต้องห้ามพื้นฐาน (Exact and pattern-matched terms)
const BAD_WORDS_PATTERNS = [
  // 1. คำด่าและคำหยาบคายรุนแรง (Thai core profanities)
  /ค[ _\-.]*[วู][ _\-.]*[ยย่]/i,                       // ควย, ค-ว-ย, ค ว ย
  /เย็[ _\-.]*ด/i,                                     // เย็ด, เยด
  /เ[ _\-.]*หี้[ _\-.]*ย/i,                            // เหี้ย, เ-หี้-ย
  /เ[ _\-.]*ฮี้[ _\-.]*ย/i,                            // เฮี้ย
  /สั[ _\-.]*[สด]/i,                                   // สัส, สัด, สั-ส
  /ไอ้[ _\-.]*สั[ _\-.]*[สด]/i,                        // ไอ้สัส, ไอ้สัด
  /ห้[ _\-.]*า[ _\-.]*ว/i,                             // ห้าวเป้ง (เมื่อก้าวร้าว)
  /จั[ _\-.]*ญ[ _\-.]*ไ[ _\-.]*ร/i,                    // จัญไร, จังไร
  /ด[ _\-.]*อ[ _\-.]*ก[ _\-.]*ท[ _\-.]*อ[ _\-.]*ง/i,   // ดอกทอง
  /ก[ _\-.]*ะ[ _\-.]*ห[ _\-.]*รี่/i,                   // กะหรี่, กระหรี่
  /ก[ _\-.]*ระ[ _\-.]*ห[ _\-.]*รี่/i,
  /ต[ _\-.]*อ[ _\-.]*แ[ _\-.]*ห[ _\-.]*ล/i,             // ตอแหล
  /เ[ _\-.]*สื[ _\-.]*อ[ _\-.]*ก/i,                    // เสือก
  /สั[ _\-.]*น[ _\-.]*ด[ _\-.]*า[ _\-.]*น/i,           // สันดาน, สันดานเสีย
  /ร[ _\-.]*ะ[ _\-.]*ย[ _\-.]*ำ/i,                     // ระยำ
  /ช[ _\-.]*า[ _\-.]*ติ[ _\-.]*ชั่[ _\-.]*ว/i,         // ชาติชั่ว
  /บั[ _\-.]*ด[ _\-.]*ซ[ _\-.]*บ/i,                    // บัดซบ
  /ห[ _\-.]*น้[ _\-.]*า[ _\-.]*ด้[ _\-.]*า[ _\-.]*น/i, // หน้าด้าน
  /ห[ _\-.]*น้[ _\-.]*า[ _\-.]*ตั[ _\-.]*ว[ _\-.]*เ[ _\-.]*มี[ _\-.]*ย/i, // หน้าตัวเมีย
  /พ่[ _\-.]*อ[ _\-.]*ง[ _\-.]*ต[ _\-.]*า[ _\-.]*ย/i,  // พ่องตาย, พ่อง
  /แ[ _\-.]*ม่[ _\-.]*ง[ _\-.]*ต[ _\-.]*า[ _\-.]*ย/i,  // แม่มึงตาย

  // 2. คำลามกอนาจารและคุกคามทางเพศ (Sexual / Vulgar terms)
  /เ[ _\-.]*งี่[ _\-.]*ย[ _\-.]*น/i,                   // เงี่ยน, หงี่
  /ห[ _\-.]*งี่/i,
  /แ[ _\-.]*ต[ _\-.]*ด/i,                              // แตด
  /ห[ _\-.]*มุ[ _\-.]*อย/i,                            // หมอย
  /เ[ _\-.]*ยี่[ _\-.]*ยน/i,

  // 3. คำหยาบภาษาอังกฤษ (English Profanity & Slurs)
  /\bf+u+c*k+\b/i,                                     // fuck, fuk, fuuuck
  /\bf+[ _\-.*]+u+[ _\-.*]+c+[ _\-.*]+k+/i,
  /\bf+u+c*k+i+n+g+\b/i,
  /\bf+u+c*k+e+r+\b/i,
  /\bs+h+i+t+\b/i,                                     // shit, shiit
  /\bb+i+t+c+h+\b/i,                                   // bitch
  /\ba+s+s+h+o+l+e+\b/i,                               // asshole
  /\bd+i+c+k+\b/i,                                     // dick
  /\bp+u+s+s+y+\b/i,                                   // pussy
  /\bc+u+n+t+\b/i,                                     // cunt
  /\bs+l+u+t+\b/i,                                     // slut
  /\bw+h+o+r+e+\b/i,                                   // whore
  /\bb+a+s+t+a+r+d+\b/i,                               // bastard
  /\bn+i+g+g+[a|e]+r*\b/i                              // nigger, nigga
];

// ข้อความคำหยาบแบบคำเดี่ยว (Exact string matches)
const EXACT_BAD_WORDS = [
  'ควย', 'เย็ด', 'เหี้ย', 'เฮี้ย', 'สัส', 'สัด', 'ไอ้สัส', 'ห่าราก',
  'จัญไร', 'จังไร', 'ดอกทอง', 'กะหรี่', 'กระหรี่', 'ตอแหล', 'เสือก',
  'สันดาน', 'ระยำ', 'ชาติชั่ว', 'บัดซบ', 'หน้าด้าน', 'พ่องตาย', 'แม่มึงตาย',
  'เงี่ยน', 'หงี่', 'แตด', 'หมอย',
  'fuck', 'fucking', 'fucker', 'shit', 'bitch', 'asshole', 'dick', 'pussy', 'cunt', 'slut', 'whore'
];

/**
 * Normalizes input text to catch obfuscated bypasses like 'ค_ว_ย' or zero-width chars
 * @param {string} text 
 * @returns {string}
 */
export function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u200B-\u200D\uFEFF]/g, '') // remove zero-width spaces
    .replace(/[_\-*~+=|\\/]/g, ' ')         // replace punctuation separators with spaces
    .trim();
}

/**
 * Checks whether text contains any forbidden or profane words
 * @param {string} text 
 * @returns {boolean}
 */
export function containsBadWords(text) {
  if (!text || typeof text !== 'string') return false;

  const trimmed = text.trim();
  if (!trimmed) return false;

  // Check direct regex patterns
  for (const pattern of BAD_WORDS_PATTERNS) {
    if (pattern.test(trimmed)) {
      return true;
    }
  }

  // Check normalized compacted text (e.g. "ค ว ย" -> "ควย")
  const compacted = trimmed.replace(/\s+/g, '');
  for (const pattern of BAD_WORDS_PATTERNS) {
    if (pattern.test(compacted)) {
      return true;
    }
  }

  return false;
}

/**
 * Replaces bad words in text with '***' (Censorship)
 * @param {string} text 
 * @returns {string}
 */
export function censorBadWords(text) {
  if (!text || typeof text !== 'string') return '';
  let result = text;

  for (const pattern of BAD_WORDS_PATTERNS) {
    result = result.replace(new RegExp(pattern, 'gi'), (match) => {
      return '*'.repeat(Math.min(match.length, 5) || 3);
    });
  }

  return result;
}

/**
 * Returns list of matched bad words (for audit logging)
 * @param {string} text 
 * @returns {string[]}
 */
export function findBadWords(text) {
  if (!text || typeof text !== 'string') return [];
  const found = new Set();
  const trimmed = text.trim();

  for (const pattern of BAD_WORDS_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      found.add(match[0]);
    }
  }

  return Array.from(found);
}

