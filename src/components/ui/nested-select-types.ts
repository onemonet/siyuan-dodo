/** Generic option contract for the shared Svelte 4 / Bits UI hierarchical picker. */
export interface NestedSelectChild { value: string; label: string; }
export interface NestedSelectOption {
  value: string;
  label: string;
  /** Native SiYuan AV field type (for the host SVG icon). */
  type?: string;
  children?: NestedSelectChild[];
}
export interface NestedSelectSelection { value: string; subValue?: string; }
