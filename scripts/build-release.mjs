/**
 * Sürüm derlemesi sarmalayıcısı.
 *
 * Rust, panik mesajlarına kaynak dosya yollarını gömer. Bu yollar derleyen
 * bilgisayarın ev dizinini içerdiğinden (ör. C:\Users\<kullanıcı>\.cargo\...),
 * dağıtılan .exe dosyası Windows kullanıcı adını dışarı sızdırır.
 *
 * Burada --remap-path-prefix ile ev dizini ve kayıt defteri yolları anonim
 * karşılıklarıyla değiştirilir. Kullanıcı adı hiçbir dosyaya yazılmaz;
 * çalışma anında os.homedir() ile okunur.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();
const cargoHome = process.env.CARGO_HOME || join(home, ".cargo");

const remaps = [
  `--remap-path-prefix=${cargoHome}=/cargo`,
  `--remap-path-prefix=${home}=/home`,
];

const rustflags = [process.env.RUSTFLAGS, ...remaps].filter(Boolean).join(" ");

console.log("Kaynak yolları anonimleştiriliyor:");
for (const remap of remaps) {
  console.log("  " + remap.replace(home, "<ev-dizini>"));
}

const child = spawn("npm", ["exec", "--", "tauri", "build", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, RUSTFLAGS: rustflags },
});

child.on("exit", (code) => process.exit(code ?? 1));
