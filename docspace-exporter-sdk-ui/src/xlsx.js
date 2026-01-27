import * as XLSX from "xlsx";

export function makeSampleRows() {
  return [
    { id: 1, name: "Alice", created_at: new Date().toISOString() },
    { id: 2, name: "Bob", created_at: new Date().toISOString() }
  ];
}

export function rowsToXlsxBlob({ sheetName = "Daily", rows }) {
  const worksheet = XLSX.utils.json_to_sheet(rows || []);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  const array = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return new Blob([array], { type: mime });
}

export function defaultFileName(prefix = "daily") {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  return `${prefix}-${yyyy}-${mm}-${dd}-${hh}${mi}.xlsx`;
}
