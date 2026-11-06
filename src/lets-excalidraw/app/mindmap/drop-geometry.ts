/** Shared geometric hit-testing for native mind-map drag gestures. */
export type Rect = {x:number;y:number;width:number;height:number};
export type Point = {x:number;y:number};

export const center = (rect:Rect):Point => ({
  x:rect.x+rect.width/2,y:rect.y+rect.height/2
});
export const overlap = (a:Rect,b:Rect) => ({
  x:Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x)),
  y:Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y))
});
export const rectGap = (a:Rect,b:Rect):number => {
  const dx=Math.max(0,b.x-(a.x+a.width),a.x-(b.x+b.width));
  const dy=Math.max(0,b.y-(a.y+a.height),a.y-(b.y+b.height));
  return Math.hypot(dx,dy);
};
export const overlapArea = (a:Rect,b:Rect):number => {
  const o=overlap(a,b);
  return o.x*o.y;
};
export const normalizedOverlap = (a:Rect,b:Rect):number =>
  overlapArea(a,b)/Math.max(1,Math.min(a.width*a.height,b.width*b.height));
export const centerGap = (a:Rect,b:Rect):number => {
  const p=center(a),q=center(b);
  return Math.hypot(p.x-q.x,p.y-q.y);
};
/** Snap distances are measured on screen, independent of canvas zoom. */
export const snapScene = (pixels:number,zoom:number):number =>
  pixels/Math.max(.05,zoom);

