// Script de prueba para verificar el parsing de tablas
const fs = require('fs');
const path = require('path');

// Simulamos una estructura de tablas similar a la que vte en las capturas
const mockTables = [
  // Tabla 0: Encabezado "Listado de piezas detalladas"
  [
    ["Listado de piezas detalladas (Nuevos / Modificados)"]
  ],
  
  // Tabla 1: Middleware/OSB (con 9 items)
  [
    ["Middleware/OSB"],
    ["Nombre", "Tipo", "Nuevo o modificado"],
    ["QA/SolicitaFinanciamientoTC.jar", "JAR", "Nuevo"],
    ["PRD/SolicitaFinanciamientoTC.jar", "JAR", "Nuevo"],
    ["QA/CreaFinanciamientoNI.jar", "JAR", "Nuevo"],
    ["PRD/CreaFinanciamientoNI.jar", "JAR", "Nuevo"],
    ["CreaFinanciamientoNI.proxy", "PROXY", "Modificado"],
    ["SolicitaFinanciamientoTC.proxy", "PROXY", "Modificado"],
    ["monetaryActionNIIn.xq", "XQUERY", "Modificado"],
    ["creaFinanciamientoTypes.xsd", "XSD", "Modificado"],
    ["ingresaGestionExtraRGNNIIn.xq", "XQUERY", "Modificado"]
  ],
  
  // Tabla 2: Middleware/DB (con 4 items)
  [
    ["Middleware/DB"],
    ["Nombre", "Tipo", "Nuevo o modificado"],
    ["QA/INSERT_INTO_PARAMETRIZACION_MIDDLEWARE.sql", "SQL", "Nuevo"],
    ["PRD/INSERT_INTO_PARAMETRIZACION_MIDDLEWARE.sql", "SQL", "Nuevo"],
    ["QA/ROLLBACK_INSERT_INTO_PARAMETRIZACION_MIDDLEWARE.sql", "SQL", "Nuevo"],
    ["PRD/ROLLBACK_INSERT_INTO_PARAMETRIZACION_MIDDLEWARE.sql", "SQL", "Nuevo"]
  ],
  
  // Tabla 3: Middleware/Vortex (con 5 items)
  [
    ["Middleware/Vortex"],
    ["Nombre", "Tipo", "Nuevo o modificado"],
    ["CreaFinanciamientoNI.pipeline", "PIPELINE", "Modificado"],
    ["SolicitaFinanciamientoTC.pipeline", "PIPELINE", "Modificado"],
    ["monetaryActionNIIn.xqy", "XQUERY", "Modificado"],
    ["creaFinanciamientoTypes.xsd", "XSD", "Modificado"],
    ["ingresaGestionExtraRGNNIIn.xqy", "XQUERY", "Modificado"]
  ],
  
  // Tabla 4: Otra sección
  [
    ["Listado de piezas detalladas para Bugfix / Hotfix / Incidencia"]
  ]
];

