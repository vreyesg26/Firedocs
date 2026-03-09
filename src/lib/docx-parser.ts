import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import type {
  ManualExtract,
  PiezasGrupo,
  PiezasItem,
  KeyValueField,
  UISection,
  CommunicationMatrixRow,
  BackupTableGroup,
  BackupProcedureRow,
  InstallationTableGroup,
  InstallationProcedureRow,
} from "@/types/manual";

type SupportedInput =
  | Uint8Array
  | ArrayBufferLike
  | ArrayBufferView
  | { type: "Buffer"; data: number[] };

function normalize(s: string) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function normalizeSearch(s: string) {
  return normalize(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toUint8Array(input: SupportedInput): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input as any))
    return new Uint8Array((input as ArrayBufferView).buffer);
  if ((input as any)?.type === "Buffer" && Array.isArray((input as any).data)) {
    return Uint8Array.from((input as any).data);
  }
  return new Uint8Array(input as ArrayBufferLike);
}

function walkPreserveOrder(node: any, ordered: any[]) {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) walkPreserveOrder(item, ordered);
    return;
  }

  if (typeof node !== "object") return;

  for (const [key, value] of Object.entries(node)) {
    if (key === ":@") continue;

    if (key === "w:p") {
      ordered.push({ type: "p", node: value });
    } else if (key === "w:tbl") {
      ordered.push({ type: "tbl", node: value });
    }

    walkPreserveOrder(value, ordered);
  }
}

function collectNodesByKey(node: any, key: string, out: any[] = []): any[] {
  if (!node) return out;

  if (Array.isArray(node)) {
    for (const n of node) collectNodesByKey(n, key, out);
    return out;
  }

  if (typeof node !== "object") return out;

  for (const [k, v] of Object.entries(node)) {
    if (k === ":@") continue;
    if (k === key) out.push(v);
    collectNodesByKey(v, key, out);
  }

  return out;
}

function extractTextPreserveOrder(node: any): string {
  if (node == null) return "";
  if (typeof node === "string") return node;

  if (Array.isArray(node)) {
    return node.map((n) => extractTextPreserveOrder(n)).join("");
  }

  if (typeof node !== "object") return "";

  if (typeof node["#text"] === "string") return node["#text"];

  let out = "";
  for (const [k, v] of Object.entries(node)) {
    if (k === ":@") continue;
    out += extractTextPreserveOrder(v);
  }
  return out;
}

function textFromParagraphPO(pNode: any): string {
  return extractTextPreserveOrder(pNode);
}

function normalizeKeepLineBreaks(value: string) {
  return (value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => normalize(line))
    .filter((line, index, all) => {
      if (line.length > 0) return true;
      const previous = all[index - 1];
      const next = all[index + 1];
      return Boolean(previous?.length) && Boolean(next?.length);
    })
    .join("\n")
    .trim();
}

function tableFromPreserveOrder(tblNode: any): string[][] {
  const rows: string[][] = [];
  const trNodes = Array.isArray(tblNode)
    ? tblNode.filter((n: any) => n && typeof n === "object" && n["w:tr"]).map((n: any) => n["w:tr"])
    : [];

  for (const tr of trNodes) {
    const tcNodes = Array.isArray(tr)
      ? tr.filter((n: any) => n && typeof n === "object" && n["w:tc"]).map((n: any) => n["w:tc"])
      : [];

    const row: string[] = [];
    for (const tc of tcNodes) {
      const paras = collectNodesByKey(tc, "w:p");
      const cellText = normalizeKeepLineBreaks(
        paras.map((p) => textFromParagraphPO(p)).join("\n"),
      );
      row.push(cellText);
    }

    if (row.some(Boolean)) rows.push(row);
  }

  return rows;
}

function rowIncludesText(row: string[], text: string) {
  return row.some((cell) => normalizeSearch(cell).includes(normalizeSearch(text)));
}

function compactRow(row: string[]) {
  return row.map((cell) => normalize(cell)).filter(Boolean);
}

function normalizeRowKeepingColumns(row: string[]) {
  return row.map((cell) => normalizeKeepLineBreaks(cell));
}

function combineBackupCellValues(values: string[]) {
  return values
    .map((value) => normalize(value))
    .filter(Boolean)
    .join(" | ");
}

function extractBackupTableGroup(table: string[][]): BackupTableGroup | null {
  if (!table.length) return null;

  const headerOneIndex = table.findIndex(
    (row) =>
      rowIncludesText(row, "Equipo encargado de respaldo") &&
      rowIncludesText(row, "Base de datos/Directorio") &&
      rowIncludesText(row, "Aplicativo"),
  );
  if (headerOneIndex === -1) return null;

  const headerTwoIndex = table.findIndex(
    (row, index) =>
      index > headerOneIndex &&
      rowIncludesText(row, "Paso") &&
      rowIncludesText(row, "Objeto a respaldar"),
  );
  const headerThreeIndex = table.findIndex(
    (row, index) =>
      index > headerOneIndex &&
      rowIncludesText(row, "Servidor (Nombre, IP)") &&
      rowIncludesText(row, "Comentarios adicionales"),
  );

  if (headerTwoIndex === -1 || headerThreeIndex === -1) return null;

  const firstDataRow = compactRow(table[headerOneIndex + 1] ?? []);
  if (firstDataRow.length < 3) return null;

  const procedureRows: BackupProcedureRow[] = table
    .slice(headerTwoIndex + 1, headerThreeIndex)
    .map((row) => compactRow(row))
    .filter((row) => row.length > 0)
    .map((row) => ({
      step: row[0] ?? "",
      objectToBackup:
        row.length > 1 ? combineBackupCellValues(row.slice(1)) : "",
    }))
    .filter((row) => row.step || row.objectToBackup);

  if (!procedureRows.length) return null;

  const footerRows = table
    .slice(headerThreeIndex + 1)
    .map((row) => compactRow(row))
    .filter((row) => row.length > 0);

  return {
    title: "",
    headerOne: {
      responsibleTeam: firstDataRow[0] ?? "",
      databaseOrDirectory: firstDataRow[1] ?? "",
      application: firstDataRow[2] ?? "",
    },
    procedureRows,
    headerThree: {
      server: combineBackupCellValues(footerRows.map((row) => row[0] ?? "")),
      additionalComments: combineBackupCellValues(
        footerRows.map((row) =>
          row.length > 1 ? combineBackupCellValues(row.slice(1)) : "",
        ),
      ),
    },
  };
}

