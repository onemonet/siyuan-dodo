import type { Plugin } from 'siyuan';
import canvasGuide from '../../skills/dodo-toolbox-excalidraw/SKILL.md?raw';

export type CanvasAction = 'read' | 'add' | 'update' | 'delete' | 'save' | 'viewport'
  | 'screenshot' | 'align' | 'distribute' | 'group' | 'ungroup' | 'duplicate' | 'from_mermaid' | 'add_image';
type CanvasTarget = (canvasId?: string) => HTMLIFrameElement | null;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    result: { type: 'string' },
    structuredContent: { type: 'object', additionalProperties: true },
    error: { type: 'string' },
  },
  additionalProperties: true,
};

export function registerExcalidrawAgentCapabilities(plugin: Plugin, getTarget: CanvasTarget, isEnabled = () => true): boolean {
  const addCapability = (plugin as any).addAgentCapability;
  if (typeof addCapability !== 'function') {
    console.warn('[siyuan-dodo-excalidraw] SiYuan Agent capability API is unavailable in this SiYuan version.');
    return false;
  }

  const register = (
    name: string,
    title: string,
    description: string,
    inputSchema: Record<string, unknown>,
    action: CanvasAction,
    write = false,
  ) => {
    addCapability.call(plugin, {
      name,
      title,
      description,
      inputSchema: {
        ...inputSchema,
        properties: { ...(inputSchema.properties as object), canvasId: { type: 'string', description: 'Canvas identity returned by canvas.read; required for changes.' } },
        ...(action !== 'read' ? { required: [...((inputSchema.required as string[]) ?? []), 'canvasId'] } : {}),
      },
      outputSchema: OUTPUT_SCHEMA,
      effects: write ? { localWrite: true } : { localRead: true },
      handler: async (args: Record<string, unknown>) => {
        if (!isEnabled()) return { error: "Excalidraw 子模块已停用。" };
        if (action !== 'read' && (typeof args?.canvasId !== 'string' || !args.canvasId)) return { error: '请先读取目标画布，并传入返回的 canvasId。' };
        const response = await sendCanvasCommand(getTarget, action, args ?? {});
        if (!response || typeof response !== 'object') return { error: '画布没有返回有效结果。' };
        if ((response as any).error) return { error: String((response as any).error), structuredContent: response };
        if (action === 'screenshot' && typeof (response as any).dataURL === 'string') {
          const { dataURL, ...metadata } = response as any;
          const base64 = dataURL.split(',')[1];
          if (!base64) return { error: '截图缺少图片数据' };
          return { result: JSON.stringify(metadata), structuredContent: metadata,
            content: [{ type: 'image', mimeType: 'image/png', data: base64 }] };
        }
        return { result: JSON.stringify(response), structuredContent: response };
      },
    });
  };

  addCapability.call(plugin, {
    name: 'dodo-excalidraw.read_me', title: 'Excalidraw: Drawing Guide',
    description: 'Drawing guide for these native tools. Read once if instructions are needed; a generic Skill load is not a prerequisite. Follow host approval rules for any Skill loading.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    effects: { localRead: true }, handler: async () => isEnabled() ? ({ result: canvasGuide }) : ({ error: "Excalidraw 子模块已停用。" }),
  });

  register(
    'dodo-excalidraw.canvas.read',
    'Excalidraw: Read Canvas',
    'Read the active canvas before drawing. Returns compact positions, sizes, labelId and arrow startId/endId. Empty ids means no filter. Use detail:full only for style/binding diagnostics. Native tools include their own guide via read_me.',
    {
      type: 'object',
      properties: { limit: { type: 'integer', minimum: 1, maximum: 250, default: 150 }, offset: { type: 'integer', minimum: 0 }, ids: { type: 'array', items: { type: 'string' } }, selectedOnly: { type: 'boolean' }, detail: { type: 'string', enum: ['summary', 'full'], default: 'summary' } },
      required: [],
    },
    'read',
  );
  register(
    'dodo-excalidraw.canvas.add',
    'Excalidraw: Add Elements',
    'Draw a requested diagram in one batch. By default finalize:true returns actual element dimensions, focuses the result and confirms saving in this same call; no separate read/viewport/save is needed on success. Use label:{text} and start:{id}/end:{id}. No generic Skill load is required to use this capability.',
    {
      type: 'object',
      properties: {
        finalize: { type: 'boolean', default: true, description: 'Focus and save after creation, returning compact actual geometry. Use false only for intermediate batches. If saving fails, created IDs remain valid; retry canvas.save, not canvas.add.' },
        elements: {
          type: 'array', minItems: 1, maxItems: 100,
          description: 'Excalidraw skeletons. Use label:{text} for node and arrow labels, start:{id}/end:{id} for bound arrows. Frame children must reference the same batch. Coordinates are required except on frames.',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' }, type: { type: 'string', enum: ['rectangle', 'ellipse', 'diamond', 'text', 'arrow', 'line', 'frame'] },
              x: { type: 'number' }, y: { type: 'number' }, width: { type: 'number' }, height: { type: 'number' },
              label: { type: 'object', properties: { text: { type: 'string' }, fontSize: { type: 'number' } }, required: ['text'], additionalProperties: true },
              start: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
              end: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
              name: { type: 'string' }, children: { type: 'array', items: { type: 'string' } },
              text: { type: 'string' }, strokeColor: { type: 'string' }, backgroundColor: { type: 'string' },
              fontSize: { type: 'number' }, points: { type: 'array' }, endArrowhead: { type: ['string', 'null'] },
            },
            required: ['id', 'type'],
            additionalProperties: true,
          },
        },
      },
      required: ['elements'],
    },
    'add',
    true,
  );
  register(
    'dodo-excalidraw.canvas.update',
    'Excalidraw: Update Elements',
    'Update elements by id and optional read version. Use labelId for text, or text on a labeled shape. Set finalize:true on the last edit to return actual dimensions, focus and save in one call. Reroute complex paths explicitly with points.',
    {
      type: 'object',
      properties: {
        finalize: { type: 'boolean', default: false, description: 'Focus, return compact geometry and save after the final update. On save failure retry canvas.save with the returned IDs preserved.' },
        elements: {
          type: 'array', minItems: 1, maxItems: 100,
          items: { type: 'object', properties: { id: { type: 'string' }, version: { type: 'integer' } }, required: ['id'], additionalProperties: true },
        },
      },
      required: ['elements'],
    },
    'update',
    true,
  );
  register(
    'dodo-excalidraw.canvas.delete',
    'Excalidraw: Delete Elements',
    'Delete elements from the currently active Excalidraw canvas by id. Deletion is destructive; only call when the user explicitly requests deletion. Bound text associated with a deleted shape is also removed.',
    {
      type: 'object',
      properties: { ids: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } } },
      required: ['ids'],
    },
    'delete',
    true,
  );
  register('dodo-excalidraw.canvas.save', 'Excalidraw: Save Canvas',
    'Persist the current canvas and wait for SiYuan file write confirmation. Call after drawing; mutations alone return saved:false. Embedded previews may require focusing the editor for a full refresh.',
    { type: 'object', properties: {} }, 'save', true);
  register('dodo-excalidraw.canvas.viewport', 'Excalidraw: Focus Elements',
    'Fit the canvas viewport to specified element ids, or the whole drawing when ids is omitted.',
    { type: 'object', properties: { ids: { type: 'array', minItems: 1, items: { type: 'string' } } } }, 'viewport', true);

  const ids = { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 100 };
  const finalize = { type: 'boolean', default: true, description: '完成操作后聚焦并保存画布。false 仅用于多批次中间操作。' };
  register('dodo-excalidraw.canvas.screenshot','Excalidraw: Screenshot',
    'Return a PNG image of the whole canvas or selected IDs as image content. Use it for visual QA after drawing, checking overlap, readability, and arrows. Must read the canvas first.',
    { type:'object', properties:{ ids:{...ids,minItems:0}, maxSize:{type:'integer',minimum:256,maximum:2048,default:1200} } },
    'screenshot');
  register('dodo-excalidraw.canvas.align','Excalidraw: Align Elements',
    'Align at least two nodes, preserving bound text and connected arrows. Supported alignments: left, center-x, right, top, center-y, bottom.',
    { type:'object',properties:{ ids:{...ids,minItems:2},alignment:{type:'string',enum:['left','center-x','right','top','center-y','bottom']},finalize },required:['ids','alignment'] },
    'align',true);
  register('dodo-excalidraw.canvas.distribute','Excalidraw: Distribute Elements',
    'Evenly distribute at least three nodes horizontally/vertically; optional explicit gap. Preserves connected arrows and labels.',
    { type:'object',properties:{ids:{...ids,minItems:3},axis:{type:'string',enum:['horizontal','vertical']},gap:{type:'number',minimum:0,maximum:3000},finalize},required:['ids','axis'] },
    'distribute',true);
  register('dodo-excalidraw.canvas.group','Excalidraw: Group Elements',
    'Put 2-100 elements and their bound labels in one native Excalidraw group.',
    { type:'object',properties:{ids:{...ids,minItems:2},finalize},required:['ids'] },'group',true);
  register('dodo-excalidraw.canvas.ungroup','Excalidraw: Ungroup Elements',
    'Remove the nearest shared group from selected elements and their bound labels.',
    { type:'object',properties:{ids,finalize},required:['ids'] },'ungroup',true);
  register('dodo-excalidraw.canvas.duplicate','Excalidraw: Duplicate Elements',
    'Copy elements including bound labels, frames and internal arrow references. Returns idMap for the new IDs.',
    { type:'object',properties:{ids,dx:{type:'number',default:40},dy:{type:'number',default:40},finalize},required:['ids'] },
    'duplicate',true);
  register('dodo-excalidraw.canvas.from_mermaid','Excalidraw: Mermaid Diagram',
    'Convert Mermaid graph syntax into native editable Excalidraw shapes and connectors. Use for flowcharts. Returns new IDs and saves by default.',
    { type:'object',properties:{definition:{type:'string',minLength:1,maxLength:18000},x:{type:'number'},y:{type:'number'},finalize},required:['definition'] },
    'from_mermaid',true);
  register('dodo-excalidraw.canvas.add_image','Excalidraw: Add Image',
    'Add a raster image from base64 data URL (PNG/JPEG/WebP/GIF) at the given position. Images do not become editable vector shapes.',
    { type:'object',properties:{dataURL:{type:'string',description:'Base64 PNG/JPEG/WebP/GIF data URL, max 6MB'},x:{type:'number'},y:{type:'number'},width:{type:'number',minimum:1,maximum:8000},height:{type:'number',minimum:1,maximum:8000},finalize},required:['dataURL','x','y'] },
    'add_image',true);

  return true;
}