// Función para normalizar texto (igual que en docx-parser.ts)
function normalize(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

// Función para detectar si una fila es header
function isHeaderRow(row) {
  const lower = row.map((c) => normalize(c).toLowerCase());
  return (
    lower.some((c) => c === "nombre") &&
    lower.some((c) => c === "tipo") &&
    lower.some((c) => c.includes("nuevo") || c.includes("modificado"))
  );
}

// Función para procesar tablas (similar a lo que hace el parser real)
function parsePiezasTest(tables) {
  const piezasDetalladas = [];
  const procesedTableIndices = new Set();
  
  // Buscar el inicio
  let startIndexDetailed = -1;
  let endIndexDetailed = -1;
  
  for (let i = 0; i < tables.length; i++) {
    const flat = normalize(tables[i].flat().join(" ").toLowerCase());
    if (flat.includes("listado de piezas detalladas") && !flat.includes("bugfix")) {
      startIndexDetailed = i + 1;
      break;
    }
  }
  
  if (startIndexDetailed === -1) {
    console.warn("⚠ No se encontró la sección de piezas detalladas");
    startIndexDetailed = 0;
  }
  
  // Buscar el fin
  if (startIndexDetailed > 0) {
    for (let i = startIndexDetailed; i < tables.length; i++) {
      const flat = normalize(tables[i].flat().join(" ").toLowerCase());
      if (flat.includes("listado de piezas detalladas para bugfix")) {
        endIndexDetailed = i;
        break;
      }
    }
    if (endIndexDetailed === -1) {
      endIndexDetailed = tables.length;
    }
  } else {
    endIndexDetailed = tables.length;
  }
  
  console.log(`Rango de piezas: ${startIndexDetailed} a ${endIndexDetailed}`);
  console.log(`Total de tablas: ${tables.length}\n`);
  
  // Procesar tablas
  for (let i = startIndexDetailed; i < endIndexDetailed; i++) {
    if (procesedTableIndices.has(i)) continue;
    
    const tbl = tables[i];
    if (!tbl?.length) continue;
    
    console.log(`\n[DEBUG] Analizando tabla ${i} (índice en rango: ${i - startIndexDetailed})`);
    console.log(`  - Filas: ${tbl.length}`);
    console.log(`  - Preview: ${tbl[0]?.slice(0, 3).join(" | ")}`);
    
    // Buscar header
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
      continue;
    }
    
    // Buscar título en filas anteriores
    let titulo = null;
    for (let rowIdx = headerRowIndex - 1; rowIdx >= 0 && headerRowIndex - rowIdx <= 3; rowIdx--) {
      const row = tbl[rowIdx];
      if (!row?.length) continue;
      const nonEmpty = row.map(normalize).filter(Boolean);
      if (nonEmpty.length === 1 && nonEmpty[0].length > 0 && nonEmpty[0].length < 100) {
        titulo = nonEmpty[0];
        console.log(`  - Titulo encontrado en fila ${rowIdx}: "${titulo}"`);
        break;
      }
    }
    
    if (!titulo) {
      titulo = "Sin título";
      console.log(`  - Usando titulo por defecto`);
    }
    
    // Extraer columnas
    const header = tbl[headerRowIndex];
    const colNombre = header.findIndex((c) => /nombre/i.test(normalize(c)));
    const colTipo = header.findIndex((c) => /tipo/i.test(normalize(c)));
    const colEstado = header.findIndex((c) => /(nuevo|modificado)/i.test(normalize(c)));
    
    console.log(`  - Columnas: nombre=${colNombre}, tipo=${colTipo}, estado=${colEstado}`);
    
    if (colNombre === -1 || colTipo === -1 || colEstado === -1) {
      console.log(`  ✗ Columnas incompletas`);
      continue;
    }
    
    // Extraer items
    const items = [];
    for (let rowIdx = headerRowIndex + 1; rowIdx < tbl.length; rowIdx++) {
      const row = tbl[rowIdx];
      if (!row) continue;
      
      const nombre = normalize(row[colNombre] || "");
      if (!nombre) continue;
      
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
    }
  }
  
  return piezasDetalladas;
}

// Ejecutar prueba
console.log("====== PRUEBA DE PARSING DE TABLAS ======\n");
const resultado = parsePiezasTest(mockTables);

console.log(`\n========== RESULTADO FINAL ==========`);
console.log(`Total de tablas encontradas: ${resultado.length}`);
resultado.forEach((grupo, idx) => {
  console.log(`  ${idx + 1}. "${grupo.grupo}" - ${grupo.items.length} items`);
  grupo.items.forEach((item, itemIdx) => {
    console.log(`     - ${item.nombre} (${item.tipo}) [${item.estado}]`);
  });
});
console.log(`====================================`);

// Verificar resultado esperado
console.log("\n====== VERIFICACION ======");
if (resultado.length === 3) {
  console.log("✓ Se encontraron exactamente 3 tablas (CORRECTO)");
} else {
  console.log(`✗ Se esperaban 3 tablas pero se encontraron ${resultado.length} (ERROR)`);
}

const titulos = resultado.map(g => g.grupo);
const titulosEsperados = ["Middleware/OSB", "Middleware/DB", "Middleware/Vortex"];
if (JSON.stringify(titulos) === JSON.stringify(titulosEsperados)) {
  console.log("✓ Los títulos son correctos");
} else {
  console.log(`✗ Títulos encontrados: ${titulos.join(", ")}`);
  console.log(`  Títulos esperados: ${titulosEsperados.join(", ")}`);
}

const itemsCounts = resultado.map(g => g.items.length);
const itemsEsperados = [9, 4, 5];
if (JSON.stringify(itemsCounts) === JSON.stringify(itemsEsperados)) {
  console.log("✓ El número de items en cada tabla es correcto");
} else {
  console.log(`✗ Items encontrados: ${itemsCounts.join(", ")}`);
  console.log(`  Items esperados: ${itemsEsperados.join(", ")}`);
}
