import type { FieldMappingDefinition } from "../../components/ui/field-mapping-types";
import type { MapFieldMapping } from "./map-data";

/** Shared by embedded map blocks and database native map views. */
export const MAP_FIELD_DEFINITIONS: FieldMappingDefinition<keyof MapFieldMapping>[] = [
  { key: "coordinate", label: "坐标", description: "选择位置列，决定地图标记位置。", required: true, placeholder: "请选择字段", acceptedTypes: ["location"] },
  { key: "image", label: "图片", description: "显示标记图片，不需要可选不使用。", placeholder: "不使用", acceptedTypes: ["mAsset"] },
];
