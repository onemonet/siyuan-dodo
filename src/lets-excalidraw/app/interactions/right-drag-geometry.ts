/** Geometry for right-button erase sweeps.
 * Straight, multi-point and rotated Excalidraw lines/arrows are tested
 * against their actual polyline segments, NOT their axis-aligned bounds. */
export type Point={x:number;y:number};
export type Rect={x:number;y:number;width:number;height:number};
const EPS=1e-9;
const sq=(n:number)=>n*n;
const sqDist=(a:Point,b:Point)=>sq(a.x-b.x)+sq(a.y-b.y);
function pointToSegmentSq(p:Point,a:Point,b:Point):number{
  const dx=b.x-a.x,dy=b.y-a.y,len=sq(dx)+sq(dy);
  if(len<EPS)return sqDist(p,a);
  const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/len));
  return sqDist(p,{x:a.x+t*dx,y:a.y+t*dy});
}
const orient=(a:Point,b:Point,p:Point)=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
const onSegment=(a:Point,b:Point,p:Point)=>p.x>=Math.min(a.x,b.x)-EPS&&
  p.x<=Math.max(a.x,b.x)+EPS&&p.y>=Math.min(a.y,b.y)-EPS&&
  p.y<=Math.max(a.y,b.y)+EPS;
function intersects(a:Point,b:Point,c:Point,d:Point):boolean{
  const o1=orient(a,b,c),o2=orient(a,b,d),o3=orient(c,d,a),o4=orient(c,d,b);
  if(o1*o2<0&&o3*o4<0)return true;
  return (Math.abs(o1)<EPS&&onSegment(a,b,c))||
    (Math.abs(o2)<EPS&&onSegment(a,b,d))||
    (Math.abs(o3)<EPS&&onSegment(c,d,a))||
    (Math.abs(o4)<EPS&&onSegment(c,d,b));
}
/** Minimum actual segment-to-segment distance (including endpoint grazes). */
export function segmentDistance(a:Point,b:Point,c:Point,d:Point):number{
  if(intersects(a,b,c,d))return 0;
  return Math.sqrt(Math.min(pointToSegmentSq(a,c,d),pointToSegmentSq(b,c,d),
    pointToSegmentSq(c,a,b),pointToSegmentSq(d,a,b)));
}
const linear=new Set(["line","arrow","freedraw"]);
/** World-space points. Excalidraw rotates linear elements about their bounds'
 * center; the local points are relative to the element's x/y. */
export function linearElementPoints(element:any):Point[]{
  const raw:Array<[number,number]>=Array.isArray(element.points)?element.points:[];
  const points=raw.length?raw:[[0,0],[element.width||0,element.height||0]];
  const x=Number(element.x)||0,y=Number(element.y)||0;
  const angle=Number(element.angle)||0;
  const cx=x+(Number(element.width)||0)/2,cy=y+(Number(element.height)||0)/2;
  const cos=Math.cos(angle),sin=Math.sin(angle);
  return points.filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1]))
    .map(([px,py])=>{
      const ux=x+px,uy=y+py,dx=ux-cx,dy=uy-cy;
      return angle?{x:cx+dx*cos-dy*sin,y:cy+dx*sin+dy*cos}:{x:ux,y:uy};
    });
}
/** Liang-Barsky inclusive segment-vs-rect for filled/basic shapes. */
export function sweepIntersectsRect(a:Point,b:Point,rect:Rect):boolean{
  let enter=0,leave=1;
  for(const axis of ["x","y"] as const){
    const size=axis==="x"?rect.width:rect.height;
    const low=Math.min(rect[axis],rect[axis]+size);
    const high=Math.max(rect[axis],rect[axis]+size);
    const delta=b[axis]-a[axis];
    if(Math.abs(delta)<EPS){if(a[axis]<low||a[axis]>high)return false;continue;}
    const t1=(low-a[axis])/delta,t2=(high-a[axis])/delta;
    enter=Math.max(enter,Math.min(t1,t2));leave=Math.min(leave,Math.max(t1,t2));
    if(enter>leave)return false;
  }
  return true;
}
/** Screen-pixel slop keeps small strokes usable without promoting the entire
 * (potentially huge) bounds of an inclined line to a hit target. */
export function sweepIntersectsElement(a:Point,b:Point,element:any,zoom=1):boolean{
  if(!linear.has(element.type))
    return sweepIntersectsRect(a,b,{x:element.x,y:element.y,
      width:element.width||0,height:element.height||0});
  const points=linearElementPoints(element);
  if(!points.length)return false;
  const screenSlop=3/Math.max(.05,zoom);
  const tolerance=Math.max(0,Number(element.strokeWidth)||0)/2+screenSlop;
  if(points.length===1)return Math.sqrt(pointToSegmentSq(points[0],a,b))<=tolerance;
  for(let i=1;i<points.length;i++)
    if(segmentDistance(a,b,points[i-1],points[i])<=tolerance)return true;
  return false;
}

