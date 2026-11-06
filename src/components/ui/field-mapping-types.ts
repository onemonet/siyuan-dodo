/** Generic field mapping contract; domain-specific validation lives in each consumer. */
export interface FieldMappingDefinition<Key extends string = string> {
  key: Key;
  label: string;
  /** Concise label help; hovering its native SiYuan info icon shows a tooltip. */
  description?: string;
  required?: boolean;
  placeholder?: string;
  acceptedTypes?: readonly string[];
}

export interface FieldMappingChange<Key extends string = string> {
  field: Key;
  value: string;
}

export interface FieldSelectOption {
  value: string;
  label: string;
  type: string;
}
