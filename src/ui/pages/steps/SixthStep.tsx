import { mainColor } from "@/lib/utils";
import { Divider, Table, Title } from "@mantine/core";

export const SixthStep = () => {
  const HEADER_BG = mainColor;
  const rows = [
    { paso: "1", objeto: "Respaldar carpeta X" },
    { paso: "2", objeto: "Exportar base Y" },
    { paso: "3", objeto: "Guardar en ruta Z" },
  ];
  const thStyle: React.CSSProperties = {
    background: HEADER_BG,
    color: "white",
    textAlign: "center",
    fontWeight: 700,
  };
  const tdEmpty: React.CSSProperties = { height: 56 }; // para “celdas vacías” como en tu diseño

  return (
    <>
      <Title order={2}>Repositorios y matriz de comunicación</Title>
      <Divider my="xs" />
      <Table
        withTableBorder
        withColumnBorders
        verticalSpacing="md"
        horizontalSpacing="md"
      >
        <Table.Thead>
          {/* Encabezado 1: 3 columnas */}
          <Table.Tr>
            <Table.Th style={thStyle}>Equipo encargado de respaldo:</Table.Th>
            <Table.Th style={thStyle}>
              Base de datos/Directorio (SQR-SQT)
            </Table.Th>
            <Table.Th style={thStyle}>Aplicativo:</Table.Th>
          </Table.Tr>
        </Table.Thead>

        <Table.Tbody>
          {/* Fila de datos del encabezado 1 (vacía / para llenar) */}
          <Table.Tr>
            <Table.Td style={tdEmpty} />
            <Table.Td style={tdEmpty} />
            <Table.Td style={tdEmpty} />
          </Table.Tr>

          {/* Encabezado 2: 2 columnas VISUALES (pero en grid de 3) */}
          <Table.Tr>
            <Table.Td style={thStyle}>Paso</Table.Td>
            <Table.Td style={thStyle} colSpan={2}>
              Objeto a respaldar
            </Table.Td>
          </Table.Tr>

          {/* Filas de datos del encabezado 2 */}
          {rows.map((r) => (
            <Table.Tr key={r.paso}>
              <Table.Td style={{ width: 180 }}>{r.paso}</Table.Td>
              <Table.Td colSpan={2}>{r.objeto}</Table.Td>
            </Table.Tr>
          ))}

          {/* Encabezado 3: 2 columnas VISUALES */}
          <Table.Tr>
            <Table.Td style={thStyle}>Servidor (Nombre, IP)</Table.Td>
            <Table.Td style={thStyle} colSpan={2}>
              Comentarios adicionales
            </Table.Td>
          </Table.Tr>

          {/* Fila de datos del encabezado 3 (1 registro) */}
          <Table.Tr>
            <Table.Td style={tdEmpty} />
            <Table.Td style={tdEmpty} colSpan={2} />
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </>
  );
};
