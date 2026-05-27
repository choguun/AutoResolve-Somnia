import fs from 'node:fs';
import path from 'node:path';

const artifactPath = path.join(
  process.cwd(),
  'out/AutonomousPredictionMarket.sol/AutonomousPredictionMarket.json'
);
const outDir = path.join(process.cwd(), 'lib-web');
const outPath = path.join(outDir, 'abi.json');

if (!fs.existsSync(artifactPath)) {
  console.error('Run `forge build` first.');
  process.exit(1);
}

const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact.abi, null, 2));
console.log(`Exported ABI to ${outPath}`);
