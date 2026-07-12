const fs = require("fs");
const path = require("path");
const https = require("https");

const binDir = path.join(__dirname, "..", "bin");
const portableDir = path.join(binDir, "node-portable");
const nodeExePath = path.join(portableDir, "node.exe");

if (fs.existsSync(nodeExePath)) {
  console.log("[OK] Node.js portable runtime already exists in bin/node-portable.");
  process.exit(0);
}

console.log("[INFO] Node.js portable runtime not found in bin/node-portable.");
console.log("[INFO] Downloading Node.js v20.11.1 portable runtime (this might take a minute)...");

// Create bin directory if not exists
if (!fs.existsSync(binDir)) {
  fs.mkdirSync(binDir, { recursive: true });
}

const zipUrl = "https://nodejs.org/dist/v20.11.1/node-v20.11.1-win-x64.zip";
const zipPath = path.join(binDir, "node-portable.zip");

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on("finish", () => {
        file.close(resolve);
      });
    }).on("error", (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  try {
    await downloadFile(zipUrl, zipPath);
    console.log("[INFO] Download completed. Extracting...");

    // Use adm-zip to extract
    const AdmZip = require("adm-zip");
    const zip = new AdmZip(zipPath);
    
    const tempExtractDir = path.join(binDir, "node-temp");
    if (fs.existsSync(tempExtractDir)) {
      fs.rmSync(tempExtractDir, { recursive: true, force: true });
    }
    fs.mkdirSync(tempExtractDir, { recursive: true });
    
    zip.extractAllTo(tempExtractDir, true);
    
    const extractedFolderName = "node-v20.11.1-win-x64";
    const sourceDir = path.join(tempExtractDir, extractedFolderName);
    
    if (!fs.existsSync(sourceDir)) {
      throw new Error(`Expected folder ${extractedFolderName} not found in zip structure`);
    }
    
    if (fs.existsSync(portableDir)) {
      fs.rmSync(portableDir, { recursive: true, force: true });
    }
    fs.mkdirSync(portableDir, { recursive: true });
    
    // Copy all files from sourceDir to portableDir recursively
    copyFolderSync(sourceDir, portableDir);
    
    // Clean up
    fs.rmSync(tempExtractDir, { recursive: true, force: true });
    fs.unlinkSync(zipPath);
    
    console.log("[OK] Node.js portable runtime successfully installed in bin/node-portable.");
  } catch (err) {
    console.error("[ERROR] Failed to set up Node.js portable:", err.message);
    process.exit(1);
  }
}

function copyFolderSync(from, to) {
  if (!fs.existsSync(to)) {
    fs.mkdirSync(to, { recursive: true });
  }
  fs.readdirSync(from).forEach((element) => {
    const fromPath = path.join(from, element);
    const toPath = path.join(to, element);
    if (fs.lstatSync(fromPath).isDirectory()) {
      copyFolderSync(fromPath, toPath);
    } else {
      fs.copyFileSync(fromPath, toPath);
    }
  });
}

main();
