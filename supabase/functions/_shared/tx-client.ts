// Etapa 1 / Fatia 1A — Envelope transacional.
//
// Objetivo: rodar a logica de gravacao existente (proposals.ts, plan-documents.ts)
// EXATAMENTE como esta, mas dentro de UMA transacao de banco de verdade, para que
// uma falha no meio nao deixe dados parciais e para garantir idempotencia.
//
// Como: um adaptador (`TxClient`) que expoe o mesmo subconjunto do query-builder do
// supabase-js usado por aquele codigo (`from().insert()/upsert()/update()/delete()/
// select()/eq()/neq()/is()/in()/order()/limit()/single()/maybeSingle()`), mas backed
// por uma transacao deno-postgres. A conversao de tipos (jsonb, text[], timestamptz,
// uuid...) e delegada ao proprio Postgres via `jsonb_populate_record`, evitando
// codificacao manual fragil. Todas as operacoes sao serializadas numa fila interna,
// pois uma conexao de transacao nao aceita queries concorrentes (ex.: Promise.all).

// Import de tipo apenas (apagado em runtime): permite testar o builder em Node/vitest
// sem tentar baixar o modulo Deno. A conexao real vive em tx-runner.ts.
import type { Transaction } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

type Row = Record<string, unknown>;
type Result = { data: any; error: any };

