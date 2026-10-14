const { HOME } = require('./paths');

function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(day, n) {
  const d = new Date(day + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

// "C:\Users\me\Desktop\my-app\web" -> "my-app/web"
function projectName(cwd) {
  if (!cwd) return 'unknown';
  let rel = cwd;
  if (rel.toLowerCase().startsWith(HOME.toLowerCase())) rel = rel.slice(HOME.length);
  const parts = rel.split(/[\\/]+/).filter((p) => p && !/^[a-z]:$/i.test(p));
  while (parts.length > 1 && /^(desktop|documents|projects|repos|code|src|dev)$/i.test(parts[0])) parts.shift();
  if (!parts.length) return '~';
  return parts.slice(0, 2).join('/');
}

async function readJson(file) {
  try { return JSON.parse(await require('fs/promises').readFile(file, 'utf8')); } catch { return null; }
}

module.exports = { dayKey, addDays, projectName, readJson };
