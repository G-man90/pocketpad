export function normalizeCode(value) {
  const code = String(value).trim().toUpperCase();
  if (!/^[A-Z]{5}$/.test(code))
    throw Error("Enter the five letters shown on your laptop.");
  return code;
}
export function codeLink(value) {
  const code = normalizeCode(value);
  return `http://pocketpad-${code.toLowerCase()}.local:3210/#code=${code}`;
}
export function localCompanion(location) {
  return location.protocol === "http:" && location.port === "3210";
}
