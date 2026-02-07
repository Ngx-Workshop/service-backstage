const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

/**
 * Normalize for comparison only
 */
function norm(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Explicit overrides (Devicon → GitHub)
 * This is the ONLY place you should hand-maintain things.
 */
const OVERRIDES = {
  csharp: 'C#',
  cplusplus: 'C++',
  fsharp: 'F#',
  objectivec: 'Objective-C',
  objectivecplusplus: 'Objective-C++',
  jupyter: 'Jupyter Notebook',
  bash: 'Shell',
  go: 'Go',
};

/**
 * Load files
 */
const devicon = JSON.parse(fs.readFileSync('./devicon.json', 'utf8'));
const linguist = yaml.load(fs.readFileSync('./languages.yml', 'utf8'));

const githubLanguages = Object.keys(linguist);

/**
 * Build index:
 * normalized GitHub language → original GitHub language
 */
const githubIndex = new Map();
for (const lang of githubLanguages) {
  githubIndex.set(norm(lang), lang);
}

/**
 * Main transform
 */
const result = {};
const unmatched = [];
const ambiguous = [];

for (const entry of devicon) {
  const deviconName = entry.name;

  // 1) explicit override wins
  if (OVERRIDES[deviconName]) {
    result[deviconName] = OVERRIDES[deviconName];
    continue;
  }

  // 2) attempt direct name match
  const candidates = [deviconName, ...(entry.altnames ?? [])];

  const matches = new Set();

  for (const c of candidates) {
    const hit = githubIndex.get(norm(c));
    if (hit) matches.add(hit);
  }

  if (matches.size === 0) {
    unmatched.push(deviconName);
    continue;
  }

  if (matches.size > 1) {
    ambiguous.push({
      devicon: deviconName,
      github: Array.from(matches),
    });
    continue;
  }

  result[deviconName] = Array.from(matches)[0];
}

/**
 * Write outputs
 */
fs.writeFileSync(
  './deviconToGithubLanguage.json',
  JSON.stringify(result, null, 2),
  'utf8'
);

fs.writeFileSync(
  './unmatched-devicon.json',
  JSON.stringify(unmatched.sort(), null, 2),
  'utf8'
);

fs.writeFileSync(
  './ambiguous-devicon.json',
  JSON.stringify(ambiguous, null, 2),
  'utf8'
);

console.log('✅ Wrote deviconToGithubLanguage.json');
console.log('🟡 Unmatched devicons:', unmatched.length);
console.log('🔴 Ambiguous devicons:', ambiguous.length);
console.log('📌 Total devicons:', devicon.length);
console.log('📌 Mapped 1:1:', Object.keys(result).length);
