const HEADER = '%PDF-1.4\n%âãÏÓ\n';
const DECIMALS = 1e4;
const LATIN1_MAX = 0xff;

export const ref = (id: number) => `${id} 0 R`;

export function pdfNumber(n: number): string {
  const rounded = Math.round(n * DECIMALS) / DECIMALS;

  return rounded === 0 ? '0' : String(rounded);
}

export const pdfNumbers = (...values: number[]) => values.map(pdfNumber).join(' ');

export const pdfString = (text: string) => `(${text.replace(/[\\()]/g, (c) => `\\${c}`)})`;

export const pdfStream = (dict: string, content: string) =>
  `<< ${dict ? `${dict} ` : ''}/Length ${content.length} >>\nstream\n${content}\nendstream`;

function latin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);

  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    if (code > LATIN1_MAX) throw new Error(`A PDF can’t hold the character ${text[i]} here.`);

    bytes[i] = code;
  }

  return bytes;
}

const xrefLine = (offset: number) => `${String(offset).padStart(10, '0')} 00000 n \n`;

export class PdfWriter {
  private readonly bodies: Array<string | undefined> = [];

  reserve(): number {
    this.bodies.push(undefined);

    return this.bodies.length;
  }

  set(id: number, body: string) {
    this.bodies[id - 1] = body;
  }

  add(body: string): number {
    const id = this.reserve();

    this.set(id, body);

    return id;
  }

  bytes(rootId: number): Uint8Array {
    let out = HEADER;
    const offsets: number[] = [];

    this.bodies.forEach((body, i) => {
      if (body === undefined) throw new Error(`PDF object ${i + 1} was reserved but never written.`);

      offsets.push(out.length);
      out += `${i + 1} 0 obj\n${body}\nendobj\n`;
    });

    const xrefAt = out.length;
    const count = this.bodies.length + 1;

    out += `xref\n0 ${count}\n0000000000 65535 f \n${offsets.map(xrefLine).join('')}`;
    out += `trailer\n<< /Size ${count} /Root ${ref(rootId)} >>\nstartxref\n${xrefAt}\n%%EOF\n`;

    return latin1(out);
  }
}