function extractFixBackupTableGroup(table: string[][]): BackupTableGroup | null {
  if (!table.length) return null;

  const headerOneIndex = table.findIndex(
    (row) =>
      rowIncludesText(row, "Equipo encargado de respaldo") &&
      rowIncludesText(row, "Base de datos/Directorio") &&
      rowIncludesText(row, "Aplicativo"),
  );
  if (headerOneIndex === -1) return null;

  const headerTwoIndex = table.findIndex(
    (row, index) =>
      index > headerOneIndex &&
      rowIncludesText(row, "Paso") &&
      rowIncludesText(row, "Objeto a respaldar"),
  );
  const headerThreeIndex = table.findIndex(
    (row, index) =>
      index > headerTwoIndex &&
      rowIncludesText(row, "Aplicativo a implementar") &&
      rowIncludesText(row, "Comentarios adicionales"),
  );

  if (headerTwoIndex === -1 || headerThreeIndex === -1) return null;

  const firstDataRow = compactRow(table[headerOneIndex + 1] ?? []);
  if (firstDataRow.length < 3) return null;

  const procedureRows: BackupProcedureRow[] = table
    .slice(headerTwoIndex + 1, headerThreeIndex)
    .map((row) => compactRow(row))
    .filter((row) => row.length > 0)
    .map((row) => ({
      step: row[0] ?? "",
      objectToBackup:
        row.length > 1 ? combineBackupCellValues(row.slice(1)) : "",
    }))
    .filter((row) => row.step || row.objectToBackup);

  const footerRows = table
    .slice(headerThreeIndex + 1)
    .map((row) => compactRow(row))
    .filter((row) => row.length > 0);

  return {
    title: "",
    headerOne: {
      responsibleTeam: firstDataRow[0] ?? "",
      databaseOrDirectory: firstDataRow[1] ?? "",
      application: firstDataRow[2] ?? "",
    },
    procedureRows,
    headerThree: {
      server: combineBackupCellValues(footerRows.map((row) => row[0] ?? "")),
      additionalComments: combineBackupCellValues(
        footerRows.map((row) =>
          row.length > 1 ? combineBackupCellValues(row.slice(1)) : "",
        ),
      ),
    },
  };
}

function extractInstallationTableGroup(table: string[][]): InstallationTableGroup | null {
  if (!table.length) return null;

  const headerOneIndex = table.findIndex(
    (row) =>
      rowIncludesText(row, "Equipo Implementador") &&
      rowIncludesText(row, "Rama de Integración") &&
      rowIncludesText(row, "Repositorio"),
  );
  if (headerOneIndex === -1) return null;

  const headerTwoIndex = table.findIndex(
    (row, index) =>
      index > headerOneIndex &&
      rowIncludesText(row, "Paso") &&
      rowIncludesText(row, "Objeto a instalar") &&
      rowIncludesText(row, "Ruta en Versionador"),
  );
  const headerThreeIndex = table.findIndex(
    (row, index) =>
      index > headerTwoIndex &&
      rowIncludesText(row, "Base de datos/Directorio") &&
      rowIncludesText(row, "Servidor"),
  );
  const headerFourIndex = table.findIndex(
    (row, index) =>
      index > headerThreeIndex &&
      rowIncludesText(row, "Aplicativo a implementar") &&
      rowIncludesText(row, "Comentarios adicionales"),
  );

  if (
    headerTwoIndex === -1 ||
    headerThreeIndex === -1 ||
    headerFourIndex === -1
  ) {
    return null;
  }

  const firstDataRow = normalizeRowKeepingColumns(table[headerOneIndex + 1] ?? []);
  if (firstDataRow.length < 3) return null;

  const procedureRows: InstallationProcedureRow[] = table
    .slice(headerTwoIndex + 1, headerThreeIndex)
    .map((row) => normalizeRowKeepingColumns(row))
    .filter((row) => row.some(Boolean))
    .map((row) => ({
      step: row[0] ?? "",
      objectToInstall: row[1] ?? "",
      versionerPath: row[2] ?? "",
    }))
    .filter(
      (row) => row.step || row.objectToInstall || row.versionerPath,
    );

  if (!procedureRows.length) return null;

  const headerThreeDataRow = normalizeRowKeepingColumns(
    table[headerThreeIndex + 1] ?? [],
  );
  const headerFourDataRow = normalizeRowKeepingColumns(
    table[headerFourIndex + 1] ?? [],
  );

  return {
    title: "",
    headerOne: {
      implementingTeam: firstDataRow[0] ?? "",
      integrationBranch: firstDataRow[1] ?? "",
      repository: firstDataRow[2] ?? "",
    },
    procedureRows,
    headerThree: {
      databaseOrDirectory: headerThreeDataRow[0] ?? "",
      server: headerThreeDataRow[1] ?? "",
    },
    headerFour: {
      applicationToImplement: headerFourDataRow[0] ?? "",
      additionalComments: headerFourDataRow[1] ?? "",
    },
  };
}