function quoteIdent(name: string): string {
  // Identificadores vem do nosso codigo (nomes de tabela/coluna), nunca de entrada
  // do usuario. Ainda assim, escapamos aspas por seguranca.
  return '"' + String(name).replace(/"/g, '""') + '"';
}

type Filter =
  | { kind: "eq"; col: string; val: unknown }
  | { kind: "neq"; col: string; val: unknown }
  | { kind: "is"; col: string; val: unknown }
  | { kind: "in"; col: string; val: unknown[] }
  | { kind: "ilike"; col: string; val: unknown };

class TxQueryBuilder implements PromiseLike<Result> {
  private op: "insert" | "upsert" | "update" | "delete" | "select" | null = null;
  private payload: Row | Row[] | null = null;
  private conflict: string | null = null;
  private filters: Filter[] = [];
  private wantReturning = false;
  private selectMode: "single" | "maybe" | "list" = "list";
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;

  constructor(private tx: Transaction, private table: string, private run: (fn: () => Promise<Result>) => Promise<Result>) {}

  insert(values: Row | Row[]) { this.op = "insert"; this.payload = values; return this; }
  upsert(values: Row | Row[], opts?: { onConflict?: string }) {
    this.op = "upsert"; this.payload = values; this.conflict = opts?.onConflict ?? null; return this;
  }
  update(values: Row) { this.op = "update"; this.payload = values; return this; }
  delete() { this.op = "delete"; return this; }
  // No supabase-js, .select() apos escrita liga o RETURNING; em leitura, inicia a query.
  select(_columns?: string) {
    if (this.op === null) this.op = "select";
    this.wantReturning = true;
    return this;
  }
  eq(col: string, val: unknown) { this.filters.push({ kind: "eq", col, val }); return this; }
  neq(col: string, val: unknown) { this.filters.push({ kind: "neq", col, val }); return this; }
  is(col: string, val: unknown) { this.filters.push({ kind: "is", col, val }); return this; }
  in(col: string, val: unknown[]) { this.filters.push({ kind: "in", col, val }); return this; }
  ilike(col: string, val: unknown) { this.filters.push({ kind: "ilike", col, val }); return this; }
  order(col: string, opts?: { ascending?: boolean }) { this.orderCol = col; this.orderAsc = opts?.ascending !== false; return this; }
  limit(n: number) { this.limitN = n; return this; }
  single() { this.selectMode = "single"; this.wantReturning = true; return this; }
  maybeSingle() { this.selectMode = "maybe"; this.wantReturning = true; return this; }

  private buildWhere(params: unknown[], alias?: string): string {
    if (this.filters.length === 0) return "";
    const prefix = alias ? quoteIdent(alias) + "." : "";
    const parts = this.filters.map((f) => {
      const col = prefix + quoteIdent(f.col);
      if (f.kind === "is") {
        if (f.val === null) return `${col} is null`;
        if (f.val === true) return `${col} is true`;
        if (f.val === false) return `${col} is false`;
        params.push(f.val); return `${col} is not distinct from $${params.length}`;
      }
      if (f.kind === "in") { params.push(f.val); return `${col} = any($${params.length})`; }
      if (f.kind === "ilike") { params.push(f.val); return `${col} ilike $${params.length}`; }
      params.push(f.val);
      return `${col} ${f.kind === "neq" ? "<>" : "="} $${params.length}`;
    });
    return " where " + parts.join(" and ");
  }

  private buildSql(): { text: string; args: unknown[] } {
    const t = quoteIdent(this.table);
    const args: unknown[] = [];
    const ret = this.wantReturning ? " returning *" : "";

    if (this.op === "select") {
      const where = this.buildWhere(args);
      const order = this.orderCol ? ` order by ${quoteIdent(this.orderCol)} ${this.orderAsc ? "asc" : "desc"}` : "";
      const limit = this.limitN != null ? ` limit ${Number(this.limitN)}` : "";
      return { text: `select * from ${t}${where}${order}${limit}`, args };
    }

    if (this.op === "delete") {
      const where = this.buildWhere(args);
      return { text: `delete from ${t}${where}${ret}`, args };
    }

    if (this.op === "insert" || this.op === "upsert") {
      const isMany = Array.isArray(this.payload);
      const rows = (isMany ? this.payload : [this.payload]) as Row[];
      const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
      const colList = cols.map(quoteIdent).join(", ");
      args.push(JSON.stringify(isMany ? rows : rows[0]));
      const src = isMany
        ? `jsonb_populate_recordset(null::${t}, $1::jsonb)`
        : `jsonb_populate_record(null::${t}, $1::jsonb)`;
      let text = `insert into ${t} (${colList}) select ${colList} from ${src}`;
      if (this.op === "upsert") {
        const conflictCols = (this.conflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
        const updatable = cols.filter((c) => !conflictCols.includes(c));
        const setClause = updatable.length
          ? updatable.map((c) => `${quoteIdent(c)} = excluded.${quoteIdent(c)}`).join(", ")
          : "";
        const target = conflictCols.map(quoteIdent).join(", ");
        text += conflictCols.length
          ? (updatable.length
            ? ` on conflict (${target}) do update set ${setClause}`
            : ` on conflict (${target}) do nothing`)
          : "";
      }
      return { text: text + ret, args };
    }

    // update: SET a partir do registro populado (s), WHERE qualificado em tgt para
    // evitar ambiguidade (s tem as mesmas colunas do rowtype da tabela).
    const values = this.payload as Row;
    const cols = Object.keys(values);
    args.push(JSON.stringify(values));
    const setClause = cols.map((c) => `${quoteIdent(c)} = s.${quoteIdent(c)}`).join(", ");
    const where = this.buildWhere(args, "tgt");
    const text = `update ${t} as tgt set ${setClause} from jsonb_populate_record(null::${t}, $1::jsonb) as s${where}${this.wantReturning ? " returning tgt.*" : ""}`;
    return { text, args };
  }

  private finalize(rows: Row[]): Result {
    if (!this.wantReturning) return { data: null, error: null };
    if (this.selectMode === "single") {
      if (rows.length !== 1) {
        return { data: null, error: { message: `single() esperava 1 linha, veio ${rows.length}`, code: "PGRST116" } };
      }
      return { data: rows[0], error: null };
    }
    if (this.selectMode === "maybe") {
      if (rows.length > 1) return { data: null, error: { message: `maybeSingle() veio ${rows.length} linhas`, code: "PGRST116" } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private async execute(): Promise<Result> {
    let sql: { text: string; args: unknown[] };
    try {
      sql = this.buildSql();
    } catch (e) {
      return { data: null, error: e };
    }
    return this.run(async () => {
      try {
        const res = await this.tx.queryObject<Row>({ text: sql.text, args: sql.args });
        return this.finalize(res.rows);
      } catch (e) {
        return { data: null, error: e };
      }
    });
  }

  then<TResult1 = Result, TResult2 = never>(
    onfulfilled?: ((value: Result) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

// Adaptador com a mesma "cara" do supabase-js, mas transacional.
export class TxClient {
  // Fila para serializar operacoes na conexao da transacao (evita erro com Promise.all).
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private tx: Transaction) {}

  private serialize = (fn: () => Promise<Result>): Promise<Result> => {
    const next = this.chain.then(fn, fn);
    // Mantem a cadeia viva mesmo se um passo rejeitar, sem vazar unhandled rejection.
    this.chain = next.then(() => undefined, () => undefined);
    return next;
  };

  from(table: string) {
    return new TxQueryBuilder(this.tx, table, this.serialize);
  }
}

// --- Idempotencia: tipos + chave (estavel por conteudo) -----------------------

export class ProposalConflictError extends Error {
  constructor() {
    super("Esta operacao ja foi registrada com um conteudo diferente. Nenhuma alteracao foi aplicada.");
    this.name = "ProposalConflictError";
  }
}

export type CommandKey = {
  orgId: string;
  operation: string;
  idempotencyKey: string;
  requestHash: string;
  actorUserId: string | null;
};

export type CommandWork = (tx: TxClient) => Promise<{ summary: string; reply: string; session: Row }>;

export type CommandOutcome = {
  duplicate: boolean;
  summary: string;
  reply: string;
  session: Row | null;
};

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  const keys = Object.keys(value as Row).sort();
  return "{" + keys.map((k) => JSON.stringify(k) + ":" + stableStringify((value as Row)[k])).join(",") + "}";
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Para propostas, a chave deriva de sessao + tipo + conteudo da proposta.
// Confirmar a MESMA proposta de novo => mesma chave => idempotente.
// Proposta alterada => conteudo diferente => chave diferente => nova gravacao (correto).
export async function proposalCommandKey(
  sessionId: string,
  operation: string,
  proposal: unknown,
  actorUserId: string | null,
): Promise<CommandKey> {
  const contentHash = await sha256Hex(stableStringify(proposal));
  const idempotencyKey = await sha256Hex(`${sessionId}|${operation}|${contentHash}`);
  return { orgId: "", operation, idempotencyKey, requestHash: contentHash, actorUserId };
}
