import { useEffect, useState } from "react";
import {
  ActionIcon,
  Button,
  Container,
  Divider,
  Flex,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { IconArrowLeft, IconFileUpload, IconRefresh } from "@tabler/icons-react";
import { Navigate, useNavigate } from "react-router-dom";
import { useManual } from "@/context/ManualContext";
import { mainColor } from "@/lib/utils";

function bytesFromUnknown(input: unknown): Uint8Array | null {
  if (!input) return null;
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    const view = input as ArrayBufferView;
    return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  }
  return null;
}

export default function ManualPreviewPage() {
  const navigate = useNavigate();
  const { data, sections, manualTitle, previewCurrentManualPdf, handleExport } =
    useManual();
  const [loading, setLoading] = useState(true);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  async function loadPreview() {
    setLoading(true);
    setPreviewError(null);
    try {
      const preview = await previewCurrentManualPdf();
      const bytes = bytesFromUnknown(preview.bytes);
      if (!bytes) {
        setPreviewUrl(null);
        setPreviewError("No fue posible leer el PDF de vista previa.");
        return;
      }

      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        const safeBytes = new Uint8Array(bytes);
        const blob = new Blob([safeBytes], { type: preview.mimeType });
        return URL.createObjectURL(blob);
      });
    } catch (error: unknown) {
      setPreviewUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      setPreviewError(
        error instanceof Error
          ? error.message
          : "No fue posible generar la vista previa.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void window.ipc.setWindowTitle("Vista previa");
  }, []);

  useEffect(() => {
    void loadPreview();
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  if (!data || !sections) {
    return <Navigate to="/" replace />;
  }

  return (
    <Container fluid px="lg" py="md">
      <Flex justify="space-between" align="center" mb="md" gap="xs">
        <Group gap="xs" align="center">
          <ActionIcon
            variant="subtle"
            color="white"
            onClick={() => navigate("/editor")}
            aria-label="Volver al editor"
          >
            <IconArrowLeft size="1.5rem" />
          </ActionIcon>
          <Title order={2}>Vista previa del manual</Title>
        </Group>
        <Group gap="xs">
          <Button
            variant="outline"
            color="gray"
            leftSection={<IconRefresh size={16} />}
            onClick={loadPreview}
            loading={loading}
          >
            Actualizar vista
          </Button>
          <Button
            leftSection={<IconFileUpload size={16} />}
            onClick={handleExport}
            color={mainColor}
          >
            Exportar
          </Button>
        </Group>
      </Flex>

      <Divider my="xs" />

      <Stack gap="md">
        {loading ? (
          <Group justify="center" py="xl">
            <Loader />
          </Group>
        ) : previewError ? (
          <Paper withBorder radius="md" p="xl">
            <Text c="dimmed">{previewError}</Text>
          </Paper>
        ) : !previewUrl ? (
          <Paper withBorder radius="md" p="xl">
            <Text c="dimmed">No fue posible generar la vista previa.</Text>
          </Paper>
        ) : (
          <Paper
            withBorder
            radius="md"
            style={{
              maxHeight: "78vh",
              minHeight: 720,
              overflow: "hidden",
            }}
          >
            <iframe
              title={`Vista previa de ${manualTitle || "manual"}`}
              src={previewUrl}
              style={{
                width: "100%",
                height: "78vh",
                border: "none",
                background: "#2c2c2c",
              }}
            />
          </Paper>
        )}
      </Stack>
    </Container>
  );
}
