interface ExcalidrawImageInfo {
  imageURL: string;
  data: string;
  format: "svg" | "png";
}

interface ISnippet {
  id?: string;
  name: string;
  type: string;
  enabled: boolean;
  content: string;
  disabledInPublish?: boolean | undefined;
}
