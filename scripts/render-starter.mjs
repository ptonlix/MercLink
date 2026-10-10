import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const sourceRoot = path.join(process.cwd(), "src");
const outputRoot = path.join(process.cwd(), "node_modules/.cache/merclink-starter");
rmSync(outputRoot, { recursive: true, force: true });
const emitted = new Map();

function sourceFile(specifier, parentFile) {
  const base = specifier.startsWith(".") ? path.resolve(path.dirname(parentFile), specifier) : null;
  if (base === null) {
    return null;
  }
  const candidates = [".tsx", ".ts"].flatMap((extension) => [
    `${base}${extension}`,
    path.join(base, `index${extension}`),
  ]);
  return candidates.find((candidate) => {
    try {
      readFileSync(candidate);
      return true;
    } catch {
      return false;
    }
  });
}

function emit(file) {
  if (emitted.has(file)) {
    return emitted.get(file);
  }
  const relative = path.relative(sourceRoot, file);
  const output = path.join(outputRoot, relative).replace(/\.tsx?$/, ".mjs");
  emitted.set(file, output);
  const source = readFileSync(file, "utf8").replace(/^"use client";\s*/, "");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: file,
  });
  const rewritten = transpiled.outputText.replace(
    /(from\s+["'])(\.[^"']+)(["'])/g,
    (_match, open, specifier, close) => {
      const imported = sourceFile(specifier, file);
      if (imported === undefined || imported === null) {
        return `${open}${specifier}${close}`;
      }
      const importedOutput = emit(imported);
      const relativeImport = path
        .relative(path.dirname(output), importedOutput)
        .split(path.sep)
        .join("/");
      return `${open}${relativeImport.startsWith(".") ? relativeImport : `./${relativeImport}`}${close}`;
    },
  );
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, rewritten);
  return output;
}

const entry = emit(path.join(sourceRoot, "public-discovery/render-starter.tsx"));
const { renderStarterFragments } = await import(pathToFileURL(entry).href);
process.stdout.write(JSON.stringify(renderStarterFragments()));
