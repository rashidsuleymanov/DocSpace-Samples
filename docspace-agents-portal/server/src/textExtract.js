import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import xlsx from "xlsx";

function guessExt(name) {
  const n = String(name || "").toLowerCase();
  const idx = n.lastIndexOf(".");
  return idx >= 0 ? n.slice(idx + 1) : "";
}

export async function extractText({ fileName, contentType, buffer }) {
  const ext = guessExt(fileName);
  const ct = String(contentType || "").toLowerCase();

  if (!buffer || !buffer.length) return "";

  if (ct.startsWith("text/") || ["txt", "md", "csv", "json"].includes(ext)) {
    return buffer.toString("utf8");
  }

  if (ext === "pdf" || ct.includes("pdf")) {
    const data = await pdfParse(buffer);
    return String(data?.text || "");
  }

  if (ext === "docx" || ct.includes("wordprocessingml")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return String(value || "");
  }

  if (ext === "xlsx" || ext === "xls" || ct.includes("spreadsheetml")) {
    const wb = xlsx.read(buffer, { type: "buffer" });
    const parts = [];
    for (const name of wb.SheetNames || []) {
      const sheet = wb.Sheets[name];
      const text = xlsx.utils.sheet_to_csv(sheet, { blankrows: false });
      if (text) {
        parts.push(`# ${name}\n${text}`);
      }
    }
    return parts.join("\n\n");
  }

  return "";
}

