// Publication automatique (voir .github/workflows/release.yml).
//   node scripts/release.mjs bump       → passe à la version suivante (x.y.z+1) dans les 5 fichiers, écrit release-notes.txt
//   node scripts/release.mjs manifest   → écrit latest.json pour l'installeur signé de la version courante
// Aucune clé ici : la signature est faite par `tauri build` avec le secret du dépôt.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync } from "node:fs";

const REPO = "NIKAerer/NIXUS";
const read = (f) => readFileSync(f, "utf8");
const write = (f, s) => writeFileSync(f, s);
const current = () => JSON.parse(read("package.json")).version;
const output = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`);

function replaceOnce(file, re, value) {
  const s = read(file);
  if (!re.test(s)) throw new Error(`Version introuvable dans ${file}`);
  write(file, s.replace(re, (_, a, b) => `${a}${value}${b}`));
}

function bump() {
  const from = current();
  const [maj, min, pat] = from.split(".").map(Number);
  const to = `${maj}.${min}.${pat + 1}`;

  const pkg = JSON.parse(read("package.json"));
  pkg.version = to;
  write("package.json", JSON.stringify(pkg, null, 2) + "\n");
  const lock = JSON.parse(read("package-lock.json"));
  lock.version = to;
  if (lock.packages?.[""]) lock.packages[""].version = to;
  write("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  conf.version = to;
  write("src-tauri/tauri.conf.json", JSON.stringify(conf, null, 2) + "\n");
  replaceOnce("src-tauri/Cargo.toml", /(\[package\][^[]*?\nversion = ")[^"]+(")/, to);
  replaceOnce("src-tauri/Cargo.lock", /(name = "nexus-client"\nversion = ")[^"]+(")/, to);

  // Notes : les commits depuis la dernière publication (« NIXUS x.y.z »), sans les fusions.
  const log = (args) => execSync(`git log ${args}`, { encoding: "utf8" }).trim();
  const last = log(`--format=%H -1 --extended-regexp --grep="^NIXUS [0-9]+\\.[0-9]+\\.[0-9]+$"`);
  const subjects = log(`--no-merges --format=%s ${last ? `${last}..HEAD` : "-20"}`)
    .split("\n")
    .filter((s) => s && !/^NIXUS \d/.test(s) && !/captures d'écran/i.test(s));
  const notes = subjects.length ? subjects.slice(0, 8).join(" · ") : "Corrections et améliorations.";
  write("release-notes.txt", notes + "\n");

  console.log(`${from} → ${to}`);
  output("version", to);
}

function manifest() {
  const v = current();
  const exe = `NIXUS_${v}_x64-setup.exe`;
  const sig = read(`src-tauri/target/release/bundle/nsis/${exe}.sig`).trim();
  const notes = read("release-notes.txt").trim();
  const latest = {
    version: v,
    notes,
    pub_date: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    platforms: {
      "windows-x86_64": { signature: sig, url: `https://github.com/${REPO}/releases/download/v${v}/${exe}` },
    },
  };
  write("latest.json", JSON.stringify(latest, null, 2) + "\n");
  console.log(`latest.json → ${v}`);
}

const cmd = process.argv[2];
if (cmd === "bump") bump();
else if (cmd === "manifest") manifest();
else {
  console.error("usage : node scripts/release.mjs bump|manifest");
  process.exit(1);
}