export async function parseDocxArrayBuffer(
  input: SupportedInput
): Promise<ManualExtract> {
  const bytes = toUint8Array(input);

  const zip = await JSZip.loadAsync(bytes);
  const docXml = await zip.file("word/document.xml")?.async("string");
  if (!docXml) throw new Error("No se encontró word/document.xml");

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
  });
  const xml: any = parser.parse(docXml);

  const orderedParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    preserveOrder: true,
  });
  const orderedXml: any[] = orderedParser.parse(docXml);

  const body = xml?.["w:document"]?.["w:body"];
  if (!body) throw new Error("Estructura DOCX no reconocida");

  const paragraphs: string[] = [];
  const tables: string[][][] = [];

  const orderedNodes: Array<{ type: "p" | "tbl"; node: any }> = [];
  const orderedBody =
    orderedXml
      ?.find((n: any) => n?.["w:document"])
      ?.["w:document"]?.find((n: any) => n?.["w:body"])
      ?.["w:body"] ?? [];
  walkPreserveOrder(orderedBody, orderedNodes);

  for (const item of orderedNodes) {
    if (item.type === "p") {
      const t = normalize(textFromParagraphPO(item.node));
      if (t) paragraphs.push(t);
    } else {
      const table = tableFromPreserveOrder(item.node);
      if (table.length) tables.push(table);
    }
  }

  const camposDetectados: KeyValueField[] = [];
  const kvRegex = /^([^:]{2,80}):\s*(.+)$/;
  for (const line of paragraphs) {
    const m = line.match(kvRegex);
    if (m)
      camposDetectados.push({ key: normalize(m[1]), value: normalize(m[2]) });
  }

  function splitRepositoryValues(value: string): string[] {
    return Array.from(
      new Set(
        normalize(value)
          .split(",")
          .map((item) => normalize(item))
          .filter(Boolean),
      ),
    );
  }

  function extractRepositoryNamesFromParagraphs(values: string[]): string[] {
    const reposStartIndex = values.findIndex((line) =>
      normalizeSearch(line).includes("nombre de repositorios"),
    );
    if (reposStartIndex === -1) return [];

    const stopMatchers = [
      "matriz de comunicacion del area solicitante",
      "requisitos y trabajos que deben estar completados",
      "respaldo de objetos",
      "pasos requeridos para la instalacion",
      "pasos requeridos para la implementacion",
    ];

    const out: string[] = [];
    for (let i = reposStartIndex + 1; i < values.length; i += 1) {
      const raw = values[i];
      const line = normalize(raw);
      if (!line) continue;

      const normalizedLine = normalizeSearch(line);
      if (stopMatchers.some((matcher) => normalizedLine.includes(matcher))) {
        break;
      }

      if (
        normalizedLine.includes("informacion de programas para instalar") ||
        normalizedLine.includes("nombre de repositorios")
      ) {
        continue;
      }

      out.push(line);
    }

    return Array.from(new Set(out));
  }

  function findCommunicationMatrixTable(
    ordered: Array<{ type: "p" | "tbl"; node: any }>,
  ): string[][] | null {
    for (let i = 0; i < ordered.length; i += 1) {
      const item = ordered[i];
      if (item.type !== "p") continue;

      const title = normalizeSearch(textFromParagraphPO(item.node));
      if (!title.includes("matriz de comunicacion del area solicitante")) {
        continue;
      }

      for (let j = i + 1; j < ordered.length; j += 1) {
        const next = ordered[j];
        if (next.type === "p") {
          const paragraphText = normalize(textFromParagraphPO(next.node));
          if (paragraphText) continue;
        }

        if (next.type === "tbl") {
          const table = tableFromPreserveOrder(next.node);
          const header = table[0]?.map((cell) => normalizeSearch(cell)) ?? [];
          const hasRequiredColumns =
            header.some((cell) => cell === "pais") &&
            header.some((cell) => cell.includes("desarrollador")) &&
            header.some((cell) => cell.includes("aplicacion")) &&
            header.some((cell) => cell.includes("jefe"));

          if (hasRequiredColumns) return table;
          break;
        }
      }
    }

    return null;
  }

  function extractCommunicationMatrix(table: string[][] | null): CommunicationMatrixRow[] {
    if (!table || table.length < 2) return [];

    const header = table[0].map((cell) => normalizeSearch(cell));
    const countryIndex = header.findIndex((cell) => cell === "pais");
    const developerIndex = header.findIndex((cell) =>
      cell.includes("desarrollador"),
    );
    const applicationIndex = header.findIndex((cell) =>
      cell.includes("aplicacion"),
    );
    const bossIndex = header.findIndex((cell) => cell.includes("jefe"));

    const contactIndexes = header.reduce<number[]>((acc, cell, index) => {
      if (cell.includes("numero de contacto")) acc.push(index);
      return acc;
    }, []);

    if (
      countryIndex === -1 ||
      developerIndex === -1 ||
      applicationIndex === -1 ||
      bossIndex === -1
    ) {
      return [];
    }

    const developerContactIndex =
      contactIndexes.find((index) => index > developerIndex && index < applicationIndex) ?? -1;
    const bossContactIndex =
      contactIndexes.find((index) => index > bossIndex) ?? contactIndexes[1] ?? -1;

    return table
      .slice(1)
      .map((row) => {
        const repositories = splitRepositoryValues(row[applicationIndex] ?? "");
        return {
          country: normalize(row[countryIndex] ?? "").toUpperCase(),
          developerName: normalize(row[developerIndex] ?? ""),
          developerContact:
            developerContactIndex >= 0
              ? normalize(row[developerContactIndex] ?? "")
              : "",
          repositories,
          repositoriesInput: repositories.join(", "),
          pickerRepositories: [],
          bossName: normalize(row[bossIndex] ?? ""),
          bossContact:
            bossContactIndex >= 0 ? normalize(row[bossContactIndex] ?? "") : "",
        } satisfies CommunicationMatrixRow;
      })
      .filter(
        (row) =>
          row.country ||
          row.developerName ||
          row.developerContact ||
          row.repositories.length > 0 ||
          row.bossName ||
          row.bossContact,
      );
  }

  function extractPreviousStepsHtml(
    ordered: Array<{ type: "p" | "tbl"; node: any }>,
  ) {
    const startIndex = ordered.findIndex((item) => {
      if (item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "requisitos y trabajos que deben estar completados previo a la implementacion del cambio",
      );
    });

    if (startIndex === -1) return "";

    const endIndex = ordered.findIndex((item, index) => {
      if (index <= startIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "respaldo de objetos",
      );
    });

    const placeholder = normalizeSearch(
      "[Describa aquí las consideraciones y actividades que ya deben estar gestionadas y realizadas por los equipos correspondientes previo a la instalación del cambio]",
    );

    const blocks: string[] = [];
    for (let i = startIndex + 1; i < (endIndex === -1 ? ordered.length : endIndex); i += 1) {
      const item = ordered[i];
      if (item.type !== "p") continue;

      const text = normalize(textFromParagraphPO(item.node));
      if (!text) continue;
      if (normalizeSearch(text) === placeholder) continue;

      blocks.push(`<p>${escapeHtml(text)}</p>`);
    }

    return blocks.join("");
  }

  function extractInstallationBackupTables(
    ordered: Array<{ type: "p" | "tbl"; node: any }>,
  ) {
    const previousStepsIndex = ordered.findIndex((item) => {
      if (item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "requisitos y trabajos que deben estar completados previo a la implementacion del cambio",
      );
    });
    if (previousStepsIndex === -1) return [];

    const backupStartIndex = ordered.findIndex((item, index) => {
      if (index <= previousStepsIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "respaldo de objetos",
      );
    });
    if (backupStartIndex === -1) return [];

    const installationStartIndex = ordered.findIndex((item, index) => {
      if (index <= backupStartIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la instalacion",
      );
    });

    const groups: BackupTableGroup[] = [];
    for (
      let i = backupStartIndex + 1;
      i < (installationStartIndex === -1 ? ordered.length : installationStartIndex);
      i += 1
    ) {
      const item = ordered[i];
      if (item.type !== "tbl") continue;

      const parsedGroup = extractBackupTableGroup(tableFromPreserveOrder(item.node));
      if (!parsedGroup) continue;

      groups.push({
        ...parsedGroup,
        title: `Tabla ${groups.length + 1}`,
      });
    }

    return groups;
  }

  function extractFixBackupTables(
    ordered: Array<{ type: "p" | "tbl"; node: any }>,
  ) {
    const fixImplementationIndex = ordered.findIndex((item) => {
      if (item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la implementacion de bugfix / hotfix",
      );
    });
    if (fixImplementationIndex === -1) return [];

    const backupStartIndex = ordered.findIndex((item, index) => {
      if (index <= fixImplementationIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "respaldo de objetos",
      );
    });
    if (backupStartIndex === -1) return [];

    const installationStartIndex = ordered.findIndex((item, index) => {
      if (index <= backupStartIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la instalacion",
      );
    });

    const groups: BackupTableGroup[] = [];
    for (
      let i = backupStartIndex + 1;
      i < (installationStartIndex === -1 ? ordered.length : installationStartIndex);
      i += 1
    ) {
      const item = ordered[i];
      if (item.type !== "tbl") continue;

      const parsedGroup = extractFixBackupTableGroup(
        tableFromPreserveOrder(item.node),
      );
      if (!parsedGroup) continue;

      groups.push({
        ...parsedGroup,
        title: `Tabla ${groups.length + 1}`,
      });
    }

    return groups;
  }

  function extractInstallationTables(
    ordered: Array<{ type: "p" | "tbl"; node: any }>,
  ) {
    const installationStartIndex = ordered.findIndex((item) => {
      if (item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la instalacion",
      );
    });
    if (installationStartIndex === -1) return [];

    const reversionStartIndex = ordered.findIndex((item, index) => {
      if (index <= installationStartIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la reversion",
      );
    });

    const groups: InstallationTableGroup[] = [];
    for (
      let i = installationStartIndex + 1;
      i < (reversionStartIndex === -1 ? ordered.length : reversionStartIndex);
      i += 1
    ) {
      const item = ordered[i];
      if (item.type !== "tbl") continue;

      const parsedGroup = extractInstallationTableGroup(
        tableFromPreserveOrder(item.node),
      );
      if (!parsedGroup) continue;

      groups.push({
        ...parsedGroup,
        title: `Tabla ${groups.length + 1}`,
      });
    }

    return groups;
  }

  function extractReversionTables(
    ordered: Array<{ type: "p" | "tbl"; node: any }>,
  ) {
    const reversionStartIndex = ordered.findIndex((item) => {
      if (item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la reversion",
      );
    });
    if (reversionStartIndex === -1) return [];

    const fixImplementationStartIndex = ordered.findIndex((item, index) => {
      if (index <= reversionStartIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la implementacion de bugfix / hotfix",
      );
    });

    const groups: InstallationTableGroup[] = [];
    for (
      let i = reversionStartIndex + 1;
      i <
      (fixImplementationStartIndex === -1
        ? ordered.length
        : fixImplementationStartIndex);
      i += 1
    ) {
      const item = ordered[i];
      if (item.type !== "tbl") continue;

      const parsedGroup = extractInstallationTableGroup(
        tableFromPreserveOrder(item.node),
      );
      if (!parsedGroup) continue;

      groups.push({
        ...parsedGroup,
        title: `Tabla ${groups.length + 1}`,
      });
    }

    return groups;
  }

  function extractFixInstallationTables(
    ordered: Array<{ type: "p" | "tbl"; node: any }>,
  ) {
    const fixImplementationIndex = ordered.findIndex((item) => {
      if (item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la implementacion de bugfix / hotfix",
      );
    });
    if (fixImplementationIndex === -1) return [];

    const installationStartIndex = ordered.findIndex((item, index) => {
      if (index <= fixImplementationIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la instalacion",
      );
    });
    if (installationStartIndex === -1) return [];

    const reversionStartIndex = ordered.findIndex((item, index) => {
      if (index <= installationStartIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la reversion",
      );
    });

    const groups: InstallationTableGroup[] = [];
    for (
      let i = installationStartIndex + 1;
      i < (reversionStartIndex === -1 ? ordered.length : reversionStartIndex);
      i += 1
    ) {
      const item = ordered[i];
      if (item.type !== "tbl") continue;

      const parsedGroup = extractInstallationTableGroup(
        tableFromPreserveOrder(item.node),
      );
      if (!parsedGroup) continue;

      groups.push({
        ...parsedGroup,
        title: `Tabla ${groups.length + 1}`,
      });
    }

    return groups;
  }

  function extractFixReversionTables(
    ordered: Array<{ type: "p" | "tbl"; node: any }>,
  ) {
    const fixImplementationIndex = ordered.findIndex((item) => {
      if (item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la implementacion de bugfix / hotfix",
      );
    });
    if (fixImplementationIndex === -1) return [];

    const reversionStartIndex = ordered.findIndex((item, index) => {
      if (index <= fixImplementationIndex || item.type !== "p") return false;
      return normalizeSearch(textFromParagraphPO(item.node)).includes(
        "pasos requeridos para la reversion",
      );
    });
    if (reversionStartIndex === -1) return [];

    const groups: InstallationTableGroup[] = [];
    for (let i = reversionStartIndex + 1; i < ordered.length; i += 1) {
      const item = ordered[i];
      if (item.type !== "tbl") continue;

      const parsedGroup = extractInstallationTableGroup(
        tableFromPreserveOrder(item.node),
      );
      if (!parsedGroup) continue;

      groups.push({
        ...parsedGroup,
        title: `Tabla ${groups.length + 1}`,
      });
    }

    return groups;
  }

  const repositoryNames = extractRepositoryNamesFromParagraphs(paragraphs);
  const communicationMatrix = extractCommunicationMatrix(
    findCommunicationMatrixTable(orderedNodes),
  );
  const previousStepsHtml = extractPreviousStepsHtml(orderedNodes);
  const backupTables = extractInstallationBackupTables(orderedNodes);
  const backupFixTables = extractFixBackupTables(orderedNodes);
  const installationTables = extractInstallationTables(orderedNodes);
  const reversionTables = extractReversionTables(orderedNodes);
  const installationFixTables = extractFixInstallationTables(orderedNodes);
  const reversionFixTables = extractFixReversionTables(orderedNodes);

  // BUSCAR EL INICIO DEL BLOQUE DE PIEZAS DETALLADAS
  let startIndexDetailed = -1;
  let endIndexDetailed = -1;

  for (let i = 0; i < tables.length; i++) {
    const flat = normalize(tables[i].flat().join(" ").toLowerCase());
    if (flat.includes("listado de piezas detalladas")) {
      startIndexDetailed = i + 1;
      break;
    }
  }

  // Buscar el fin del bloque de piezas detalladas
  if (startIndexDetailed > 0) {
    for (let i = startIndexDetailed; i < tables.length; i++) {
      const flat = normalize(tables[i].flat().join(" ").toLowerCase());
      if (flat.includes("listado de piezas detalladas para bugfix") || 
          flat.includes("anexos") ||
          flat.includes("firma autorizada")) {
        endIndexDetailed = i;
        break;
      }
    }
    if (endIndexDetailed === -1) {
      endIndexDetailed = tables.length;
    }
  } else {
    console.warn("⚠ No se encontró la sección de piezas detalladas");
    startIndexDetailed = 0;
    endIndexDetailed = tables.length;
  }

  // ===============================================
  // NUEVA DETECCIÓN: Buscar tablas con patrón de encabezados primero
  // ===============================================
  
  const piezasDetalladas: PiezasGrupo[] = [];
  const detailedFixPieces: PiezasGrupo[] = [];
  const procesedTableIndices = new Set<number>();
  const processedFixTableIndices = new Set<number>();

  function isHeaderRow(row: string[]): boolean {
    const lower = row.map((c) => normalize(c).toLowerCase());
    const hasFixColumns =
      lower.some((c) => c.includes("identificador")) ||
      lower.some((c) => c.includes("fecha") && c.includes("hora"));
    return (
      !hasFixColumns &&
      lower.some((c) => c === "nombre") &&
      lower.some((c) => c === "tipo") &&
      lower.some((c) => c.includes("nuevo") || c.includes("modificado"))
    );
  }

  function isFixHeaderRow(row: string[]): boolean {
    const lower = row.map((c) => normalize(c).toLowerCase());
    return (
      lower.some((c) => c === "nombre") &&
      lower.some((c) => c === "tipo") &&
      lower.some((c) => c.includes("identificador")) &&
      lower.some((c) => c.includes("fecha") && c.includes("hora")) &&
      lower.some((c) => c.includes("nuevo") || c.includes("modificado"))
    );
  }

  function findTableTitleInContext(tableIndex: number): string | null {
    // Buscar en párrafos inmediatamente antes de esta tabla en orderedNodes
    let foundTableCount = 0;
    
    for (let i = 0; i < orderedNodes.length; i++) {
      if (orderedNodes[i].type === "tbl") {
        if (foundTableCount === tableIndex) {
          // Encontramos la tabla, ahora busca títulos hacia atrás
          for (let j = i - 1; j >= 0 && i - j <= 10; j--) {
            const node = orderedNodes[j];
            if (node.type === "tbl") break; // No cruzar otra tabla
            if (node.type === "p") {
              const txt = normalize(textFromParagraphPO(node.node));
              if (!txt) continue;
              const lower = txt.toLowerCase();
              // Ignorar textos que no son títulos
              if (/^listado de piezas|^paso\s+\d|^informaci[óo]n general/i.test(lower)) continue;
              if (txt.length > 150) continue; // Evitar párrafos muy largos
              return txt;
            }
          }
          break;
        }
        foundTableCount++;
      }
    }
    
    return null;
  }

  for (let i = 0; i < tables.length; i++) {
    const tbl = tables[i];
    if (!tbl?.length) continue;

    let headerRowIndex = -1;
    for (let rowIdx = 0; rowIdx < Math.min(5, tbl.length); rowIdx++) {
      if (isFixHeaderRow(tbl[rowIdx])) {
        headerRowIndex = rowIdx;
        break;
      }
    }
    if (headerRowIndex === -1) continue;

    const header = tbl[headerRowIndex];
    const colNombre = header.findIndex((c) => /nombre/i.test(normalize(c)));
    const colTipo = header.findIndex((c) => /tipo/i.test(normalize(c)));
    const colIdentificador = header.findIndex((c) =>
      /identificador/i.test(normalize(c)),
    );
    const colFecha = header.findIndex((c) =>
      /fecha\s*\/?\s*hora/i.test(normalize(c)),
    );
    const colEstado = header.findIndex((c) =>
      /(nuevo|modificado)/i.test(normalize(c)),
    );

    if (
      colNombre === -1 ||
      colTipo === -1 ||
      colIdentificador === -1 ||
      colFecha === -1 ||
      colEstado === -1
    ) {
      continue;
    }

    const items: PiezasItem[] = [];
    for (let rowIdx = headerRowIndex + 1; rowIdx < tbl.length; rowIdx++) {
      const row = tbl[rowIdx];
      if (!row) continue;

      const nombre = normalize(row[colNombre] || "");
      if (!nombre) continue;

      const tipo = normalize(row[colTipo] || "");
      const identificador = normalize(row[colIdentificador] || "");
      const fechaHoraModificacion = normalize(row[colFecha] || "");
      const estadoRaw = normalize(row[colEstado] || "");
      const estado = /nuevo/i.test(estadoRaw)
        ? "Nuevo"
        : /modificado/i.test(estadoRaw)
          ? "Modificado"
          : "Modificado";

      items.push({
        nombre,
        tipo,
        estado,
        identificador,
        fechaHoraModificacion,
      });
    }

    if (!items.length) continue;

    const groupTitle = findTableTitleInContext(i) || `Grupo ${detailedFixPieces.length + 1}`;
    detailedFixPieces.push({
      grupo: groupTitle,
      items,
    });
    processedFixTableIndices.add(i);
  }

  // Procesar tablas en el rango de piezas detalladas
  for (let i = startIndexDetailed; i < endIndexDetailed; i++) {
    if (procesedTableIndices.has(i)) continue;
    if (processedFixTableIndices.has(i)) continue;

    const tbl = tables[i];
    if (!tbl?.length) continue;

    console.log(`\n[DEBUG] Analizando tabla ${i} (índice en rango de piezas: ${i - startIndexDetailed})`);
    console.log(`  - Filas: ${tbl.length}`);
    console.log(`  - Preview: ${tbl[0]?.slice(0, 3).join(" | ")}`);

    // Buscar si esta tabla tiene el patrón de headers
    let headerRowIndex = -1;
    for (let rowIdx = 0; rowIdx < Math.min(5, tbl.length); rowIdx++) {
      if (isHeaderRow(tbl[rowIdx])) {
        headerRowIndex = rowIdx;
        console.log(`  ✓ Header encontrado en fila ${rowIdx}`);
        break;
      }
    }

    if (headerRowIndex === -1) {
      console.log(`  ✗ No tiene patrón de headers, saltando...`);
      continue; // No es una tabla de piezas
    }

    // Encontrar el título para esta tabla
    let titulo = findTableTitleInContext(i);
    console.log(`  - Titulo encontrado: "${titulo || "NO ENCONTRADO"}"`);
    
    // Si no encuentra título en paragrafos, buscar en filas anteriores de la misma tabla
    if (!titulo) {
      for (let rowIdx = headerRowIndex - 1; rowIdx >= 0 && headerRowIndex - rowIdx <= 3; rowIdx--) {
        const row = tbl[rowIdx];
        if (!row?.length) continue;
        const nonEmpty = row.map(normalize).filter(Boolean);
        // Si hay solo una celda no vacía, podría ser el título
        if (nonEmpty.length === 1 && nonEmpty[0].length > 0 && nonEmpty[0].length < 100) {
          titulo = nonEmpty[0];
          console.log(`  - Titulo encontrado en fila ${rowIdx} de la tabla: "${titulo}"`);
          break;
        }
      }
    }

    if (!titulo) {
      titulo = "Sin título";
      console.log(`  - Usando titulo por defecto`);
    }

    // Extraer encabezados
    const header = tbl[headerRowIndex];
    const colNombre = header.findIndex((c) => /nombre/i.test(normalize(c)));
    const colTipo = header.findIndex((c) => /tipo/i.test(normalize(c)));
    const colEstado = header.findIndex((c) => /(nuevo|modificado)/i.test(normalize(c)));

    console.log(`  - Columnas: nombre=${colNombre}, tipo=${colTipo}, estado=${colEstado}`);

    if (colNombre === -1 || colTipo === -1 || colEstado === -1) {
      console.log(`  ✗ Columnas incompletas, saltando...`);
      continue;
    }

    // Extraer items desde las filas después del header
    const items: PiezasItem[] = [];
    for (let rowIdx = headerRowIndex + 1; rowIdx < tbl.length; rowIdx++) {
      const row = tbl[rowIdx];
      if (!row) continue;

      const nombre = normalize(row[colNombre] || "");
      if (!nombre) continue; // Saltar filas vacías

      const tipo = normalize(row[colTipo] || "");
      const estadoRaw = normalize(row[colEstado] || "");

      const estado = /nuevo/i.test(estadoRaw)
        ? "Nuevo"
        : /modificado/i.test(estadoRaw)
        ? "Modificado"
        : "Modificado";

      items.push({ nombre, tipo, estado });
    }

    console.log(`  - Items extraídos: ${items.length}`);

    if (items.length > 0) {
      piezasDetalladas.push({ grupo: titulo, items });
      procesedTableIndices.add(i);
      console.log(`  ✓ Tabla "${titulo}" añadida con ${items.length} items\n`);
    } else {
      console.log(`  ✗ Sin items válidos, saltando...\n`);
    }
  }

  console.log(`\n========== RESULTADO FINAL ==========`);
  console.log(`Total de tablas de piezas detalladas encontradas: ${piezasDetalladas.length}`);
  piezasDetalladas.forEach((grupo, idx) => {
    console.log(`  ${idx + 1}. "${grupo.grupo}" - ${grupo.items.length} items`);
  });
  console.log(`====================================\n`);

  (function detectInstallTables() {
    if (piezasDetalladas.length > 0) {
      console.log(
        `[DEBUG] detectInstallTables: omitido porque ya se detectaron ${piezasDetalladas.length} grupo(s) en "Listado de piezas detalladas"`
      );
      return;
    }

    const KNOWN_EXTS = [
      "jar",
      "sql",
      "sp",
      "spsql",
      "dtsx",
      "pks",
      "pkb",
      "tps",
      "pkg",
      "xml",
      "xqy",
      "xquery",
      "wsdl",
      "xsd",
      "yaml",
      "yml",
      "json",
      "js",
      "ts",
      "dll",
      "war",
      "ear",
    ];

    const extToTipo = (ext: string) => {
      const e = ext.toLowerCase();
      if (e === "jar") return "JAR";
      if (e === "sql") return "Script SQL";
      if (e === "sp" || e === "spsql") return "Stored Procedure";
      if (e === "dtsx") return "SSIS Package";
      if (e === "pks" || e === "pkb" || e === "pkg") return "Oracle Package";
      if (e === "tps") return "Oracle Type";
      if (e === "xqy" || e === "xquery") return "XQuery";
      if (e === "wsdl") return "WSDL";
      if (e === "xsd") return "XSD";
      if (e === "yaml" || e === "yml") return "YAML";
      if (e === "json") return "JSON";
      if (e === "dll") return "DLL";
      if (e === "war" || e === "ear") return e.toUpperCase();
      if (e === "xml" || e === "js" || e === "ts") return e.toUpperCase();
      return e.toUpperCase();
    };

    const extractFilenames = (text: string): string[] => {
      const t = normalize(text);
      if (!t) return [];
      const re = /[A-Za-z0-9._\-\\\/]+\.([A-Za-z0-9]{1,8})/g;
      const out: string[] = [];
      let m: RegExpExecArray | null;
      while ((m = re.exec(t))) {
        const full = m[0];
        const ext = (m[1] || "").toLowerCase();
        if (!KNOWN_EXTS.includes(ext)) continue;
        const base = full.split(/[/\\]/).pop()!;
        if (/^N\/A$/i.test(base)) continue;
        if (!out.includes(base)) out.push(base);
      }
      return out;
    };

    const looksLikeInstallHeader = (hdr: string) =>
      /^(objeto\s+a\s+instalar|objeto\s+a\s+respaldar|archivo|artefacto)/i.test(
        normalize(hdr)
      );

    const guessEstadoAround = (
      rowTexts: string[]
    ): "Nuevo" | "Modificado" | string => {
      const joined = normalize(rowTexts.join(" "));
      if (/nuevo/i.test(joined) && !/modificad/i.test(joined)) return "Nuevo";
      if (/modificad/i.test(joined) && !/nuevo/i.test(joined))
        return "Modificado";
      return "Modificado";
    };

    console.log(`\n[DEBUG] detectInstallTables: Procesando ${tables.length} tablas totales`);
    console.log(`[DEBUG] Tablas ya procesadas como piezas detalladas: ${procesedTableIndices.size}`);
    console.log(`[DEBUG] Ignorando tablas con índices: ${Array.from(procesedTableIndices).join(", ")}`);

    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const table = tables[tableIndex];
      
      // IMPORTANTE: Saltar las tablas que ya fueron procesadas como piezas detalladas
      if (procesedTableIndices.has(tableIndex)) {
        console.log(`[DEBUG] Tabla ${tableIndex} ya procesada, saltando...`);
        continue;
      }
      
      if (!table?.length) continue;

      let repoName = "";
      const headerRow = table.find((r) =>
        r.some((c) => /repositorio\s*:?\s*$/i.test(normalize(c)))
      );
      if (headerRow) {
        const idx = headerRow.findIndex((c) =>
          /repositorio\s*:?\s*$/i.test(normalize(c))
        );
        const headerRowIndex = table.indexOf(headerRow);
        const below = table[headerRowIndex + 1]?.[idx];
        if (below) repoName = normalize(below);
      }

      if (!repoName) {
        const repoTriple = table.find(
          (r) =>
            r.length >= 3 &&
            /^implementaci[óo]n|^base de datos|^par[áa]metros|^seguridad|^oic|^salesforce/i.test(
              normalize(r[0])
            ) &&
            /^(RGCARD|NICARD|DB12|OSB|NITRANSFER|RGTRANSFER|DATABASE[_ ]CLOUD|APLICACIONES-ESCRITORIO|SALESFORCE|COBIS|DIGITALIZACION(?:[- ]TARJETAS)?|OIC)$/i.test(
              normalize(r[2])
            )
        );
        if (repoTriple) repoName = normalize(repoTriple[2]);
      }

      const firstRow = table[0] || [];
      let idxObjeto = -1;
      for (let c = 0; c < firstRow.length; c++) {
        const h = normalize(firstRow[c]);
        if (looksLikeInstallHeader(h)) {
          idxObjeto = c;
          break;
        }
      }
      if (idxObjeto === -1) {
        for (const row of table.slice(0, 4)) {
          for (let c = 0; c < row.length; c++) {
            if (looksLikeInstallHeader(row[c])) {
              idxObjeto = c;
              break;
            }
          }
          if (idxObjeto !== -1) break;
        }
      }
      if (idxObjeto === -1) continue;

      const items: PiezasItem[] = [];
      for (let r = 1; r < table.length; r++) {
        const row = table[r];
        if (!row) continue;
        const objetoCell = row[idxObjeto] ?? "";
        const files = extractFilenames(objetoCell);

        if (files.length === 0) {
          for (let c = 0; c < row.length; c++) {
            if (c === idxObjeto) continue;
            const more = extractFilenames(row[c] ?? "");
            for (const f of more) files.push(f);
          }
        }

        if (files.length) {
          const estado = guessEstadoAround(row);
          for (const f of files) {
            const ext = (f.split(".").pop() || "").toLowerCase();
            const tipo = extToTipo(ext);
            items.push({ nombre: f, tipo, estado });
          }
        }
      }

      if (items.length) {
        const grupo = repoName || "Piezas Detalladas";
        // Verificar si ya existe este grupo
        const exists = piezasDetalladas.some(p => p.grupo === grupo);
        if (!exists) {
          piezasDetalladas.push({
            grupo,
            items,
          });
        }
      }
    }
  })();

  (function extractKVFromTables() {
    const seen = new Set<string>();
    const pushKV = (keyRaw: string, valRaw: string) => {
      let key = normalize(keyRaw).replace(/^\*+/, "");
      let value = normalize(valRaw);
      if (!key || !value) return;

      if (/^informaci[óo]n general$/i.test(key)) return;
      if (/^listado de piezas detalladas/i.test(key)) return;
      if (/^repositorio$/i.test(key)) return;
      if (/^paso$/i.test(key)) return;

      const sig = key.toLowerCase();
      if (seen.has(sig)) return;
      seen.add(sig);
      camposDetectados.push({ key, value });
    };

    const kvRegex = /^([^:]{2,120}):\s*(.+)$/;

    for (const table of tables) {
      if (!table?.length) continue;

      for (let r = 0; r < table.length; r++) {
        const row = table[r] ?? [];

        if (row.length === 1) {
          const c0 = normalize(row[0]);
          const m = c0.match(kvRegex);
          if (m) {
            pushKV(m[1], m[2]);
            continue;
          }
        }

        if (row.length >= 2) {
          const c0 = normalize(row[0]);
          const c1 = normalize(row[1]);

          const m0 = c0.match(kvRegex);
          const m1 = c1.match(kvRegex);

          if (m0) {
            pushKV(m0[1], m0[2]);
          } else if (m1 && !c0) {
            pushKV(m1[1], m1[2]);
          } else if (c0 && c1 && !/^respuesta/i.test(c0)) {
            pushKV(c0.replace(/:$/, ""), c1);
          }
        }
      }
    }

    for (const table of tables) {
      const headers = table[10] || table[11] || [];
      const headerIdx: Record<string, number> = {};
      headers.forEach((h, i) => {
        const k = normalize(h).toUpperCase();
        if (["REG", "HN", "GT", "PA", "NI"].includes(k)) headerIdx[k] = i;
      });

      const selRow = table.find((r) =>
        normalize(r[0]).toLowerCase().startsWith("seleccionar país afectado")
      );
      if (selRow && Object.keys(headerIdx).length) {
        let elegido = "";
        for (const [pais, idx] of Object.entries(headerIdx)) {
          const cell = normalize(selRow[idx] ?? "");
          if (cell.toUpperCase() === "X") {
            elegido = pais;
            break;
          }
        }
        if (elegido) pushKV("País afectado", elegido);
      }
    }
  })();

  const seccionesReconocidas: UISection[] = [];
  let servicesProducts: string[] = [];
  let affectedAreas: string[] = [];

  function findInfoGeneralTable(tables: any[][][]): any[][] | null {
    for (const tbl of tables) {
      const flat = tbl.flat().join(" ");
      const hasHeader = /informacion general|información general/i.test(flat);
      const hasId = tbl.some((row) =>
        row.some((c) => /id\s*de\s*cambio\s*:/i.test(c))
      );
      const hasTipo = tbl.some((row) =>
        row.some((c) => /\*?\s*tipo\s*de\s*requerimiento\s*:/i.test(c))
      );
      if (hasHeader || (hasId && hasTipo)) return tbl;
    }
    return null;
  }

  function extractYesNo(table: any[][], label: RegExp): "SI" | "NO" | "" {
    for (const row of table) {
      const joined = row.join(" ");
      if (label.test(joined)) {
        const rev = [...row].reverse();
        for (const cell of rev) {
          const t = cell.trim().toUpperCase().replace("SÍ", "SI");
          if (t === "SI" || t === "NO") return t as "SI" | "NO";
        }
        if (row.length >= 2) {
          const v = row[row.length - 1]
            .trim()
            .toUpperCase()
            .replace("SÍ", "SI");
          if (v === "SI" || v === "NO") return v as "SI" | "NO";
        }
      }
    }
    return "";
  }

  function extractOtros(table: any[][]): string {
    for (const row of table) {
      const idx = row.findIndex((c) => /^otros\s*:?/i.test(c));
      if (idx >= 0) {
        if (row.length > idx + 1) return row[idx + 1].trim();
        const m = row[idx].match(/^otros\s*:?\s*(.+)$/i);
        if (m) return m[1].trim();
        return "";
      }
    }
    return "";
  }

  function extractIdCambio(table: any[][]): string {
    for (const row of table) {
      for (const c of row) {
        const m = c.match(/id\s*de\s*cambio\s*:\s*(.+)$/i);
        if (m) return m[1].trim();
      }
    }
    return "";
  }

  function extractTipoReq(table: any[][]): string {
    for (const row of table) {
      for (const c of row) {
        const m = c.match(/\*?\s*tipo\s*de\s*requerimiento\s*:\s*(.+)$/i);
        if (m) return m[1].trim();
      }
    }
    return "";
  }

  function extractCountries(table: any[][]): string[] {
    let header: string[] | null = null;
    let select: string[] | null = null;

    for (let i = 0; i < table.length; i++) {
      const row = table[i];
      const hasAll =
        row.some((c) => /\bREG\b/i.test(c)) &&
        row.some((c) => /\bHN\b/i.test(c)) &&
        row.some((c) => /\bGT\b/i.test(c)) &&
        row.some((c) => /\bPA\b/i.test(c)) &&
        row.some((c) => /\bNI\b/i.test(c));
      if (hasAll) {
        header = row.map((c) => c.trim().toUpperCase());
        if (i + 1 < table.length) {
          select = table[i + 1].map((c) => c.trim().toUpperCase());
        }
        break;
      }
    }
    if (!header || !select) return [];

    const out: string[] = [];
    for (let i = 0; i < header.length; i++) {
      const h = header[i];
      if (!/^(REG|HN|GT|PA|NI)$/.test(h)) continue;
      const v = select[i] ?? "";
      if (v === "X" || v === "SI" || v === "✔") {
        out.push(h);
      }
    }
    return out;
  }

  const infoTbl = findInfoGeneralTable(tables);

  function extractListValueRows(rows: string[][]): string[] {
    const out: string[] = [];
    for (const row of rows) {
      const nonEmpty = row.map((cell) => normalize(cell)).filter(Boolean);
      if (!nonEmpty.length) continue;
      if (nonEmpty.length > 1) continue;

      const value = nonEmpty[0];
      const normalizedValue = normalizeSearch(value);
      if (
        normalizedValue.startsWith("paso ") ||
        normalizedValue.includes("listado de piezas detalladas") ||
        normalizedValue.includes("listado de fuentes afectados") ||
        normalizedValue.includes("repositorio") ||
        normalizedValue.includes("anexos")
      ) {
        continue;
      }

      out.push(value);
    }
    return out;
  }

  function extractServicesAndAreas(table: string[][]) {
    const servicesTitleIndex = table.findIndex((row) =>
      normalizeSearch(row.join(" ")).includes(
        "listar servicios/productos que estan relacionados y que se veran impactados",
      ),
    );

    const areasTitleIndex = table.findIndex((row) =>
      normalizeSearch(row.join(" ")).includes(
        "listar areas que se veran impactadas",
      ),
    );

    if (servicesTitleIndex === -1 || areasTitleIndex === -1) {
      return { services: [], areas: [] };
    }

    const servicesRows = table.slice(servicesTitleIndex + 1, areasTitleIndex);
    const areasRows = table.slice(areasTitleIndex + 1);

    return {
      services: extractListValueRows(servicesRows),
      areas: extractListValueRows(areasRows),
    };
  }

  for (const table of tables) {
    const extracted = extractServicesAndAreas(table);
    if (extracted.services.length) {
      servicesProducts = extracted.services;
    }
    if (extracted.areas.length) {
      affectedAreas = extracted.areas;
    }
    if (servicesProducts.length || affectedAreas.length) {
      break;
    }
  }

  if (infoTbl) {
    const idCambio = extractIdCambio(infoTbl);
    const tipoReq = extractTipoReq(infoTbl);
    const dwh = extractYesNo(infoTbl, /afecta\s+dwh/i) || "NO";
    const cierre = extractYesNo(infoTbl, /afecta\s+cierre/i) || "NO";
    const robot = extractYesNo(infoTbl, /afecta\s+robot/i) || "NO";
    const noc = extractYesNo(infoTbl, /notific[oó] al noc/i) || "NO";
    const regul = extractYesNo(infoTbl, /es\s+regulatorio/i) || "NO";
    const otros = extractOtros(infoTbl);
    const paises = extractCountries(infoTbl);

    seccionesReconocidas.push({
      id: "informacion-general",
      title: "",
      fields: [
        {
          key: "id-cambio",
          label: "ID de Cambio",
          kind: "text",
          value: idCambio,
        },
        {
          key: "tipo-requerimiento",
          label: "Tipo de Requerimiento",
          kind: "text",
          value: tipoReq,
        },
        {
          key: "afecta-dwh",
          label: "Afecta DWH",
          kind: "select",
          value: dwh,
          options: [
            { label: "SI", value: "SI" },
            { label: "NO", value: "NO" },
          ],
        },
        {
          key: "afecta-cierre",
          label: "Afecta Cierre",
          kind: "select",
          value: cierre,
          options: [
            { label: "SI", value: "SI" },
            { label: "NO", value: "NO" },
          ],
        },
        {
          key: "afecta-robot",
          label: "Afecta Robot",
          kind: "select",
          value: robot,
          options: [
            { label: "SI", value: "SI" },
            { label: "NO", value: "NO" },
          ],
        },
        {
          key: "notificó-al-noc-sobre-los-servicios-a-monitorear",
          label: "Notificó al NOC sobre los servicios a monitorear",
          kind: "select",
          value: noc,
          options: [
            { label: "SI", value: "SI" },
            { label: "NO", value: "NO" },
          ],
        },
        {
          key: "es-regulatorio",
          label: "Es Regulatorio",
          kind: "select",
          value: regul,
          options: [
            { label: "SI", value: "SI" },
            { label: "NO", value: "NO" },
          ],
        },
        { key: "otros", label: "Otros", kind: "text", value: otros },
        {
          key: "pais-afectado",
          label: "Seleccionar país afectado",
          kind: "multiselect",
          value: paises,
          options: [
            { label: "REG", value: "REG" },
            { label: "HN", value: "HN" },
            { label: "GT", value: "GT" },
            { label: "PA", value: "PA" },
            { label: "NI", value: "NI" },
          ],
        },
        {
          key: "participa-proveedor",
          label: "Participa Proveedor",
          kind: "select",
          value: extractYesNo(infoTbl, /participa\s+proveedor/i) || "NO",
          options: [
            { label: "SI", value: "SI" },
            { label: "NO", value: "NO" },
          ],
        },
      ],
    });
  }

  return {
    camposDetectados,
    piezasDetalladas,
    detailedFixPieces,
    backupTables,
    backupFixTables,
    installationTables,
    reversionTables,
    installationFixTables,
    reversionFixTables,
    servicesProducts,
    affectedAreas,
    repositoryNames,
    communicationMatrix,
    previousStepsHtml,
    seccionesReconocidas,
    raw: { paragraphs, tables },
  };
}
