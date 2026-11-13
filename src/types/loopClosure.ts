export interface LoopClosure {
  driver: string;
  link: 'coupler' | 'rocker';
  fourBar: { ground: number; crank: number; coupler: number; rocker: number; theta: number };
}