export async function sendCanvasCommand(target: CanvasTarget, action: CanvasAction, payload: Record<string, unknown>): Promise<any> {
  let iframe: HTMLIFrameElement | null;
  try { iframe = target(typeof payload.canvasId === 'string' ? payload.canvasId : undefined); } catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  if (!iframe?.contentWindow) {
    return { error: '没有找到可操作的 Excalidraw 画布。请先在思源中打开一张 Excalidraw 画布，再调用此工具。' };
  }

  const requestId = `agent-${crypto.randomUUID()}`;
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value: unknown) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.removeEventListener('message', onMessage);
      resolve(value);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe!.contentWindow || event.origin !== location.origin) return;
      let message: any;
      try { message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; } catch { return; }
      if (message?.event === 'agentCommandResult' && message.requestId === requestId) finish(message.result);
    };
    const timer = window.setTimeout(() => finish({ error: '等待 Excalidraw 画布响应超时。请确认画布已加载且当前窗口未冻结。' }), 60000);
    window.addEventListener('message', onMessage);
    try {
      iframe!.contentWindow!.postMessage(JSON.stringify({ event: 'agentCommand', requestId, action, payload }), location.origin);
    } catch (error) {
      finish({ error: error instanceof Error ? error.message : String(error) });
    }
  });
}
