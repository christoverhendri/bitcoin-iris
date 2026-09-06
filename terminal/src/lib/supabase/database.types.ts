/**
 * PLACEHOLDER — replaced wholesale in Phase 1 by:
 *
 *   supabase gen types typescript --linked > src/lib/supabase/database.types.ts
 *
 * Until the schema exists there is nothing to generate from, so this permissive
 * shape keeps `from(...).select(...)` typed as plain rows instead of collapsing
 * into `GenericStringError`. Column access is unchecked here; it becomes checked
 * the moment the real types land, which is the point at which typos matter.
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type LooseRow = Record<string, Json>;

interface LooseTable {
  Row: LooseRow;
  Insert: LooseRow;
  Update: LooseRow;
  Relationships: [];
}

export interface Database {
  public: {
    Tables: Record<string, LooseTable>;
    Views: Record<string, LooseTable>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
