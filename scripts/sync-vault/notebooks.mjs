import { writeFileSync } from "node:fs";
import path from "node:path";
import { ensureParentDir } from "./fs-utils.mjs";
import { parseFrontmatter } from "./markdown.mjs";

function asNotebookText(value) {
  return Array.isArray(value) ? value.join("") : String(value ?? "");
}

function escapeHtml(input) {
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function makeCodeFence(source) {
  const longestFence = source.match(/`{3,}/g)?.reduce((max, fence) => Math.max(max, fence.length), 0) ?? 0;
  return "`".repeat(Math.max(3, longestFence + 1));
}

function decodeBase64Data(data) {
  return Buffer.from(String(data).replace(/\s/g, ""), "base64");
}

export function notebookTitle(notebook, fallbackTitle) {
  for (const cell of notebook.cells ?? []) {
    if (cell.cell_type !== "markdown") {
      continue;
    }

    const heading = asNotebookText(cell.source)
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("# "));

    if (heading) {
      return heading.replace(/^#\s+/, "").trim();
    }
  }

  return fallbackTitle;
}

function isRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value);
}

function pickNotebookNoteMetadata(notebook) {
  const metadata = isRecord(notebook.metadata) ? notebook.metadata : {};
  const notegenMetadata = isRecord(metadata.notegen) ? metadata.notegen : {};
  const scopedNotegenMetadata = isRecord(notegenMetadata.note) ? notegenMetadata.note : notegenMetadata;
  const rootMetadata = {};

  for (const key of ["title", "slug", "description", "date", "draft", "status"]) {
    if (metadata[key] !== undefined) {
      rootMetadata[key] = metadata[key];
    }
  }

  return {
    ...rootMetadata,
    ...scopedNotegenMetadata
  };
}

export function notebookNoteFrontmatter(notebook, markdown, fallbackTitle) {
  const parsedMarkdown = parseFrontmatter(markdown);
  const metadata = pickNotebookNoteMetadata(notebook);
  const data = {
    ...metadata,
    ...parsedMarkdown.data
  };

  return {
    data: {
      ...data,
      title: data.title || notebookTitle(notebook, fallbackTitle)
    },
    body: parsedMarkdown.body
  };
}

function getNotebookLanguage(notebook) {
  return notebook.metadata?.language_info?.name || notebook.metadata?.kernelspec?.language || "python";
}

export function createNotebookConverter({ assetsRoot, publicBasePath }) {
  function writeNotebookImageOutput(data, mimeType, publicScope, cellIndex, outputIndex) {
    const extension = mimeType === "image/svg+xml" ? "svg" : mimeType.split("/").at(-1) || "png";
    const filename = `notebook-output-${cellIndex + 1}-${outputIndex + 1}.${extension}`;
    const outputPath = path.join(assetsRoot, publicScope, filename);

    ensureParentDir(outputPath);
    if (mimeType === "image/svg+xml") {
      writeFileSync(outputPath, asNotebookText(data), "utf8");
    } else {
      writeFileSync(outputPath, decodeBase64Data(asNotebookText(data)));
    }

    return `${publicBasePath}/generated/notes/${publicScope}/${filename}`;
  }

  function renderNotebookOutput(output, publicScope, cellIndex, outputIndex) {
    const outputType = output.output_type;

    if (outputType === "stream") {
      const text = asNotebookText(output.text).trimEnd();
      return text ? `<pre class="notebook-output notebook-output-stream"><code>${escapeHtml(text)}</code></pre>` : "";
    }

    if (outputType === "error") {
      const traceback = Array.isArray(output.traceback) ? output.traceback.join("\n") : `${output.ename ?? "Error"}: ${output.evalue ?? ""}`;
      return `<pre class="notebook-output notebook-output-error"><code>${escapeHtml(traceback.trimEnd())}</code></pre>`;
    }

    if (outputType !== "display_data" && outputType !== "execute_result") {
      return "";
    }

    const data = output.data ?? {};
    const imageMime = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"].find((mimeType) => data[mimeType]);
    if (imageMime) {
      const imageUrl = writeNotebookImageOutput(data[imageMime], imageMime, publicScope, cellIndex, outputIndex);
      return `<p class="notebook-output notebook-output-image"><img src="${imageUrl}" alt="Notebook output"></p>`;
    }

    if (data["text/html"]) {
      return `<div class="notebook-output notebook-output-html">${asNotebookText(data["text/html"])}</div>`;
    }

    if (data["text/markdown"]) {
      return asNotebookText(data["text/markdown"]).trim();
    }

    if (data["text/plain"]) {
      return `<pre class="notebook-output notebook-output-plain"><code>${escapeHtml(asNotebookText(data["text/plain"]).trimEnd())}</code></pre>`;
    }

    return "";
  }

  function notebookToMarkdown(raw, publicScope) {
    const notebook = JSON.parse(raw);
    const language = getNotebookLanguage(notebook);
    const chunks = [];

    for (const [cellIndex, cell] of (notebook.cells ?? []).entries()) {
      const source = asNotebookText(cell.source).trimEnd();

      if (cell.cell_type === "markdown") {
        if (source) {
          chunks.push(source);
        }
        continue;
      }

      if (cell.cell_type !== "code") {
        continue;
      }

      if (source) {
        const fence = makeCodeFence(source);
        chunks.push(`${fence}${language}\n${source}\n${fence}`);
      }

      const outputs = (cell.outputs ?? [])
        .map((output, outputIndex) => renderNotebookOutput(output, publicScope, cellIndex, outputIndex))
        .filter(Boolean);

      chunks.push(...outputs);
    }

    return {
      notebook,
      markdown: chunks.join("\n\n").trim()
    };
  }

  return {
    notebookToMarkdown
  };
}
