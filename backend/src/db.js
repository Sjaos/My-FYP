import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, "../data/db.json");
const initial = { users: [], products: [], savedItems: [], interactions: [] };
function ensure() {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file))
    fs.writeFileSync(file, JSON.stringify(initial, null, 2));
}
export function readDb() {
  ensure();
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
export function writeDb(db) {
  ensure();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(db, null, 2));
  fs.renameSync(temp, file);
}
export function mutate(fn) {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return result;
}
