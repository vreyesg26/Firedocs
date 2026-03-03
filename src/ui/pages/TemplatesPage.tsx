import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Card,
  Container,
  Divider,
  Flex,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  IconFileDescription,
  IconPlus,
  IconEye,
  IconArrowRight,
} from "@tabler/icons-react";
import { useManual } from "@/context/ManualContext";
import { parseDocxArrayBuffer } from "@/lib/docx-parser";
import { mainColor } from "@/lib/utils";
import { useNavigate } from "react-router-dom";

type TemplateMeta = {
  id: string;
  fileName: string;
  filePath: string;
  name: string;
  sourceFileName: string;
  createdAt: string;
  updatedAt: string;
  size?: number;
};

type PreviewData = {
  title: string;
  paragraphs: string[];
  tables: string[][][];
};

function bytesFromUnknown(input: unknown): Uint8Array | null {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    const v = input as ArrayBufferView;
    return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
  }

  if (typeof input === "object") {
    const obj = input as Record<string, unknown>;
    if (obj.type === "Buffer" && Array.isArray(obj.data)) {
      return Uint8Array.from(obj.data as number[]);
    }
  }

  return null;
}

export default function TemplatesPage() {
  const navigate = useNavigate();
  const { loadFromTemplateBytes } = useManual();

  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  async function refreshTemplates() {
    setLoading(true);
    try {
      const list = await window.ipc.templateList();
      setTemplates(list ?? []);
      setSelectedId((prev) => {
        if (!list?.length) return null;
        if (prev && list.some((t) => t.id === prev)) return prev;
        return list[0].id;
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleImportTemplate() {
    setImporting(true);
    try {
      const saved = await window.ipc.templateImportDocx();
      if (!saved) return;
      await refreshTemplates();
      setSelectedId(saved.id);
    } finally {
      setImporting(false);
    }
  }

  async function loadPreview(templateId: string) {
    setPreviewLoading(true);
    try {
      const data = await window.ipc.templateRead(templateId);
      const bytes = bytesFromUnknown(data?.bytes);
      if (!bytes) {
        setPreview(null);
        return;
      }
      const parsed = await parseDocxArrayBuffer(bytes);
      setPreview({
        title: data?.sourceFileName || data?.name || "Vista previa",
        paragraphs: parsed.raw?.paragraphs ?? [],
        tables: parsed.raw?.tables ?? [],
      });
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleUseTemplate() {
    if (!selected) return;
    const data = await window.ipc.templateRead(selected.id);
    const bytes = bytesFromUnknown(data?.bytes);
    if (!bytes) {
      alert("No se pudo leer la plantilla seleccionada.");
      return;
    }

    const ok = await loadFromTemplateBytes(bytes);
    if (ok) navigate("/import");
  }

  useEffect(() => {
    refreshTemplates();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setPreview(null);
      return;
    }
    loadPreview(selectedId);
  }, [selectedId]);

  if (loading) {
    return (
      <Container fluid px="lg" py="xl">
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      </Container>
    );
  }

  const hasTemplates = templates.length > 0;

  return (
    <Container fluid px="lg" py="md">
      <Flex justify="space-between" align="center" mb="md">
        <Title order={2}>Usar plantilla existente</Title>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={handleImportTemplate}
          loading={importing}
          color={mainColor}
        >
          Cargar plantilla
        </Button>
      </Flex>

      <Divider mb="lg" />

      {!hasTemplates ? (
        <Flex
          mt="md"
          mih="60vh"
          align="center"
          justify="center"
          style={{ width: "100%" }}
        >
          <Text c="dimmed" ta="center" size="md">
            Las plantillas que cargues aparecerán aquí. Puedes importar archivos
            DOCX para usarlos como base de tus manuales de instalación.
          </Text>
        </Flex>
      ) : (
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          <Stack>
            {templates.map((tpl) => (
              <Card
                key={tpl.id}
                withBorder
                radius="md"
                p="md"
                style={{
                  cursor: "pointer",
                  borderColor: selectedId === tpl.id ? mainColor : undefined,
                }}
                onClick={() => setSelectedId(tpl.id)}
              >
                <Group justify="space-between" align="start">
                  <Box style={{ minWidth: 0 }}>
                    <Group gap="xs" mb={6}>
                      <IconFileDescription size={16} color={mainColor} />
                      <Text fw={700} truncate>
                        {tpl.name}
                      </Text>
                    </Group>
                    <Text size="sm" c="dimmed" truncate>
                      {tpl.sourceFileName || tpl.fileName}
                    </Text>
                    <Text size="xs" c="dimmed" mt={4}>
                      Actualizada: {new Date(tpl.updatedAt).toLocaleString()}
                    </Text>
                  </Box>
                  {selectedId === tpl.id && (
                    <Badge color={mainColor} variant="light">
                      Seleccionada
                    </Badge>
                  )}
                </Group>
              </Card>
            ))}
          </Stack>

          <Paper withBorder radius="md" p="md">
            <Stack>
              <Group gap="xs" align="center">
                <IconEye size={16} color={mainColor} />
                <Text fw={700}>Vista previa</Text>
              </Group>

              {!selected ? (
                <Text c="dimmed">
                  Selecciona una plantilla para ver detalles.
                </Text>
              ) : previewLoading ? (
                <Group justify="center" py="xl">
                  <Loader size="sm" />
                </Group>
              ) : !preview ? (
                <Text c="dimmed">No fue posible generar la vista previa.</Text>
              ) : (
                <Paper
                  withBorder
                  radius="sm"
                  p="md"
                  style={{
                    background: "#f2f2f2",
                    maxHeight: "65vh",
                    overflowY: "auto",
                  }}
                >
                  <Paper
                    withBorder
                    radius={0}
                    p="lg"
                    style={{
                      background: "#fff",
                      color: "#111",
                      minHeight: 600,
                    }}
                  >
                    <Stack gap="sm">
                      <Text fw={700} c="black">
                        {preview.title}
                      </Text>

                      {preview.paragraphs.slice(0, 14).map((p, i) => (
                        <Text key={`p-${i}`} size="sm" c="black">
                          {p}
                        </Text>
                      ))}

                      {preview.tables.slice(0, 6).map((table, ti) => (
                        <Box
                          key={`t-${ti}`}
                          style={{
                            border: "1px solid #333",
                            overflowX: "auto",
                          }}
                        >
                          <table
                            style={{
                              width: "100%",
                              borderCollapse: "collapse",
                              fontSize: 12,
                            }}
                          >
                            <tbody>
                              {table.slice(0, 20).map((row, ri) => (
                                <tr key={`r-${ri}`}>
                                  {row.slice(0, 8).map((cell, ci) => (
                                    <td
                                      key={`c-${ci}`}
                                      style={{
                                        border: "1px solid #333",
                                        padding: "4px 6px",
                                        color: "#111",
                                        verticalAlign: "top",
                                      }}
                                    >
                                      {cell || " "}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </Box>
                      ))}
                    </Stack>
                  </Paper>
                </Paper>
              )}

              <Button
                mt="md"
                rightSection={<IconArrowRight size={16} />}
                onClick={handleUseTemplate}
                disabled={!selected}
                color={mainColor}
              >
                Usar plantilla y continuar
              </Button>
            </Stack>
          </Paper>
        </SimpleGrid>
      )}
    </Container>
  );
}
