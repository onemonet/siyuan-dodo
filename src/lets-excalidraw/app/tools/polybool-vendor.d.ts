declare const PolyBool: {
  union(a: {regions:number[][][];inverted:boolean},b:{regions:number[][][];inverted:boolean}): {regions:number[][][];inverted:boolean};
  difference(a:{regions:number[][][];inverted:boolean},b:{regions:number[][][];inverted:boolean}): {regions:number[][][];inverted:boolean};
  intersect(a:{regions:number[][][];inverted:boolean},b:{regions:number[][][];inverted:boolean}): {regions:number[][][];inverted:boolean};
  xor(a:{regions:number[][][];inverted:boolean},b:{regions:number[][][];inverted:boolean}): {regions:number[][][];inverted:boolean};
};
export default PolyBool;
