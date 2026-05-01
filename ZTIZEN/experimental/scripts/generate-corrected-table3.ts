#!/usr/bin/env tsx

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface BaselineStats {
  mean: number;
  std: number;
  count: number;
}

interface BaselineData {
  library: string;
  embeddingDim: number;
  scenarios: {
    samePerson: BaselineStats;
    differentPerson: BaselineStats;
  };
}

const baselineDir = path.join(__dirname, '../results/baseline-similarity');

const models = [
  { file: 'facenet_baseline.json', name: 'FaceNet-128' },
  { file: 'facenet512_baseline.json', name: 'FaceNet-512' },
  { file: 'arcface_baseline.json', name: 'ArcFace' },
  { file: 'faceapijs_baseline.json', name: 'Face-api.js' },
];

// Transformed data from your experiment results
const transformedData = {
  'FaceNet-128': { samePerson: { mean: 0.7286, std: 0.088 }, differentPerson: { mean: 0.524, std: 0.0588 } },
  'FaceNet-512': { samePerson: { mean: 0.7231, std: 0.0906 }, differentPerson: { mean: 0.512, std: 0.0662 } },
  'ArcFace': { samePerson: { mean: 0.6942, std: 0.0968 }, differentPerson: { mean: 0.5169, std: 0.0596 } },
  'Face-api.js': { samePerson: { mean: 0.9059, std: 0.0305 }, differentPerson: { mean: 0.8131, std: 0.0349 } },
};

console.log('\n='.repeat(80));
console.log('TABLE III (CORRECTED): Similarity Score Before and After Transformation');
console.log('='.repeat(80));
console.log();

// Print Markdown table
console.log('| Embedding Model | **Before Transformation** | **After Transformation (Same Person)** | **After Transformation (Different Person)** |');
console.log('|-----------------|:-------------------------:|:--------------------------------------:|:-------------------------------------------:|');

for (const model of models) {
  const filePath = path.join(baselineDir, model.file);

  if (!fs.existsSync(filePath)) {
    console.error(`⚠️  File not found: ${filePath}`);
    continue;
  }

  const data: BaselineData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const transformed = transformedData[model.name as keyof typeof transformedData];

  // Before transformation: show both same-person and different-person
  const beforeSame = (data.scenarios.samePerson.mean * 100).toFixed(2);
  const beforeSameStd = (data.scenarios.samePerson.std * 100).toFixed(2);
  const beforeDiff = (data.scenarios.differentPerson.mean * 100).toFixed(2);
  const beforeDiffStd = (data.scenarios.differentPerson.std * 100).toFixed(2);

  // After transformation
  const afterSame = (transformed.samePerson.mean * 100).toFixed(2);
  const afterSameStd = (transformed.samePerson.std * 100).toFixed(2);
  const afterDiff = (transformed.differentPerson.mean * 100).toFixed(2);
  const afterDiffStd = (transformed.differentPerson.std * 100).toFixed(2);

  console.log(
    `| ${model.name.padEnd(15)} | Same: **${beforeSame}% ± ${beforeSameStd}%**<br>Diff: **${beforeDiff}% ± ${beforeDiffStd}%** | **${afterSame}% ± ${afterSameStd}%** | **${afterDiff}% ± ${afterDiffStd}%** |`
  );
}

console.log();
console.log('---');
console.log();

// Print detailed explanation
console.log('## 📊 Key Observations:');
console.log();

for (const model of models) {
  const filePath = path.join(baselineDir, model.file);
  if (!fs.existsSync(filePath)) continue;

  const data: BaselineData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const transformed = transformedData[model.name as keyof typeof transformedData];

  const beforeSame = data.scenarios.samePerson.mean * 100;
  const afterSame = transformed.samePerson.mean * 100;
  const improvement = afterSame - beforeSame;

  console.log(`### ${model.name}:`);
  console.log(`- **Before (Same Person):** ${beforeSame.toFixed(2)}%`);
  console.log(`- **After (Same Person):** ${afterSame.toFixed(2)}%`);
  console.log(`- **Improvement:** ${improvement >= 0 ? '+' : ''}${improvement.toFixed(2)}% → ${improvement >= 0 ? '✅ LOSSLESS' : '⚠️ DEGRADATION'}`);
  console.log();
}

console.log('---');
console.log();

// Print LaTeX table
console.log('## 📄 LaTeX Format:');
console.log();
console.log('```latex');
console.log('\\begin{table}[htbp]');
console.log('\\centering');
console.log('\\caption{Similarity Score Before and After Transformation}');
console.log('\\label{tab:similarity_comparison}');
console.log('\\begin{tabular}{lcccc}');
console.log('\\hline');
console.log('\\textbf{Embedding Model} & \\textbf{Before (Same)} & \\textbf{Before (Diff)} & \\textbf{After (Same)} & \\textbf{After (Diff)} \\\\');
console.log('\\hline');

for (const model of models) {
  const filePath = path.join(baselineDir, model.file);
  if (!fs.existsSync(filePath)) continue;

  const data: BaselineData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const transformed = transformedData[model.name as keyof typeof transformedData];

  const beforeSame = (data.scenarios.samePerson.mean * 100).toFixed(2);
  const beforeSameStd = (data.scenarios.samePerson.std * 100).toFixed(2);
  const beforeDiff = (data.scenarios.differentPerson.mean * 100).toFixed(2);
  const beforeDiffStd = (data.scenarios.differentPerson.std * 100).toFixed(2);
  const afterSame = (transformed.samePerson.mean * 100).toFixed(2);
  const afterSameStd = (transformed.samePerson.std * 100).toFixed(2);
  const afterDiff = (transformed.differentPerson.mean * 100).toFixed(2);
  const afterDiffStd = (transformed.differentPerson.std * 100).toFixed(2);

  console.log(`${model.name} & ${beforeSame}\\% \\pm ${beforeSameStd}\\% & ${beforeDiff}\\% \\pm ${beforeDiffStd}\\% & ${afterSame}\\% \\pm ${afterSameStd}\\% & ${afterDiff}\\% \\pm ${afterDiffStd}\\% \\\\`);
}

console.log('\\hline');
console.log('\\end{tabular}');
console.log('\\end{table}');
console.log('```');
console.log();

console.log('---');
console.log();

// Generate summary statistics
console.log('## 📈 Statistical Summary:');
console.log();
console.log('| Model | Sample Count (Same) | Sample Count (Diff) | Separation Score* |');
console.log('|-------|--------------------:|--------------------:|------------------:|');

for (const model of models) {
  const filePath = path.join(baselineDir, model.file);
  if (!fs.existsSync(filePath)) continue;

  const data: BaselineData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  const sameCount = data.scenarios.samePerson.count;
  const diffCount = data.scenarios.differentPerson.count;

  // Separation score: how well separated are the distributions
  const beforeSeparation = (data.scenarios.samePerson.mean - data.scenarios.differentPerson.mean) * 100;

  console.log(`| ${model.name} | ${sameCount.toLocaleString()} | ${diffCount.toLocaleString()} | ${beforeSeparation.toFixed(2)}% |`);
}

console.log();
console.log('*Separation Score = (Same Person Mean - Different Person Mean)');
console.log('Higher separation = Better biometric quality');
console.log();
