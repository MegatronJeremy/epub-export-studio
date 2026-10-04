export interface InlineStyle {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  highlight?: boolean;
}

export type Inline =
  | ({ t: "text"; text: string } & InlineStyle)
  | { t: "break" }
  | { t: "fnref"; id: string }
  | { t: "link"; href: string; children: Inline[] }
  | { t: "image"; src: string; alt: string; width?: number };

export interface ListItem {
  level: number;
  ordered: boolean;
  checked?: boolean;
  content: Inline[];
}

export type Block =
  | { t: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; content: Inline[] }
  | { t: "paragraph"; content: Inline[] }
  | { t: "code"; lang: string; text: string }
  | { t: "list"; items: ListItem[] }
  | { t: "table"; header: Inline[][]; align: ("left" | "center" | "right")[]; rows: Inline[][][] }
  | { t: "callout"; kind: string; title: Inline[]; children: Block[] }
  | { t: "quote"; children: Block[] }
  | { t: "hr" };
