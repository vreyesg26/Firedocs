import { Divider, Paper, Text, Title } from "@mantine/core";
import { RichTextEditor, Link } from "@mantine/tiptap";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import SubScript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect } from "react";
import { useManual } from "@/context/ManualContext";

const richTextEditorLabels = {
  boldControlLabel: "Negrita",
  italicControlLabel: "Cursiva",
  underlineControlLabel: "Subrayado",
  strikeControlLabel: "Tachado",
  clearFormattingControlLabel: "Limpiar formato",
  highlightControlLabel: "Resaltar",
  sourceCodeControlLabel: "Código fuente",
  linkControlLabel: "Insertar enlace",
  unlinkControlLabel: "Quitar enlace",
  bulletListControlLabel: "Lista con viñetas",
  orderedListControlLabel: "Lista numerada",
  h1ControlLabel: "Título 1",
  h2ControlLabel: "Título 2",
  h3ControlLabel: "Título 3",
  h4ControlLabel: "Título 4",
  blockquoteControlLabel: "Cita",
  alignLeftControlLabel: "Alinear a la izquierda",
  alignCenterControlLabel: "Centrar",
  alignRightControlLabel: "Alinear a la derecha",
  alignJustifyControlLabel: "Justificar",
  subscriptControlLabel: "Subíndice",
  superscriptControlLabel: "Superíndice",
  undoControlLabel: "Deshacer",
  redoControlLabel: "Rehacer",
  linkEditorInputLabel: "URL del enlace",
  linkEditorInputPlaceholder: "https://ejemplo.com/",
  linkEditorExternalLink: "Abrir enlace en una nueva pestaña",
  linkEditorInternalLink: "Abrir enlace en la misma pestaña",
  linkEditorSave: "Guardar",
} satisfies Partial<Parameters<typeof RichTextEditor>[0]["labels"]>;

export const SixthStep = () => {
  const { previousStepsHtml, setPreviousStepsHtml } = useManual() as {
    previousStepsHtml?: string;
    setPreviousStepsHtml: (value: string) => void;
  };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Highlight,
      SubScript,
      Superscript,
      Underline,
      Link,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: previousStepsHtml?.trim(),
    onUpdate: ({ editor: currentEditor }) => {
      setPreviousStepsHtml(currentEditor.getHTML());
    },
  });

  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    const nextHtml = previousStepsHtml?.trim() || "<p><br></p>";
    if (currentHtml !== nextHtml) {
      editor.commands.setContent(nextHtml, { emitUpdate: false });
    }
  }, [editor, previousStepsHtml]);

  return (
    <>
      <Title order={2}>Pasos previos a la instalación</Title>
      <Divider my="xs" />
      <Paper withBorder radius="md" p="md">
        <Text size="sm" c="dimmed" mb="sm">
          Define aqui las actividades previas con el formato que necesites.
        </Text>
        <RichTextEditor
          editor={editor}
          mih={480}
          labels={richTextEditorLabels}
        >
          <RichTextEditor.Toolbar sticky stickyOffset={60}>
            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Bold />
              <RichTextEditor.Italic />
              <RichTextEditor.Underline />
              <RichTextEditor.Strikethrough />
              <RichTextEditor.ClearFormatting />
              <RichTextEditor.Highlight />
              <RichTextEditor.SourceCode />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.H1 />
              <RichTextEditor.H2 />
              <RichTextEditor.H3 />
              <RichTextEditor.H4 />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Blockquote />
              <RichTextEditor.Hr />
              <RichTextEditor.BulletList />
              <RichTextEditor.OrderedList />
              <RichTextEditor.Subscript />
              <RichTextEditor.Superscript />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Link />
              <RichTextEditor.Unlink />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.AlignLeft />
              <RichTextEditor.AlignCenter />
              <RichTextEditor.AlignJustify />
              <RichTextEditor.AlignRight />
            </RichTextEditor.ControlsGroup>

            <RichTextEditor.ControlsGroup>
              <RichTextEditor.Undo />
              <RichTextEditor.Redo />
            </RichTextEditor.ControlsGroup>
          </RichTextEditor.Toolbar>

          <RichTextEditor.Content />
        </RichTextEditor>
      </Paper>
    </>
  );
};
