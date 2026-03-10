const textEncoder = new TextEncoder();

export function safeEqualText(leftRaw, rightRaw) {
  const left = String(leftRaw ?? "");
  const right = String(rightRaw ?? "");
  if (!left || !right) return false;

  const lhs = textEncoder.encode(left);
  const rhs = textEncoder.encode(right);
  const lhsLen = lhs.length;
  const rhsLen = rhs.length;
  const maxLen = Math.max(lhsLen, rhsLen, 1);
  let diff = lhsLen ^ rhsLen;

  for (let i = 0; i < maxLen; i += 1) {
    const a = i < lhsLen ? lhs[i] : 0;
    const b = i < rhsLen ? rhs[i] : 0;
    diff |= a ^ b;
  }

  return diff === 0;
}
