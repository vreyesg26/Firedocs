import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
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
  IconArrowLeft,
  IconFileDescription,
  IconPlus,
  IconEye,
  IconArrowRight,
  IconTrash,
} from "@tabler/icons-react";
import { useManual } from "@/context/ManualContext";
import { notifyError } from "@/lib/notifications";
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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

  function resetPreview(url?: string | null) {
    if (url) URL.revokeObjectURL(url);
    setPreviewUrl(null);
    setPreviewError(null);
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
    setPreviewError(null);
    try {
      const data = await window.ipc.templatePreviewPdf(templateId);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      if (!data) {
        setPreviewUrl(null);
        setPreviewError("No fue posible generar la vista previa.");
        return;
      }
      if ("error" in data) {
        setPreviewUrl(null);
        setPreviewError(data.error);
        return;
      }
      const bytes = bytesFromUnknown(data.bytes);
      if (!bytes) {
        setPreviewUrl(null);
        setPreviewError("No fue posible leer el PDF de vista previa.");
        return;
      }
      const blob = new Blob([bytes], { type: "application/pdf" });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error: unknown) {
      setPreviewUrl(null);
      setPreviewError(
        error instanceof Error
          ? error.message
          : "No fue posible generar la vista previa.",
      );
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDeleteTemplate(templateId: string) {
    const template = templates.find((item) => item.id === templateId);
    const confirmed = window.confirm(
      `Eliminar la plantilla "${template?.name || "Sin título"}"?`,
    );
    if (!confirmed) return;

    setDeletingId(templateId);
    try {
      const ok = await window.ipc.templateDelete(templateId);
      if (!ok) {
        notifyError({
          title: "No se pudo eliminar la plantilla",
          message: "Intenta nuevamente",
        });
        return;
      }

      if (selectedId === templateId) {
        resetPreview(previewUrl);
      }
      await refreshTemplates();
    } finally {
      setDeletingId(null);
    }
  }

  async function handleUseTemplate() {
    if (!selected) return;
    const data = await window.ipc.templateRead(selected.id);
    const bytes = bytesFromUnknown(data?.bytes);
    if (!bytes) {
      notifyError({
        title: "No se pudo leer la plantilla",
        message: "La plantilla seleccionada no contiene un archivo válido",
      });
      return;
    }

    const ok = await loadFromTemplateBytes(bytes);
    if (ok) navigate("/import");
  }

  useEffect(() => {
    void window.ipc.setWindowTitle("Plantilla existente");
  }, []);

  useEffect(() => {
    refreshTemplates();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      resetPreview(previewUrl);
      return;
    }
    void loadPreview(selectedId);
  }, [selectedId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

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
        <Group gap="xs" align="center">
          <ActionIcon
            variant="subtle"
            color='white'
            onClick={() => navigate("/")}
            aria-label="Volver al inicio"
          >
            <IconArrowLeft size="1.5rem" />
          </ActionIcon>
          <Title order={2}>Usar plantilla existente</Title>
        </Group>
        <Button
          leftSection={<IconPlus size={16} />}
          onClick={handleImportTemplate}
          loading={importing}
          color={mainColor}
        >
          Cargar plantilla
        </Button>
      </Flex>

      <Divider my="xs" />

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
                  <Group gap="xs" align="start">
                    {selectedId === tpl.id && (
                      <Badge color={mainColor} variant="filled">
                        Seleccionada
                      </Badge>
                    )}
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      loading={deletingId === tpl.id}
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDeleteTemplate(tpl.id);
                      }}
                      aria-label="Eliminar plantilla"
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
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
              ) : previewError ? (
                <Text c="dimmed">{previewError}</Text>
              ) : !previewUrl ? (
                <Text c="dimmed">No fue posible generar la vista previa.</Text>
              ) : (
                <Paper
                  withBorder
                  radius="sm"
                  style={{
                    maxHeight: "65vh",
                    minHeight: 640,
                    overflow: "hidden",
                  }}
                >
                  <iframe
                    title={`Vista previa de ${selected?.name ?? "plantilla"}`}
                    src={previewUrl}
                    style={{
                      width: "100%",
                      height: "65vh",
                      border: "none",
                      background: "#2c2c2c",
                    }}
                  />
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
